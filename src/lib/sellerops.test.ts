import { describe, expect, it } from 'vitest'
import {
  aggregateDashboard,
  aggregateProducts,
  calculateOrderMetrics,
  parseCsvRows,
  type OrderRow,
} from './sellerops'

const rows: OrderRow[] = [
  {
    orderDate: '2026-05-01',
    productName: '무선 키보드',
    category: '디지털',
    quantity: 2,
    unitPrice: 30000,
    productCost: 18000,
    platformFeeRate: 10,
    shippingFee: 3000,
    adCost: 8000,
    discount: 2000,
    stock: 4,
  },
  {
    orderDate: '2026-05-01',
    productName: '스마트폰 거치대',
    category: '생활용품',
    quantity: 3,
    unitPrice: 12000,
    productCost: 5000,
    platformFeeRate: 8,
    shippingFee: 2500,
    adCost: 1500,
    discount: 0,
    stock: 20,
  },
]

describe('sellerops calculations', () => {
  it('calculates row-level sales, costs, profit, margin, and break-even price', () => {
    expect(calculateOrderMetrics(rows[0])).toEqual({
      grossSales: 60000,
      platformFee: 6000,
      totalProductCost: 36000,
      totalCost: 55000,
      netProfit: 5000,
      marginRate: 8.333333333333332,
      breakEvenPrice: 27222.222222222223,
      adCostRate: 13.333333333333334,
    })
  })

  it('can calculate profit from VAT-included sales and product cost inputs', () => {
    const metrics = calculateOrderMetrics(rows[0], { vatMode: 'included' })

    expect(metrics.grossSales).toBe(60000)
    expect(Math.round(metrics.totalProductCost)).toBe(32727)
    expect(Math.round(metrics.netProfit)).toBe(2818)
    expect(Math.round(metrics.breakEvenPrice)).toBe(27944)
  })

  it('aggregates product rows and classifies risk', () => {
    const products = aggregateProducts(rows)

    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({
      productName: '무선 키보드',
      grossSales: 60000,
      netProfit: 5000,
      marginRate: 8.3,
      riskLevel: 'high',
    })
    expect(products[1]).toMatchObject({
      productName: '스마트폰 거치대',
      grossSales: 36000,
      netProfit: 14120,
      marginRate: 39.2,
      riskLevel: 'low',
    })
  })

  it('aggregates dashboard summary and trend data', () => {
    const dashboard = aggregateDashboard(rows)

    expect(dashboard.summary).toEqual({
      totalRevenue: 96000,
      totalProfit: 19120,
      averageMarginRate: 19.9,
      riskProductCount: 1,
    })
    expect(dashboard.categoryProfit).toEqual([
      { category: '디지털', grossSales: 60000, netProfit: 5000 },
      { category: '생활용품', grossSales: 36000, netProfit: 14120 },
    ])
    expect(dashboard.dailyTrend).toEqual([
      { orderDate: '2026-05-01', grossSales: 96000, netProfit: 19120 },
    ])
    expect(dashboard.priorityProducts[0].productName).toBe('무선 키보드')
  })

  it('validates missing columns and invalid row values', () => {
    const missingColumnResult = parseCsvRows([], ['orderDate', 'productName'])
    expect(missingColumnResult.issues.some((issue) => issue.field === 'category')).toBe(true)

    const invalidResult = parseCsvRows(
      [
        {
          orderDate: '2026/05/01',
          productName: '',
          category: '디지털',
          quantity: '-1',
          unitPrice: '30000',
          productCost: '18000',
          platformFeeRate: '120',
          shippingFee: '3000',
          adCost: '8000',
          discount: '2000',
          stock: '4',
        },
      ],
      [
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
      ],
    )

    expect(invalidResult.validRows).toHaveLength(0)
    expect(invalidResult.issues.length).toBeGreaterThanOrEqual(4)
  })

  it('normalizes common CSV number formats before validation', () => {
    const result = parseCsvRows(
      [
        {
          orderDate: '2026-05-01',
          productName: '무선 키보드',
          category: '디지털',
          quantity: '2',
          unitPrice: '30,000원',
          productCost: '18,000',
          platformFeeRate: '10%',
          shippingFee: '3,000',
          adCost: '8,000',
          discount: '2,000',
          stock: '4',
        },
      ],
      [
        '\uFEFForderDate',
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
      ],
    )

    expect(result.issues).toHaveLength(0)
    expect(result.validRows[0]).toMatchObject({
      unitPrice: 30000,
      productCost: 18000,
      platformFeeRate: 10,
    })
  })
})
