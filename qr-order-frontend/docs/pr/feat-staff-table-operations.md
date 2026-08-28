# 개요

테이블 대상 운영 화면 여섯 개를 구현했다 — **A03 주문 추가**, **A04 이동**,
**A05 합석**, **A06 분리**, **A07 할인**, **A08 주문 수정 / 메모**. A02 상세 패널의
액션 버튼들이 이제 실제 화면으로 이어진다.

`feat/staff-table-detail` 위에 쌓은 브랜치다.

# 변경 사항

## 라우트

| 경로 | 화면 |
|---|---|
| `/staff/tables/:tableId/order` | A03 — 주문 추가 (전체 화면) |
| `/staff/tables/:tableId/move` | A04 — 테이블 이동 |
| `/staff/tables/:tableId/merge` | A05 — 테이블 합치기 |
| `/staff/tables/:tableId/split` | A06 — 테이블 분리 |
| `/staff/tables/:tableId/discount` | A07 — 할인 적용 |
| `/staff/tables/:tableId/edit` | A08 — 주문 수정 / 메모 |
| `/staff/tables/:tableId/note` | A08과 같은 패널 (메모 진입점) |
| `/staff/tables/:tableId/cancel` | ConfirmDialog (주문 전체 취소) |

A04~A08은 테이블 그리드를 뒤에 그대로 두므로 `StaffTableOperationRoute` 하나가
셸을 공유한다 — 그리드·폴링·호출 스트립이 화면마다 새로 생기지 않는다.

## 새 컴포넌트

| 컴포넌트 | Figma |
|---|---|
| `StaffDialog` + `ImpactNote` + `DialogSummary` | A04~A07 공통 (93:852 외) |
| `ConfirmDialog` | `staff/ConfirmDialog` (99:1591) |
| `TableChoice` | Destinations 타일 (93:861) |
| `MoveTableDialog` | A04 (93:852) |
| `MergeTablesDialog` | A05 (95:1103) |
| `SplitTablesDialog` | A06 (95:1260) |
| `DiscountDialog` | A07 (95:1418) |
| `StaffMenuCard` / `AvailabilityCard` | A03 (92:840), 품절 관리 (102:1579) |
| `EditOrderPanel` | A08 (97:1407) |

**재사용:** `QuantitySelector`(고객앱)를 A03 초안과 A08 수정 목록에 그대로 썼다.
`CategoryTabs`에는 `variant="pill"`을 더해 A03이 재사용한다 — 키보드 모델과
`role="tablist"` 시맨틱이 동일하고 인디케이터만 다르므로 컴포넌트를 나누지 않았다.

## 데이터

- `src/api/staff/operations.ts` — `tables/move`(§4.14), `tables/merge`(§4.15),
  `tables/split`(§4.16), `tables/discount`(§4.13), `tables/confirm-payment`(§4.17).
  **모두 문서에 이미 있는 계약을 그대로 따랐다.**
- `src/api/staff/menu.ts` — `menu/list`, `menu/availability`, `orders/create`.
- `src/hooks/useStaffOperations.ts` — 제출·오류 처리 공통.
- `src/hooks/useStaffMenu.ts` — 메뉴 목록과 품절 토글(낙관적).

# Figma

| 프레임 | 노드 |
|---|---|
| A03 — Add Order | `92:817` |
| A03 상태 — 품절 관리 | `102:1579` |
| A04 — Move Table | `93:835` / 다이얼로그 `93:852` |
| A05 — Merge Tables | `95:970` / `95:1103` |
| A06 — Split Tables | `95:1127` / `95:1260` |
| A07 — Apply Discount | `95:1285` / `95:1418` |
| A08 — Edit Order / Note | `97:1315` / `97:1407` |

# 검증

- `npm run lint` / `npm run build` 통과.
- 1194×834 / 1024×768 양쪽에서 여섯 화면 모두 가로·세로 페이지 스크롤 없음.
- 상호작용 확인:
  - A04 — 사용 중 테이블은 선택 불가, T08 선택 시 impact 문구와 확인 버튼 라벨이
    `T08로 이동`으로 바뀜.
  - A05 — 빈 테이블과 이미 합석한 테이블은 선택 불가, 선택 전 확인 버튼 비활성.
  - A06 — 합석 그룹을 T01 / T02로 분해해 각 금액 표시.
  - A07 — 할인 없음 / 20% 전환 시 금액 분해가 즉시 갱신(₩64,000 → -₩12,800 → ₩51,200).
  - A03 — 메뉴 탭 두 번으로 수량 2, 합계 ₩28,000 반영. 품절 관리 전환 및 품절 항목
    선택 불가 확인.
  - A08 — 수량 스테퍼, 항목 취소 버튼(Danger 아웃라인), 메모 대상 칩 렌더 확인.
  - 취소 확인 다이얼로그가 건수와 금액을 구체적으로 말하는 것 확인.

