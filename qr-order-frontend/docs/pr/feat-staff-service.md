# 개요

스태프 서비스 지급 기능을 구현했다. 스태프가 손님 테이블에 메뉴를 무상 제공하면 손님
청구액은 0원이 되고, 정가의 80%를 지급을 요청한 스태프가 부담한다. 부담금은 행사 종료 후
총무가 개인별로 한 번에 수금한다.

지급 시 스태프는 **손님에게 보낼 메시지**를 함께 적을 수 있고, 그 문장은 손님 주문
내역(S08)에 그대로 표시된다.

화면은 셋이다 — **A10 서비스 지급**(테이블 단위), **B04 서비스 정산**(스태프 단위), 그리고
**S08 주문 내역**의 서비스 회차 표시(고객 앱).

계약은 `docs/qr-order/google-sheets-schema.md` §9/§12/§17~§19와
`docs/qr-order/apps-script-api-design.md` §4.20~§4.22에 함께 확정했으며, 같은 브랜치의
선행 커밋에 들어 있다.

# 변경 사항

## 라우트

| 경로 | 화면 |
|---|---|
| `/staff/tables/:tableId/service` | A10 — 서비스 지급 |
| `/staff/service` | B04 — 서비스 정산 |

`StaffTableOperationRoute`의 다이얼로그 패턴이 아니라 전체 화면 라우트다 — 메뉴 그리드가
필요하고, 부담 스태프(필수)와 손님에게 보낼 메시지(선택)라는 결정이 둘 더 붙기 때문이다.

## A02 주 액션 교체

A02 인스펙터 패널에서 **`주문 추가`를 없애고 그 자리를 `서비스 제공`으로 바꿨다.** 손님이
각자 휴대폰으로 주문하므로 운영진이 대행 주문을 넣을 자리가 A02에 있을 이유가 없고, A02에서만
할 수 있는 일은 서비스 지급 쪽이다.

- `TableDetailActions`에서 `onAddOrder`를 제거했다. 패널은 더 이상 A03을 열지 않는다.
- 이전 커밋에서 하단 액션 행에 넣었던 보조 `서비스` 버튼은 삭제했다. 주 버튼과 중복이다.
- 액션 행은 `이동 · 합석 · 분리 · 할인` 4개로 원래대로 돌아왔다.
- Figma `staff/TableDetailPanel`(`89:8`)의 버튼 라벨도 함께 바꿔 A02 프레임(`90:183`)에
  반영되게 했다.

## 좌측 레일

`StaffNavigation` 항목이 5개에서 6개가 됐다. 순서는
`테이블 · 주방 · 서빙 · 결제 · 서비스 · 설정`이다.

레일 정의가 4개 페이지에 하드코딩돼 있어 `staffNavItems(counts, extra)` 헬퍼로 한 번
추출하고, `StaffTableHomePage` / `StaffStationPage` / `StaffAddOrderPage` /
`StaffSettingsPage` 네 곳을 모두 이 헬퍼로 바꿨다. 6번째 항목을 네 곳에 복붙하면 화면마다
레일이 어긋날 여지가 생긴다.

## 새 컴포넌트

| 파일 | 역할 |
|---|---|
| `pages/staff/StaffServicePage.tsx` | A10 본체. A03의 3단 구조 |
| `pages/staff/StaffServiceRoutes.tsx` | A10/B04 라우트와 페이지 상태 |
| `components/staff/StaffMemberPicker.tsx` | 부담 스태프 검색·선택 |
| `components/staff/ServiceChargeDialog.tsx` | 지급 확인 |
| `components/staff/SettlementCard.tsx` | B04 카드 1장 |
| `components/staff/SettlementDialog.tsx` | 스태프별 지급 내역 + 수금 확정 |
| `components/staff/SettlementStatusBadge.tsx` | 미정산 / 정산 완료 |
| `components/staff/staffNavItems.ts` | 공용 레일 정의 |

## 고객 앱 (S08)

서비스 회차를 손님이 알아볼 수 있게 `OrderRound`와 `OrderLine`을 확장했다. 새 컴포넌트는
만들지 않았다.

