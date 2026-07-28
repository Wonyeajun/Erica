import { GoogleGenerativeAI } from '@google/generative-ai';

// 전국 광역시/도 및 주요 시/군/구 기본 좌표 매핑
const coordsMap = {
  // 광역시/도
  "서울특별시": { lat: 37.5665, lon: 126.9780 },
  "경기도": { lat: 37.2636, lon: 127.0286 },
  "인천광역시": { lat: 37.4563, lon: 126.7052 },
  "강원특별자치도": { lat: 37.8853, lon: 127.7298 },
  "충청북도": { lat: 36.6372, lon: 127.4897 },
  "충청남도": { lat: 36.6588, lon: 126.6728 },
  "전북특별자치도": { lat: 35.8242, lon: 127.1480 },
  "전라남도": { lat: 34.8161, lon: 126.4629 },
  "경상북도": { lat: 36.5760, lon: 128.5056 },
  "경상남도": { lat: 35.2383, lon: 128.6925 },
  "제주특별자치도": { lat: 33.4996, lon: 126.5312 },
  // 주요 시/구
  "수원시": { lat: 37.2636, lon: 127.0286 },
  "성남시": { lat: 37.4200, lon: 127.1265 },
  "부천시": { lat: 37.5034, lon: 126.7660 },
  "안산시": { lat: 37.3219, lon: 126.8309 },
  "고양시": { lat: 37.6584, lon: 126.8320 },
  "용인시": { lat: 37.2410, lon: 127.1779 },
  "강남구": { lat: 37.5172, lon: 127.0473 },
  "마포구": { lat: 37.5663, lon: 126.9016 },
  "송파구": { lat: 37.5145, lon: 127.1061 },
  "해운대구": { lat: 35.1631, lon: 129.1636 }
};

