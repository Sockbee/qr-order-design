# Apps Script 주문 생성·조회 및 상태 polling

## 개요

Google Sheets의 현재 카탈로그를 서버에서 다시 검증하고 주문 snapshot을 안전하게
저장하는 Apps Script Web App의 `POST /orders/create` API와 인증된 주문 조회 API를
구현했습니다. Netlify 프론트엔드는 최종 QR URL에서 table 자격증명을 복구하고 주문
현황을 15초 간격으로 갱신합니다.

클라이언트가 보낸 가격이나 메뉴명은 신뢰하지 않으며, table token 인증부터 메뉴·옵션
판매 상태, 수량, 필수 선택 규칙, 주문 총액까지 Script Lock 안에서 검증합니다. 동일
요청의 네트워크 재전송은 idempotency key로 감지해 중복 주문과 주문번호 증가를 막습니다.

주문 조회는 `COMMITTED` snapshot만 사용하므로 현재 메뉴명과 가격이 바뀌어도 과거
주문 내역은 변하지 않습니다.

## 변경 사항

### 주문 생성 endpoint

다음 endpoint와 query fallback을 추가했습니다.

```text
POST {WEB_APP_URL}/exec/orders/create
POST {WEB_APP_URL}/exec?action=orders/create
```

요청 예시:

```json
{
  "apiVersion": "v1",
  "tableId": "T01",
  "tableToken": "<64자리 원본 token>",
  "clientRequestId": "8eaf87de-7f16-43cb-a7ee-dba5054567cc",
  "note": "",
  "items": [
    {
      "menuId": "soju",
      "quantity": 1,
      "selectedOptionIds": []
    }
  ]
}
```

`price`, `unitPrice`, `lineTotal`, `totalAmount`, 메뉴·옵션 snapshot 등 계약에 없는 field는
`INVALID_REQUEST`로 거절합니다.

### 서버 검증과 가격 계산

신규 주문은 다음 순서로 처리합니다.

1. payload allowlist, UUID, 메모 길이, line·option 개수 형식 검사
2. table ID와 원본 token hash constant-time 검증
3. table active와 Settings의 `EVENT_OPEN` 확인
4. 현재 Categories, Menu, MenuOptionGroups, MenuOptions read
5. 메뉴·옵션 판매 상태와 수량 범위 검사
6. 필수·최소·최대 option 선택 수 검사
7. 현재 Sheet 가격으로 unit price, line total, order total 계산
8. 주문번호 할당과 snapshot write

`MAX_ORDER_LINES`는 Settings 값을 사용하며 서버의 hard limit 100을 초과할 수 없습니다.
주문 메모는 최대 200자, line별 option ID는 최대 50개로 제한합니다.

### idempotency

idempotency key는 다음 형식입니다.

```text
{tableId}:{lowercase clientRequestId}
```

request fingerprint에는 table ID, note, item 순서, menu ID, quantity, 정렬된 option ID를
포함합니다.

- 같은 key와 같은 fingerprint: 기존 주문 응답, `idempotentReplay=true`
- 같은 key와 다른 fingerprint: `DUPLICATE_REQUEST`
- replay에서는 새 주문번호와 child row를 만들지 않음
- 이미 성공한 주문은 이후 행사가 닫히거나 table이 비활성화돼도 기존 결과 반환
- 신규 주문만 현재 event/table/catalog 상태를 검사

### snapshot write와 복구

주문은 다음 Sheet에 저장합니다.

- `Orders`: 주문 identity, 상태, 총액, idempotency, 복구 snapshot
- `OrderItems`: 주문 시점 메뉴명·가격·수량 snapshot
- `OrderItemOptions`: 주문 시점 option group·이름·가격 증감 snapshot
- `AuditLogs`: 생성, 실패, 복구 이력

Orders를 먼저 `WRITING`으로 기록하고 deterministic child ID로 item과 option을 batch
append한 뒤 `COMMITTED`로 전환합니다.

```text
order_item_id        = {orderId}-{2-digit lineNo}
order_item_option_id = {orderItemId}-{2-digit option order}
```

중간 write가 실패하면 Orders를 `FAILED`로 표시합니다. 같은 요청이 다시 들어오면 보호된
`write_payload_json`을 검증하고 기존 child snapshot과 일치하는지 확인한 뒤 누락된 행만
추가합니다. 30초 이내의 `WRITING` 주문은 중복 실행하지 않고
`ORDER_WRITE_IN_PROGRESS`를 반환합니다.

