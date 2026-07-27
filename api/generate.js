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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    let prompt = '';

    if (type === 'weather') {
      prompt = `
        사용자 입력 위치/날씨: "${payload.weatherInput}"

        [러닝 위치 판단 및 경로 안내 알고리즘]
        1. 입력된 위치를 분석해:
           - A. 학교, 건물명, 세부 도로명 주소 등 (예: '한양대 에리카', 'OO동 OO아파트')처럼 러닝 전용 트랙이 마땅치 않거나 매우 좁은 장소인 경우:
             * 해당 장소 내부를 억지로 안내하지 마세요.
             * 해당 위치에서 가장 가깝고 러닝하기 좋은 실제 유명 공원/천변/체육공원(예: 안산호수공원, 노적봉공원, 안산천 산책로 등)을 찾아서 추천하세요.
             * [시각적 경로 안내]: 
               ① 현재 위치 ➔ 추천 공원까지 이동 방법 (도보/대중교통 시간 및 거리)
               ② 추천 공원 내부의 핵심 러닝 코스 루프(Loop) 동선 상세 설명

           - B. '안산시 상록구' 처럼 범위가 넓은 행정구역명인 경우:
             * 해당 구역 내 대표적인 러닝 명소 2~3곳을 간단히 추천하고 주요 특성(바닥 재질, 그늘 유무 등)을 정리하세요. (너무 복잡한 이동 경로 시각화는 생략)

        2. 복장 및 준비물 추천
        3. 주의사항 (날씨/지형 고려)

        작성 톤앤매너: 친절하고 전문적이며, 파이팅 넘치는 코치 어조로 정리해줘.
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
