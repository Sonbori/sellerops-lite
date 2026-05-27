# SellerOps Lite

CSV 기반 온라인 셀러 수익성 운영 대시보드입니다. 주문 CSV를 업로드하면 상품별 매출, 비용, 순이익, 마진율, 손익분기 단가, 위험도를 브라우저에서 계산합니다.

이 프로젝트는 MarginMate의 후속 프로젝트로 설계했습니다. MarginMate가 단건 상품 계산 도구라면, SellerOps Lite는 반복 운영자가 CSV 데이터를 업로드해 상품별 수익성과 위험을 확인하는 대시보드입니다.

## Core Principle

```txt
계산은 TypeScript 순수 함수가 한다.
AI는 계산 결과를 해석한다.
```

현재 MVP에는 OpenAI API를 넣지 않았습니다. AI 요약은 2차 범위이며, 원본 CSV가 아니라 계산된 summary만 전송하는 구조로 확장할 계획입니다.

## MVP Features

- CSV 업로드
- 샘플 CSV 다운로드
- Zod 기반 CSV 검증
- 상품별 매출/비용/순이익/마진율 계산
- 손익분기 단가 계산
- 위험도 표시
- 상품명/카테고리 검색
- 카테고리/위험도 필터
- 요약 카드
- 카테고리별 순이익 차트
- 날짜별 매출/순이익 차트
- 상품별 수익 테이블
- 모바일 대응
- Vitest 계산 테스트
- Vercel 배포 준비

## Out of Scope

- 로그인
- DB 저장
- 결제
- 원본 CSV 저장
- OpenAI API
- 원본 CSV 전체 AI 전송
- 복잡한 AI 채팅
- 관리자 페이지

## CSV Schema

샘플 파일: [`public/sample-orders.csv`](./public/sample-orders.csv)

필수 컬럼:

```txt
orderDate
productName
category
quantity
unitPrice
productCost
platformFeeRate
shippingFee
adCost
discount
stock
```

| Column | Meaning |
| --- | --- |
| `orderDate` | 주문일, `YYYY-MM-DD` |
| `productName` | 상품명 |
| `category` | 카테고리 |
| `quantity` | 판매 수량 |
| `unitPrice` | 개당 판매가 |
| `productCost` | 개당 상품 원가 |
| `platformFeeRate` | 플랫폼 수수료율 |
| `shippingFee` | 주문 1건당 배송비 부담 |
| `adCost` | 주문 1건당 광고비 |
| `discount` | 주문 1건당 할인액 |
| `stock` | 현재 재고 |

## Calculation Formulas

계산 로직은 [`src/lib/sellerops.ts`](./src/lib/sellerops.ts)에 있습니다.

```txt
grossSales = quantity * unitPrice
platformFee = grossSales * (platformFeeRate / 100)
totalProductCost = quantity * productCost
totalVariableCost = totalProductCost + shippingFee + adCost + discount
totalCost = totalVariableCost + platformFee
netProfit = grossSales - totalCost
marginRate = grossSales === 0 ? 0 : (netProfit / grossSales) * 100
breakEvenPrice = totalVariableCost / (quantity * (1 - platformFeeRate / 100))
```

동일한 `productName + category` 조합은 상품별 테이블에서 집계됩니다.

## Risk Level

```txt
high:
  marginRate < 10
  or netProfit < 0
  or unitPrice <= breakEvenPrice

medium:
  marginRate >= 10 and marginRate < 20
  or stock <= 5

low:
  marginRate >= 20 and netProfit >= 0
```

위험도는 회계 판단이 아니라 운영 우선순위 표시입니다.

## Run Locally

```bash
pnpm install
pnpm dev
```

Validation:

```bash
pnpm test
pnpm build
```

## Test Coverage

현재 Vitest 테스트는 [`src/lib/sellerops.test.ts`](./src/lib/sellerops.test.ts)에 있습니다.

검증하는 내용:

- 주문 row 단위 매출/비용/순이익/마진율/손익분기 계산
- 상품별 집계
- 위험도 분류
- 대시보드 summary 집계
- 날짜별 trend 집계
- 필수 컬럼 누락 검증
- 잘못된 row 값 검증

## Phase 2 AI Summary Plan

AI 기능은 계산 결과를 해석하는 보조 기능으로만 추가합니다.

AI에 보낼 수 있는 데이터 예시:

```json
{
  "totalRevenue": 1200000,
  "totalProfit": 180000,
  "averageMarginRate": 15.2,
  "riskProducts": [
    {
      "productName": "무선 키보드",
      "category": "디지털",
      "marginRate": 4.1,
      "riskLevel": "high",
      "reason": "광고비 비중 높음"
    }
  ]
}
```

원본 CSV 전체는 AI API로 전송하지 않습니다.

## Known Limits

- 실제 플랫폼 정산액과 다를 수 있습니다.
- MVP는 부가세, 반품, 교환, 포인트, 결제 수단별 수수료를 자동 반영하지 않습니다.
- CSV 형식은 MVP 스키마에 맞춰야 합니다.
- 데이터는 브라우저에서 처리하며 서버 저장 기능은 없습니다.
- 사용량, 전환율, 매출 개선 같은 성과 지표는 아직 없습니다.
