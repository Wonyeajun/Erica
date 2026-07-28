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

  // 1. OpenWeatherMap 실시간 날씨 데이터 조회
  if (type === 'fetch_weather') {
    const weatherKey = process.env.WEATHER_API_KEY;
    const { baseRegion, cityVal } = payload;
    const coord = coordsMap[cityVal] || coordsMap[baseRegion.split(' ')[0]] || { lat: 37.5665, lon: 126.9780 };

    if (!weatherKey) {
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
        return res.status(200).json({ weatherStatus: `${baseRegion} / 맑음, 기온 22°C, 습도 45%` });
      }
    } catch (err) {
      return res.status(200).json({ weatherStatus: `${baseRegion} / 맑음, 기온 22°C, 습도 45%` });
    }
  }

  // 2. Gemini AI 연동
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: 'models/gemini-3.1-flash-lite' });
    }

    let prompt = '';

    if (type === 'weather') {
      const hasDetail = payload.detailLocation && payload.detailLocation.length > 0;

      prompt = `
        사용자 입력 정보:
        - 기본 지역: "${payload.baseRegion}"
        - 실시간 날씨 데이터: "${payload.weatherInfo}"
        - 사용자 컨디션/신체정보: "${payload.userHealth}"
        - 세부 위치 입력값: "${hasDetail ? payload.detailLocation : '미입력'}"

        [러닝 경로 및 지침 요구사항]
        1. 날씨와 사용자 컨디션을 종합 분석하여 운동 강도 조언.
        2. 러닝 장소 추천:
           - 세부 위치가 있으면 가장 가까운 대표 공원/천변 추천.
           - 없으면 기본 지역의 대표 공원 추천.

        [응답 형식 제약조건]
        결과는 반드시 아래 JSON 형식으로만 응답해주세요. 다른 설명이나 마크다운 문법 없이 Pure JSON만 반환하세요.
        {
          "spotName": "추천된 대표 공원/장소의 정확한 이름 (예: 안산호수공원, 여의도공원)",
          "result": "사용자에게 전달할 상세 코칭 메시지 전문 (1. 경로안내, 2. 컨디션/날씨 조언 등)"
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
        // AI 응답에서 JSON 데이터 추출
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        return res.status(200).json({
          result: parsed.result,
          spotName: parsed.spotName
        });
      } catch (e) {
        // JSON 파싱 실패 시 일반 텍스트로 처리
        return res.status(200).json({
          result: responseText,
          spotName: `${payload.baseRegion} 공원`
        });
      }
    }

    return res.status(200).json({ result: responseText });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: `AI 분석 실패: ${error.message}` });
  }
}
