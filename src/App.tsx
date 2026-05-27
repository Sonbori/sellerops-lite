import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Search,
  Upload,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { clsx } from 'clsx'
import {
  aggregateDashboard,
  formatKRW,
  formatNumber,
  formatPercent,
  getRiskLabel,
  parseCsvRows,
  REQUIRED_COLUMNS,
} from './lib/sellerops'
import type { ProductMetrics, RiskLevel, ValidationIssue } from './lib/sellerops'

type RiskFilter = 'all' | RiskLevel

function issueSummary(issues: ValidationIssue[]) {
  if (issues.length === 0) {
    return '검증 오류 없음'
  }

  return `${issues.length}개 검증 오류`
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
        risk === 'high' && 'bg-red-100 text-red-700',
        risk === 'medium' && 'bg-amber-100 text-amber-700',
        risk === 'low' && 'bg-emerald-100 text-emerald-700',
      )}
    >
      {getRiskLabel(risk)}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-400" />
      <h2 className="mt-4 text-lg font-semibold text-slate-950">CSV를 업로드하세요</h2>
      <p className="mx-auto mt-2 max-w-[300px] text-sm leading-6 text-slate-600 sm:max-w-xl">
        샘플 CSV로 형식을 확인한 뒤 업로드하면 상품별 수익성, 위험도, 재고 상태를 볼 수 있습니다.
      </p>
    </div>
  )
}