// 지역 이름 기반으로 일관되지만 서로 다른 날씨 생성 (API 키가 없거나 미매핑 시)
function getDynamicFallbackWeather(regionName) {
  let hash = 0;
  for (let i = 0; i < regionName.length; i++) {
    hash = regionName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  const conditions = ["맑음", "구름조금", "흐림", "약한 바람", "쾌청함"];
  const condition = conditions[absHash % conditions.length];
  const temp = 18 + (absHash % 11); // 18 ~ 28도
  const humidity = 40 + (absHash % 31); // 40 ~ 70%

  return `${regionName} / 날씨:${condition}, 기온: ${temp}°C, 습도:${humidity}%`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type, payload } = req.body;

  // 📍 1. 카카오모빌리티 길찾기 API
  if (type === 'get_route') {
    try {
      const { origin, destination } = payload;
      const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY || "3f7a78903a6bb6af7151dd55db43ce26";
      const routeUrl = `https://apis-navigator.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=RECOMMEND`;
      
      const routeResponse = await fetch(routeUrl, {
        headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` }
      });

      if (!routeResponse.ok) return res.status(200).json({ path: null });

      const routeData = await routeResponse.json();
      
      if (routeData.routes && routeData.routes[0] && routeData.routes[0].sections) {
        const pathPoints = [];
        routeData.routes[0].sections.forEach(section => {
          section.roads.forEach(road => {
            for (let i = 0; i < road.vertexes.length; i += 2) {
              pathPoints.push({ lng: road.vertexes[i], lat: road.vertexes[i + 1] });
            }
          });
        });
        return res.status(200).json({ path: pathPoints });
      }
      return res.status(200).json({ path: null });
    } catch (e) {
      return res.status(200).json({ path: null });
    }
  }

  // 🌤️ 2. 실시간 날씨 데이터 조회 (OpenWeatherMap + 동적 Fallback)
  if (type === 'fetch_weather') {
    const weatherKey = process.env.WEATHER_API_KEY;
    const { baseRegion, cityVal } = payload;
    
    const provinceVal = baseRegion ? baseRegion.split(' ')[0] : '';
    const coord = coordsMap[cityVal] || coordsMap[provinceVal];

    // OpenWeatherMap API 키가 없는 경우 지역명을 이용해 서로 다른 날씨 반환
    if (!weatherKey) {
      return res.status(200).json({ weatherStatus: getDynamicFallbackWeather(baseRegion) });
    }

    try {
      let url = "";
      if (coord) {
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&appid=${weatherKey}&units=metric&lang=kr`;
      } else {
        // 좌표 매핑이 안 된 지역은 시/구 이름으로 직접 검색
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityVal)},KR&appid=${weatherKey}&units=metric&lang=kr`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && data.main) {
        const temp = Math.round(data.main.temp);
        const humidity = data.main.humidity;
        const weatherDesc = data.weather[0].description;

        return res.status(200).json({
          weatherStatus: `${baseRegion} / 날씨:${weatherDesc}, 기온: ${temp}°C, 습도:${humidity}%`
        });
      } else {
        return res.status(200).json({ weatherStatus: getDynamicFallbackWeather(baseRegion) });
      }
    } catch (err) {
      return res.status(200).json({ weatherStatus: getDynamicFallbackWeather(baseRegion) });
    }
  }

  // 🤖 3. Gemini AI 연동
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });
    }

    let prompt = '';

    if (type === 'weather') {
      const hasDetail = payload.detailLocation && payload.detailLocation.length > 0;
      const startPoint = hasDetail ? `${payload.baseRegion}${payload.detailLocation}` : payload.baseRegion;

      prompt = `
        사용자 입력 정보:
        - 출발지 위치: "${startPoint}"
        - 기본 지역: "${payload.baseRegion}"
        - 실시간 날씨 데이터: "${payload.weatherInfo}"
        - 사용자 컨디션/신체정보: "${payload.userHealth}"
        - 세부 위치 입력값: "${hasDetail ? payload.detailLocation : '미입력'}"

        [러닝 장소 추천 최우선 규칙]
        1. **거리 최우선 규칙**: 멀리 떨어진 유명 관광지나 명소를 추천하지 말고, 입력된 출발지 위치("${startPoint}")에서 도보 또는 단거리로 쉽게 접근할 수 있는 **가장 가까운 인근 대표 공원, 천변, 산책로, 학교 운동장 등 1곳만 최우선으로 탐색하여 지정**하세요.
        2. 날씨와 사용자 컨디션을 종합 분석하여 운동 강도 및 조언을 작성하세요.

        [응답 형식 제약조건]
        결과는 반드시 아래 JSON 형식으로만 응답해주세요. 다른 설명이나 마크다운 문법(```json 등) 없이 Pure JSON 문자열로만 반환하세요.
        {
          "spotName": "추천된 가장 가까운 대표 공원/장소의 정확한 이름 (예: 여의도공원, 안산호수공원, 상동호수공원 등 지도 검색 가능한 정확한 명칭)",
          "result": "사용자에게 전달할 상세 코칭 메시지 전문 (1. 추천 장소 및 거리 안내, 2. 컨디션/날씨 맞춤 운동 피드백 등)"
        }
      `;
    } else if (type === 'score') {
      prompt = `
        다음 정보를 종합하여 사용자의 [러닝 점수(100점 만점)]를 산출하고 실시간 피드백을 제공해줘.
        - 날씨 상태: ${payload.weather}
        - 사용자 신체/건강 정보: ${payload.healthInfo}
        - 오늘 목표/입력 내용: ${payload.scoreInput}

        응답 형식:
        1. 🏃‍♂️ 오늘의 예상 러닝 점수 (점수와 이유)
        2. 💡 신체 상태 기반 실시간 피드백 및 Pace 조절 조언
      `;
    } else if (type === 'analysis') {
      prompt = `
        다음 러닝 기록 데이터를 바탕으로 상세한 사후 분석 리포트를 작성해줘.
        - 러닝 기록 데이터: ${payload.analysisInput}

        응답 형식:
        1. 📊 종합 운동 성과 요약
        2. 💚 심박수/페이스/심폐 부담 분석
        3. 🧘‍♂️ 회복 안내 및 다음 러닝을 위한 피드백
      `;
    } else {
      return res.status(400).json({ error: '올바르지 않은 요청 유형입니다.' });
    }

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    if (type === 'weather') {
      try {
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        return res.status(200).json({
          result: parsed.result,
          spotName: parsed.spotName
        });
      } catch (e) {
        return res.status(200).json({
          result: responseText,
          spotName: payload.detailLocation || `${payload.baseRegion} 공원`
        });
      }
    }

    return res.status(200).json({ result: responseText });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: `AI 분석 실패: ${error.message}` });
  }
}
