# QR Order Apps Script bootstrap

Google Spreadsheet의 canonical 12개 Sheet를 생성하고 schema, Settings, validation,
보호 범위와 무결성 진단을 설정한다. 테이블 QR token 발급/회전과 고객용
`resolve-table`, `menu`, `orders/create`, `orders/get`, `orders/list`, `calls/create`,
`calls/cancel` API와 운영 인증·호출·테이블 정산 API를 포함하는
Apps Script V8 프로젝트다.

## 포함 파일

- `Config.gs`: 12개 Sheet의 정확한 header, enum, 초기 Settings, 보호 범위
- `Repositories.gs`: header 기반 Spreadsheet read/write helper
- `Setup.gs`: `bootstrapSpreadsheet()`, formatting, validation, protection
- `CatalogSeed.gs`: 카테고리 4개와 메뉴 19개의 idempotent 초기 데이터
- `Diagnostics.gs`: `runDiagnostics()`와 FK/금액/snapshot 무결성 검사
- `TableProvisioning.gs`: 테이블 생성, token 회전, 일회성 QR CSV export
- `TableCatalogService.gs`: SHA-256 token 검증, Settings parse, `resolveTable()`, `getMenu()`
- `OrderValidation.gs`: 주문 payload, 메뉴/옵션/수량/가격 검증과 fingerprint 생성
- `OrderService.gs`: idempotent 주문 생성, snapshot 저장, 부분 write 복구
- `OrderQueryService.gs`: 인증된 단건/목록 주문 snapshot 조회
- `CallService.gs`: 고객 직원 호출 생성/취소, idempotency, 호출 간격 제한
- `TableSessionService.gs`: 테이블 세션 생성, 기존 주문 backfill, 청구 그룹 계산
- `StaffAuthService.gs`: 운영 로그인, HMAC token, throttle, 운영 action dispatch
- `StaffCallService.gs`: 미확인 호출 그룹 조회와 테이블 단위 일괄 확인
- `StaffTableService.gs`: 청구, 할인, 이동, 합석, 분리, 결제 확정
- `StaffDashboardService.gs`: 테이블 현황·상세, 스테이션 queue, 상태, 메뉴, 운영 주문
- `Code.gs`, `Http.gs`: Web App path dispatch와 JSON envelope
- `appsscript.json`: Asia/Seoul, V8, anonymous web app 설정

## 최초 실행

1. Spreadsheet에서 `확장 프로그램 > Apps Script`를 연다.
2. 이 디렉터리의 `.gs` 파일을 같은 이름으로 프로젝트에 추가한다.
3. 프로젝트 설정의 Script Properties에 다음을 저장한다.
   - `SPREADSHEET_ID`: 대상 Spreadsheet URL의 `/d/`와 `/edit` 사이 값
   - `TOKEN_PEPPER`: `openssl rand -hex 32` 등으로 만든 32바이트 이상 난수
   - `STAFF_PASSCODE_HASH`: `SHA-256(TOKEN_PEPPER + ':' + passcode)` 64자리 hex
   - `STAFF_TOKEN_SECRET`: `openssl rand -hex 32` 등으로 만든 별도 서명 비밀값
4. 함수 목록에서 `bootstrapSpreadsheet`를 선택해 실행하고 권한을 승인한다.
5. Spreadsheet를 새로고침하면 `QR 주문 관리` 메뉴가 표시된다.
6. `QR 주문 관리 > 카테고리/메뉴 초기 데이터 추가`를 실행한다.
7. Settings에서 `FRONTEND_BASE_URL`, `EVENT_OPEN` 등 행사 값을 확인한다.
8. `QR 주문 관리 > 테이블/QR 초기 발급`을 실행하고 테이블 수를 입력한다.
9. 표시되는 창에서 CSV를 즉시 다운로드해 안전하게 보관한다.
10. `QR 주문 관리 > 무결성 진단`을 실행한다.

