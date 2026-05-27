import { z } from 'zod'

export const REQUIRED_COLUMNS = [
  'orderDate',
  'productName',
  'category',
  'quantity',
  'unitPrice',
  'productCost',
  'platformFeeRate',
  'shippingFee',
  'adCost',
  'discount',
  'stock',
] as const

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number]
export type RiskLevel = 'high' | 'medium' | 'low'
export type VatMode = 'ignored' | 'included'

export interface CalculationOptions {
  vatMode?: VatMode
}

export interface OrderRow {
  orderDate: string
  productName: string
  category: string
  quantity: number
  unitPrice: number
  productCost: number
  platformFeeRate: number
  shippingFee: number
  adCost: number
  discount: number
  stock: number
}

export interface ValidationIssue {
  row?: number
  field?: string
  message: string
}

export interface ParseCsvResult {
  validRows: OrderRow[]
  issues: ValidationIssue[]
}

export interface ProductMetrics {
  productName: string
  category: string
  quantity: number
  grossSales: number
  platformFee: number
  totalProductCost: number
  shippingFee: number
  adCost: number
  discount: number
  totalCost: number
  netProfit: number
  marginRate: number
  breakEvenPrice: number
  adCostRate: number
  stock: number
  riskLevel: RiskLevel
  riskReasons: string[]
}

export interface DashboardSummary {
  totalRevenue: number
  totalProfit: number
  averageMarginRate: number
  riskProductCount: number
}

export interface DashboardData {
  products: ProductMetrics[]
  summary: DashboardSummary
  categoryProfit: Array<{ category: string; grossSales: number; netProfit: number }>
  dailyTrend: Array<{ orderDate: string; grossSales: number; netProfit: number }>
  priorityProducts: ProductMetrics[]
}

const VAT_RATE = 0.1

function normalizeNumberInput(value: unknown) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value !== 'string') {
    return value
  }

  const normalized = value
    .trim()
    .replaceAll(',', '')
    .replaceAll('원', '')
    .replaceAll('%', '')
    .replace(/\s/g, '')

  return normalized === '' ? value : normalized
}

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().replace(/^\uFEFF/, ''), normalizeNumberInput(value)]),
  )
}

function normalizeFields(fields: string[]) {
  return fields.map((field) => field.trim().replace(/^\uFEFF/, ''))
}

const nonNegativeNumber = z.preprocess(normalizeNumberInput, z.coerce.number().finite().min(0))
const nonNegativeInteger = z.preprocess(normalizeNumberInput, z.coerce.number().int().min(0))

const orderRowSchema = z.object({
  orderDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.'),
  productName: z.string().trim().min(1, '상품명은 필수입니다.'),
  category: z.string().trim().min(1, '카테고리는 필수입니다.'),
  quantity: z.preprocess(
    normalizeNumberInput,
    z.coerce.number().int().min(1, '수량은 1 이상 정수여야 합니다.'),
  ),
  unitPrice: nonNegativeNumber,
  productCost: nonNegativeNumber,
  platformFeeRate: z.preprocess(normalizeNumberInput, z.coerce.number().finite().min(0).max(99.9)),
  shippingFee: nonNegativeNumber,
  adCost: nonNegativeNumber,
  discount: nonNegativeNumber,
  stock: nonNegativeInteger,
})

function roundKRW(value: number) {
  return Math.round(value)
}

function roundRate(value: number) {
  return Math.round(value * 10) / 10
}

export function parseCsvRows(rows: Array<Record<string, unknown>>, fields: string[]): ParseCsvResult {
  const issues: ValidationIssue[] = []
  const validRows: OrderRow[] = []
  const normalizedFields = normalizeFields(fields)
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !normalizedFields.includes(column))

  for (const column of missingColumns) {
    issues.push({
      field: column,
      message: `필수 컬럼 ${column}이 누락되었습니다.`,
    })
  }

  if (missingColumns.length > 0) {
    return { validRows, issues }
  }

  rows.forEach((row, index) => {
    const result = orderRowSchema.safeParse(normalizeRow(row))

    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          row: index + 2,
          field: issue.path.join('.'),
          message: issue.message,
        })
      }
      return
    }

    validRows.push(result.data)
  })

  return { validRows, issues }
}

