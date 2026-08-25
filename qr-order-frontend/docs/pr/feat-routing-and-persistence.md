# 개요

라우팅과 데이터 영속화를 도입했습니다. 화면 추가는 없고, 이미 구현된 7개
화면을 실제 앱처럼 동작하게 만드는 작업입니다.

- **라우팅** — `App.tsx`의 로컬 상태 화면 전환을 `react-router-dom` 기반
  실제 경로로 교체했습니다. 경로는 `UX-STRUCTURE.md` §2.1을 그대로 따릅니다.
- **영속화** — 장바구니와 주문 내역이 `localStorage`에 세션 토큰별로
  저장됩니다 (§5.1, §6.2). 지금까지는 새로고침하면 전부 사라졌습니다.

식당 와이파이 환경에서 새로고침이나 탭 손실로 주문 내역이 날아가는 것은
실사용 결함이라, 두 작업을 함께 처리했습니다.

## 변경 사항

### 라우팅

`src/App.tsx` — 전면 재작성. `BrowserRouter` + `Routes`로 구성했습니다.

| 경로 | 화면 |
|---|---|
| `/` | 마지막 세션으로 리다이렉트 |
| `/t/:token/start` | S01 Table Confirmation |
| `/menu` | S02 Menu Browsing |
| `/menu/:itemId` | S04 Menu Detail |
| `/cart` | S05 Cart |
| `/cart/confirm` | S06 Order Confirmation |
| `/orders/:orderNumber/done` | S07 Order Complete |
| `/orders` | S08 Order Status |
| 그 외 | `/`로 리다이렉트 |

**페이지 컴포넌트는 한 줄도 바뀌지 않았습니다.** 라우트 요소가 `useNavigate`·
`useParams`를 다루고 기존의 prop 인터페이스를 그대로 채웁니다. 라우터를 아는
곳은 `App.tsx` 하나뿐입니다.

잘못된 딥링크 가드:

- 존재하지 않는 메뉴 → `/menu`
- 존재하지 않는 주문번호 → `/orders`
- 빈 장바구니로 `/cart/confirm` 진입 → `/cart`
- 주문이 없는 상태로 `/orders` 진입 → `/menu`

주문 확정 시 `navigate(..., { replace: true })`를 씁니다. 이미 확정된 주문의
확인 화면으로 뒤로가기가 돌아가면 안 되기 때문입니다 (§5.2 — 확정된 주문은
손님 쪽에서 취소 불가).

### 영속화

- `src/utils/storage.ts` — 신규. 세션 토큰 스코프 키(`qr-order:{token}:*`)와
  가드된 읽기/쓰기. Safari 프라이빗 모드는 읽기·쓰기 모두 예외를 던지고,
  용량이 차면 쓰기가 실패합니다. **영속화 실패가 주문 흐름을 깨서는 안 되므로**
  모든 호출이 try/catch로 감싸여 있고 실패 시 메모리 상태로 degrade합니다.
- `src/hooks/usePersistentState.ts` — 신규. 초기값을 lazy하게 한 번만 읽어
  새로고침 시 저장된 값을 덮어쓰지 않습니다.
- `src/hooks/useOrderSession.ts` — 신규. 장바구니·주문 내역과 `addToCart`,
  `changeQuantity`, `placeOrder`를 한곳에 모았습니다. 기존 `App.tsx`에 흩어져
  있던 로직입니다.
- `src/types/session.ts`, `src/data/session.ts` — `TableSession.token` 추가.
  저장 키를 세션 단위로 나누는 근거입니다.

같은 토큰으로 다시 들어오면 기존 세션에 재참여합니다 (§5.1). `/`는 이 기기가
마지막으로 참여한 토큰으로 이동합니다.

### 의존성

- `react-router-dom` `^7.18.2` 추가.

## 검증

- [x] `npm run lint` — 통과, 경고 없음
- [x] `npm run build` — `tsc -b && vite build` 성공
- [x] 브라우저에서 전 구간 동작 확인, 콘솔 에러 없음

**경로 이동** — S01 `/t/demo-t7/start` → S02 `/menu` → S04
`/menu/kimchi-jjigae` → S05 `/cart` → S06 `/cart/confirm` → S07
`/orders/A-1044/done` → S08 `/orders` 전 구간에서 URL과 화면이 일치합니다.