# 참고 사항

## 새 API 액션 세 개

`operations.ts`는 전부 문서화된 계약이지만, A03에 필요한 다음 셋은 없다.

- **`menu/list`** — 고객용 `POST /menu`(§4.3)는 테이블 토큰 스코프라 운영 기기가
  부를 수 없다.
- **`menu/availability`** — 품절 토글.
- **`orders/create`**(운영 배포) — 고객용 §4.4는 테이블 토큰으로 인증한다.

A08의 수량 변경·항목 취소·메모 저장도 액션이 없다. 이번 브랜치에서는 **UI만
구현하고 호출은 연결하지 않았다** — 계약 없이 추측해서 부르면 잘못된 요청을 보내는
것보다 나쁜 게 없다. 아래 "미연결" 항목 참고.

## Figma와 다른 점

- **A05 합석 상대 선택 단계를 추가했다.** Figma A05는 T03과 T04가 이미 선택된
  상태만 그린다. 어디서 고르는지는 그리지 않아서, A04의 Destinations와 같은 패턴으로
  선택 단계를 넣었다. 선택 전에는 두 번째 슬롯이 점선 `?`이고 확인 버튼이 비활성이다.
- **다이얼로그 액션 행을 sticky로 고정했다.** 1024×768에서 A05가 뷰포트보다 길어
  `취소`/`합치기`가 스크롤 밖으로 나갔다. POS에서 확인 버튼이 스크롤에 묻히면 안 된다.
- **A03에 `닫기` 버튼을 추가했다.** Figma는 `주문 넣기`만 그리는데, 초안이 비어 있을
  때 이 화면에서 빠져나갈 방법이 없었다.
- **품절 토글의 빨간 아웃라인.** DESIGN.md §7은 빨강을 실패/지연 전용으로 두지만,
  Figma 102:1579이 품절 쪽을 빨간 아웃라인으로 그린다. 주문을 막는 정지 상태라
  의미가 맞다고 보고 Figma를 따랐다. 채운 빨강은 아니다.

## 판단한 것

| 항목 | 선택 | 근거 |
|---|---|---|
| 할인율 상수 | 20% (`TABLE_DISCOUNT_RATE`) | §4.13이 "0 또는 설정값"만 허용한다. 실제 값은 Settings에서 오므로 상수를 서버 값으로 교체해야 한다 |
| 이동 대상 | 빈 테이블만 | §4.14가 `DESTINATION_OCCUPIED`로 거절한다 |
| 합석 대상 | 사용 중이면서 합석이 아닌 테이블만 | §4.15의 `MERGE_CHAIN_NOT_ALLOWED` |
| 품절 토글 | 낙관적 반영, 실패 시 되돌림 | 102:1579이 "확인 단계는 없다 (되돌릴 수 있으므로)"라고 명시 |
| 작업 성공 후 | 다이얼로그 닫고 그리드 폴링에 맡김 | 로컬에서 반쯤 반영된 상태를 만들지 않는다 |

## 미연결 — 다음 작업

- **A08의 수량 변경·항목 취소·메모 저장**이 서버로 가지 않는다. `onQuantityChange`는
  비어 있고, `항목 취소`는 확인 다이얼로그로만 이동하며, `메모 저장`은 패널을 닫는다.
  `orders/items` 계열 액션이 정해지면 연결한다.
- **주문 전체 취소**도 같은 이유로 다이얼로그만 뜨고 실제 취소는 하지 않는다.
- A03의 옵션 선택이 없다. Figma A03은 메뉴 타일을 탭하면 바로 담기고 옵션 UI를
  그리지 않아서, 초안 항목의 옵션은 `기본` 고정이다. 옵션이 있는 메뉴를 운영 기기로
  주문하려면 별도 화면이 필요하다.