- `OrderRound` — `service` / `serviceMessage` / `chargedStaffName` 옵셔널 prop 추가.
  `서비스` 배지와 메시지 블록(`"…" + 김하늘 드림`)을 렌더링한다.
- `OrderLine` — `comped` 옵셔널 prop 추가. 정가에 취소선을 긋고 `0원`을 함께 보여준다.
- `types/order.ts` — `OrderKind`와 `serviceMessage` / `chargedStaffName` 추가.
  `PlacedOrder`는 localStorage에 저장되므로 전부 옵셔널이며, 값이 없으면 `GUEST`로 읽는다.
- `api/orders.ts` — `orders/list` 응답의 `orderKind` / `serviceMessage` /
  `chargedStaffName`을 매핑한다. `GUEST` 회차에는 두 필드를 `null`로 떨어뜨려 빈 메시지
  블록이 그려지지 않게 한다.

## 재사용한 기존 컴포넌트

`StaffStationPage`(B03 셸), `StaffDialog`/`ImpactNote`, `OperationalButton`,
`CategoryTabs`(plain-CSS 원본), `QuantitySelector`(plain-CSS 원본), `StaffMenuCard`,
`StaffEmptyState`, `StaffInlineAlert`, `formatStaffAmount`. 새 다이얼로그 셸은 만들지
않았고, B04는 B03이 쓰는 `StaffStationPage`를 `sections[]` 계약 그대로 재사용한다.

## 데이터

- `src/api/staff/service.ts` — `members/list`, `orders/service`(§4.20),
  `settlements/list`(§4.21), `settlements/confirm`(§4.22)와 매퍼, 그리고 부담금 계산
  `staffServiceCharge()`.
- `src/hooks/useStaffMembers.ts` — 학생회 명단. 행사 중 바뀌지 않으므로 폴링하지 않는다.
- `src/hooks/useStaffSettlements.ts` — 정산 목록과 수금 확정. 마운트 시와 확정 후에만
  다시 읽는다.
- `src/types/staff.ts` — `StaffOrderKind`, `StaffMember`, `StaffServiceCharge`,
  `StaffSettlement`, `StaffSettlementOrder` 추가.
- `src/data/staff.ts` — 명단 10명과 지급 8건 목업 추가. 훅만 읽으며 페이지는 `src/data`를
  직접 import하지 않는다.

## 토큰

**`tokens.css`는 수정하지 않았다.** 이 기능에 필요한 값이 전부 기존 토큰으로 덮인다.

- 레이아웃: `--layout-staff-panel-width`(A03 패널 = 지급 패널 420px),
  `--layout-staff-station-card-width`(B03 카드 = 정산 카드 342px),
  `--layout-staff-rail-width`, `--layout-staff-header-height`, `--layout-staff-gutter`,
  `--layout-staff-control-height`
- 타이포: `--type-staff-metric`(부담액·수금액), `--type-title-section`, `--type-body-strong`,
  `--type-caption-default/strong`, `--type-micro-badge`
- 색: `--color-staff-status-unpaid-*`(미정산), `--color-staff-status-paid-*`(정산 완료),
  `--color-bg-weak`/`--color-text-weak`(선택 상태), `--color-status-attention-*`(정산 후
  금액 변동 경고)

# Figma

이 기능의 프레임은 없었으므로 **새로 그렸다.** `Staff POS — iPad`(`81:132`) 페이지에
기존 프레임과 같은 1274px 간격으로 이어 붙였다.

| 프레임 | 노드 | 위치 |
|---|---|---|
| A10 — Service Grant | `220:1805` | x=15688 |
| B04 — Service Settlement | `222:1861` | x=16962 |

구조 출처는 지시대로 A03 — Add Order(`92:817`)와 B03 — Payment(`91:723`)이며, 두 프레임을
`get_metadata`로 읽어 레일 88 / 헤더 72 / 거터 24 / 패널 420 / 카드 342 / 타일 202×84
지오메트리를 그대로 따랐다. 색은 전부 파일의 기존 변수(`bg/canvas`, `text/strong`,
`status/unpaid-*` 등)에 바인딩했고 하드코딩한 hex는 없다. 폰트는 Noto Sans KR
Bold/Regular로 기존 프레임과 같다.

