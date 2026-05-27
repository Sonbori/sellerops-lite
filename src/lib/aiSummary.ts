import { z } from 'zod'
import type { DashboardData } from './sellerops'

export const aiSummaryRequestSchema = z.object({
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

export type AiSummaryRequest = z.infer<typeof aiSummaryRequestSchema>
export type AiChatMessage = NonNullable<AiSummaryRequest['messages']>[number]

export function createAiSummaryPayload(dashboard: DashboardData): AiSummaryRequest {
  return {
    summary: dashboard.summary,
    priorityProducts: dashboard.priorityProducts.map((product) => ({
      productName: product.productName,
      category: product.category,
      grossSales: product.grossSales,
      netProfit: product.netProfit,
      marginRate: product.marginRate,
      breakEvenPrice: product.breakEvenPrice,
      adCostRate: product.adCostRate,
      stock: product.stock,
      riskLevel: product.riskLevel,
      riskReasons: product.riskReasons,
    })),
    categoryProfit: dashboard.categoryProfit.slice(0, 8),
  }
}
