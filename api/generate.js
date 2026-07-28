import { GoogleGenerativeAI } from '@google/generative-ai';

// 주요 지역 좌표 매핑
const coordsMap = {
  "서울특별시": { lat: 37.5665, lon: 126.9780 },
  "경기도": { lat: 37.2636, lon: 127.0286 },
  "부천시": { lat: 37.5034, lon: 126.7660 },
  "안산시": { lat: 37.3219, lon: 126.8309 },
  "인천광역시": { lat: 37.4563, lon: 126.7052 },
  "마포구": { lat: 37.5663, lon: 126.9016 },
  "강남구": { lat: 37.5172, lon: 127.0473 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type, payload } = req.body;

  // 1. [날씨 전용 요청] API 키를 사용해 OpenWeatherMap에서 날씨 데이터 조회
  if (type === 'fetch_weather') {
    const weatherKey = process.env.WEATHER_API_KEY;
    const { baseRegion, cityVal } = payload;
    const coord = coordsMap[cityVal] || coordsMap[baseRegion.split(' ')[0]] || { lat: 37.5665, lon: 126.9780 };

    if (!weatherKey) {
      // 키가 설정되지 않았을 경우 비상용 기본값 반환
      return res.status(200).json({ weatherStatus: `${baseRegion} / 맑음, 기온 22°C, 습도 45% (기본값)` });
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&appid=${weatherKey}&units=metric&lang=kr`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        const temp = Math.round(data.main.temp);
        const humidity = data.main.humidity;
        const weatherDesc = data.weather[0].description;

        return res.status(200).json({
          weatherStatus: `${baseRegion} / 날씨: ${weatherDesc}, 기온: ${temp}°C, 습도: ${humidity}%`
        });
      } else {
        return res.status(200).json({ weatherStatus: `${baseRegion} / 맑음, 기온 22°C, 습도 45% (API 확인 필요)` });
      }
    } catch (err) {
      return res.status(200).json({ weatherStatus: `${baseRegion} / 맑음, 기온 22°C, 습도 45%` });
    }
  }

  // 2. Gemini AI 요청 처리
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

      prompt = `
        사용자 위치 정보:
        - 기본 선택 지역(최소 기준): "${payload.baseRegion}"
        - 세부 위치 입력값(최대 기준): "${hasDetail ? payload.detailLocation : '미입력 (기본 지역 기준)'}"
        - 실시간 날씨 데이터: "${payload.weatherInfo}"

        [러닝 경로 추천 판단 알고리즘]
        ${hasDetail ? `
        ★ [최대 모드 적용]: 사용자가 세부 위치/건물명("${payload.detailLocation}")을 작성했습니다.
        1. 입력된 세부 위치(예: '한양대 에리카', 특정 도로/건물 등)가 속한 상위 행정구역을 자동으로 추론하세요.
        2. 해당 세부 장소에서 출발하여 '가장 가까운 러닝하기 좋은 대표 공원/천변/체육공원'을 탐색하세요.
        3. [이동 동선 안내]:
           - 현재 위치 ➔ 추천 공원까지 이동하는 방법/동선
           - 추천 공원 내부 러닝 코스 루프 설명
        ` : `
        ★ [최소 모드 적용]: 세부 위치가 미입력되었으므로, 선택한 기본 지역("${payload.baseRegion}") 전체를 기준으로 추천합니다.
        1. 해당 행정구역(도/시 또는 서울/구) 대표 러닝 스팟 2~3곳과 각 장소의 특징을 추천해 주세요.
        `}

        2. 제공된 날씨 데이터(기온, 습도 등)에 적합한 준비물 및 복장 팁 추천
        3. 오늘 날씨 기준 러닝 주의사항 안내

        친절하고 파이팅 넘치는 전담 러닝 코치 톤으로 답변해줘.
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
    const responseText = result.response.text();

    return res.status(200).json({ result: responseText });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: `AI 분석 실패: ${error.message}` });
  }
}
