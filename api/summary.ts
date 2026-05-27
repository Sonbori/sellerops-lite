import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { aiSummaryRequestSchema } from '../src/lib/aiSummary'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'POST 요청만 지원합니다.' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.' })
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const parsed = aiSummaryRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    return response.status(400).json({ error: '요약 데이터 형식이 올바르지 않습니다.' })
  }

  try {
    const result = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content:
            '온라인 셀러 운영 데이터를 해석하는 보조 분석가입니다. 계산은 이미 완료된 값만 신뢰하고, 성과를 과장하지 마세요. 한국어로 짧고 실행 가능한 리포트를 작성하세요.',
        },
        {
          role: 'user',
          content: JSON.stringify(parsed.data),
        },
      ],
    })

    return response.status(200).json({
      summary: result.output_text,
    })
  } catch {
    return response.status(502).json({
      error: 'AI 요약을 생성하지 못했습니다. 계산 결과는 그대로 사용할 수 있습니다.',
    })
  }
}
