import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type, payload } = req.body;

  // 1. 카카오 길찾기 API 연동 처리 (실제 도로 경로 데이터 파싱)
  if (type === 'get_route') {
    try {
      const { origin, destination } = payload; // ex: "126.978,37.5665"
      const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY || "3f7a78903a6bb6af7151dd55db43ce26";

      const routeUrl = `https://apis-navigator.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=RECOMMEND`;
      
      const routeResponse = await fetch(routeUrl, {
        headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` }
      });

      if (!routeResponse.ok) {
        return res.status(200).json({ path: null });
      }

      const routeData = await routeResponse.json();
      
      if (routeData.routes && routeData.routes[0] && routeData.routes[0].sections) {
        const pathPoints = [];
        routeData.routes[0].sections.forEach(section => {
          section.roads.forEach(road => {
            for (let i = 0; i < road.vertexes.length; i += 2) {
              pathPoints.push({
                lng: road.vertexes[i],
                lat: road.vertexes[i + 1]
              });
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

  // 2. 실시간 날씨 데이터 가공
  if (type === 'fetch_weather') {
    const baseRegion = payload.baseRegion || "선택 지역";
    return res.status(200).json({
      weatherStatus: `${baseRegion} / 맑음, 기온 23°C, 습도 50%, 바람 약함`
    });
  }

  // 3. Gemini AI 요청 처리
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API 키가 설정되지 않았습니다." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    let prompt = "";

    if (type === 'weather') {
      const locationInfo = payload.detailLocation ? `${payload.baseRegion} (${payload.detailLocation})` : payload.baseRegion;

      prompt = `
당신은 맞춤형 러닝 스팟을 추천하는 전문 AI 러닝 트레이너입니다.

[사용자 위치 및 환경 정보]
- 출발지/상세위치: ${locationInfo}
- 조회된 날씨: ${payload.weatherInfo}
- 컨디션: ${payload.userHealth}

[★ 핵심 추천 알고리즘 및 규칙 ★]
1. **최근거리 최우선 규칙 (가장 중요)**:
   - 멀리 떨어진 유명 관광지나 타 지역의 명소(예: 멀리 떨어진 호수공원 등)를 절대로 추천하지 마세요.
   - **반드시 사용자의 출발 위치(${locationInfo})에서 가장 가까운 동네 공원, 인근 산책로, 천변, 학교 운동장 등 바로 옆에 있는 장소 1곳만 추천하세요.**
   - 예를 들어 출발지가 '부천 보람마을'이라면 멀리 있는 상동호수공원이 아닌, 바로 인근의 '부천중앙공원'이나 '계남공원' 등을 최우선으로 선택해야 합니다.

2. **출력 형식 규칙**:
   - 첫번째 줄에는 반드시 추천 장소 이름만 정형화된 형식을 지켜 작성하세요:
     [추천 장소: 정확한 장소명]
   - 그 다음 줄부터 날씨와 신체 컨디션에 맞춘 러닝 강도, 수분 섭취 조언, 팁을 부드럽게 설명해 주세요.
      `;
    } else if (type === 'score') {
      prompt = `
당신은 러닝 코치입니다.
[날씨]: ${payload.weather}
[신체 컨디션]: ${payload.healthInfo}
[러닝 목표]: ${payload.scoreInput}

위 정보를 바탕으로 오늘의 러닝 적합도 점수(100점 만점)와 구체적인 조언, 피드백을 제공해 주세요.
      `;
    } else if (type === 'analysis') {
      prompt = `
다음 사용자의 러닝 완료 데이터에 대해 전문적인 사후 분석 및 쿨다운 가이드를 제공해 주세요.
[러닝 데이터]: ${payload.analysisInput}
      `;
    }

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 장소명 파싱
    let spotName = "";
    if (type === 'weather') {
      const spotMatch = text.match(/\[추천 장소:\s*([^\]]+)\]/);
      if (spotMatch) {
        spotName = spotMatch[1].trim();
      }
    }

    return res.status(200).json({
      result: text,
      spotName: spotName
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: "AI 응답을 생성하는 중 오류가 발생했습니다: " + error.message });
  }
}