A10의 입력 필드는 `사유`에서 `손님에게 보낼 메시지`로 바꾸고 그 아래 안내 문구를 더해
구현과 일치시켰다.

# 검증

- `npm run lint` — 통과 (경고 0)
- `npm run build` — 통과 (`tsc -b && vite build`, 174 modules)
- `npm test` — 통과 (1 파일 2 테스트)
- 렌더링 검증 — 아이패드 뷰포트 1194×834에서 스태프 두 화면을, 390px와 320px에서 고객
  S08을 실제로 띄워 확인했다. 가로 overflow 없음, 콘솔 에러 없음.
- 메시지 왕복 검증 — A10에서 메시지를 입력하면 글자 수(`20/100자`)와 확인 다이얼로그의
  인용 블록에 그대로 반영되고, 고객 S08에서 `서비스` 배지 · 메시지 · `김하늘 드림` ·
  정가 취소선과 `0원`이 함께 표시되는 것까지 확인했다. 서비스 회차는 합계에 0을 더하므로
  `현재까지 합계`는 23,000원 그대로였다.
- 금액 검증 — 정가 ₩28,000에서 `floor(28000 × 20 / 100) = 5,600`을 빼 부담액 ₩22,400.
  화면·다이얼로그·정산 카드가 모두 같은 값을 보인다.
- 플로우 검증 — 지급 화면에서 메뉴 담기 → 부담 스태프 선택 → 확인 다이얼로그까지, 정산
  화면에서 카드 → 내역 다이얼로그 → 수금 완료 → 카드가 `정산 완료` 섹션으로 이동하고 요약과
  레일 배지가 함께 감소하는 것까지 확인했다.

목업 검증을 위해 `.env.development.local`의 `VITE_API_BASE_URL`을 잠시 비웠고 검증 후
원래 값으로 복원했다. 이 파일은 git 추적 대상이 아니며 커밋에 포함되지 않는다. 고객 S08은
백엔드가 없어 `localStorage`에 서비스 회차 한 건을 넣어 렌더링을 확인한 뒤 지웠다.

# 참고 사항

Figma 프레임이 없어 판단으로 정한 부분과 그 이유다.

## 화면 구조

- **A10을 `StaffAddOrderPage` 재사용이 아니라 별도 페이지로 만들었다.** A03의 props가
  `tableId/draft/note/onSubmit` 고정인데 여기에 `chargedStaffId`·`serviceMessage`·부담액
  패널이 더해지면 props가 두 배가 되고 두 화면 모두 읽기 어려워진다. 3단 구조와 CSS 값은
  동일하게 가져가되 페이지는 분리했다.
- **A10에는 확인 다이얼로그가 있다. A03에는 없다.** A03은 "담은 항목 패널이 곧 확인이고 모든
  줄이 편집 가능하다"는 것이 명시적 설계였다. 서비스 지급은 명단의 특정 개인에게 금액을
  지우는 행위이고 §4.18에 따라 지급 후 수정이 불가능하므로, 결과를 읽고 확정하는 단계가
  필요하다고 판단했다.
- **A10에 `품절 관리`를 넣지 않았다.** A03에 이미 있고, 같은 스위치를 두 화면에서 뒤집을 수
  있게 만들 이유가 없다. A02에서 A03 진입점이 사라진 지금은 `품절 관리`가 갈 곳을 잃은
  상태이며, 아래 "남은 작업"에 적었다.
- **`서비스 제공`을 주 버튼(파란 채움)에 두었다.** 지시대로 `주문 추가` 자리를 그대로
  물려받았다. 익숙한 자리라 잘못 누를 수 있지만, A10에 들어가는 것 자체로는 아무것도
  기록되지 않는다 — 부담 스태프를 고르고 확인 다이얼로그를 읽어야 주문이 쓰인다. 되돌리는
  비용이 화면 이동 한 번이라 주 버튼에 두어도 안전하다고 판단했다.
