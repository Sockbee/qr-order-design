# 개요

**A02 — Table Detail**을 구현했다. A01과 같은 화면에 420px 인스펙터 패널을 오른쪽에
붙이는 구조라, 별도 페이지를 만들지 않고 `StaffTableHomePage`에 패널 슬롯을 더했다.

`feat/staff-login` 위에 쌓은 브랜치다.

# 변경 사항

## 라우트

| 경로 | 동작 |
|---|---|
| `/staff/tables/:tableId` | A01 + 상세 패널. 테이블 카드를 누르면 여기로 온다 |

패널의 `✕`는 `/staff/tables`로 돌아간다. 액션 버튼들은 각각
`/staff/tables/:tableId/{order,payment,move,merge,split,discount,note,edit,cancel}`
로 이동하며, 해당 화면들은 아직 없다(아래 참고 사항).

## 새 컴포넌트

| 컴포넌트 | Figma |
|---|---|
| `TableDetailPanel` | `staff/TableDetailPanel` (89:8) |
| `OrderStatusDropdown` | `staff/OrderStatusDropdown` (83:47) |
| `StaffOrderItem` | `staff/StaffOrderItem` (87:68) |
| `OrderNote` | `staff/OrderNote` (87:81) |

`TableCard`에 `selected`를 추가했다(상세가 열린 카드는 2px 파란 테두리).
`StaffTableHomePage`에 `renderPanel(now)` 슬롯을 추가했다 — 패널의 경과 시간이
헤더 시계와 같은 tick을 쓰도록 clock을 넘긴다.

## 데이터

- `src/api/staff/detail.ts` — `tables/detail`, `orders/status` 호출과 매핑.
- `src/hooks/useStaffTableDetail.ts` — 상세 조회, 상태 변경(updating → success),
  실패 시 기존 상태 유지.
- `src/data/staff.ts` — `staffTableDetail(tableId)` 폴백 추가.

## 토큰

`--layout-staff-panel-width: 420px` 추가.

## 레이아웃 수정

`.staff-home`을 `min-height: 100dvh`에서 `height: 100dvh; overflow: hidden`으로
바꾸고 그리드만 `overflow-y: auto`로 만들었다. 이전에는 테이블이 많아지면 **페이지
전체가 스크롤되어 패널과 레일이 화면 밖으로 밀려났다.** POS는 크롬이 고정되고 그리드만
움직여야 한다. A01에도 함께 적용된다.

# Figma

| 프레임 | 노드 |
|---|---|
| A02 — Table Detail | `90:183` |
| TableDetailPanel | `90:304` / 컴포넌트 `89:8` |
| OrderStatusDropdown 상태 | `99:1504` |

# 검증

- `npm run lint` / `npm run build` 통과.
- 1194×834 — 3열 그리드 + 420px 패널, 가로 스크롤 없음, 페이지 스크롤 없음.
- 1024×768 — 2열로 wrap, 가로 스크롤 없음.
- 상호작용: 상태 드롭다운 열기(6단계, 선택 행 틴트 + ✓, 컨트롤과 8px 간격),
  다른 상태 선택 → success(초록 배경 + ✓ + 새 상태 즉시 반영) 확인.
- 취소된 항목이 취소선 + `취소됨` 칩으로 남고 목록에서 지워지지 않는 것 확인.
- 항목 메모와 테이블 메모가 각각 렌더되는 것 확인.

# 참고 사항

## 새 API 액션이 두 개 더 필요하다

- **`tables/detail`** — §4.12 `tables/bill`은 금액만 준다. A02는 주문 항목 목록,
  메모, 대기 중인 호출까지 한 번에 필요하다. `bill`과 같은 금액 필드를 포함하도록
  형태를 잡아, 서버에서 한 구현이 둘을 다 서비스할 수 있게 했다.
- **`orders/status`** — 상태 드롭다운이 부르는 액션인데 문서의 endpoint 목록에 없다.
  `{ tableId, status }`로 정의했다.

둘 다 **Apps Script 구현이 없다.** `feat/staff-table-home`의 `tables/list`와 함께
계약을 확정해야 한다.

## 상태 변경 실패 시 롤백 방식

`99:1551`이 "무엇이 실패했고, 기존 상태가 유지되는지, 재시도가 가능한지를 모두
말한다"고 요구한다. 그래서 낙관적 갱신을 하지 않는다 — `updating` 동안 기존 상태를
그대로 두고, 성공해야 새 상태를 반영한다. 실패하면 상태는 애초에 바뀐 적이 없고
알럿만 뜬다. 되돌리는 애니메이션이 없어 "반쯤 반영됐나?"라는 의심이 생기지 않는다.

## 판단한 것

| 항목 | 선택 | 근거 |
|---|---|---|
| success 유지 시간 | 1.5초 (`SUCCESS_HOLD_MS`) | Figma가 success 상태를 그리지만 지속 시간은 말하지 않는다 |
| 옵션이 없는 항목 | `—` | A02의 해물파전 행이 `—`로 그려져 있다 |
| 상세 조회 갱신 | 폴링 없이 1회 조회 + 수동 reload | A01 그리드는 10초 폴링하지만, 패널까지 같이 돌리면 열어둔 동안 계속 요청이 두 배가 된다. 상태 변경은 사용자가 일으키므로 그때 반영하면 충분하다 |
| 결제 완료 테이블 | `결제 확인` 버튼 비활성 + 라벨 `결제 완료` | Figma는 미결제 상태만 그린다. 이미 받은 결제를 다시 확인하는 버튼은 위험하다 |

## 범위에서 뺀 것

- **패널의 액션 9개는 라우트로 이동만 하고 대상 화면이 아직 없다.** A03(주문 추가),
  A04(이동), A05(합석), A06(분리), A07(할인), A08(메모·수정), B03(결제)이 다음
  브랜치다. 현재는 `/staff/tables/:tableId/*`가 `*` catch-all에 걸려 `/`로 돌아간다.
- `주문 취소`는 Danger 아웃라인으로 그렸지만 **ConfirmDialog는 아직 없다.**
  `staff/ConfirmDialog`(99:1591)는 A08과 함께 구현한다. 그때까지 취소 버튼은
  확인 절차 없이 라우트만 바꾸므로, 실제 취소는 일어나지 않는다.
- `staff/ElapsedTimeIndicator`의 Warning(앰버) 단계는 A02 패널이 쓰지 않아
  아직 별도 컴포넌트로 만들지 않았다. B01 주방 뷰에서 필요해지면 그때 뺀다.
