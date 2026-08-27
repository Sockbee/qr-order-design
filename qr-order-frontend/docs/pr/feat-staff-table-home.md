# 개요

운영(staff) POS의 첫 화면인 **A01 — Table Home**을 구현했다. 좌측 레일, 헤더 요약,
직원 호출 스트립, 테이블 그리드와 그 상태(로딩 / 실패 / 빈 목록 / 호출 확인됨)까지
포함한다. 함께 **A00 — Staff Foundations**의 토큰과 공용 컴포넌트를 도입해, 이후
staff 화면들이 올라갈 토대를 만들었다.

Figma `81:132`은 프레임이 아니라 캔버스(페이지)이며 19개 프레임(A00~A09, B01~B03과
상태판)을 담고 있다. 한 PR로 다 넣을 수 없어 이번 브랜치는 A00 + A01로 한정했다.

# 변경 사항

## 라우트

| 경로 | 동작 |
|---|---|
| `/staff` | `/staff/tables`로 redirect |
| `/staff/tables` | `StaffTableHomePage` |

`App.tsx`에 `StaffTableHomeRoute`를 추가했다. staff 경로에서는 고객 세션 훅이
동작하면 안 되므로, `isStaffRoute`일 때 `credentials`를 `null`로 초기화해
`useStorefront` / `useOrderPolling` / `useStaffCall`이 요청을 시작하지 않게 했다.

## 새 컴포넌트 (`src/components/staff/`)

| 컴포넌트 | Figma |
|---|---|
| `StaffNavigation` | `staff/StaffNavigation` (84:90) |
| `TableCard` | `staff/TableCard` (87:45) |
| `TableStatusBadge` | `staff/TableStatusBadge` (82:20) |
| `CallRow` | `staff/CallRow` (106:124) |
| `OperationalButton` | `staff/PrimaryOperationalButton` (84:29) |
| `StaffEmptyState` | `staff/EmptyState` (86:25) |
| `StaffInlineAlert` | `FailureAlert` (99:1551) |
| `TableCardSkeleton` | `Skeleton` (99:1559) |

`staff/DiscountBadge`(82:28), `CallChip`(106:99), `MergeChip`(87:38)은 `TableCard`
안에서만 쓰이는 한 줄짜리 칩이라 별도 컴포넌트로 분리하지 않았다.

## 데이터

- `src/api/staff/client.ts` — 운영 전용 Apps Script 클라이언트.
  `VITE_STAFF_APPS_SCRIPT_URL`(고객용과 **별도 배포**)을 읽고 `staffToken`을 body에
  실어 보낸다. `STAFF_TOKEN_EXPIRED` / `REVOKED` / `INVALID` / `MISSING`을 재로그인
  트리거로 구분한다.
- `src/api/staff/tables.ts` — `tables/list` 호출과 `StaffTableSummary` 매핑.
- `src/api/staff/calls.ts` — `calls/list`(§4.10), `calls/acknowledge`(§4.11) 호출과
  `StaffCallGroup` 매핑.
- `src/types/staff.ts` — 매핑된 도메인 타입. 페이지는 이것만 받는다.
- `src/data/staff.ts` — `VITE_STAFF_APPS_SCRIPT_URL`이 없을 때만 쓰는 폴백.
  `useStaffTableHome`만 import하며 페이지는 접근하지 않는다.
- `src/hooks/useStaffTableHome.ts` — 폴링, 백오프, 문서 숨김 시 정지, 호출 확인.

## 토큰 (`src/styles/tokens.css`)

추가한 것만 적는다.

```text
--type-staff-table-no        700 32/40   (A00 신규)
--type-staff-metric          700 20/28   (A00 신규)
--color-staff-status-*-bg/fg 6단계 12개
--color-text-danger          #e42939
--layout-staff-rail-width / -header-height / -gutter
--layout-staff-card-width / -card-height / -control-height
```