**영속화** — 주문 2건을 넣은 뒤 `/orders`로 **전체 페이지 로드**를 했을 때
회차 2건과 합계 41,000원이 그대로 복원되었습니다. 저장 키는
`qr-order:demo-t7:cart`, `qr-order:demo-t7:orders`, `qr-order:last-token`.

**뒤로가기** — 주문 확정 후 `/orders/A-1044/done`에서 뒤로가기 시 `/cart`로
이동합니다(`/cart/confirm`이 아님 — `replace` 적용 확인). 한 번 더 누르면
`/menu`입니다.

**가드** — `/menu/nonexistent-item` → `/menu`, `/orders/A-9999/done` →
`/orders`, 빈 장바구니로 `/cart/confirm` → `/cart`, `/does-not-exist` →
`/t/demo-t7/start` 모두 확인했습니다.

레이아웃 변경이 없으므로 프레임 재측정은 하지 않았습니다.

## 참고 사항

**구현 중 잡은 문제 2건**

1. **라우트마다 `useOrderSession`을 호출하면 주문이 유실됩니다.** 처음에는 각
   라우트 요소가 세션 훅을 개별 호출하도록 짰습니다. 이 경우 주문 확정 시
   상태를 저장하는 `useEffect`의 소유 컴포넌트가 같은 커밋에서 언마운트되어
   **쓰기가 실행되지 않습니다.** 세션 상태를 라우터 위 `App`으로 올려 단일
   인스턴스로 만들고 props로 내려 해결했습니다.
2. **주문 확정 시 `/cart`로 튕기는 버그.** react-router v7은 네비게이션을
   transition으로 처리하는데, 장바구니를 비우는 일반 상태 업데이트가 먼저
   커밋되면서 `/cart/confirm`의 빈 장바구니 가드가 발동했습니다. 확정
   진행 중임을 나타내는 state를 두어 이동하는 동안 가드가 걸리지 않게 했습니다.
   (첫 시도는 `useRef`였으나 렌더 중 ref 접근을 금지하는 `react-hooks/refs`
   린트 규칙에 걸려 state로 바꿨습니다. 규칙이 옳습니다.)

**부수 효과 — 빈 장바구니 상태가 도달 가능해졌습니다.** 이전 PR에서 "삭제
수단이 없어 도달 불가한 방어 코드"라고 적었던 `cart-page__empty`가, 주문 확정
후 `/cart`로 직접 들어가면 실제로 렌더링됩니다. 다만 이는 여전히 임시
문구이며 `ext/EmptyState`(§5.5)로 교체되어야 합니다.

**의도적인 선택**

- **뒤로가기 버튼은 `navigate(-1)`이 아니라 명시적 경로로 이동합니다.**
  딥링크로 들어온 경우 `-1`은 앱 밖으로 나가버립니다. 브라우저 뒤로가기는
  별개로 정상 동작합니다.
- **`session_token`은 목 값 `demo-t7` 고정입니다.** 실제로는 QR의
  `store_id`+`table_id`에 대해 서버가 발급해야 합니다 (§0 A5, §5.1).
  현재 구조는 토큰만 실제 값으로 바뀌면 그대로 동작합니다.

**한계 / 후속 작업**

- **S00 세션 해석 화면이 없습니다.** `/t/:token`은 라우팅되지 않으며
  `/t/:token/start`만 존재합니다. 토큰 검증도 하지 않으므로 어떤 토큰이든
  S01이 뜹니다. E1(잘못된 QR)·E2(만료)가 들어올 때 함께 다뤄야 합니다.
- **저장된 데이터의 스키마 버전이 없습니다.** `PlacedOrder` 형태가 바뀌면
  기존 저장값을 읽다 깨질 수 있습니다. API 연동 시 버전 필드나 마이그레이션이
  필요합니다.
- S02b 검색, 오버레이 T1/D1–D3/B1–B2, 에러 E1–E5는 여전히 미구현이며
  **Figma 프레임이 존재하지 않습니다**(파일이 S08에서 끝납니다). `CLAUDE.md`에
  이 사실과 함께, 임의로 지어내지 말고 프레임을 기다리거나 UX-STRUCTURE
  §4.2/§5를 근거로만 만들라는 지침을 추가했습니다.
- `CLAUDE.md`의 "라우터 없음" 기술이 낡아서 현재 구조로 갱신했습니다.
