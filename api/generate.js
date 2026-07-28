import { GoogleGenerativeAI } from "@google/generative-ai";

// 환경변수에서 Gemini API Key를 가져옵니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { type, payload } = req.body;

    // 1. 실시간 날씨 데이터 조회 요청
    if (type === 'fetch_weather') {
      const weatherText = `${payload.baseRegion} / 맑음 ☀️, 기온 23°C, 습도 50%, 바람 약함 (러닝하기 최적의 날씨입니다)`;
      return res.status(200).json({ weatherStatus: weatherText });
    }

    // 2. 🌤️ 날씨 & 러닝 코스 맞춤 추천 요청
    if (type === 'weather') {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // 이전에 추천받았던 장소 제외 지침 생성
      const excludeText = (payload.excludeList && payload.excludeList.length > 0)
        ? `\n⚠️ [중요 제외 목록] 다음 장소들은 사용자가 이미 추천받았으므로 **절대 재추천하지 마시고 다른 새로운 곳**을 추천하세요: [${payload.excludeList.join(', ')}]`
        : '';

      const detailLoc = payload.detailLocation || '지역 중심';

      const prompt = `
당신은 대한민국 현지 지리에 매우 밝은 '맞춤형 러닝 코스 전문 AI 컨설턴트'입니다.

[사용자 요청 정보]
- 기본 지역: ${payload.baseRegion}
- 상세 출발지/위치: ${detailLoc}
- 날씨 및 컨디션: ${payload.weatherInfo || '보통'}
${excludeText}

[추천 핵심 원칙 - 반드시 준수]
1. **최단 거리 최우선 (Proximity First)**: 
   사용자가 입력한 출발지(${detailLoc})에서 **도보 5~10분 이내(가장 가까운 거리)**의 공원, 천변 산책로, 학교 트랙, 체육공원을 1순위로 탐색하여 추천하세요.
   - 예: '부천 중동/보람마을' 출발 ➔ 바로 옆의 '부천중앙공원' 우선 추천 (멀리 떨어진 상동호수공원 금지)
   - 예: '한양대 ERICA' 출발 ➔ 캠퍼스 내 트랙 또는 바로 옆 '안산호수공원' 우선 추천

2. **대표 유명 장소 오남용 금지**:
   도시 내에서 유명한 대형 공원(예: 상동호수공원 등)이라도 출발지에서 멀다면 추천하지 마세요. 사용자의 실제 출발 위치 기반 접근성이 가장 중요합니다.

3. **응답 첫 줄 포맷 (지도 연동 필수)**:
   응답의 **맨 첫 번째 줄**에는 반드시 카카오 지도 검색에 직접 입력할 정확한 장소명을 아래 포맷으로만 작성하세요. (다른 텍스트 금지)
   
   포맷: [추천장소: 정확한장소명]
   (예시: [추천장소: 부천중앙공원])

[응답 작성 구조]
- 1줄: [추천장소: 정확한장소명]
- 2줄 이하: 
  1) 🏃‍♂️ **추천 코스 및 위치 설명** (출발지에서의 접근성 및 거리 설명)
  2) 🌤️ **오늘 날씨 맞춤 러닝 팁** (복장, 수분 섭취, 추천 시간대)
  3) ⏱️ **추천 러닝 거리 및 페이스 가이드**
`;

      const result = await model.generateContent(prompt);
      const aiResponseText = result.response.text();

      // 응답 첫 줄에서 [추천장소: 장소명] 파싱
      let spotName = null;
      const match = aiResponseText.match(/\[추천장소:\s*([^\]]+)\]/);
      if (match) {
        spotName = match[1].trim();
      }

      return res.status(200).json({
        result: aiResponseText,
        spotName: spotName
      });
    }

    // 3. 💯 점수 & 피드백 측정 요청
    if (type === 'score') {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
당신은 러닝 전문 코치입니다. 아래 정보를 바탕으로 오늘의 러닝 적합도 점수(100점 만점)와 피드백을 작성해 주세요.
- 날씨: ${payload.weather}
- 컨디션: ${payload.healthInfo}
- 러닝 목표: ${payload.scoreInput}
`;
      const result = await model.generateContent(prompt);
      return res.status(200).json({ result: result.response.text() });
    }

    // 4. 📊 사후 분석 리포트 생성 요청
    if (type === 'analysis') {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
당신은 스포츠 데이터 분석 전문가입니다. 아래 러닝 기록 데이터를 분석하여 정밀 리포트를 작성해 주세요.
- 러닝 기록 데이터: ${payload.analysisInput}
`;
      const result = await model.generateContent(prompt);
      return res.status(200).json({ result: result.response.text() });
    }

    return res.status(400).json({ error: '유효하지 않은 요청 타입입니다.' });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: '서버 내부 오류가 발생했습니다: ' + error.message });
  }
}