`src/index.css`에 `#root:has(> .staff-home) { max-width: none }`를 추가해 staff
레이아웃이 고객앱의 480px 컬럼을 벗어나게 했다.

`src/utils/price.ts`에 `formatStaffAmount`를 추가했다(아래 참고 사항).

# Figma

기준 프레임은 다음과 같다. 파일 `u5pXNGrYEdVDbvqmJLglUS` (ui-ux).

| 프레임 | 노드 |
|---|---|
| Staff POS — iPad (캔버스) | `81:132` |
| A00 — Staff Foundations | `98:1403` |
| A01 — Table Home | `90:2` |
| A01 상태 — 드롭다운 / 실패 / 로딩 / 빈 화면 | `99:1501` |

`get_metadata` → `get_design_context` → `get_variable_defs` 순으로 읽었고, 각
컴포넌트의 Figma description(설계 의도)을 코드 주석으로 옮겼다.

# 검증

- `npm run lint` — 통과.
- `npm run build` — 통과 (`tsc -b && vite build`).
- dev 서버 렌더링 비교:
  - **1194×834** (Figma 기준 해상도): 5열 × 3행 그리드, 가로 스크롤 없음
    (`scrollWidth === clientWidth === 1194`).
  - **1024×768** (11인치 이전 iPad 가로): 4열로 자연 wrap, 가로 스크롤 없음.
- 상태별 확인:
  - 로딩 — 스켈레톤 15장, 셔머 없는 평평한 블록.
  - 실패(재시도 가능) — FailureAlert + `다시 시도` 버튼.
  - 실패(인증) — `로그인이 만료됐어요.`, 재시도 버튼 없음.
  - 호출 확인 — `확인` 클릭 시 해당 행이 `✓ 확인됨`으로 바뀌고, 헤더 `호출` 수,
    레일 배지, 카드의 `호출` 칩이 함께 줄어든다.
- 접근성 트리 확인: 인터랙티브 요소는 레일 링크 1개와 `확인` 버튼 2개뿐이며,
  각 버튼에 `테이블 N 호출 확인` 라벨이 붙는다.

# 참고 사항

## 새 API 액션이 필요하다 — `tables/list`

`docs/qr-order/apps-script-api-design.md`에 **테이블 그리드용 액션이 없다.** §4.12
`tables/bill`은 한 테이블의 청구 조회이지 층 전체 현황이 아니다. A01은 15개 타일의
상태·금액·경과·미처리·결제 여부를 한 번에 필요로 하므로, `src/api/staff/tables.ts`에
`tables/list`의 요청/응답 형태를 A01이 실제로 그리는 값에서 역산해 정의했다.
**Apps Script 쪽은 아직 구현되어 있지 않다.** 계약을 확정하기 전에 이 형태를 먼저
검토해달라. 나머지(`calls/list`, `calls/acknowledge`)는 문서의 계약을 그대로 따랐다.

## 상태 토큰 이름을 `staff-`로 네임스페이스했다

Figma A00은 회색 종료 단계를 `--color-status-served-*`로 부르는데, 고객앱은 같은
이름을 **초록**으로 이미 쓰고 있다(`#0f7a43`). 이름을 합치면 S08 주문 상태 화면이
조용히 다시 칠해진다. 그래서 `--color-staff-status-*`로 분리했다. 값 자체는 Figma
그대로다.

## 금액 표기가 UX-STRUCTURE와 다르다

UX-STRUCTURE §4.4는 `42,000원`을 요구하지만 A01은 `₩42,000`으로 그린다. CLAUDE.md의
우선순위(프레임이 실제로 그리는 것은 Figma가 우선)에 따라 Figma를 따랐고,
`formatStaffAmount`를 별도로 추가해 고객앱의 `formatPrice`는 건드리지 않았다.
198px 타일 안에서 금액이 한 줄에 들어가는 것도 이 표기 덕분이다.

## 헤더·레일 숫자를 Figma의 예시 값이 아니라 규칙에서 계산했다

