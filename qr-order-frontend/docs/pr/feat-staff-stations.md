# 개요

운영 스테이션 화면 세 개를 구현했다 — **B01 주방**, **B02 서빙**, **B03 결제**와 각
빈 상태. 이것으로 Figma `Staff POS — iPad` 페이지(`81:132`)의 화면이 전부 구현됐다.

`feat/staff-table-operations` 위에 쌓은 브랜치다.

# 변경 사항

## 라우트

| 경로 | 화면 |
|---|---|
| `/staff/kitchen` | B01 — 주방 |
| `/staff/serving` | B02 — 서빙 |
| `/staff/payment` | B03 — 결제 |

좌측 레일의 `주방` / `서빙` / `결제`가 이제 실제 링크다. A01·A03의 레일도 함께
연결했다.

## 새 컴포넌트

| 컴포넌트 | Figma |
|---|---|
| `StaffStationPage` | B01/B02/B03 공통 셸 (91:415 / 91:600 / 91:723) |
| `StationOrderCard` | `staff/KitchenOrderCard` (88:68) — 주방·서빙 공용 |
| `PaymentOrderCard` | `staff/PaymentOrderCard` |
| `ElapsedTimeIndicator` | `staff/ElapsedTimeIndicator` (82:27) |

## 데이터

- `src/api/staff/stations.ts` — `orders/queue`(신규), `orders/status`(주문 단위).
- `src/hooks/useStaffStations.ts` — 세 스테이션 단일 폴링, 낙관적 카드 제거,
  `tables/confirm-payment`(§4.17) 호출.
- `src/utils/elapsed.ts` — 스테이션별 경과 시간 임계값.
- `src/data/staff.ts` — B01~B03 폴백 큐 추가.

## 토큰

`--layout-staff-station-card-width: 342px` 추가.

# Figma

| 프레임 | 노드 |
|---|---|
| B01 — Kitchen | `91:415` |
| B01 상태 — 빈 주방 | `99:1606` |
| B02 — Serving | `91:600` |
| B02 상태 — 빈 서빙 | `99:1611` |
| B03 — Payment | `91:723` |
| B03 상태 — 입금 확인 / 빈 결제 | `99:1616` |

# 검증

- `npm run lint` / `npm run build` 통과.
- 1194×834 / 1024×768 양쪽에서 세 화면 모두 가로·세로 페이지 스크롤 없음.
- B01 — 신규 3 / 조리 중 3, T03이 `31분 지연` 적색 칩 + 적색 테두리, 헤더 `지연 1`.
  Figma와 일치.
- B02 — `방금` / `6분 대기`(앰버) / `14분 지연`(적색) 3단계 모두 Figma와 일치.
- B03 — 결제 대기 3 / 완료 3, 금액 분해와 상태 배지 일치.
  `입금 확인` 클릭 시 카드가 `결제 완료`로 이동하고 헤더·레일 숫자가 함께 감소.
- 빈 상태 — 서빙 큐를 모두 비우면 `서빙할 주문이 없어요` EmptyState 렌더 확인.

# 참고 사항

## 새 API 액션

- **`orders/queue`** — 세 스테이션의 대기열을 한 번에 반환한다. 레일 배지가 모든
  화면에서 같은 네 숫자를 보여야 하는데, 스테이션별로 나누면 화면마다 폴링이 세 개가
  된다. 응답에 `counts`를 포함시킨 이유다.
- **`orders/status`** — `feat/staff-table-detail`에서 `{ tableId, status }`로
  정의했는데, 스테이션은 티켓 하나를 넘기므로 `{ orderId, status }`도 받아야 한다.
  **한 액션이 둘 중 하나를 받는 형태**로 계약을 확정해야 한다.
- `tables/confirm-payment`는 §4.17 그대로다. `expectedFinalAmount`를 필수로 보내며,
  서버가 재계산 값과 다르면 `BILL_AMOUNT_CHANGED`로 거절한다.

## 경과 시간 임계값을 스테이션별로 나눴다

A00은 하나의 사다리(18 Normal / 24 Warning / 38 Delayed)를 예시로 들지만 **실제
화면이 이와 어긋난다.** B01은 31분을 지연으로 그리면서 16분은 아니고, B02는 6분을
앰버, 14분을 지연으로 그린다. 램프 아래 식어가는 접시와 아직 불 위에 있는 요리는
같은 시계로 잴 수 없으므로 하나로 합치지 않고 세 벌로 나눴다.

| 사다리 | Warning | Delayed | 근거 |
|---|---|---|---|
| `TABLE_ELAPSED` | 24분 | 35분 | A01의 22분 Normal / 38·41분 지연 |
| `KITCHEN_ELAPSED` | 24분 | 30분 | B01의 16분 Normal / 31분 지연 |
| `SERVING_ELAPSED` | 5분 | 12분 | B02의 방금 / 6분 앰버 / 14분 지연 |

정확한 값은 Figma에 없다. 예시 값들과 모순되지 않는 범위에서 고른 것이므로
운영 기준이 정해지면 이 세 상수만 바꾸면 된다.

## 낙관적 카드 제거

`조리 시작` / `서빙 완료`를 누르면 서버 응답을 기다리지 않고 카드가 큐에서 빠진다.
스테이션 화면은 양손이 찬 상태로 조작하는 화면이라, 왕복을 기다리는 동안 같은 티켓을
두 번 시작하는 일이 실제로 일어난다. 실패하면 알럿이 뜨고 다음 폴링에서 카드가
돌아온다.

## 판단한 것

| 항목 | 선택 | 근거 |
|---|---|---|
| 폴링 주기 | 10초 (`STAFF_POLL_INTERVAL_MS` 재사용) | A01과 같은 주기. 주방이 테이블 홈보다 느릴 이유가 없다 |
| 결제 완료 섹션 | 빈 상태 없이 섹션째 표시 | Figma가 완료 카드를 그리고, 0건이면 섹션 헤더만 남는다 |
| 레일 배지 | 화면에 보이는 큐에서 파생 | 큐를 비우면 배지도 즉시 준다. `테이블`만 서버 값이다 |
| 주방 카드의 금액 | 표시하지 않음 | `staff/KitchenOrderCard` description이 "금액을 절대 보여주지 않는다 — 주방은 돈으로 판단하지 않는다"라고 명시 |

## 남은 것

- A01·A02·A03의 레일 배지는 여전히 `주방`/`서빙`/`결제` 숫자가 비어 있다.
  `orders/queue`를 그 화면들에서도 폴링하면 가장 오래 열려 있는 화면의 요청이 두 배가
  된다. `tables/list` 응답에 `stationCounts`를 함께 실어 주는 쪽이 맞다고 보는데,
  그건 계약 확정 시 같이 정하는 게 좋겠다.
- `staff/OrderStatusDropdown`의 `Disabled` 상태는 아직 쓰는 화면이 없다.