- **B04 상세를 다이얼로그로 열었다.** 지시는 "B03의 목록/상세 레이아웃"이었지만
  `91:723`을 읽어 보니 B03에는 상세 페인이 없고 342px 카드 그리드만 있다(목록/상세 2단은
  A02의 패턴이다). 새 셸을 만들지 않기 위해 목록은 B03 셸 그대로 두고, 스태프별 지급 내역과
  수금 확정은 A04~A07이 쓰는 wide `StaffDialog`에 담았다. 이 선택은 사전에 확인받았다.

## 목록과 노출

- **B04 미정산 섹션에서 부담액 0원인 인원을 숨긴다.** §4.21은 명단 전체를 반환하도록
  확정돼 있고 클라이언트는 그 계약을 그대로 받지만, 화면에는 잔액이 있는 사람만 그린다.
  지급 이력이 없는 사람은 낼 것이 없고, ₩0 카드 여섯 장이 실제로 찾아가야 할 세 명을
  덮는다. 정렬은 부담액 내림차순이다 — B01이 테이블 번호가 아니라 경과 시간으로 정렬하는
  것과 같은 이유다.
- **레일 `서비스` 배지는 미정산 "인원 수"다.** 지급 건수가 아니다. 총무가 밤 끝에 0으로
  만들어야 하는 숫자가 인원 수이기 때문이다.
- **부담 스태프 이름은 주방·서빙 응답에 싣지 않는다.** 문서 §9에 계약으로 명시했다. 이번
  프론트엔드 범위에는 주방 화면 변경이 없어 코드 변화는 없지만, 백엔드 구현 시 지켜야 한다.

## 손님에게 보낼 메시지

- **필드 이름을 `service_reason`이 아니라 `service_message`로 바꿨다.** 이 값은 내부 사유
  메모가 아니라 손님 화면에 그대로 뜨는 문장이다. "사유"로 읽히면 운영진이 `진상 테이블
  달래기` 같은 내부 표현을 적고 그 문장이 손님 기기에 표시된다. 백엔드가 아직 없어 문서상
  이름만 바꾸면 되는 시점이라 지금 정리했다.
- **필드 바로 아래에 "손님 주문 내역에 그대로 표시됩니다"를 적었다.** 툴팁이나 도움말이
  아니라 입력하는 자리에 둔다. 이 화면이 막아야 할 유일한 사고가 내부 메모를 손님용
  칸에 적는 것이기 때문이다.
- **확인 다이얼로그가 메시지를 인용해 되보여준다.** 운영진이 자기가 친 문장이 아니라
  손님이 읽을 문장을 확인하고 확정하게 한다.
- 선택 항목이다. 비어 있으면 확인 다이얼로그가 "메시지는 비어 있습니다"라고 명시하고,
  손님 화면에는 `서비스` 배지와 0원만 표시된다.
- 100자 제한이며 입력 중 글자 수를 표시한다.
- **주방·서빙 응답에는 싣지 않는다.** 부담자 이름과 같은 규칙이다 — 손님용 인사말이 조리
  지시와 섞이면 노이즈다. 문서 §9 노출 규칙 표에 열을 추가했다.
- 스태프 자유 입력이 손님 기기에 렌더링되므로 React가 텍스트로 이스케이프한다.
  `dangerouslySetInnerHTML`을 쓰지 않으며 마크다운도 해석하지 않는다.

## 고객 화면의 0원 표시

- **정가에 취소선을 긋고 `0원`을 나란히 보여준다.** 0원만 적으면 손님은 그 회차가 원래
  얼마짜리인지 모르고, 서비스의 의미도 전달되지 않는다.
- 서비스 회차도 자기 차수(`2차 주문`)를 그대로 갖는다. 실제로 하나의 주문이고 조리·서빙
  상태도 따로 진행되므로 회차에서 빼면 상태 칩이 갈 곳이 없어진다.
- `현재까지 합계`는 바뀌지 않는다. 서비스 회차의 `total`이 0이라 기존 합산식이 그대로
  맞는다 — 스키마 §15 subtotal이 무변경인 것과 같은 이유다.

## 부담금 계산