초기 데이터가 아직 없으면 `NO_TABLES`, `NO_MENU`, `PLACEHOLDER_EVENT_ID` 경고는
정상이다. 오류가 0개이면 `ok: true`다.

## 테이블 QR과 token

최종 QR URL 형식은 다음과 같다.

```text
https://caucse.shop/t/T01?token=<64자리 원본 token>
```

Sheet에는 원본 token 대신 `SHA-256(TOKEN_PEPPER + ':' + token)` hash만 저장한다.
원본 token URL은 발급/재발급 직후의 modal과 CSV에만 나타나며 실행 로그에는 남기지 않는다.
CSV를 받지 않고 창을 닫으면 복구할 수 없으므로 `Tables` 행을 선택한 뒤
`선택 테이블 token 재발급`을 실행해야 한다. 재발급 즉시 기존 QR은 무효화된다.

초기 발급은 이미 존재하는 `T01`, `T02` 등의 행을 덮어쓰지 않아 반복 실행해도 안전하다.

## Web App 첫 API

- `GET {WEB_APP_URL}/exec/health`
- `POST {WEB_APP_URL}/exec/resolve-table`
- `POST {WEB_APP_URL}/exec/menu`
- `POST {WEB_APP_URL}/exec/orders/create`
- `POST {WEB_APP_URL}/exec/orders/get`
- `POST {WEB_APP_URL}/exec/orders/list`
- `POST {WEB_APP_URL}/exec/calls/create`
- `POST {WEB_APP_URL}/exec/calls/cancel`
- `POST {STAFF_WEB_APP_URL}/exec/staff/login`
- `POST {STAFF_WEB_APP_URL}/exec/staff/calls/list`
- `POST {STAFF_WEB_APP_URL}/exec/staff/calls/acknowledge`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/bill`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/discount`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/move`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/merge`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/split`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/confirm-payment`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/list`
- `POST {STAFF_WEB_APP_URL}/exec/staff/tables/detail`
- `POST {STAFF_WEB_APP_URL}/exec/staff/orders/status`
- `POST {STAFF_WEB_APP_URL}/exec/staff/orders/queue`
- `POST {STAFF_WEB_APP_URL}/exec/staff/menu/list`
- `POST {STAFF_WEB_APP_URL}/exec/staff/menu/availability`
- `POST {STAFF_WEB_APP_URL}/exec/staff/orders/create`
- 모든 운영 action은 `staff/` prefix를 사용하며 body에 `staffToken`을 포함
- path routing이 제한된 환경에서는 각 endpoint를 `?action=...` 형식으로도 지원

POST body는 `Content-Type: text/plain;charset=utf-8`로 다음 JSON 문자열을 전송한다.

```json
{"apiVersion":"v1","tableId":"T01","tableToken":"<QR 원본 token>"}
```

`EVENT_OPEN=FALSE`인 동안 유효한 QR도 `EVENT_CLOSED`를 반환한다. 행사 전 성공 응답을
시험할 때만 잠시 `TRUE`로 바꾼 뒤 다시 `FALSE`로 돌린다. API 응답에는 stack trace,
Spreadsheet ID, 원본 token, token hash가 포함되지 않는다.

`menu` 요청 body는 `resolve-table`과 동일하다. 활성 카테고리와 그 카테고리에 속한
메뉴를 sort order 순으로 반환하며, `available=false`인 메뉴와 옵션도 품절 UI 표시를
위해 응답에 포함한다. 비활성 category와 option group은 제외한다.

## 주문 생성 API

`orders/create`는 클라이언트가 보낸 가격과 이름을 받지 않는다. `menuId`, 수량,
선택 option ID만 받아 Script Lock 안에서 현재 Sheet의 판매 상태와 가격을 다시 검증한
뒤 Orders, OrderItems, OrderItemOptions에 주문 시점 snapshot을 저장한다.

```json
{
  "apiVersion": "v1",
  "tableId": "T01",
  "tableToken": "<64자리 원본 token>",
  "clientRequestId": "8eaf87de-7f16-43cb-a7ee-dba5054567cc",
  "note": "",
  "items": [
    { "menuId": "soju", "quantity": 2, "selectedOptionIds": [] }
  ]
}
```

동일한 `tableId + clientRequestId`와 동일 payload가 재전송되면 새 주문이나 주문번호를
만들지 않고 기존 결과에 `idempotentReplay=true`를 표시한다. 같은 ID를 다른 장바구니에
재사용하면 `DUPLICATE_REQUEST`다. 중간 write가 실패한 주문은 deterministic child ID와
서버 snapshot을 사용해 다음 동일 요청에서 누락된 행만 복구한다.

원본 table token은 주문 Sheet, snapshot, AuditLogs에 저장하지 않는다. 신규 주문만
현재 table active, `EVENT_OPEN`, 메뉴/옵션 판매 상태를 확인하며, 이미 성공한 주문의
재전송은 그 사이 행사가 닫혀도 기존 결과를 반환한다.

## 주문 조회 API

`orders/get`은 `orderId` 또는 `displayCode` 중 하나로 table의 `COMMITTED` 주문을
조회한다. `orders/list`는 table의 주문을 최신순으로 반환하고 가장 최근 비취소 주문의
공개 상태와 취소 주문을 제외한 누적 합계를 함께 제공한다. 두 API 모두 QR의 table ID와
원본 token 인증이 필요하지만, 이미 접수된 주문 복구를 위해 table active와
`EVENT_OPEN` 상태에는 영향받지 않는다.

조회 결과는 OrderItems와 OrderItemOptions의 주문 시점 snapshot만 사용한다. 현재 Menu
가격이나 이름을 다시 join하지 않으며 다른 table 및 `WRITING`/`FAILED` 주문은 노출하지
않는다.

진단 결과는 오류와 경고를 각각 최대 100개까지 로그에 포함하고, 전체 개수와 생략된
개수는 `summary`, `truncated`에 별도로 기록한다. 대량 오류가 있어도 실행 로그 전체가
잘리지 않도록 하기 위한 제한이다.

## 카탈로그 초기 데이터

`seedCatalog()`는 `docs/qr-order/menu-list.md`의 최신 가격표를 기준으로 Categories
4개와 Menu 19개를 추가한다. 이미 존재하는 `category_id`, `menu_id`는 운영자 수정값을
보존하기 위해 덮어쓰지 않는다. 여러 번 실행해도 중복 행이 생기지 않는다.

메뉴 설명은 별도 원문 정보가 없으므로 초기에는 메뉴명과 동일하게 저장한다. 실제
서비스 공개 전에 운영자가 description, image URL, 알레르기와 원산지 정보를 보완한다.

## 반복 실행 안전성

- 없는 Sheet와 Settings key만 추가한다.
- header가 정확하면 기존 데이터를 유지한다.
- 데이터가 있는 Sheet의 header가 schema와 다르면 자동 덮어쓰지 않고 중단한다.
- 예외적으로 기존 Orders A:T가 정확히 일치하면 끝 열 U에 `session_id`만 추가한다.
- `session_id`가 비어 있는 기존 주문은 table별로 backfill한다. 결제 완료 주문은 닫힌
  이력 세션, 미결제 주문은 열린 세션으로 분리해 과거 결제분의 재청구를 막는다.
- `QR Order bootstrap:` prefix가 붙은 보호 범위만 교체한다.
- 사용자가 별도로 만든 보호 범위는 삭제하지 않는다.

## 생성되는 Sheet

```text
Tables
Categories
Menu
MenuOptionGroups
MenuOptions
Orders
OrderItems
OrderItemOptions
Calls
TableSessions
Settings
AuditLogs
```

기준 문서: `../docs/qr-order/google-sheets-schema.md`
