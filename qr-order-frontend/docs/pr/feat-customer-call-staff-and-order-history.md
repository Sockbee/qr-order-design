# 개요

고객 화면에 **직원 호출(S09/S09b)** 과 **전체 주문 내역 조회(S08/S08b)** 를 추가한다.

기존에는 주문 내역이 주문을 넣은 뒤에만 도달 가능했고, 직원 호출은 S08 하단에 버튼만 있고 동작하지 않았다(`onCallStaff`가 빈 함수). 이번 변경으로 두 기능 모두 메뉴 화면에서 언제든 진입할 수 있다.

## 변경 사항

### 새 화면 / 상태

| 화면 | 경로 | 설명 |
|---|---|---|
| S09 직원 호출 | 오버레이 | 사유 선택(선택 사항) 후 호출 |
| S09b 호출 완료 | 오버레이 | 호출 접수 확인, 경과 시간, 호출 취소 |
| S08b 빈 주문 내역 | `/orders` | 주문 전 진입 시 |

### 진입점

- **S02 메뉴**: 앱바에 `주문 내역` · `직원 호출` 추가
- **S04 메뉴 상세**: 앱바에 `직원 호출` 추가
- **S08 주문 내역**: 앱바에 뒤로 가기 + `직원 호출` 추가, 제목을 `주문 현황` → `주문 내역`으로 변경

`직원 호출`은 손님이 *머무는* 화면(S02/S04/S08)에만 둔다. S05 장바구니 · S06 주문 확인 · S07 완료는 결제를 확정하는 단계라, 경쟁하는 두 번째 액션이 오탭을 유발한다.

### 추가된 컴포넌트

| 파일 | 역할 |
|---|---|
| `src/components/CallStaffSheet.tsx` / `.css` | S09 + S09b. 한 컴포넌트, 두 뷰 |
| `src/components/OrderStatusChip.tsx` / `.css` | 회차별 주문 상태 칩 |
| `src/hooks/useStaffCall.ts` | 호출 상태 머신, localStorage 지속 |
| `src/api/calls.ts` | `calls/create`, `calls/cancel` |
| `src/types/call.ts` | `CallReason` enum, 사유 목록 |
| `src/utils/call.ts` | `formatCallElapsed` |

### 수정된 컴포넌트

- **`AppBar`**: `cartCount` / `onCartClick` 제거, `actions: AppBarAction[]` 추가. 앱바의 `장바구니 N` 칩은 하단 `BottomOrderBar`와 같은 정보를 중복 표시하고 있어 제거했고, 그 자리를 진입점이 없던 두 기능에 넘겼다. 장바구니는 하단 바에 그대로 있다.
- **`OrderRound`**: `status` prop 추가. 회차가 2개 이상이면 1차는 `서빙 완료`인데 2차는 `조리 중`일 수 있어, 상단 트래커 하나로는 설명되지 않는다. 트래커는 최신 회차를 반영하고 회차별 칩이 실제 상태를 가진다.
- **`OrderStatusPage`**: 빈 상태(S08b) 분기, 뒤로 가기, 회차별 상태 칩.
- **`App.tsx`**: `useStaffCall`과 시트를 라우터 위에 배치. 장바구니와 같은 이유로, 메뉴 ↔ 상세 ↔ 주문 내역을 오가도 "직원을 불렀어요" 상태가 유지되어야 한다.

### 디자인 토큰 추가

`src/styles/tokens.css`에 주문 상태 색 12개 추가 (`--color-status-{accepted,preparing,served,closed,cancelled,attention}-{bg,fg}`).

약한 틴트만 쓰며 `#e42939`은 실제 실패에만 남겨둔다(DESIGN.md §7). 라벨이 상태를 전달하고 색은 보조이므로, 색만으로 구분될 필요가 없다.

## Figma

| 화면 | 프레임 | node id |
|---|---|---|
| S02 Menu Browsing | `S02 — Menu Browsing` | `14:15` |
| S04 Menu Detail | `S04 — Menu Detail` | `15:39` |
| S08 Order History | `S08 — Order Status` | `16:121` |
| S08b 빈 주문 내역 | `S08b — Order History · 비어 있음` | `105:189` |
| S09 직원 호출 | `S09 — Call Staff` | `105:92` |
| S09b 호출 완료 | `S09b — Call Staff · 호출 완료` | `105:146` |