- **`staffServiceCharge()`는 할인액을 floor한 뒤 뺀다** — `gross - floor(gross × rate/100)`.
  부담액을 직접 floor하지 않는다. 스키마 §15의 `discount_amount`가 같은 형태이고, 두 식은
  실제로 값이 다르다(정가 1,001원·20%에서 800 vs 801). line별이 아니라 주문 총액에 floor
  1회다.
- 프론트의 계산은 **표시용**이다. 저장되는 값은 서버가 계산한 `staffChargeAmount`이며,
  `STAFF_DISCOUNT_RATE`는 목업 경로에서만 클라이언트 상수(`20`)를 쓴다.

## 부담 스태프 선택 UI

- **타일이 아니라 검색 가능한 라디오 리스트다.** 이동 다이얼로그의 `TableChoice`(148×64
  타일)는 테이블 15개에는 맞지만 명단 수십 명에는 맞지 않는다. 행 스타일은
  `.operation-dialog__option`을 따라가 같은 계열로 읽히게 했다.
- **자유 입력과 `기타` 행이 없다.** 스키마 §19가 명단을 입력 도메인 전체로 정의한다. 명단
  밖 이름을 받으면 아무에게도 청구할 수 없는 부담금이 생긴다.
- `active=FALSE`인 인원은 선택 목록에서 빠지되 기존 주문과 정산은 유지된다.

## 함께 고친 것

- **`CategoryTabs`의 pill variant에 `flex-shrink: 0`을 추가했다.** 스태프 두 호스트가 모두
  세로 flex 컨테이너라 탭 스트립이 0px로 줄어들고 있었다. **A03에도 이미 있던 버그로**,
  구현 중 렌더링 확인에서 발견했다(수정 전 `getBoundingClientRect().height === 0`). pill
  variant는 스태프 전용이라 고객 앱에는 영향이 없다.

## 남은 작업

- **Figma `staff/StaffNavigation` 컴포넌트 세트에 `서비스` 행이 없다.** 새 프레임 두 장은
  6개짜리 레일을 로컬로 그렸고 공유 컴포넌트를 인스턴스하지 않았다. 공유 세트를 고치면 모든
  variant에 행을 추가해야 하고 기존 프레임 15장의 모습이 함께 바뀌므로, "프레임 두 장을
  그린다"는 이번 범위를 넘는다고 판단했다. 컴포넌트 세트 갱신은 별도 작업으로 남긴다.
- **백엔드 4개 endpoint가 아직 없다.** `members/list`, `orders/service`,
  `settlements/list`, `settlements/confirm`. `VITE_API_BASE_URL`이 설정된 환경에서는 명단이
  비고 정산 목록이 에러 상태로 떨어진다.
- `members/list`는 §4.20~§4.22에 없는 다섯 번째 action이다. `menu/list`·`orders/queue`와
  같은 위치의 프론트엔드 요구사항이며 문서에 추가하지 않았다.
- 정산 되돌리기(`UNSETTLED`로 복귀)는 문서 §4.22에 있지만 UI를 만들지 않았다. 잘못 확정한
  경우는 현재 화면에서 복구할 수 없다.
- 지급 화면은 옵션 선택을 지원하지 않는다. A03도 `optionSummary: '기본'` 고정이라 같은
  수준을 유지했다.
- **A03 주문 추가 화면은 지우지 않고 남겼다.** 진입점이 사라져 `/staff/tables/:tableId/order`
  직접 입력으로만 열린다. 페이지를 지우지 않은 이유는 거기에 `품절 관리`가 얹혀 있기
  때문이다 — 설정 화면에도 `판매` 체크박스가 있지만 그건 행마다 저장 버튼을 누르는 관리자
  폼이고, A03 쪽은 서비스 중 서서 한 번 탭하는 용도로 따로 만든 것이라 성격이 다르다.
  A03을 완전히 지우려면 `품절 관리`를 옮길 곳을 먼저 정해야 한다. 후속 결정 사항이다.
- 고객 S08의 서비스 회차는 `orders/list`가 `orderKind`를 내려주기 전까지는 나타나지 않는다.
  로컬에서 만든 주문은 항상 `GUEST`다.
- 메시지에 대한 금칙어·길이 외 검증은 없다. 손님에게 표시되는 값이므로 운영 정책이
  필요하다면 후속 작업이다.
