# 2차 대형 배포 QA — 재현 이슈

검증일: 2026-09-22. 대상: `44a61677047e6109f65b76376154878ba026772d` + 기존 사용자 작업 트리. 전체 범위·제약·명령은 [QA 보고서](release-qa.md).

모든 재현은 일회용 로컬 PostgreSQL 17.11, Spring Boot API `127.0.0.1:18081`, production frontend `localhost:4179`에서 수행했다. 브라우저는 Codex In-app Browser이며 실제 모바일 기기가 아니다. 아래 `tableToken`·Bearer는 합성 fixture 인증으로 대체하고 원문은 증거에서 제거했다.

## RQA-001 / 원화 가격의 정수 overflow가 0원 판매로 이어짐 / P1

- **구분:** 실행으로 재현 — 관리자 API, 실제 DB, 운영 설정 UI, 고객 주문 API.
- **사전 조건:** 인증된 운영 계정과 테스트 메뉴. 운영 화면 1440×900.
- **최소 재현:**
  1. `/staff/settings`의 메뉴 가격에 `4294967296`을 입력하고 해당 메뉴의 저장을 누른다.
  2. 저장된 가격을 확인한다. 또는 `PUT /api/v1/admin/menus/<새 메뉴 ID>`에 정상 메뉴 필드와 `basePrice: 4294967296`을 전달한다.
  3. 고객 bootstrap으로 가격을 조회한 뒤 해당 메뉴 1개, `expectedTotalAmount: 0`, 새 `clientRequestId`로 주문한다.
- **기대:** 표현 범위를 넘거나 소수인 원화 금액은 400으로 거절하고 기존 가격을 보존한다. 입력한 값과 다른 가격을 성공 저장해서는 안 된다. 금액 필드는 정수 계약이며 엽전 가격은 이미 exact integer 검증을 적용한다.
- **실제:** 저장 API 200, DB `base_price=0`, UI 가격 `0`. 고객 주문도 200이며 `basePrice/unitPrice/lineTotal/totalAmount` 모두 0. 별도로 `1000.9` 입력은 1000으로 잘린다.
- **영향:** 운영 입력 오류가 판매 가격을 조용히 바꿔 무료 주문·잘못된 청구를 만든다. **비정상 경계값에서 재현한 결함이며 정상 10,000원 입력 자체에 문제가 있다는 뜻은 아니다.**
- **증거:** [API 경계값 결과](release-evidence/extra-results.json), [0원 주문 요청·응답](release-evidence/zero-price-order-proof.json), [운영 UI 저장 후 가격 0](release-evidence/price-overflow-ui.txt), [소수 가격 결과](release-evidence/api-results.json).
- **관련 코드:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/AdminService.java:83` 및 `:288`; `qr-order-frontend/src/pages/staff/StaffSettingsPage.tsx:198`, `:206`.
- **추정 원인:** `Number.intValue()`로 변환한 다음 범위를 검사한다. `2^32`는 0이 되어 `price < 0` 검사를 통과한다. UI 저장 활성 조건도 엽전 가격만 검사한다.
- **최소 수정 방향:** 변환 전 exact integer·범위 검증, 원화·수량·정렬 공통 검증기 적용, UI의 원화 가격 정수·상한 검증. 저장 성공 응답/재조회 금액의 일치와 overflow·fraction 회귀 테스트 추가.

## RQA-002 / 필수 요청 ID 누락을 허용해 동일 주문 재전송이 중복 저장됨 / P1

- **구분:** 실행으로 재현 — 실제 HTTP API·DB. 정상 UI의 연타와 응답 유실 재시도는 별도로 PASS.
- **사전 조건:** 정상 QR, 영업 중, 판매 가능한 닭발 10,000원.
- **최소 재현:** 다음 body를 `POST /api/v1/customer/orders/create`로 두 번 전송한다. 의도적으로 `clientRequestId`를 생략한다.

```json
{
  "tableId": "T19",
  "tableToken": "<local fixture token>",
  "expectedTotalAmount": 10000,
  "note": "QA synthetic",
  "items": [{"menuId": "chicken-feet", "quantity": 1}]
}
```

- **기대:** 공개 OpenAPI가 필수로 선언한 `clientRequestId`가 없으면 400이고 주문은 생성하지 않는다. 서버에서 새로운 요청 ID를 임의로 발급해 재전송 보호를 무력화하면 안 된다.
- **실제:** 두 요청 모두 200, `idempotentReplay=false`. 최종 재실행에서 각각 `A-1062`, `A-1063`, 서로 다른 `orderId`로 10,000원씩 저장된다.
- **영향:** 잘못된/구버전 클라이언트의 재시도 또는 API 직접 요청이 중복 주문·중복 청구를 유발한다. **현행 브라우저는 UUID를 전달하므로 정상 브라우저 경로에서 중복이 발생했다고 주장하지 않는다.**
- **증거:** [추가 API 결과의 required clientRequestId omission rejected](release-evidence/extra-results.json), [두 요청 원문을 마스킹한 trace](release-evidence/extra-trace.json), [실행 서버 OpenAPI required 목록](release-evidence/order-required-schema.json).
- **관련 코드:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/CustomerOrderService.java:75`; 계약은 `qr-order-backend/src/main/java/com/caucse/qrorder/api/OpenApiRequests.java:35`.
- **추정 원인:** 누락/null/blank 요청 ID를 `UUID.randomUUID()`로 치환한다. HTTP controller가 문서용 typed record 대신 Map을 받아 필수 선언이 런타임 검증으로 적용되지 않는다.
- **최소 수정 방향:** 고객 HTTP 주문에서 요청 ID를 필수 UUID로 검증하고 누락을 거절한다. 내부 신뢰 호출의 자동 생성이 필요하면 외부 경로와 구분한다. 누락·null·blank 및 반복 전송 회귀 검증 추가.