- Figma는 헤더에 `활성 12 · 호출 2 · 미처리 8 · 지연 2`, 레일 배지에 `2`로 그려져
  있으나, 같은 프레임의 타일을 세면 활성은 11이고 미처리 합은 8이 아니다. 예시
  텍스트로 판단해 데이터에서 파생하도록 했다.
- 레일의 테이블 배지는 `staff/StaffNavigation` description이 **"주목이 필요한 수 —
  직원 호출 + 지연"**이라고 못박고 있어 그 규칙을 따랐다. 그래서 폴백 데이터에서는
  Figma 예시의 `2`가 아니라 `4`(호출 2 + 지연 2)가 나온다.
- 호출 개수는 "호출 건수"가 아니라 **"호출한 테이블 수"**다(§4.10 `tableCount`).

## Figma가 그리지 않아 판단한 것들

전부 상수로 빼두었으니 값만 바꾸면 된다.

| 항목 | 선택 | 근거 |
|---|---|---|
| 폴링 주기 | 10초 (`STAFF_POLL_INTERVAL_MS`) | 고객앱 15초보다 짧게. 놓친 호출이 이 화면이 막으려는 실패이고, iPad 1대가 운영 배포 1개를 부르는 부하는 홀 전체 휴대폰과 다르다 |
| 실패 백오프 | 10 → 20 → 40 → 60초 상한 | `useOrderPolling`과 동일한 형태 |
| 인증 실패 | 폴링 중단 | 죽은 토큰은 재시도해도 같은 거절만 반복한다 |
| 경과 시간 경고 | 24분 경고 / 35분 지연 | A00 예시가 18분 Normal · 24분 Warning · 38분 Delayed, A01은 22분이 Normal. 임계값 자체는 명시가 없다 |
| `확인됨` 행 유지 시간 | 5초 | 탭이 반영됐다는 것이 보여야 한다. Figma는 이 행을 그리지만 사라지는 시점은 말하지 않는다 |
| 최초 로드 실패 화면 | EmptyState 추가 | Figma에 없음. 알럿만 있고 본문이 비면 "테이블이 없음"으로 오독된다 |

## 범위에서 뺀 것

- **A02 — Table Detail이 없어서 테이블 카드는 아직 눌리지 않는다.** 목적지가 없는
  버튼을 두지 않으려고 `onSelect`를 optional로 만들었고, 핸들러가 없으면 카드는
  `div`로 렌더된다. A02가 들어오면 핸들러만 넘기면 `button`이 된다.
- **레일의 주방 / 서빙 / 결제는 링크가 아니다.** B01~B03이 이 브랜치에 없으므로
  `aria-disabled`인 비활성 항목으로 그렸고, 배지 숫자도 생략했다. 그 숫자의
  데이터 출처(주방 미처리 건수 등)가 B01의 API와 함께 와야 하는데 아직 없다.
  Figma는 `5 / 3 / 2`를 그리지만 지어내지 않았다.
- A01 상태판의 `OrderStatusDropdown`과 `ConfirmDialog`는 A02 이후 화면의
  컨트롤이라 이번 범위에서 제외했다.

## 그 외

- 배지의 6px 점과 10px 주목 점은 Figma가 SVG asset으로 내보내지만 CSS
  `border-radius` 원으로 그렸다. 아이콘이 아니라 색 표식이고, 자산 4개를
  커밋할 이유가 없다.
- 스켈레톤에 셔머를 넣지 않았다. Figma가 평평한 블록으로 그렸고 DESIGN.md §6도
  구분 수단을 divider / scrim / whitespace로 제한한다.
- 검증 해상도를 390px / 320px 대신 1194×834 / 1024×768로 바꿨다. iPad 가로 전용
  디자인이라 390px에는 대응 설계가 존재하지 않는다(사용자 확인 완료).
- `.env.example`에 `VITE_STAFF_APPS_SCRIPT_URL`을 추가했다. 실제 배포 URL과
  staff 토큰은 커밋하지 않는다.