파일: `u5pXNGrYEdVDbvqmJLglUS` (`ui-ux`), 페이지 `Screens — Primary Flow` (`4:11`).

## 검증

```bash
npm run lint    # 통과
npm run build   # 통과 (tsc -b && vite build)
```

렌더링 확인 (`npm run dev`, http://localhost:5173):

| 확인 항목 | 결과 |
|---|---|
| S02 앱바 `주문 내역` · `직원 호출` | Figma 일치 |
| S09 시트 — 사유 4개, 2×2 그리드 | Figma 일치 |
| 사유 선택 후 호출 → S09b에 사유 반영 | `앞접시` 정상 전달 |
| S09b — 체크 마크, 경과 칩, 호출 취소 | Figma 일치 |
| S08 — 회차별 상태 칩 (2차 `조리 중`, 1차 `서빙 완료`) | Figma 일치 |
| S08 누적 합계 42,000원 | 정상 |
| S08b 빈 상태 | Figma 일치 |
| 390px / 320px 가로 오버플로 | 없음 (`scrollWidth === clientWidth`) |

## 참고 사항

### 의도한 차이

- **앱바 `장바구니 N` 칩 제거.** Figma S02에도 없앤 상태이며, 하단 `BottomOrderBar`가 같은 개수와 총액을 이미 보여주고 있었다. `AppBar`의 `cartCount` / `onCartClick` prop을 함께 제거했다 — 사용처가 `MenuPage` 한 곳뿐이라 죽은 코드가 남지 않는다.
- **`직원 호출`·`주문 내역`은 배지가 아니라 테두리 버튼.** DESIGN.md §7은 배지를 "설명용이며 절대 액션이 아님"으로 정의한다. 시각 높이는 44px이고 히트 영역만 48px로 확장했다(UX-STRUCTURE §6.8).
- **S08 진입 시 빈 주문 내역을 리다이렉트하지 않는다.** 기존 `App.tsx`는 주문이 없으면 `/menu`로 되돌렸다. 이제 메뉴 앱바에서 언제든 들어올 수 있으므로 빈 상태가 정상이다.

### API 미연동 시 동작

`VITE_APPS_SCRIPT_URL`이 없으면 호출을 로컬에서 시뮬레이션한다(`callId`가 `local-` 접두사). 기존 mock 주문 흐름과 같은 방식으로, API 없이도 UI를 확인할 수 있게 한다.

### 백엔드 계약

`docs/qr-order/apps-script-api-design.md` §4.7 `calls/create`, §4.8 `calls/cancel`, `google-sheets-schema.md` §14 Calls를 따른다. `clientRequestId`는 재시도 시 재사용해 같은 호출이 두 번 접수되지 않게 한다.

`CALL_ALREADY_RESOLVED`(이미 직원이 확인함)는 실패로 다루지 않는다. 재시도할 일이 아니라 호출이 실제로 끝난 것이므로 활성 호출을 지우고 "직원이 이미 확인했어요"로 안내한다.

### 후속 작업

- **호출 남용 방지가 클라이언트에 없다.** 활성 호출이 있으면 시트가 S09b를 보여주어 중복 호출을 어렵게 만들지만, `호출 취소` 후 즉시 재호출하는 것은 막지 않는다. 서버의 `CALL_MIN_INTERVAL_SECONDS`(`CALL_TOO_FREQUENT`)에 의존하며, 해당 오류는 빨간 경고가 아니라 차분한 회색으로 표시한다 — 이미 한 번 성공한 상태라 실패가 아니다.
- **S09b의 경과 시간이 자동 갱신되지 않는다.** 시트를 다시 열 때 다시 계산된다. 타이머를 두면 배터리를 쓰는데, 시트는 오래 열어두는 화면이 아니다.
- **`직원 호출` 수신은 운영 앱(A01)에 이미 설계되어 있으나 구현 전이다.** 이번 PR은 고객 쪽만 포함한다.