주문번호 counter 증가 후 write가 실패하면 번호 gap은 허용하되 번호 중복을 방지합니다.

### 응답과 오류

성공 응답은 주문 시점 snapshot만 사용합니다.

```json
{
  "orderId": "...",
  "displayNumber": 1042,
  "displayCode": "A-1042",
  "status": "RECEIVED",
  "publicStatus": "accepted",
  "paymentStatus": "UNPAID",
  "totalAmount": 4500,
  "idempotentReplay": false,
  "items": []
}
```

주요 오류 코드는 다음과 같습니다.

- `INVALID_TABLE_TOKEN`, `INACTIVE_TABLE`, `EVENT_CLOSED`
- `INVALID_REQUEST`, `INVALID_QUANTITY`, `INVALID_OPTION_SELECTION`
- `MENU_NOT_FOUND`, `MENU_SOLD_OUT`
- `OPTION_NOT_FOUND`, `OPTION_SOLD_OUT`
- `DUPLICATE_REQUEST`, `ORDER_WRITE_IN_PROGRESS`, `LOCK_TIMEOUT`

### 인증된 주문 조회

다음 endpoint를 추가했습니다. Apps Script path routing이 제한된 환경에서는
`?action=orders/get`, `?action=orders/list`를 사용합니다.

```text
POST {WEB_APP_URL}/exec/orders/get
POST {WEB_APP_URL}/exec/orders/list
```

`orders/get`은 `orderId` 또는 `displayCode` 중 하나만 받습니다. token이 인증한 table의
`COMMITTED` 주문만 반환하며 다른 table 주문과 `WRITING`/`FAILED` 주문은
`ORDER_NOT_FOUND`로 숨깁니다.

`orders/list`는 다음 정보를 반환합니다.

- 최신 주문 우선의 주문 회차와 주문 시점 item/option 이름 snapshot
- 가장 최근 비취소 주문의 `latestPublicStatus`
- `COMMITTED`이면서 `CANCELLED`가 아닌 주문의 `sessionTotalAmount`

조회 API는 table이 비활성화되거나 행사가 종료된 뒤에도 이미 접수된 주문을 확인할 수
있습니다. 원본 token은 응답에 포함하지 않습니다.

### 최종 QR 경로와 15초 polling

프론트 경로를 확정된 QR 형식으로 맞췄습니다.

```text
https://caucse.shop/t/T01?token=<64자리 원본 token>
```

유효한 `tableId`와 token은 table session 범위로만 보관하고 Apps Script 주문 목록
요청에만 사용합니다. `VITE_APPS_SCRIPT_URL`이 설정된 배포에서는 session-level poller
하나가 `orders/list`를 호출합니다.

- 최초 진입 시 즉시 조회
- 성공 후 15초 + 0~2초 jitter 뒤 재조회
- 탭이 hidden이면 timer와 진행 중 요청 중단
- 다시 visible이 되면 즉시 조회
- 실패하면 30초, 60초까지 exponential backoff
- 실패 중에도 마지막 성공 주문과 상태 유지
- 현재 Menu가 변경돼도 서버가 반환한 주문 snapshot 이름과 합계 표시

### 민감정보 및 진단

- 원본 table token은 Orders, child snapshot, AuditLogs에 저장하지 않습니다.
- `write_payload_json`에는 서버가 검증한 line snapshot만 저장합니다.
- 진단에서 fingerprint 64자리 hex, client UUID, idempotency key, note 길이를 검사합니다.
- `write_payload_json`에 token 관련 key가 있으면 오류로 탐지합니다.
- HTTP request ID를 AuditLogs에 기록하되 request body 전체는 기록하지 않습니다.

## 검증

### 로컬 자동 검증