function withoutIncludedVat(value: number, vatMode: VatMode) {
  return vatMode === 'included' ? value / (1 + VAT_RATE) : value
}

export function calculateOrderMetrics(row: OrderRow, options: CalculationOptions = {}) {
  const vatMode = options.vatMode ?? 'ignored'
  const grossSales = row.quantity * row.unitPrice
  const netSales = withoutIncludedVat(grossSales, vatMode)
  const platformFee = grossSales * (row.platformFeeRate / 100)
  const totalProductCost = withoutIncludedVat(row.quantity * row.productCost, vatMode)
  const totalVariableCost = totalProductCost + row.shippingFee + row.adCost + row.discount
  const totalCost = totalVariableCost + platformFee
  const netProfit = netSales - totalCost
  const marginRate = grossSales === 0 ? 0 : (netProfit / grossSales) * 100
  const denominator = row.quantity * (1 - row.platformFeeRate / 100)
  const breakEvenSupplyPrice = denominator <= 0 ? Number.POSITIVE_INFINITY : totalVariableCost / denominator
  const breakEvenPrice =
    vatMode === 'included' ? breakEvenSupplyPrice * (1 + VAT_RATE) : breakEvenSupplyPrice

  return {
    grossSales,
    platformFee,
    totalProductCost,
    totalCost,
    netProfit,
    marginRate,
    breakEvenPrice,
    adCostRate: grossSales === 0 ? 0 : (row.adCost / grossSales) * 100,
  }
}

function classifyRisk(metrics: {
  netProfit: number
  marginRate: number
  unitPrice: number
  breakEvenPrice: number
  stock: number
}) {
  const reasons: string[] = []

  if (metrics.netProfit < 0) {
    reasons.push('순이익 적자')
  }

  if (metrics.marginRate < 10) {
    reasons.push('마진율 10% 미만')
  }

  if (metrics.unitPrice <= metrics.breakEvenPrice) {
    reasons.push('판매가가 손익분기 단가 이하')
  }

  if (metrics.stock <= 5) {
    reasons.push('재고 5개 이하')
  }

  if (metrics.netProfit < 0 || metrics.marginRate < 10 || metrics.unitPrice <= metrics.breakEvenPrice) {
    return { riskLevel: 'high' as const, riskReasons: reasons }
  }

  if (metrics.marginRate < 20 || metrics.stock <= 5) {
    return { riskLevel: 'medium' as const, riskReasons: reasons }
  }

  return { riskLevel: 'low' as const, riskReasons: reasons.length ? reasons : ['안정 구간'] }
}

export function aggregateProducts(rows: OrderRow[], options: CalculationOptions = {}): ProductMetrics[] {
  const productMap = new Map<string, ProductMetrics & { unitRevenue: number }>()

  for (const row of rows) {
    const key = `${row.productName}::${row.category}`
    const orderMetrics = calculateOrderMetrics(row, options)
    const current =
      productMap.get(key) ??
      ({
        productName: row.productName,
        category: row.category,
        quantity: 0,
        grossSales: 0,
        platformFee: 0,
        totalProductCost: 0,
        shippingFee: 0,
        adCost: 0,
        discount: 0,
        totalCost: 0,
        netProfit: 0,
        marginRate: 0,
        breakEvenPrice: 0,
        adCostRate: 0,
        stock: row.stock,
        riskLevel: 'low',
        riskReasons: [],
        unitRevenue: 0,
      } satisfies ProductMetrics & { unitRevenue: number })

    current.quantity += row.quantity
    current.grossSales += orderMetrics.grossSales
    current.platformFee += orderMetrics.platformFee
    current.totalProductCost += orderMetrics.totalProductCost
    current.shippingFee += row.shippingFee
    current.adCost += row.adCost
    current.discount += row.discount
    current.totalCost += orderMetrics.totalCost
    current.netProfit += orderMetrics.netProfit
    current.stock = Math.min(current.stock, row.stock)
    current.unitRevenue += row.unitPrice * row.quantity

    productMap.set(key, current)
  }

  return Array.from(productMap.values())
    .map((product) => {
      const feeRate = product.grossSales === 0 ? 0 : product.platformFee / product.grossSales
      const totalVariableCost =
        product.totalProductCost + product.shippingFee + product.adCost + product.discount
      const denominator = product.quantity * (1 - feeRate)
      const breakEvenSupplyPrice =
        denominator <= 0 ? Number.POSITIVE_INFINITY : totalVariableCost / denominator
      const breakEvenPrice =
        options.vatMode === 'included' ? breakEvenSupplyPrice * (1 + VAT_RATE) : breakEvenSupplyPrice
      const marginRate = product.grossSales === 0 ? 0 : (product.netProfit / product.grossSales) * 100
      const adCostRate = product.grossSales === 0 ? 0 : (product.adCost / product.grossSales) * 100
      const averageUnitPrice = product.quantity === 0 ? 0 : product.unitRevenue / product.quantity
      const risk = classifyRisk({
        netProfit: product.netProfit,
        marginRate,
        unitPrice: averageUnitPrice,
        breakEvenPrice,
        stock: product.stock,
      })

      return {
        ...product,
        grossSales: roundKRW(product.grossSales),
        platformFee: roundKRW(product.platformFee),
        totalProductCost: roundKRW(product.totalProductCost),
        shippingFee: roundKRW(product.shippingFee),
        adCost: roundKRW(product.adCost),
        discount: roundKRW(product.discount),
        totalCost: roundKRW(product.totalCost),
        netProfit: roundKRW(product.netProfit),
        marginRate: roundRate(marginRate),
        breakEvenPrice: roundKRW(breakEvenPrice),
        adCostRate: roundRate(adCostRate),
        riskLevel: risk.riskLevel,
        riskReasons: risk.riskReasons,
      }
    })
    .sort((a, b) => {
      const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.marginRate - b.marginRate
    })
}