function App() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')

  const loadSampleCsv = async () => {
    const response = await fetch('/sample-orders.csv')
    setFileName('sample-orders.csv')
    setCsvText(await response.text())
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sample') === '1') {
      void loadSampleCsv()
    }
  }, [])

  const parseResult = useMemo(() => {
    if (!csvText.trim()) {
      return null
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    })

    return parseCsvRows(parsed.data, parsed.meta.fields ?? [])
  }, [csvText])

  const dashboard = useMemo(() => {
    if (!parseResult || parseResult.validRows.length === 0) {
      return null
    }

    return aggregateDashboard(parseResult.validRows)
  }, [parseResult])

  const categories = useMemo(() => {
    if (!dashboard) {
      return []
    }

    return Array.from(new Set(dashboard.products.map((product) => product.category))).sort()
  }, [dashboard])

  const filteredProducts = useMemo(() => {
    if (!dashboard) {
      return []
    }

    const normalizedSearch = search.trim().toLowerCase()

    return dashboard.products.filter((product) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.productName.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch)
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const matchesRisk = riskFilter === 'all' || product.riskLevel === riskFilter

      return matchesSearch && matchesCategory && matchesRisk
    })
  }, [categoryFilter, dashboard, riskFilter, search])

  const columns = useMemo<ColumnDef<ProductMetrics>[]>(
    () => [
      {
        header: '상품',
        accessorKey: 'productName',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-950">{row.original.productName}</p>
            <p className="text-xs text-slate-500">{row.original.category}</p>
          </div>
        ),
      },
      {
        header: '수량',
        accessorKey: 'quantity',
        cell: ({ row }) => formatNumber(row.original.quantity),
      },
      {
        header: '매출',
        accessorKey: 'grossSales',
        cell: ({ row }) => formatKRW(row.original.grossSales),
      },
      {
        header: '순이익',
        accessorKey: 'netProfit',
        cell: ({ row }) => (
          <span className={row.original.netProfit < 0 ? 'text-red-700' : 'text-slate-950'}>
            {formatKRW(row.original.netProfit)}
          </span>
        ),
      },
      {
        header: '마진율',
        accessorKey: 'marginRate',
        cell: ({ row }) => formatPercent(row.original.marginRate),
      },
      {
        header: '손익분기 단가',
        accessorKey: 'breakEvenPrice',
        cell: ({ row }) => formatKRW(row.original.breakEvenPrice),
      },
      {
        header: '재고',
        accessorKey: 'stock',
        cell: ({ row }) => formatNumber(row.original.stock),
      },
      {
        header: '위험도',
        accessorKey: 'riskLevel',
        cell: ({ row }) => <RiskBadge risk={row.original.riskLevel} />,
      },
    ],
    [],
  )

  // TanStack Table exposes stable table helpers through this hook; React Compiler warns by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredProducts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setCsvText(await file.text())
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              SellerOps Lite
            </p>
            <h1 className="mt-2 max-w-[calc(100vw-2rem)] text-2xl font-bold leading-tight tracking-tight text-slate-950 [overflow-wrap:break-word] [word-break:keep-all] sm:max-w-3xl sm:text-4xl">
              주문 CSV 수익성 대시보드
            </h1>
            <p className="mt-3 max-w-[330px] text-sm leading-6 text-slate-600 [word-break:keep-all] sm:max-w-3xl sm:text-base">
              상품별 수익성과 위험도를 브라우저에서 계산합니다. AI 요약은 2차 범위입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSampleCsv()}
              className="inline-flex w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              샘플 데이터 보기
            </button>
            <a
              href="/sample-orders.csv"
              download
              className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400"
            >
              <Download className="h-4 w-4" />
              샘플 CSV 다운로드
            </a>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">CSV 업로드</h2>
                <p className="text-sm text-slate-500">원본 CSV는 브라우저 안에서만 처리합니다.</p>
              </div>
            </div>

            <label
              htmlFor="csv-upload"
              className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50/50"
            >
              <FileSpreadsheet className="h-10 w-10 text-slate-400" />
              <span className="mt-3 text-sm font-semibold text-slate-950">
                CSV 파일을 선택하세요
              </span>
              <span className="mt-1 max-w-full text-xs text-slate-500 [overflow-wrap:anywhere]">
                {fileName || `필수 컬럼 ${REQUIRED_COLUMNS.length}개 · 샘플 CSV로 형식 확인`}
              </span>
              <input
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void handleFile(file)
                  }
                }}
              />
            </label>
          </div>

          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">검증 결과</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {parseResult
                    ? `${parseResult.validRows.length}개 정상 row · ${issueSummary(parseResult.issues)}`
                    : 'CSV 업로드 후 검증 결과가 표시됩니다.'}
                </p>
              </div>
              {parseResult && parseResult.issues.length === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
            </div>
            {parseResult?.issues.length ? (
              <div className="mt-4 max-h-52 overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3">
                <ul className="space-y-2 text-sm text-amber-900">
                  {parseResult.issues.slice(0, 8).map((issue, index) => (
                    <li key={`${issue.row}-${issue.field}-${index}`}>
                      <span className="font-semibold">
                        {issue.row ? `${issue.row}행` : '파일'}
                        {issue.field ? ` · ${issue.field}` : ''}
                      </span>
                      : {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 max-w-[320px] rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600 sm:max-w-none">
                필수 컬럼, 숫자 범위, 날짜 형식을 검증합니다. 오류 row는 계산에서 제외합니다.
              </div>
            )}
          </div>
        </section>

        {!dashboard ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['총 매출', formatKRW(dashboard.summary.totalRevenue)],
                ['총 순이익', formatKRW(dashboard.summary.totalProfit)],
                ['평균 마진율', formatPercent(dashboard.summary.averageMarginRate)],
                ['위험 상품 수', `${dashboard.summary.riskProductCount}개`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-950">카테고리별 순이익</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.categoryProfit}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}만`} />
                      <Tooltip formatter={(value) => formatKRW(Number(value))} />
                      <Bar
                        dataKey="netProfit"
                        name="순이익"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-950">날짜별 매출 / 순이익</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="orderDate" />
                      <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}만`} />
                      <Tooltip formatter={(value) => formatKRW(Number(value))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="grossSales"
                        name="매출"
                        stroke="#2563eb"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="netProfit"
                        name="순이익"
                        stroke="#059669"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-950">상품별 수익 테이블</h2>
                  <p className="text-sm text-slate-500">
                    {filteredProducts.length}개 상품 표시 중
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="상품명 또는 카테고리 검색"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none ring-emerald-600 transition focus:ring-2 sm:w-64"
                    />
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-emerald-600 transition focus:ring-2"
                  >
                    <option value="all">전체 카테고리</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={riskFilter}
                    onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-emerald-600 transition focus:ring-2"
                  >
                    <option value="all">전체 위험도</option>
                    <option value="high">높음</option>
                    <option value="medium">주의</option>
                    <option value="low">낮음</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="px-4 py-3 font-semibold">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">AI Summary는 2차 범위</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 [word-break:keep-all]">
                이 MVP에서는 계산과 검증만 제공합니다. 다음 단계에서 원본 CSV가 아니라 총매출,
                총순이익, 평균 마진율, 위험 상품 목록처럼 계산된 summary만 OpenAI API로
                전달해 운영 리포트를 생성합니다.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

export default App