- [x] 모든 Apps Script `.gs` 파일을 하나의 namespace로 결합한 구문 검사 통과
- [x] 기존 table/catalog API regression test 통과
- [x] 신규 주문과 서버 가격 계산 확인
- [x] Orders, OrderItems, OrderItemOptions snapshot 확인
- [x] 동일 요청 replay와 주문번호·row 중복 방지 확인
- [x] 동일 idempotency key의 다른 payload 거부 확인
- [x] 필수 option, 품절 메뉴, 품절 option 거부 확인
- [x] 클라이언트 가격 field 거부 확인
- [x] 행사 종료와 table 비활성 신규 주문 차단 확인
- [x] 종료·비활성 이후 기존 주문 replay 허용 확인
- [x] lock timeout 처리 확인
- [x] option write 실패 후 `FAILED` 표시와 동일 요청 자동 복구 확인
- [x] 최근 `WRITING` 주문의 중복 처리 방지 확인
- [x] 원본 table token 미저장 확인
- [x] 주문 ID와 display code 단건 조회 확인
- [x] 다른 table 주문 접근 차단 확인
- [x] `WRITING`/`FAILED` 주문 조회 제외 확인
- [x] 주문 목록 최신순과 취소 제외 누적액 확인
- [x] 현재 메뉴 변경 후에도 주문 snapshot 응답 유지 확인
- [x] 프론트 TypeScript production build 통과
- [x] 프론트 ESLint 통과
- [x] QR 경로 `/t/{tableId}?token=...` 적용
- [x] 15초 polling, hidden 중단, visible 즉시 조회 구현
- [x] polling 실패 backoff와 마지막 성공 값 유지 구현
- [x] `git diff --check` 통과

로컬 테스트 명령:

```bash
awk 'FNR==1 { print "" } { print }' apps-script/*.gs | node --check
node apps-script/tests/table-auth.test.js
node apps-script/tests/order-create.test.js
node apps-script/tests/order-query.test.js
(cd qr-order-frontend && npm run build && npm run lint)
git diff --check
```

### 실제 Google Web App smoke test

- [x] 익명 Web App `/exec` health 응답 확인
- [x] 유효한 T01 원본 token 인증 확인
- [x] 소주 1개 주문 성공
- [x] 주문번호 `A-1042`, 총액 4,500원 확인
- [x] `RECEIVED / accepted / UNPAID` 초기 상태 확인
- [x] 첫 응답 `idempotentReplay=false` 확인
- [x] 같은 body와 같은 `clientRequestId` 재전송
- [x] 같은 order ID와 주문번호 유지 확인
- [x] replay 응답 `idempotentReplay=true` 확인
- [x] Orders와 OrderItems가 각각 1행만 존재하는지 확인
- [x] 실제 Spreadsheet `runDiagnostics()` 전체 통과
- [ ] 배포 후 `orders/get`, `orders/list` 실제 응답 확인
- [ ] Netlify에서 15초 이내 상태 변경 반영 확인
- [ ] hidden 탭 중 요청 중단과 복귀 즉시 조회 확인
- [ ] 테스트 후 `EVENT_OPEN=FALSE` 복구 확인

Apps Script ContentService는 결과를 `script.googleusercontent.com`으로 redirect합니다.
Postman에서는 자동 redirect를 켜고 302 이후 원본 POST method를 유지하지 않아야 합니다.

## 적용 방법

1. Apps Script 프로젝트에 `OrderValidation.gs`, `OrderService.gs`,
   `OrderQueryService.gs`를 추가합니다.
2. 변경된 `Code.gs`, `Config.gs`, `Http.gs`, `TableCatalogService.gs`,
   `Diagnostics.gs`를 반영합니다.
3. `runDiagnostics()`를 실행합니다.
4. Web App deployment를 새 버전으로 업데이트합니다.
5. `EVENT_OPEN=TRUE`인 테스트 시간에 신규 UUID로 주문을 생성합니다.
6. 동일 body를 재전송해 `idempotentReplay=true`를 확인합니다.
7. Sheet row와 `NEXT_DISPLAY_NUMBER`가 중복 증가하지 않았는지 확인합니다.
8. `orders/get`, `orders/list`를 실제 token으로 확인합니다.
9. Netlify에 `VITE_APPS_SCRIPT_URL={versioned /exec URL}`을 설정해 재배포합니다.
10. 실제 QR로 접속해 `/orders`의 최초 조회와 상태 변경 반영을 확인합니다.
11. 테스트 후 `EVENT_OPEN=FALSE`로 되돌립니다.

Sheet schema와 Settings key 변경은 없으므로 `bootstrapSpreadsheet()` 재실행은 필요하지
않습니다.

## 영향 범위

- Orders, OrderItems, OrderItemOptions, Settings counter, AuditLogs를 수정합니다.
- Tables, Categories, Menu, MenuOptionGroups, MenuOptions는 검증 목적으로 읽기만 합니다.
- Script Lock 범위에서 신규 주문을 직렬화합니다.
- Orders, OrderItems, OrderItemOptions는 주문 조회 목적으로 batch read합니다.
- Netlify 프론트엔드의 QR 진입 경로와 주문 현황 데이터 공급 경로를 변경합니다.
- 메뉴/장바구니/create 요청의 프론트 API 전환과 운영 상태 변경 API는 포함하지 않습니다.