export function aggregateDashboard(rows: OrderRow[], options: CalculationOptions = {}): DashboardData {
  const products = aggregateProducts(rows, options)
  const totalRevenue = products.reduce((sum, product) => sum + product.grossSales, 0)
  const totalProfit = products.reduce((sum, product) => sum + product.netProfit, 0)
  const averageMarginRate = totalRevenue === 0 ? 0 : (totalProfit / totalRevenue) * 100
  const riskProductCount = products.filter((product) => product.riskLevel === 'high').length
  const categoryMap = new Map<string, { category: string; grossSales: number; netProfit: number }>()
  const dailyMap = new Map<string, { orderDate: string; grossSales: number; netProfit: number }>()

  for (const product of products) {
    const current = categoryMap.get(product.category) ?? {
      category: product.category,
      grossSales: 0,
      netProfit: 0,
    }

    current.grossSales += product.grossSales
    current.netProfit += product.netProfit
    categoryMap.set(product.category, current)
  }

  for (const row of rows) {
    const metrics = calculateOrderMetrics(row, options)
    const current = dailyMap.get(row.orderDate) ?? {
      orderDate: row.orderDate,
      grossSales: 0,
      netProfit: 0,
    }

    current.grossSales += metrics.grossSales
    current.netProfit += metrics.netProfit
    dailyMap.set(row.orderDate, current)
  }

  return {
    products,
    summary: {
      totalRevenue: roundKRW(totalRevenue),
      totalProfit: roundKRW(totalProfit),
      averageMarginRate: roundRate(averageMarginRate),
      riskProductCount,
    },
    categoryProfit: Array.from(categoryMap.values()).map((item) => ({
      ...item,
      grossSales: roundKRW(item.grossSales),
      netProfit: roundKRW(item.netProfit),
    })),
    dailyTrend: Array.from(dailyMap.values())
      .map((item) => ({
        ...item,
        grossSales: roundKRW(item.grossSales),
        netProfit: roundKRW(item.netProfit),
      }))
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate)),
    priorityProducts: products
      .filter((product) => product.riskLevel !== 'low')
      .sort((a, b) => a.marginRate - b.marginRate || b.adCostRate - a.adCostRate)
      .slice(0, 5),
  }
}

export function getRiskLabel(risk: RiskLevel) {
  if (risk === 'high') return '높음'
  if (risk === 'medium') return '주의'
  return '낮음'
}

export function formatKRW(value: number) {
  if (!Number.isFinite(value)) return '계산 불가'
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '계산 불가'
  return `${value.toFixed(1)}%`
}