## RQA-003 / 운영 수량 수정에서 소수·overflow가 다른 수량으로 저장됨 / P2

- **구분:** 실행으로 재현 — 운영 API·DB. 일반 UI의 수량 버튼으로 overflow를 입력한 것은 아니다.
- **사전 조건:** 미결제·미조리 고객 주문의 활성 `itemId`.
- **최소 재현:** `POST /api/v1/staff/orders/update`에 `{"operation":"quantity","itemId":"<id>","quantity":1.9}` 전송. 별도 주문에서 `quantity:4294967297`도 전송한다.
- **기대:** 정수 1~99 이외의 값은 400, 기존 수량·금액은 보존.
- **실제:** 둘 다 200, 수량 1로 저장. 3개/30,000원이던 소수 수량 테스트는 1개/10,000원으로 변경된다.
- **영향:** 잘못된 운영 API 입력이 명시적으로 거절되지 않고 다른 수량과 금액으로 반영된다. 운영 권한과 비정상 입력이 필요하여 P2로 분류한다.
- **증거:** [staff fractional quantity rejected](release-evidence/api-results.json), [staff overflow quantity rejected](release-evidence/extra-results.json), 해당 [API trace](release-evidence/extra-trace.json).
- **관련 코드:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/StaffOperationsService.java:601`, `:884`; 동일 변환 패턴 `qr-order-backend/src/main/java/com/caucse/qrorder/api/StaffController.java:225`도 점검 대상.
- **추정 원인:** `intValue()`의 절삭·overflow 뒤에 1~99를 검사한다.
- **최소 수정 방향:** 원본 숫자가 정수이고 범위 내인지 검사한 뒤 변환. 고객 주문의 엄격한 정수 검증과 일관된 400 계약 적용.

## RQA-004 / 다른 주문 수신 시 운영 설정의 미저장 입력이 유실됨 / P2

- **구분:** 실행으로 재현 — 실제 브라우저 + API + SSE, 2회 재현.
- **사전 조건:** 인증된 `/staff/settings`, 정상 SSE. 1440×900.
- **최소 재현:**
  1. 닭발 설명을 `QA 미저장 편집 두 번째 재현`으로 입력하고 저장하지 않는다.
  2. 다른 고객/직원이 다른 테이블에 주문한다. 이번에는 T29에 운영 주문 API를 호출했다.
  3. 원래 설정 화면의 입력값을 확인한다.
- **기대:** 외부 데이터 갱신이 로컬 미저장 편집을 보존하거나 충돌/변경 안내를 제공한다.
- **실제:** 입력값이 DB의 기존 `닭발`로 되돌아간다. 확인·취소 없이 편집 내용이 사라진다.
- **영향:** 주문이 계속 들어오는 운영 시간에 가격·메뉴·설정 편집이 유실될 수 있다. 이번에 직접 검증한 필드는 메뉴 설명이며 다른 필드 영향은 동일 snapshot 공유 코드에 근거한다.
- **증거:** [입력 직후 09:00:07Z](release-evidence/settings-draft-before.json), [다른 주문 후 09:00:34Z](release-evidence/settings-draft-after.json), [09:00:19Z 주문 요청](release-evidence/controls-trace.jsonl), [화면 snapshot](release-evidence/settings-draft-reset.txt).
- **관련 코드:** `qr-order-frontend/src/pages/staff/StaffSettingsPage.tsx:49`, `:54`, `:72`, `:195`; `qr-order-frontend/src/hooks/useStaffEvents.ts:65`.
- **추정 원인:** 모든 운영 이벤트가 revision을 증가시켜 관리자 snapshot을 다시 조회하며, 응답을 폼 state에 그대로 `setSnapshot`한다. dirty draft가 서버 snapshot과 분리되지 않았다. 10/60초 polling도 같은 경로를 사용한다.
- **최소 수정 방향:** 서버 데이터와 편집 draft 분리, dirty row 보존, 저장/취소 때 명시적 동기화. 관련 설정 이벤트만 새 snapshot을 가져오고 충돌 처리를 제공한다.

## RQA-005 / 영업 종료를 QR·메뉴에서 알리지 않고 주문 마지막에만 거절 / P2

- **구분:** 실행으로 재현 — 고객 모바일 390×844, 실제 API.
- **사전 조건:** `EVENT_OPEN=false`, 정상 QR, 판매 가능한 메뉴.
- **최소 재현:** QR 진입 → 메뉴 보기 → 닭발 담기 → 장바구니 → 주문 확인 → 주문 확정.
- **기대 근거:** `UX-STRUCTURE.md:57`, `:113`, `:329`의 store closed 분기/E3 및 `TableSession.open` 계약. 영업 종료를 진입 또는 메뉴에서 알리고 주문 접수를 진행하지 못하게 해야 한다. 메뉴 열람 허용 여부와 무관하게 종료 안내는 필요하다.
- **실제:** 진입·메뉴·장바구니·확인에 종료 안내가 없으며 버튼도 활성. 마지막 요청에서만 409 `EVENT_CLOSED`, `현재 주문을 받고 있지 않습니다.`를 표시한다. **서버는 종료 중 주문 저장을 올바르게 차단했다.**
- **영향:** 고객이 받을 수 없는 주문을 끝까지 작성하며 혼란·직원 문의가 발생한다.
- **증거:** [종료 상태 welcome](release-evidence/closed-welcome.txt), [최종 주문 오류](release-evidence/closed-order.txt), [모바일 스크린샷](release-evidence/closed-order.png), [설정 변경 trace](release-evidence/controls-trace.jsonl).
- **관련 코드:** `qr-order-frontend/src/pages/TableConfirmationPage.tsx:27`, `:52`, `:68`; `qr-order-frontend/src/api/catalog.ts:78`의 open 매핑; `qr-order-frontend/src/App.tsx:288`의 주문 확인 흐름.
- **추정 원인:** bootstrap의 `store.open`은 session에 매핑되지만 고객 표시·접수 버튼에서 사용하지 않는다.
- **최소 수정 방향:** 영업 종료 안내와 주문 CTA 제어를 공통 고객 흐름에 적용. 이미 저장된 주문의 멱등 replay·주문 조회·직원 호출은 필요한 범위에서 유지한다.

## 확인 필요 — 결함 확정 목록과 분리

### RQA-C01 / 결제 후 이전 방문의 대기 호출이 남음 / 추가 확인 필요 (P2 후보)

- **관찰 재현:** T13 주문 → PAYMENT_REQUEST 호출 → 결제 완료 → `customer/orders/list`. 주문은 `[]`, 합계는 0이지만 `activeCall`은 기존 호출. 운영 배치도에서도 빈 T13에 호출 배지가 표시되었다.
- **증거:** [closed visit clears pending call](release-evidence/api-results.json), [API trace](release-evidence/api-trace.json).
- **근거·불명확점:** `staff-pos-design.md:123`은 **초기화** 시 호출 종료를 명시하지만 결제 시 호출의 수명을 직접 확정하지 않는다. 최신 정책은 다음 손님이 새 방문으로 시작한다고 규정한다. 결제 요청 자체를 자동 종료할지, 모든 호출을 직원 확인 때까지 유지할지 확인해야 한다. 스크립트의 엄격한 assertion은 FAIL이나 **확정 버그 수에 포함하지 않는다**.
- **코드:** `StaffOperationsService.java:375`의 결제에는 호출 종료 없음; `CustomerOrderService.java:251`은 열린 방문이 없어도 tableId로 호출을 반환한다.
- **방향:** 방문 종료 시 pending 호출을 종료할지 결정하고, 필요하면 sessionId로 호출을 귀속하거나 결제 트랜잭션에서 종료·이벤트 발행한다.

### RQA-C02 / 현재 UI에 없는 동작 / 추가 확인 필요

고객 요청사항 입력, 수동 로그아웃, 운영 대행 주문 생성 화면은 노출되지 않는다. API의 note·운영 주문 생성은 실행 검증했으며, `useStaffAuth.logout`은 인증 오류용으로 사용된다. 대행 주문 화면은 `staff-pos-design.md:42`의 사용 안 함 프레임에 해당한다. 이들을 출시 필수 UI라고 새로 단정하지 않았다. 요청사항·수동 로그아웃의 출시 요구 확정이 필요하다.

### RQA-C03 / 할인 후 고객 합계와 실제 결제액의 의미 / 추가 확인 필요

고객은 주문 누적 10,000원, 운영은 20% 할인 후 8,000원으로 표시된다. 이는 서로 다른 금액 의미이며 DB 할인·결제 snapshot은 일치했다. 고객도 최종 청구액을 보여야 하는지 제품 정책 확인이 필요하다. 금액 계산 버그로 세지 않았다.
