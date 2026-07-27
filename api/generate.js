import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type, payload } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 호환성 문제 방지를 위한 모델 지정
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });
    }

    let prompt = '';

    if (type === 'weather') {
      prompt = `
        사용자가 입력한 정보: "${payload.weatherInput}"

        위 입력값에서 [위치]와 [날씨 정보]를 추출한 후, 아래 판단 규칙에 따라 경로를 추천해주세요.

        [경로 탐색 알고리즘 규칙]
        1. 위치 상세도 판단:
           - 규칙 A: 대학 캠퍼스, 건물명, 세부 도로명 주소 등 매우 구체적이고 좁은 위치가 포함된 경우:
             * 해당 위치 자체는 러닝에 부적합할 수 있으므로 억지로 내부 경로를 생성하지 마세요.
             * 현재 위치에서 '가장 가까운 러닝하기 좋은 실제 대표 공원/천변/체육공원'을 탐색하세요.
             * [동선 가이드]: 
               - 현재 위치 ➔ 추천 공원까지 가는 이동 동선/시간
               - 해당 공원 내부에서 달리기 좋은 시각적 코스 루프(동선) 설명
           - 규칙 B: '안산시 상록구', '서울 마포구' 등 행정구역 범주가 넓은 경우:
             * 복잡한 상세 이동 동선 대신 해당 구역 내 대표 러닝 스팟 2~3곳과 특징을 명확하게 요약해 주세요.

        2. 입력된 날씨(기온, 습도, 그늘 필요 여부 등)를 고려한 준비물/복장 팁 제공
        3. 주의사항 작성

        러닝 코치로서 파이팅 넘치고 친절한 톤으로 답변해줘.
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
