import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'

const aiSummaryRequestSchema = z.object({
  summary: z.object({
    totalRevenue: z.number(),
    totalProfit: z.number(),
    averageMarginRate: z.number(),
    riskProductCount: z.number(),
  }),
  priorityProducts: z
    .array(
      z.object({
        productName: z.string(),
        category: z.string(),
        grossSales: z.number(),
        netProfit: z.number(),
        marginRate: z.number(),
        breakEvenPrice: z.number(),
        adCostRate: z.number(),
        stock: z.number(),
        riskLevel: z.enum(['high', 'medium', 'low']),
        riskReasons: z.array(z.string()),
      }),
    )
    .max(5),
  categoryProfit: z
    .array(
      z.object({
        category: z.string(),
        grossSales: z.number(),
        netProfit: z.number(),
      }),
    )
    .max(8),
  question: z.string().trim().max(600).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(3000),
      }),
    )
    .max(8)
    .optional(),
})

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
    const requestData = parsed.data
    const prompt = requestData.question
      ? [
          '아래 계산 summary와 이전 대화를 바탕으로 사용자의 후속 질문에 답하세요.',
          '제공된 계산 데이터 밖의 성과, 사용량, 실제 매출 개선은 추정하지 마세요.',
          '답변은 한국어로 짧게, 실행 가능한 항목 중심으로 작성하세요.',
          '',
          `계산 summary JSON: ${JSON.stringify({
            summary: requestData.summary,
            priorityProducts: requestData.priorityProducts,
            categoryProfit: requestData.categoryProfit,
          })}`,
          `이전 대화 JSON: ${JSON.stringify(requestData.messages ?? [])}`,
          `사용자 질문: ${requestData.question}`,
        ].join('\n')
      : [
          '아래 계산 summary를 바탕으로 온라인 셀러 운영 리포트를 작성하세요.',
          '계산은 이미 완료된 값만 신뢰하고, 성과를 과장하지 마세요.',
          '요약, 즉시 권장 액션, 우선순위 상품, 다음 질문으로 이어질 수 있는 확인 포인트를 한국어로 작성하세요.',
          '',
          `계산 summary JSON: ${JSON.stringify(requestData)}`,
        ].join('\n')

    const result = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content:
            '온라인 셀러 운영 데이터를 해석하는 보조 분석가입니다. AI는 계산을 대신하지 않고, 제공된 계산 결과를 설명하고 다음 액션을 제안합니다.',
        },
        {
          role: 'user',
          content: prompt,
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
