# Google Apps Script API 설계 (legacy)

> Spring Boot 전환 전 계약을 보존하는 참고 문서입니다. 현재 구현은
> [spring-gcp-migration.md](./spring-gcp-migration.md)를 기준으로 합니다.

> 기준 schema: [google-sheets-schema.md](./google-sheets-schema.md)
>
> 시스템 결정: [architecture.md](./architecture.md)

## 1. 전송 방식 결정

### 비교

| 방식 | 장점 | 제약 | 현재 적합성 |
|---|---|---|---|
| `doGet(e)` / `doPost(e)` + ContentService | 독립 React/Vite 앱에서 HTTP 호출 가능, 배포 경계가 명확 | ContentService redirect, HTTP status/header 제어 제약, CORS 실배포 확인 필요 | **선택** |
| `google.script.run` | HTMLService iframe 안에서 CORS 없이 서버 함수 호출 | Apps Script가 프론트도 호스팅해야 함, 현재 BrowserRouter/빌드 배포 구조 변경 필요 | 미선택 |
| Apps Script HTMLService가 React 정적 파일 제공 | 한 origin/한 배포 URL | Vite 산출물 주입과 router 변경, 정적 asset 운영이 번거로움 | fallback |

현재 프론트는 `BrowserRouter`를 쓰는 독립 Vite 앱이고 Netlify에 배포하며 Apps Script/HTML template 파일이 없다. 따라서 API는 웹 앱으로 별도 배포한다. Apps Script 웹 앱의 `e.pathInfo`에는 `/exec` 뒤 경로가 들어오므로 resource-like path를 dispatcher에 사용할 수 있다. 공식 event 구조는 [Web Apps 문서](https://developers.google.com/apps-script/guides/web#request_parameters)를 따른다.

### 실제 transport

ContentService는 HTTP 상태 코드를 세밀하게 설정할 수 없으므로 API 성공/실패는 JSON envelope의 `success`로 판단한다. 인증 정보가 있는 read도 POST body로 보내 token이 반복해서 query string과 접근 로그에 남는 것을 줄인다.

```text
GET  {WEB_APP_URL}/exec/health

POST {WEB_APP_URL}/exec/resolve-table
POST {WEB_APP_URL}/exec/menu
POST {WEB_APP_URL}/exec/orders/create
POST {WEB_APP_URL}/exec/orders/get
POST {WEB_APP_URL}/exec/orders/list
```

운영 API는 **별도 배포**의 다른 `/exec`를 쓴다. 고객 앱 번들에 운영 URL이 들어가지 않는다.

```text
POST {STAFF_WEB_APP_URL}/exec/staff/login
POST {STAFF_WEB_APP_URL}/exec/staff/calls/list
POST {STAFF_WEB_APP_URL}/exec/staff/calls/acknowledge
POST {STAFF_WEB_APP_URL}/exec/staff/tables/bill
POST {STAFF_WEB_APP_URL}/exec/staff/tables/discount
POST {STAFF_WEB_APP_URL}/exec/staff/tables/move
POST {STAFF_WEB_APP_URL}/exec/staff/tables/merge
POST {STAFF_WEB_APP_URL}/exec/staff/tables/split
POST {STAFF_WEB_APP_URL}/exec/staff/tables/confirm-payment
POST {STAFF_WEB_APP_URL}/exec/staff/tables/list
POST {STAFF_WEB_APP_URL}/exec/staff/tables/detail
POST {STAFF_WEB_APP_URL}/exec/staff/orders/status
POST {STAFF_WEB_APP_URL}/exec/staff/orders/queue
POST {STAFF_WEB_APP_URL}/exec/staff/menu/list
POST {STAFF_WEB_APP_URL}/exec/staff/menu/availability
POST {STAFF_WEB_APP_URL}/exec/staff/orders/create
POST {STAFF_WEB_APP_URL}/exec/staff/orders/update
POST {STAFF_WEB_APP_URL}/exec/staff/orders/cancel
```

`staffToken`은 **request body**에 담는다. `Authorization` header를 쓰지 않는 이유는 위와 같다 — Apps Script event object가 임의 request header를 다루지 못하고, custom header는 CORS preflight를 유발한다.

개념적으로는 `GET /menu`, `POST /orders`, `GET /orders/:id`지만 Apps Script adapter에서는 위처럼 표현한다. 모든 POST는 다음 조건을 지킨다.

- `Content-Type: text/plain;charset=utf-8`: JSON 문자열을 보내되 불필요한 CORS preflight를 만들지 않는다.
- custom header를 사용하지 않는다. Apps Script event object는 일반 서버처럼 임의 request header를 다루기 어렵다.
- browser는 redirect를 따르는 기본 `redirect: "follow"`를 사용한다. ContentService 응답이 일회성 `script.googleusercontent.com` URL로 redirect되는 것은 [공식 동작](https://developers.google.com/apps-script/guides/content)이다.
- 실제 배포 URL에 대한 cross-origin fetch가 허용되는지는 구현 1순위 smoke test다. 실패하면 same-origin proxy 또는 HTMLService 방식으로 전환한다.

## 2. Apps Script 프로젝트 구조

Apps Script V8의 `.gs` 파일은 실행 시 하나의 전역 namespace로 합쳐지고 ESM import/export를 사용하지 않는다. IDE에서 폴더 계층도 실질적인 module 경계가 아니므로 다음처럼 역할별 파일로 나눈다.

```text
appsscript.json
Code.gs              # doGet/doPost, path dispatch
Config.gs            # Sheet 이름, enum, limits
Http.gs              # envelope, ApiError, parse/serialize
Repositories.gs      # header 기반 batch read/write/update
TableCatalogService.gs # table 인증, Settings, menu 조립
TableProvisioning.gs # table token 발급/회전, 일회성 QR CSV export
OrderService.gs      # 주문 생성/조회/idempotency/snapshot
Validation.gs        # 주문/옵션/상태 전이 검증
AdminTriggers.gs     # onOpen, 설치형 edit trigger, 운영진 상태 변경 guard
Setup.gs             # Sheet/header/validation/bootstrap/diagnostics
CatalogSeed.gs       # 초기 Categories/Menu idempotent seed
Diagnostics.gs       # runDiagnostics, FK/금액/snapshot 무결성 검사
StaffDashboardService.gs # 운영 현황·queue·메뉴·상태·주문 생성
```

각 파일은 관련 함수 이름에 prefix를 붙이기보다 Apps Script 관례대로 public entry만 명확히 두고 내부 함수에 trailing underscore를 쓴다. 예: `createOrder`는 service entry, `readSheetObjects_`는 내부 helper다. class와 repository instance를 과도하게 만들지 않는다.

`appsscript.json` 권장값:

```json
{
  "timeZone": "Asia/Seoul",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

실제 manifest의 `access` 허용값은 배포 계정/조직 정책에 따라 다를 수 있으므로 `clasp` push 전에 확인한다. 실행 주체는 배포자 계정으로 두고, 그 계정이 주문 Spreadsheet에 접근한다. OAuth token을 절대로 응답에 포함하지 않는다.

## 3. 공통 API 규칙

### naming과 type

- Sheet header: `snake_case`
- JSON: `camelCase`
- 금액: KRW 정수
- timestamp: ISO 8601 (`2026-08-25T10:24:00.000Z`). 프론트가 Asia/Seoul로 표시
- boolean: JSON boolean
- absent optional field: `null` 또는 field 생략 중 endpoint별 예시를 따름. 배열은 항상 배열
- API version: request/response `apiVersion: "v1"`

### 성공 envelope

```json
{
  "success": true,
  "data": {
    "orderId": "d08c9c4b-9f60-4a84-a622-6b1dd84ed308",
    "displayCode": "A-1042",
    "status": "RECEIVED",
    "publicStatus": "accepted",
    "totalAmount": 23000,
    "idempotentReplay": false
  },
  "meta": {
    "apiVersion": "v1",
    "requestId": "8eaf87de-7f16-43cb-a7ee-dba5054567cc",
    "serverTime": "2026-08-25T10:24:00.000Z"
  }
}
```

### 오류 envelope

```json
{
  "success": false,
  "error": {
    "code": "MENU_SOLD_OUT",
    "message": "품절된 메뉴가 포함되어 있습니다.",
    "retryable": false,
    "details": {
      "menuIds": ["haemul-pajeon"]
    }
  },
  "meta": {
    "apiVersion": "v1",
    "requestId": "8eaf87de-7f16-43cb-a7ee-dba5054567cc",
    "serverTime": "2026-08-25T10:24:00.000Z"
  }
}
```

`details`에는 고객에게 공개 가능한 ID와 validation 정보만 넣는다. stack trace, Sheet ID, row number, raw token, token hash, request body 전체는 반환하지 않는다.

## 4. API 계약

### 4.1 `GET /health` — 배포 확인

실제 path: `GET /exec/health`

```json
{
  "success": true,
  "data": { "status": "ok", "apiVersion": "v1" },
  "meta": { "apiVersion": "v1", "requestId": "...", "serverTime": "..." }
}
```

Spreadsheet를 읽지 않는다. 이 endpoint가 성공해도 주문 저장 가능 상태를 뜻하지 않는다. 행사 전 진단은 운영자용 `runDiagnostics()`를 별도로 사용한다.

### 4.2 `POST /resolve-table` — QR/table 검증

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Response `data`:

```json
{
  "table": {
    "tableId": "T12",
    "displayName": "테이블 12"
  },
  "store": {
    "name": "행복식당 본점",
    "open": true,
    "notice": "주문은 이 테이블로 전달됩니다. 결제는 식사 후 카운터에서 진행해 주세요."
  },
  "statusPollSeconds": 15
}
```

검증 순서: 형식 → Tables에 ID 존재 → token hash constant-time 비교 → table active → `EVENT_OPEN`. 존재하지 않는 table과 token mismatch는 table ID enumeration을 막기 위해 모두 `INVALID_TABLE_TOKEN`과 같은 고객 문구로 응답한다.

### 4.3 `POST /menu` — 메뉴 조회

Request는 resolve-table과 같다. 이 endpoint도 table/token을 독립 검증한다.

Response `data` 축약 예시:

```json
{
  "categories": [
    { "categoryId": "recommended", "label": "추천", "heading": "추천 메뉴" }
  ],
  "items": [
    {
      "menuId": "kimchi-jjigae",
      "categoryId": "recommended",
      "name": "김치찌개",
      "description": "돼지고기와 묵은지를 넣고 진하게 끓여낸 대표 메뉴입니다",
      "basePrice": 9000,
      "imageUrl": null,
      "available": true,
      "minQuantity": 1,
      "maxQuantity": 10,
      "allergens": ["대두", "밀"],
      "origin": "국내산",
      "badgeTags": [],
      "optionGroups": [
        {
          "optionGroupId": "kimchi-spiciness",
          "label": "맵기 선택",
          "required": true,
          "selectionType": "single",
          "minSelections": 1,
          "maxSelections": 1,
          "defaultSelectedOptionIds": ["kimchi-normal"],
          "options": [
            { "optionId": "kimchi-normal", "name": "보통", "priceDelta": 0, "available": true },
            { "optionId": "kimchi-hot", "name": "아주 맵게", "priceDelta": 0, "available": true }
          ]
        }
      ]
    }
  ],
  "generatedAt": "2026-08-25T10:20:00.000Z"
}
```

`available=false`인 메뉴와 옵션도 반환해 Figma의 품절 상태를 그릴 수 있게 한다. 비활성(`active=false`) category/group은 반환하지 않는다. 메뉴 응답은 MVP에서 cache하지 않으며 createOrder는 어떤 경우에도 이 응답 가격을 신뢰하지 않는다.

### 4.4 `POST /orders/create` — 주문 생성

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "clientRequestId": "8eaf87de-7f16-43cb-a7ee-dba5054567cc",
  "note": "",
  "items": [
    {
      "menuId": "kimchi-jjigae",
      "quantity": 1,
      "selectedOptionIds": ["kimchi-normal", "kimchi-rice"]
    },
    {
      "menuId": "jeyuk-bokkeum",
      "quantity": 1,
      "selectedOptionIds": ["jeyuk-normal"]
    }
  ]
}
```

금지 field: `price`, `unitPrice`, `lineTotal`, `totalAmount`, 메뉴/옵션 이름 snapshot. 포함돼도 무시하는 것보다 `INVALID_REQUEST`로 거절해 계약 오류를 빨리 발견하는 것을 권장한다.

Response `data`:

```json
{
  "orderId": "d08c9c4b-9f60-4a84-a622-6b1dd84ed308",
  "displayNumber": 1042,
  "displayCode": "A-1042",
  "table": { "tableId": "T12", "displayName": "테이블 12" },
  "status": "RECEIVED",
  "publicStatus": "accepted",
  "paymentStatus": "UNPAID",
  "totalAmount": 23000,
  "createdAt": "2026-08-25T10:24:00.000Z",
  "idempotentReplay": false,
  "items": [
    {
      "lineNo": 1,
      "menuId": "kimchi-jjigae",
      "name": "김치찌개",
      "basePrice": 9000,
      "unitPrice": 10000,
      "quantity": 1,
      "lineTotal": 10000,
      "selectedOptions": [
        { "optionId": "kimchi-normal", "groupName": "맵기 선택", "name": "보통", "priceDelta": 0 },
        { "optionId": "kimchi-rice", "groupName": "추가 선택", "name": "공기밥 추가", "priceDelta": 1000 }
      ]
    }
  ]
}
```

동일한 `(tableId, clientRequestId)`와 동일 fingerprint가 이미 `COMMITTED`이면 새 주문을 만들지 않고 같은 응답에 `idempotentReplay=true`를 넣는다. 같은 key인데 payload가 다르면 `DUPLICATE_REQUEST`다.

### 4.5 `POST /orders/get` — 단일 주문 조회

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "...",
  "orderId": "d08c9c4b-9f60-4a84-a622-6b1dd84ed308"
}
```

`orderId` 대신 `displayCode`를 보낼 수도 있지만 둘 중 정확히 하나만 허용한다. token이 인증한 table의 주문만 반환한다. 응답 주문 shape은 create와 같고 `idempotentReplay`는 없다.

S07은 create 응답만으로 렌더링할 수 있으므로 이 endpoint는 새로고침/복구용이다.

### 4.6 `POST /orders/list` — S08 회차 및 상태 조회

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "..."
}
```

Response `data`:

```json
{
  "table": { "tableId": "T12", "displayName": "테이블 12" },
  "orders": [
    {
      "orderId": "d08c...",
      "displayCode": "A-1042",
      "status": "PREPARING",
      "publicStatus": "preparing",
      "totalAmount": 23000,
      "createdAt": "2026-08-25T10:24:00.000Z",
      "items": [
        { "name": "김치찌개", "quantity": 1, "lineTotal": 10000, "selectedOptions": ["보통", "공기밥 추가"] }
      ]
    }
  ],
  "latestPublicStatus": "preparing",
  "sessionTotalAmount": 23000
}
```

- `orders`는 최신 주문 먼저다.
- `sessionTotalAmount`는 `COMMITTED`이며 `CANCELLED`가 아닌 주문 합계다. 후불 여부와 무관하다.
- 고객 status tracker는 가장 최근 비취소 주문의 `publicStatus`를 사용한다.
- polling은 기본 15초, 탭이 hidden이면 중단, 실패 시 마지막 성공 값을 유지하고 exponential backoff+jitter를 적용한다.

### 4.7 `POST /calls/create` — 직원 호출 (고객 S09)

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "...",
  "reason": "WATER_UTENSIL",
  "clientRequestId": "7c2a9f81-..."
}
```

Response `data`:

```json
{
  "callId": "c41e...",
  "tableId": "T12",
  "reason": "WATER_UTENSIL",
  "status": "PENDING",
  "createdAt": "2026-08-25T10:41:00.000Z",
  "idempotentReplay": false
}
```

- `reason`은 `WATER_UTENSIL`, `SIDE_PLATE`, `ORDER_INQUIRY`, `PAYMENT_REQUEST`, `OTHER` 중 하나다. 고객이 사유를 고르지 않고 바로 호출하면 `OTHER`를 보낸다.
- `clientRequestId`가 이미 존재하면 새 행을 만들지 않고 기존 호출을 그대로 반환한다(`idempotentReplay: true`). 주문과 동일한 재전송 규칙이다.
- 같은 `table_id`의 마지막 `created_at`으로부터 `CALL_MIN_INTERVAL_SECONDS` 이내면 `CALL_TOO_FREQUENT`로 거절한다. 이 검사는 재전송(replay)에는 적용하지 않는다.
- 주문이 없는 테이블도 호출할 수 있다. `active=FALSE` 테이블과 `EVENT_OPEN=FALSE`일 때는 거절한다.

### 4.8 `POST /calls/cancel` — 호출 취소 (고객 S09b)

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T12",
  "tableToken": "...",
  "callId": "c41e..."
}
```

- `status`를 `CANCELLED`로 바꾸고 `cancelled_at`을 기록한다.
- `PENDING`이 아닌 호출은 `CALL_ALREADY_RESOLVED`로 거절한다. 이미 운영진이 확인했다면 취소할 수 없다 — 직원이 이미 출발했을 수 있다.
- 취소된 호출은 병합 그룹에서 빠지므로 운영 화면의 횟수가 즉시 줄어든다.

### 4.9 `POST /staff/login` — 운영 기기 인증

여기부터는 **운영 배포 전용**이다. 모든 운영 endpoint는 body에 `staffToken`을 요구한다(`/staff/login` 제외).

Request:

```json
{
  "apiVersion": "v1",
  "passcode": "gaeul-pub-2026-counter",
  "deviceLabel": "주방"
}
```

`deviceLabel`은 자유 문자열이 아니라 `카운터`, `주방`, `서빙`, `결제` 네 값만 허용한다(Figma A09의 스테이션 프리셋). 다른 값은 `INVALID_DEVICE_LABEL`로 거절한다. 교대마다 표기가 갈리면 AuditLog로 스테이션별 집계를 할 수 없다.

Response `data`:

```json
{
  "staffToken": "eyJkIjoi7KO87LCpIGlQYWQiLCJ...Q.9f3ac81b...",
  "deviceLabel": "주방",
  "expiresAt": "2026-08-26T06:00:00.000Z"
}
```

토큰 형식은 `base64url(payload) + "." + base64url(HMAC_SHA256(STAFF_TOKEN_SECRET, base64url(payload)))`이며 payload는 다음과 같다.

```json
{ "deviceLabel": "주방", "issuedAt": 1756112400, "expiresAt": 1756155600, "epoch": 3 }
```

검증 규칙:

- 서명이 일치하지 않으면 즉시 거절한다. `Utilities.computeHmacSha256Signature`를 쓰고 비교는 상수 시간으로 한다.
- `expiresAt`이 지났으면 `STAFF_TOKEN_EXPIRED`. 프론트는 재로그인 화면을 띄운다.
- payload의 `epoch`가 Settings의 `STAFF_TOKEN_EPOCH`와 다르면 `STAFF_TOKEN_REVOKED`. 이것이 일괄 무효화 스위치다.
- 검증은 Sheet를 읽지 않는다. `STAFF_TOKEN_EPOCH`만 CacheService에 60초 캐싱해 읽는다.

passcode 검증:

- `SHA-256(pepper + ":" + passcode)`를 Script Properties의 `STAFF_PASSCODE_HASH`와 비교한다.
- 실패 시도는 CacheService에 누적한다. 10분 내 5회 실패하면 그 `deviceLabel`에 대해 10분간 `STAFF_LOGIN_THROTTLED`로 거절한다. Apps Script는 신뢰할 수 있는 client IP를 주지 않으므로 `deviceLabel` 기준으로 제한하고, 전역 실패 카운터도 함께 둔다.
- passcode 불일치는 `STAFF_PASSCODE_MISMATCH`로 응답한다. throttle 응답은
  `error.details.retryAfter`에 서버 기준 ISO 8601 재시도 가능 시각을 포함한다.
- 성공/실패 모두 AuditLog에 남긴다(`STAFF_LOGIN`, `STAFF_LOGIN_FAILED`). `actor_id`는 `deviceLabel`이다.
- passcode는 응답·로그·`detail_json` 어디에도 남기지 않는다.

세션 길이는 Settings의 `STAFF_SESSION_HOURS`(기본 `14`)다. 행사 하루를 덮되 다음 날까지 살아 있지 않게 한다.

### 4.10 `POST /calls/list` — 미확인 호출 병합 조회 (운영 A01)

운영 화면 전용이다. 고객 토큰이 아니라 운영 인증을 요구한다.

Response `data`:

```json
{
  "groups": [
    {
      "tableId": "T03",
      "displayName": "테이블 3",
      "count": 3,
      "reasons": ["WATER_UTENSIL", "SIDE_PLATE", "PAYMENT_REQUEST"],
      "firstCalledAt": "2026-08-25T10:37:00.000Z",
      "lastCalledAt": "2026-08-25T10:41:00.000Z",
      "callIds": ["c41e...", "d90b...", "e02c..."]
    }
  ],
  "tableCount": 2
}
```

- `groups`는 `status='PENDING'` 행을 `table_id`로 묶은 것이다. 원본 행을 그대로 반환하지 않는다.
- 정렬은 `firstCalledAt` 오름차순이다. 가장 오래 기다린 테이블이 먼저 온다.
- `reasons`는 `created_at` 오름차순 중복 제거 결과다.
- `tableCount`는 `groups.length`다. 호출 건수가 아니라 **호출한 테이블 수**이며, 레일 배지와 헤더 카운트가 이 값을 쓴다.
- `count`는 파생값이며 Sheet에 저장하지 않는다.

### 4.11 `POST /calls/acknowledge` — 호출 확인 (운영 A01)

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T03"
}
```

Response `data`:

```json
{
  "tableId": "T03",
  "acknowledgedCount": 3,
  "acknowledgedAt": "2026-08-25T10:42:00.000Z"
}
```

- **`callId`가 아니라 `tableId`를 받는다.** 확인은 그 테이블의 `PENDING` 행 전부를 한 번에 처리하는 그룹 단위 동작이다. 개별 행 확인 API는 만들지 않는다 — 운영 화면에 개별 행이 노출되지 않으므로 부를 방법도 없다.
- 그룹의 모든 행이 **동일한** `acknowledged_at`을 갖는다. 무결성 체크리스트가 이를 검사한다.
- 확인 후 그룹이 비므로 이후 새 호출은 `count: 1`인 새 그룹이 된다. 카운트 리셋을 위한 별도 필드나 로직은 없다.
- 확인할 `PENDING`이 없으면 `acknowledgedCount: 0`으로 정상 응답한다. 두 명이 동시에 눌러도 오류가 아니다.
- AuditLog는 그룹당 1건(`CALL_ACKNOWLEDGED`)만 남긴다.

### 4.12 `POST /tables/bill` — 청구 조회 (운영 A02/B03)

Request: `{ "apiVersion": "v1", "tableId": "T08" }`

Response `data`:

```json
{
  "sessionId": "9b71...",
  "tableId": "T08",
  "originTableId": "T03",
  "mergedTableIds": ["T04"],
  "discountRate": 20,
  "subtotalAmount": 145000,
  "discountAmount": 29000,
  "finalAmount": 116000,
  "paymentStatus": "UNPAID",
  "orderCount": 5
}
```

- 금액은 **조회 시점에 계산한다.** 결제 확정 전까지 Sheet에 저장하지 않으므로 주문이 추가/취소되면 즉시 반영된다.
- 합석된 테이블을 조회하면 대표 세션의 청구를 반환하고 `mergedTableIds`로 관계를 알린다.
- `discountAmount = floor(subtotalAmount * discountRate / 100)`. 버림이다.

### 4.13 `POST /tables/discount` — 할인 적용/해제 (운영 A07)

Request: `{ "apiVersion": "v1", "tableId": "T08", "discountRate": 20 }`

- `discountRate`는 `0` 또는 `TABLE_DISCOUNT_RATE` 값만 허용한다. 임의 비율은 `INVALID_DISCOUNT_RATE`로 거절한다. 쿠폰 엔진이 아니다.
- 대표 세션에만 적용된다. 종속 세션에 걸면 대표로 리다이렉트하지 않고 `SESSION_NOT_PRIMARY`로 거절한다 — 어느 쪽에 걸었는지 운영진이 알아야 한다.
- **할인 적용 이후 추가되는 주문도 할인 대상이다.** 금액이 조회 시점 계산이기 때문이다.
- `PAID` 세션은 `SESSION_ALREADY_PAID`로 거절한다.

### 4.14 `POST /tables/move` — 테이블 이동 (운영 A04)

Request: `{ "apiVersion": "v1", "fromTableId": "T03", "toTableId": "T08" }`

- `session.table_id`만 바꾼다. `Orders.table_id`와 `origin_table_id`는 그대로 둔다.
- 목적지에 `OPEN` 세션이 있으면 `DESTINATION_OCCUPIED`로 거절한다. 이동이 아니라 합석이므로 운영진이 의도를 다시 골라야 한다.
- 이동 후 고객이 옛 QR(T03)로 들어오면 `origin_table_id` 조회로 세션을 찾아 이동 안내와 함께 주문 내역을 반환한다.

### 4.15 `POST /tables/merge` — 합석 (운영 A05)

Request: `{ "apiVersion": "v1", "primaryTableId": "T03", "secondaryTableId": "T04" }`

- 종속 세션의 `merged_into_session_id`에 대표 `session_id`를 기록한다. 주문은 각자 세션에 그대로 남는다.
- 대표가 이미 종속이면 `MERGE_CHAIN_NOT_ALLOWED`로 거절한다. 합석은 1단계만 허용한다.
- 어느 한쪽이라도 `PAID`면 `SESSION_ALREADY_PAID`로 거절한다.
- 할인율은 대표 세션의 것이 그룹 전체에 적용된다. 종속 세션의 `discount_rate`는 무시되며 분리 시 되살아난다.

### 4.16 `POST /tables/split` — 분리 (운영 A06)

Request: `{ "apiVersion": "v1", "tableId": "T04" }`

- 해당 세션의 `merged_into_session_id`를 비운다. 자기 주문과 금액을 그대로 가져간다.
- `PAID` 그룹은 `SESSION_ALREADY_PAID`로 거절한다. 정산이 끝난 금액을 사후에 쪼개면 누가 얼마를 냈는지 복원할 수 없다.
- 1인별 분할 계산은 지원하지 않는다.

### 4.17 `POST /tables/confirm-payment` — 입금 확인 (운영 B03)

Request:

```json
{
  "apiVersion": "v1",
  "tableId": "T08",
  "expectedFinalAmount": 116000
}
```

- `expectedFinalAmount`는 **필수**다. 서버가 재계산한 값과 다르면 `BILL_AMOUNT_CHANGED`로 거절한다. 운영진이 확인 다이얼로그를 읽는 사이에 주문이 추가되면 화면 금액과 실제 청구가 어긋나므로, 본 적 없는 금액을 확정하는 일을 막는다.
- 대표 세션에 `subtotal_amount`/`discount_amount`/`final_amount`를 snapshot하고 `payment_status=PAID`, `paid_at`을 기록한다.
- 그룹의 종속 세션과 모든 Orders의 `payment_status`를 함께 갱신한다(mirror).
- 그룹의 모든 세션을 `CLOSED`로 바꾼다.
- 앱은 결제를 처리하지 않는다. 계좌 입금 확인 사실만 기록한다.

### 4.18 `POST /orders/update` — 항목·메모 수정 (운영 A08)

동일 endpoint를 `operation` discriminator로 나눈다.

```json
{ "apiVersion": "v1", "operation": "quantity", "itemId": "d08c...-01", "quantity": 3 }
{ "apiVersion": "v1", "operation": "cancel-item", "itemId": "d08c...-01" }
{ "apiVersion": "v1", "operation": "note", "tableId": "T08", "note": "먼저 서빙", "audience": "serving" }
```

- 수량은 1~99 정수다. 서버가 `line_total`, 활성 항목 기준 `Orders.total_amount`,
  `write_payload_json`을 같은 Script Lock 안에서 함께 갱신한다.
- 항목 취소는 행을 삭제하지 않고 `OrderItems.status=CANCELLED`로 보존한다. 마지막 활성
  항목이 취소되면 부모 주문도 `CANCELLED`가 된다.
- 메모는 billing group의 가장 최근 `COMMITTED` 비취소 주문에 귀속한다. A08 화면이
  주문 하나가 아니라 테이블 단위로 열리기 때문에 선택 대상을 결정적으로 만드는 규칙이다.
- `audience`는 `general/kitchen/serving`이며 Sheet에는 대문자 enum으로 저장한다.
- 결제 완료 세션은 `SESSION_ALREADY_PAID`로 거절한다.

### 4.19 `POST /orders/cancel` — 테이블 전체 주문 취소 (운영 A08)

Request: `{ "apiVersion": "v1", "tableId": "T08" }`

- 현재 billing group의 미결제 `COMMITTED` 비취소 주문과 모든 항목을 취소한다.
- 가격·옵션 snapshot 행은 삭제하지 않는다. 활성 합계는 0으로 다시 쓰고 취소 전 금액은
  audit detail에 남긴다.
- 결제 완료 세션은 `SESSION_ALREADY_PAID`로 거절한다.

## 5. 오류 코드

| code | 고객 메시지 | retryable | UI 공개 | 운영 로그 |
|---|---|---:|---:|---:|
| `INVALID_REQUEST` | 요청 정보를 확인해 주세요. | N | Y | Y |
| `INVALID_JSON` | JSON 요청 본문을 확인해 주세요. | N | Y | Y |
| `REQUEST_TOO_LARGE` | 요청 본문이 너무 큽니다. | N | Y | Y |
| `UNSUPPORTED_API_VERSION` | 지원하지 않는 API 버전입니다. | N | Y | Y |
| `NOT_FOUND` | 지원하지 않는 API 경로입니다. | N | Y | Y |
| `INVALID_TABLE_TOKEN` | 유효하지 않은 테이블 QR입니다. | N | Y | Y |
| `INACTIVE_TABLE` | 현재 이 테이블에서는 주문할 수 없습니다. | N | Y | Y |
| `EVENT_CLOSED` | 현재 주문을 받고 있지 않습니다. | N | Y | Y |
| `MENU_NOT_FOUND` | 메뉴 정보를 다시 불러와 주세요. | N | Y | Y |
| `MENU_SOLD_OUT` | 품절된 메뉴가 포함되어 있습니다. | N | Y | Y |
| `OPTION_NOT_FOUND` | 옵션 정보를 다시 선택해 주세요. | N | Y | Y |
| `OPTION_SOLD_OUT` | 품절된 옵션이 포함되어 있습니다. | N | Y | Y |
| `INVALID_OPTION_SELECTION` | 필수 옵션을 확인해 주세요. | N | Y | Y |
| `INVALID_QUANTITY` | 주문 수량을 확인해 주세요. | N | Y | Y |
| `DUPLICATE_REQUEST` | 이전 주문 요청과 정보가 달라 처리할 수 없습니다. | N | 일반적으로 숨김 | Y |
| `ORDER_NOT_FOUND` | 주문 정보를 찾을 수 없습니다. | N | Y | Y |
| `INVALID_ORDER_STATUS_TRANSITION` | 주문 상태를 변경할 수 없습니다. | N | 운영 화면 | Y |
| `CALL_TOO_FREQUENT` | 방금 호출했어요. 잠시 후 다시 시도해 주세요. | Y | Y | Y |
| `CALL_NOT_FOUND` | 호출 정보를 찾을 수 없습니다. | N | Y | Y |
| `CALL_ALREADY_RESOLVED` | 이미 직원이 확인한 호출입니다. | N | Y | Y |
| `STAFF_AUTH_REQUIRED` | 운영 인증이 필요합니다. | N | 운영 화면 | Y |
| `STAFF_TOKEN_INVALID` | 인증 정보가 올바르지 않습니다. | N | 운영 화면 | Y |
| `STAFF_TOKEN_EXPIRED` | 인증이 만료되었습니다. 다시 로그인해 주세요. | N | 운영 화면 | Y |
| `STAFF_TOKEN_REVOKED` | 인증이 해제되었습니다. 다시 로그인해 주세요. | N | 운영 화면 | Y |
| `STAFF_LOGIN_THROTTLED` | 시도가 많습니다. 잠시 후 다시 시도해 주세요. | Y | 운영 화면 | Y |
| `STAFF_PASSCODE_MISMATCH` | passcode가 올바르지 않습니다. | N | 운영 화면 | Y |
| `INVALID_DEVICE_LABEL` | 스테이션을 다시 선택해 주세요. | N | 운영 화면 | Y |
| `SESSION_NOT_FOUND` | 테이블 세션을 찾을 수 없습니다. | N | 운영 화면 | Y |
| `SESSION_ALREADY_PAID` | 이미 결제 완료된 테이블입니다. | N | 운영 화면 | Y |
| `SESSION_NOT_PRIMARY` | 합석된 테이블입니다. 대표 테이블에서 진행해 주세요. | N | 운영 화면 | Y |
| `DESTINATION_OCCUPIED` | 이동할 테이블이 사용 중입니다. | N | 운영 화면 | Y |
| `MERGE_CHAIN_NOT_ALLOWED` | 이미 합석된 테이블은 다시 합칠 수 없습니다. | N | 운영 화면 | Y |
| `INVALID_DISCOUNT_RATE` | 허용되지 않은 할인율입니다. | N | 운영 화면 | Y |
| `BILL_AMOUNT_CHANGED` | 금액이 변경되었습니다. 다시 확인해 주세요. | Y | 운영 화면 | Y |
| `INTERNAL_ERROR` | 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. | Y | Y | Y |
| `ORDER_WRITE_IN_PROGRESS` | 주문 처리 결과를 확인하고 있습니다. | Y | Y | Y |
| `LOCK_TIMEOUT` | 주문이 몰리고 있습니다. 잠시 후 다시 시도해 주세요. | Y | Y | Y |
| `INTERNAL_ERROR` | 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. | Y | Y | Y |

`DUPLICATE_REQUEST`는 동일 요청 재전송을 뜻하지 않는다. 동일 재전송은 정상 성공이다. 이 오류는 같은 idempotency key를 다른 장바구니에 재사용했을 때만 발생한다.

## 6. 핵심 Apps Script 예제

아래 코드는 설계 표현을 위한 pseudocode가 아니라 Apps Script V8에서 그대로 시작점으로 쓸 수 있는 형태다. schema bootstrap, 모든 repository update와 recovery 함수까지 포함한 전체 구현은 별도 작업 범위다.

### 6.1 Config와 HTTP entry

```javascript
// Config.gs
const API_VERSION = 'v1';
const LIMITS = Object.freeze({
  MAX_ORDER_LINES: 20,
  MAX_NOTE_LENGTH: 200,
  MAX_BODY_BYTES: 50 * 1024,
  LOCK_TIMEOUT_MS: 10000,
});

const SHEET = Object.freeze({
  TABLES: 'Tables',
  CATEGORIES: 'Categories',
  MENU: 'Menu',
  GROUPS: 'MenuOptionGroups',
  OPTIONS: 'MenuOptions',
  ORDERS: 'Orders',
  ITEMS: 'OrderItems',
  ITEM_OPTIONS: 'OrderItemOptions',
  SETTINGS: 'Settings',
  AUDIT: 'AuditLogs',
});

const PUBLIC_STATUS = Object.freeze({
  RECEIVED: 'accepted',
  CONFIRMED: 'accepted',
  PREPARING: 'preparing',
  SERVING: 'served',
  COMPLETED: 'closed',
  CANCELLED: 'cancelled',
});
```

```javascript
// Http.gs
class ApiError extends Error {
  constructor(code, message, retryable, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = Boolean(retryable);
    this.details = details || undefined;
  }
}

function responseMeta_(requestId) {
  return {
    apiVersion: API_VERSION,
    requestId: requestId,
    serverTime: new Date().toISOString(),
  };
}

function ok_(data, requestId) {
  return { success: true, data: data, meta: responseMeta_(requestId) };
}

function fail_(error, requestId) {
  const known = error instanceof ApiError;
  if (!known) console.error(error && error.stack ? error.stack : String(error));
  return {
    success: false,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      retryable: known ? error.retryable : true,
      ...(known && error.details ? { details: error.details } : {}),
    },
    meta: responseMeta_(requestId),
  };
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  const text = e && e.postData ? e.postData.contents : '';
  if (!text || text.length > LIMITS.MAX_BODY_BYTES) {
    throw new ApiError('INVALID_REQUEST', '요청 정보를 확인해 주세요.', false);
  }
  try {
    const body = JSON.parse(text);
    if (body.apiVersion !== API_VERSION) {
      throw new ApiError('INVALID_REQUEST', '지원하지 않는 API 버전입니다.', false);
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('INVALID_REQUEST', '요청 정보를 확인해 주세요.', false);
  }
}
```

```javascript
// Code.gs
function doGet(e) {
  const requestId = Utilities.getUuid();
  try {
    const path = normalizePath_(e && e.pathInfo);
    if (path !== 'health') {
      throw new ApiError('INVALID_REQUEST', '지원하지 않는 API 경로입니다.', false);
    }
    return jsonOutput_(ok_({ status: 'ok', apiVersion: API_VERSION }, requestId));
  } catch (error) {
    return jsonOutput_(fail_(error, requestId));
  }
}

function doPost(e) {
  const requestId = Utilities.getUuid();
  try {
    const path = normalizePath_(e && e.pathInfo);
    const body = parseBody_(e);
    let data;
    switch (path) {
      case 'resolve-table': data = resolveTable(body); break;
      case 'menu': data = getMenu(body); break;
      case 'orders/create': data = createOrder(body, requestId); break;
      case 'orders/get': data = getOrder(body); break;
      case 'orders/list': data = listOrders(body); break;
      default:
        throw new ApiError('INVALID_REQUEST', '지원하지 않는 API 경로입니다.', false);
    }
    return jsonOutput_(ok_(data, requestId));
  } catch (error) {
    return jsonOutput_(fail_(error, requestId));
  }
}

function normalizePath_(pathInfo) {
  return String(pathInfo || '').replace(/^\/+|\/+$/g, '');
}
```

### 6.2 header 기반 repository helper

```javascript
// Repositories.gs
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Missing SPREADSHEET_ID Script Property');
  return SpreadsheetApp.openById(id);
}

function readSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Missing header: ' + sheetName);
  const headers = values[0].map(String);
  const rows = values.slice(1)
    .filter(row => row.some(value => value !== ''))
    .map((row, offset) => {
      const object = { __rowNumber: offset + 2 };
      headers.forEach((header, index) => { object[header] = row[index]; });
      return object;
    });
  return { sheet: sheet, headers: headers, rows: rows };
}

function appendObjects_(sheetName, objects) {
  if (!objects.length) return;
  const table = readSheet_(sheetName);
  const values = objects.map(object =>
    table.headers.map(header => object[header] === undefined ? '' : object[header])
  );
  table.sheet.getRange(table.sheet.getLastRow() + 1, 1, values.length, table.headers.length)
    .setValues(values);
}

function updateRow_(sheetName, rowNumber, patch) {
  const table = readSheet_(sheetName);
  const range = table.sheet.getRange(rowNumber, 1, 1, table.headers.length);
  const current = range.getValues()[0];
  table.headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(patch, header)) current[index] = patch[header];
  });
  range.setValues([current]);
}

function findOrderByIdempotency_(key) {
  return readSheet_(SHEET.ORDERS).rows.find(row => row.idempotency_key === key) || null;
}
```

실제 구현에서는 한 service 실행 안에서 같은 Sheet를 두 번 읽지 않도록 request-local table object를 넘긴다. 위 코드는 책임을 보여주기 위해 단순화했다. Google은 Spreadsheet read/write를 배열로 batch하라고 [권장](https://developers.google.com/apps-script/guides/support/best-practices#use_batch_operations)한다.

### 6.3 table 검증과 메뉴 조립

```javascript
// TableCatalogService.gs
function sha256Hex_(text) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  ).map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function constantTimeEquals_(left, right) {
  left = String(left); right = String(right);
  if (!left || !right) return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function validateTable(tableId, tableToken, requireActive) {
  if (!/^T\d{2,}$/.test(String(tableId)) || !/^[0-9a-f]{64}$/i.test(String(tableToken))) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
  const table = readSheet_(SHEET.TABLES).rows.find(row => row.table_id === tableId);

  const pepper = PropertiesService.getScriptProperties().getProperty('TOKEN_PEPPER');
  if (!pepper) throw new Error('Missing TOKEN_PEPPER Script Property');
  const actualHash = sha256Hex_(pepper + ':' + tableToken);
  const expectedHash = table ? table.token_hash : '0'.repeat(64);
  if (!constantTimeEquals_(actualHash, expectedHash) || !table) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
  if (requireActive && table.active !== true) {
    throw new ApiError('INACTIVE_TABLE', '현재 이 테이블에서는 주문할 수 없습니다.', false);
  }
  return table;
}

function settingsMap_() {
  return readSheet_(SHEET.SETTINGS).rows.reduce((map, row) => {
    let value = row.value;
    if (row.type === 'INTEGER') value = Number(value);
    if (row.type === 'BOOLEAN') value = String(value).toUpperCase() === 'TRUE' || value === true;
    map[row.key] = value;
    return map;
  }, {});
}

function assertEventOpen_(settings) {
  if (settings.EVENT_OPEN !== true) {
    throw new ApiError('EVENT_CLOSED', '현재 주문을 받고 있지 않습니다.', false);
  }
}

function resolveTable(payload) {
  const table = validateTable(payload.tableId, payload.tableToken, true);
  const settings = settingsMap_();
  assertEventOpen_(settings);
  return {
    table: { tableId: table.table_id, displayName: table.display_name },
    store: { name: settings.STORE_NAME, open: true, notice: settings.NOTICE },
    statusPollSeconds: Number(settings.STATUS_POLL_SECONDS || 15),
  };
}

function getMenu(payload) {
  validateTable(payload.tableId, payload.tableToken, true);
  assertEventOpen_(settingsMap_());

  const categories = readSheet_(SHEET.CATEGORIES).rows.filter(row => row.active === true);
  const menu = readSheet_(SHEET.MENU).rows;
  const groups = readSheet_(SHEET.GROUPS).rows.filter(row => row.active === true);
  const options = readSheet_(SHEET.OPTIONS).rows;
  const activeCategoryIds = new Set(categories.map(row => row.category_id));

  return {
    categories: categories.sort((a, b) => a.sort_order - b.sort_order).map(row => ({
      categoryId: row.category_id, label: row.label, heading: row.heading,
    })),
    items: menu.filter(row => activeCategoryIds.has(row.category_id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => catalogItem_(item, groups, options)),
    generatedAt: new Date().toISOString(),
  };
}

function catalogItem_(item, groups, options) {
  const itemGroups = groups.filter(group => group.menu_id === item.menu_id)
    .sort((a, b) => Number(b.required) - Number(a.required) || a.sort_order - b.sort_order);
  return {
    menuId: item.menu_id,
    categoryId: item.category_id,
    name: item.name,
    description: item.description,
    basePrice: Number(item.base_price),
    imageUrl: item.image_url || null,
    available: item.available === true,
    minQuantity: Number(item.min_quantity),
    maxQuantity: Number(item.max_quantity),
    allergens: item.allergens ? String(item.allergens).split('|') : [],
    origin: item.origin || null,
    badgeTags: item.badge_tags ? String(item.badge_tags).split('|') : [],
    optionGroups: itemGroups.map(group => {
      const groupOptions = options.filter(option => option.option_group_id === group.option_group_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      return {
        optionGroupId: group.option_group_id,
        label: group.label,
        required: group.required === true,
        selectionType: group.selection_type === 'SINGLE' ? 'single' : 'multiple',
        minSelections: Number(group.min_select),
        maxSelections: Number(group.max_select),
        defaultSelectedOptionIds: groupOptions.filter(option => option.default_selected === true)
          .map(option => option.option_id),
        options: groupOptions.map(option => ({
          optionId: option.option_id,
          name: option.name,
          priceDelta: Number(option.price_delta),
          available: option.available === true,
        })),
      };
    }),
  };
}

function getCatalogForOrder_() {
  // createOrder 전용: CacheService를 사용하지 않고 현재 Sheet를 직접 읽는다.
  const groups = readSheet_(SHEET.GROUPS).rows.filter(row => row.active === true);
  const options = readSheet_(SHEET.OPTIONS).rows;
  const activeCategoryIds = new Set(
    readSheet_(SHEET.CATEGORIES).rows
      .filter(row => row.active === true)
      .map(row => row.category_id)
  );
  return {
    items: readSheet_(SHEET.MENU).rows
      .filter(item => activeCategoryIds.has(item.category_id))
      .map(item => catalogItem_(item, groups, options)),
  };
}
```

table token 최소 길이와 저장 hash 존재 여부는 setup 진단에서도 검사한다. hash가 비어 있으면 비교 함수는 false를 반환해 fail closed한다.

### 6.4 주문 항목 검증과 합계

```javascript
// Validation.gs
function validateOrderItems(items, catalog) {
  if (!Array.isArray(items) || items.length < 1 || items.length > LIMITS.MAX_ORDER_LINES) {
    throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false);
  }
  const menuById = new Map(catalog.items.map(item => [item.menuId, item]));

  return items.map((input, index) => {
    const menu = menuById.get(input.menuId);
    if (!menu) {
      throw new ApiError('MENU_NOT_FOUND', '메뉴 정보를 다시 불러와 주세요.', false,
        { menuIds: [input.menuId] });
    }
    if (!menu.available) {
      throw new ApiError('MENU_SOLD_OUT', '품절된 메뉴가 포함되어 있습니다.', false,
        { menuIds: [input.menuId] });
    }
    if (!Number.isInteger(input.quantity) || input.quantity < menu.minQuantity || input.quantity > menu.maxQuantity) {
      throw new ApiError('INVALID_QUANTITY', '주문 수량을 확인해 주세요.', false,
        { menuId: input.menuId, min: menu.minQuantity, max: menu.maxQuantity });
    }

    const selectedIds = Array.isArray(input.selectedOptionIds) ? input.selectedOptionIds : [];
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new ApiError('INVALID_OPTION_SELECTION', '옵션 정보를 다시 선택해 주세요.', false);
    }
    const allOptions = menu.optionGroups.flatMap(group =>
      group.options.map(option => ({ ...option, group: group }))
    );
    const optionById = new Map(allOptions.map(option => [option.optionId, option]));
    const selected = selectedIds.map(optionId => {
      const option = optionById.get(optionId);
      if (!option) {
        throw new ApiError('OPTION_NOT_FOUND', '옵션 정보를 다시 선택해 주세요.', false,
          { optionIds: [optionId] });
      }
      if (!option.available) {
        throw new ApiError('OPTION_SOLD_OUT', '품절된 옵션이 포함되어 있습니다.', false,
          { optionIds: [optionId] });
      }
      return option;
    });

    menu.optionGroups.forEach(group => {
      const count = selected.filter(option => option.group.optionGroupId === group.optionGroupId).length;
      if (count < group.minSelections || count > group.maxSelections) {
        throw new ApiError('INVALID_OPTION_SELECTION', '필수 옵션을 확인해 주세요.', false,
          { optionGroupId: group.optionGroupId, min: group.minSelections, max: group.maxSelections });
      }
    });

    const unitPrice = menu.basePrice + selected.reduce((sum, option) => sum + option.priceDelta, 0);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error('Invalid catalog price');
    const lineTotal = unitPrice * input.quantity;
    if (!Number.isSafeInteger(lineTotal)) throw new Error('Order total overflow');

    return {
      lineNo: index + 1,
      menuId: menu.menuId,
      menuName: menu.name,
      basePrice: menu.basePrice,
      unitPrice: unitPrice,
      quantity: input.quantity,
      lineTotal: lineTotal,
      selectedOptions: selected.map((option, optionIndex) => ({
        sortOrder: optionIndex + 1,
        optionId: option.optionId,
        groupName: option.group.label,
        name: option.name,
        priceDelta: option.priceDelta,
      })),
    };
  });
}

function calculateOrderTotal(lines) {
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid order total');
  return total;
}
```

선택되지 않은 option ID가 다른 메뉴에 속해 있어도 `OPTION_NOT_FOUND`로 거절된다. 클라이언트가 보내지 않은 default option을 서버가 임의로 추가하지 않는다. 필수 default는 UI 편의를 위한 값일 뿐, 요청에 명시돼야 한다.

### 6.5 idempotency, locking, 주문 생성

```javascript
// OrderService.gs
function requestFingerprint_(payload) {
  const canonical = {
    tableId: payload.tableId,
    note: String(payload.note || ''),
    items: payload.items.map(item => ({
      menuId: String(item.menuId),
      quantity: item.quantity,
      selectedOptionIds: (item.selectedOptionIds || []).map(String).slice().sort(),
    })),
  };
  return sha256Hex_(JSON.stringify(canonical));
}

function validateClientRequest_(payload) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(payload.clientRequestId || ''))) {
    throw new ApiError('INVALID_REQUEST', '주문 요청 ID를 확인해 주세요.', false);
  }
  if (!Array.isArray(payload.items)) {
    throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false);
  }
  if (String(payload.note || '').length > LIMITS.MAX_NOTE_LENGTH) {
    throw new ApiError('INVALID_REQUEST', '요청 메모가 너무 깁니다.', false);
  }
}

function createOrder(payload, requestId) {
  validateClientRequest_(payload); // Sheet/lock을 사용하지 않는 형식 검증
  const idempotencyKey = payload.tableId + ':' + payload.clientRequestId;
  const fingerprint = requestFingerprint_(payload);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '주문이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }

  let orderId;
  let replay = false;
  let createdRowNumber = null;
  try {
    const table = validateTable(payload.tableId, payload.tableToken, false);
    const existing = findOrderByIdempotency_(idempotencyKey);
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new ApiError('DUPLICATE_REQUEST', '이전 주문 요청과 정보가 달라 처리할 수 없습니다.', false);
      }
      if (existing.write_state === 'COMMITTED') {
        orderId = existing.order_id;
        replay = true;
      } else if (existing.write_state === 'WRITING') {
        const ageMs = Date.now() - new Date(existing.updated_at).getTime();
        if (Number.isFinite(ageMs) && ageMs < 30000) {
          throw new ApiError('ORDER_WRITE_IN_PROGRESS', '주문 처리 결과를 확인하고 있습니다.', true);
        }
        // 30초 이상 갱신되지 않은 WRITING은 중단된 실행으로 보고 snapshot에서 복구한다.
        repairOrderWrite_(existing, payload, requestId);
        orderId = existing.order_id;
        replay = true;
      } else {
        // FAILED는 deterministic child ID로 복구한다. 전체 구현에서 repairOrderWrite_를 제공한다.
        repairOrderWrite_(existing, payload, requestId);
        orderId = existing.order_id;
        replay = true;
      }
    } else {
      if (table.active !== true) {
        throw new ApiError('INACTIVE_TABLE', '현재 이 테이블에서는 주문할 수 없습니다.', false);
      }
      assertEventOpen_(settingsMap_());

      // create에서는 cache를 쓰지 않고 lock 안에서 현재 Sheet를 읽는다.
      const catalog = getCatalogForOrder_();
      const lines = validateOrderItems(payload.items, catalog);
      const total = calculateOrderTotal(lines);
      const number = allocateDisplayNumber_();
      orderId = Utilities.getUuid();
      const now = new Date();
      const displayCode = number.prefix + number.value;

      const orderRow = {
        order_id: orderId,
        display_number: number.value,
        display_code: displayCode,
        client_request_id: payload.clientRequestId,
        idempotency_key: idempotencyKey,
        request_fingerprint: fingerprint,
        table_id: payload.tableId,
        status: 'RECEIVED',
        public_status: 'accepted',
        payment_status: 'UNPAID',
        total_amount: total,
        note: String(payload.note || ''),
        write_payload_json: JSON.stringify(lines),
        write_state: 'WRITING',
        status_updated_at: now,
        created_at: now,
        updated_at: now,
      };
      appendObjects_(SHEET.ORDERS, [orderRow]);
      createdRowNumber = readSheet_(SHEET.ORDERS).sheet.getLastRow();

      writeOrderChildren_(orderId, lines, now); // 각 Sheet에 한 번씩 setValues
      updateRow_(SHEET.ORDERS, createdRowNumber, { write_state: 'COMMITTED', updated_at: new Date() });
      appendAudit_('SYSTEM', 'ORDER_CREATED', 'ORDER', orderId, requestId, null);
    }
  } catch (error) {
    if (createdRowNumber) {
      try {
        updateRow_(SHEET.ORDERS, createdRowNumber, { write_state: 'FAILED', updated_at: new Date() });
        appendAudit_('SYSTEM', 'ORDER_WRITE_FAILED', 'ORDER', orderId, requestId,
          { error: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' });
      } catch (markError) {
        console.error('Failed to mark order write failure: ' + markError.stack);
      }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }

  const result = getOrder({
    tableId: payload.tableId,
    tableToken: payload.tableToken,
    orderId: orderId,
  });
  result.idempotentReplay = replay;
  return result;
}
```

실제 구현에서는 `appendObjects_`가 반환한 시작 row를 사용한다. 위 예제의 `getLastRow()` 재조회는 같은 Script Lock 안이라 다른 주문과 충돌하지 않지만 반환값 방식이 더 명확하다.

중요한 순서:

1. token은 검증하되 active/event 상태보다 idempotency를 먼저 확인한다.
2. 기존에 성공한 요청은 그 사이 메뉴가 품절되거나 이벤트가 닫혀도 기존 결과를 반환한다.
3. 신규 요청만 현재 active/event/menu/option을 검증한다.
4. response 조립은 lock을 푼 뒤 수행한다.

`writeOrderChildren_`는 다음 deterministic ID를 사용해 retry/recovery 시 upsert할 수 있게 한다.

```javascript
function writeOrderChildren_(orderId, lines, now) {
  const itemRows = [];
  const optionRows = [];
  lines.forEach(line => {
    const itemId = orderId + '-' + String(line.lineNo).padStart(2, '0');
    itemRows.push({
      order_item_id: itemId,
      order_id: orderId,
      line_no: line.lineNo,
      menu_id: line.menuId,
      menu_name_snapshot: line.menuName,
      base_price_snapshot: line.basePrice,
      unit_price_snapshot: line.unitPrice,
      quantity: line.quantity,
      line_total: line.lineTotal,
      created_at: now,
    });
    line.selectedOptions.forEach((option, index) => optionRows.push({
      order_item_option_id: itemId + '-' + String(index + 1).padStart(2, '0'),
      order_item_id: itemId,
      order_id: orderId,
      option_id: option.optionId,
      option_group_name_snapshot: option.groupName,
      option_name_snapshot: option.name,
      price_delta_snapshot: option.priceDelta,
      sort_order: option.sortOrder,
      created_at: now,
    }));
  });
  appendObjects_(SHEET.ITEMS, itemRows);
  appendObjects_(SHEET.ITEM_OPTIONS, optionRows);
}
```

`repairOrderWrite_`는 Orders의 `write_payload_json`을 parse하고 기존 child ID set을 읽어 누락된 행만 append한 뒤 합계 검증 후 `COMMITTED`로 바꾼다. 같은 ID가 이미 있으면 다시 쓰지 않는다. 이 JSON은 token이나 client가 주장한 가격이 아니라 서버가 검증·계산한 line snapshot만 포함한다. frontend도 결과를 받기 전까지 원 body를 보존한다.

### 6.6 주문 번호 할당

```javascript
function allocateDisplayNumber_() {
  // 반드시 Script Lock 안에서만 호출한다.
  const settings = readSheet_(SHEET.SETTINGS);
  const next = settings.rows.find(row => row.key === 'NEXT_DISPLAY_NUMBER');
  const prefix = settings.rows.find(row => row.key === 'ORDER_PREFIX');
  if (!next || !Number.isInteger(Number(next.value))) throw new Error('Invalid NEXT_DISPLAY_NUMBER');
  const value = Number(next.value);
  updateRow_(SHEET.SETTINGS, next.__rowNumber, { value: value + 1, updated_at: new Date() });
  return { value: value, prefix: prefix ? String(prefix.value) : 'A-' };
}
```

counter 증가 후 주문 write가 실패하면 순번이 하나 비게 될 수 있다. 현장 번호에서 gap은 허용하고 중복 방지를 우선한다.

### 6.7 주문 조회

```javascript
function getOrder(payload) {
  const table = validateTable(payload.tableId, payload.tableToken, false);
  if (Boolean(payload.orderId) === Boolean(payload.displayCode)) {
    throw new ApiError('INVALID_REQUEST', 'orderId 또는 displayCode 중 하나가 필요합니다.', false);
  }
  const orders = readSheet_(SHEET.ORDERS).rows;
  const order = orders.find(row =>
    row.write_state === 'COMMITTED' &&
    row.table_id === table.table_id &&
    (payload.orderId ? row.order_id === payload.orderId : row.display_code === payload.displayCode)
  );
  if (!order) throw new ApiError('ORDER_NOT_FOUND', '주문 정보를 찾을 수 없습니다.', false);
  return buildOrderResponse_(order);
}

function listOrders(payload) {
  const table = validateTable(payload.tableId, payload.tableToken, false);
  const rows = readSheet_(SHEET.ORDERS).rows
    .filter(row => row.table_id === table.table_id && row.write_state === 'COMMITTED')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const orders = rows.map(buildOrderResponse_);
  const active = orders.filter(order => order.status !== 'CANCELLED');
  return {
    table: { tableId: table.table_id, displayName: table.display_name },
    orders: orders,
    latestPublicStatus: active.length ? active[0].publicStatus : null,
    sessionTotalAmount: active.reduce((sum, order) => sum + order.totalAmount, 0),
  };
}
```

`buildOrderResponse_`는 OrderItems를 `order_id`로, OrderItemOptions를 `order_item_id`로 묶고 snapshot만 반환한다. 현재 Menu Sheet와 join해 이름/가격을 다시 계산하면 안 된다.

### 6.8 상태 전이 validation과 Sheet edit trigger

```javascript
const ALLOWED_TRANSITIONS = Object.freeze({
  RECEIVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SERVING', 'CANCELLED'],
  SERVING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
});

function validateOrderStatusTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new ApiError(
      'INVALID_ORDER_STATUS_TRANSITION',
      '주문 상태를 변경할 수 없습니다.',
      false,
      { from: fromStatus, to: toStatus }
    );
  }
  return true;
}

// Setup.gs에서 이 함수에 대한 installable spreadsheet edit trigger를 한 번 생성한다.
function onOrderSheetEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== SHEET.ORDERS) return;
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColumn = headers.indexOf('status') + 1;
  if (e.range.getColumn() !== statusColumn || e.range.getNumRows() !== 1 || !e.oldValue) return;

  try {
    validateOrderStatusTransition(String(e.oldValue), String(e.value));
    const row = e.range.getRow();
    const publicColumn = headers.indexOf('public_status') + 1;
    const statusAtColumn = headers.indexOf('status_updated_at') + 1;
    const updatedAtColumn = headers.indexOf('updated_at') + 1;
    sheet.getRange(row, publicColumn).setValue(PUBLIC_STATUS[e.value]);
    sheet.getRange(row, statusAtColumn).setValue(new Date());
    sheet.getRange(row, updatedAtColumn).setValue(new Date());
  } catch (error) {
    e.range.setValue(e.oldValue); // setValue는 edit trigger를 다시 발생시키지 않는다.
    e.range.setNote('허용되지 않은 상태 변경: ' + e.oldValue + ' → ' + e.value);
    appendAudit_('STAFF', 'INVALID_STATUS_EDIT', 'ORDER', '', '', {
      from: e.oldValue, to: e.value, row: e.range.getRow(),
    });
  }
}
```

Apps Script가 `setValue()`로 바꾼 셀은 edit trigger를 다시 발생시키지 않는다는 점은 [공식 문서](https://developers.google.com/apps-script/guides/triggers#restrictions)에 따른다. 이 함수는 `e.oldValue`가 있는 단일 셀 편집만 지원한다. Orders status 열의 bulk paste를 막고, 가장 안전한 운영 방식으로 커스텀 메뉴 `advanceSelectedOrder()`를 권장한다. API 내부 상태 변경 함수도 반드시 같은 `validateOrderStatusTransition`을 호출한다.

## 7. 프론트엔드 연동 예제

### 공통 호출

```typescript
type ApiEnvelope<T> =
  | { success: true; data: T; meta: { apiVersion: 'v1'; requestId: string; serverTime: string } }
  | { success: false; error: { code: string; message: string; retryable: boolean; details?: unknown }; meta: { requestId: string } }

async function callAppsScript<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_APPS_SCRIPT_URL}/${path}`, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ apiVersion: 'v1', ...payload }),
  })
  const envelope = (await response.json()) as ApiEnvelope<T>
  if (!envelope.success) throw Object.assign(new Error(envelope.error.message), envelope.error)
  return envelope.data
}
```

### 주문 idempotency

```typescript
const pendingKey = `qr-order:${tableToken}:pending-order`

function loadOrCreatePendingOrder(items: unknown[]) {
  const stored = localStorage.getItem(pendingKey)
  if (stored) return JSON.parse(stored)
  const pending = { clientRequestId: crypto.randomUUID(), items }
  localStorage.setItem(pendingKey, JSON.stringify(pending))
  return pending
}

async function submitOrder(tableId: string, tableToken: string, items: unknown[]) {
  const pending = loadOrCreatePendingOrder(items)
  const order = await callAppsScript('orders/create', { tableId, tableToken, ...pending })
  localStorage.removeItem(pendingKey) // success envelope를 받은 뒤에만 제거
  return order
}
```

- 사용자가 장바구니를 수정해 새로 확정하면 새 `clientRequestId`를 만든다.
- timeout, offline, 5xx/파싱 실패, `LOCK_TIMEOUT`, `ORDER_WRITE_IN_PROGRESS`에서는 pending body를 유지한다.
- `MENU_SOLD_OUT`, `INVALID_QUANTITY`처럼 definitive validation 오류이면 pending key를 폐기하고 장바구니를 수정하게 한다.
- 버튼은 첫 클릭 즉시 loading/disabled 처리하지만 서버 idempotency를 대체하지 않는다.

### 상태 polling

15초를 기준으로 0~2초 jitter를 넣고, hidden tab에서는 중지한다. 실패 시 15→30→60초까지 backoff하며 마지막 성공 화면을 유지한다. 다시 visible이 되면 즉시 한 번 조회한다. 여러 component가 각자 timer를 만들지 않고 session-level query 하나를 공유한다.

## 8. 배포와 운영 체크리스트

### 배포 전

- Script Properties: `SPREADSHEET_ID`, 32바이트 이상 random `TOKEN_PEPPER`
- `runDiagnostics()`로 header/enum/FK/가격/option/counter 검사
- Web app은 배포자 권한으로 실행, 익명 접근 허용 정책 확인
- `/dev`가 아니라 versioned `/exec` URL 사용
- 실제 frontend origin에서 resolve/menu/create/list CORS 및 redirect 확인
- 배포 URL을 frontend 환경 변수에 주입하고 raw token이 build/log에 들어가지 않는지 확인
- Table token 생성 후 hash만 Sheet에 저장하고 QR을 출력
- 보호 범위, dropdown, Filter View/QUERY View 확인
- 메뉴/옵션 품절은 같은 Script Lock을 쓰는 Sheet 커스텀 메뉴 함수로 전환되는지 확인

### 필수 시나리오 테스트

| 시나리오 | 기대 결과 |
|---|---|
| table ID만 T12→T13 변경 | `INVALID_TABLE_TOKEN` |
| inactive table | `INACTIVE_TABLE` |
| 메뉴 가격을 client body에 추가/변조 | `INVALID_REQUEST` 또는 완전 무시가 아닌 계약 거절 |
| menu available을 주문 직전 FALSE | `MENU_SOLD_OUT`, 주문 row 없음 |
| option available을 주문 직전 FALSE | `OPTION_SOLD_OUT` |
| 품절 커스텀 메뉴와 주문을 동시에 실행 | Lock 획득 순서에 따라 주문 1건 또는 품절 거절로 일관되게 결정 |
| 필수 option 누락/복수 single 선택 | `INVALID_OPTION_SELECTION` |
| 같은 body/clientRequestId 10회 병렬 전송 | 주문 1건, 나머지는 replay 또는 in-progress 후 replay |
| 같은 clientRequestId에 다른 body | `DUPLICATE_REQUEST` |
| 서로 다른 20개 주문 동시 전송 | display code/idempotency/order_id 중복 없음 |
| OrderItems write 중 강제 실패 | Orders `FAILED`, 일반 조회/통계에서 숨김, 복구 가능 |
| RECEIVED→PREPARING 직접 편집 | revert + AuditLog |
| polling 네트워크 실패 | 마지막 상태 유지, cart/order local state 보존 |

### quota와 성능

- 메뉴/옵션/주문 자식 행은 range batch read/write한다.
- 주문 생성 lock 안에서 외부 fetch, sleep, formatting, 전체 응답 join을 하지 않는다.
- 15초 polling은 탭 visibility와 backoff를 적용한다.
- Apps Script 실행 dashboard에서 duration, failure, 동시 실행을 행사 리허설 동안 확인한다.
- 공식 quota는 변경될 수 있으므로 행사 직전 [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)를 다시 확인한다.

## 9. 구현 결정 기록

2026-08-28 구현 확정:

- passcode 불일치는 `STAFF_PASSCODE_MISMATCH`로 응답한다.
- `STAFF_LOGIN_THROTTLED`는 `error.details.retryAfter`에 서버 기준 ISO 8601 시각을 포함한다.
- `orders/status`는 `tableId` 또는 `orderId` 중 정확히 하나를 받는다. 둘 다 있거나 둘 다
  없으면 `INVALID_REQUEST`다.
- 경과 시간 지연 임계값은 현재 운영 기준인 테이블 24/35분, 주방 24/30분, 서빙
  5/12분을 유지한다.
- `tables/list`는 레일 배지에 필요한 `stationCounts`를 함께 반환한다.
- 고객 앱과 운영 앱은 별도 Vite entry와 산출물로 분리한다. 운영 Apps Script URL은 운영
  entry에서만 참조하며 고객 entry가 내려받는 JavaScript에는 포함하지 않는다.
- 같은 Apps Script 소스에서 고객/운영의 동명 action을 안전하게 분기하도록 운영
  `?action=` 값은 §1의 transport와 동일하게 항상 `staff/` prefix를 사용한다.
- 기존 Orders A:T/A:U는 열 위치를 보존하고 U:V에 누락된 `session_id`와
  `note_audience`만 추가한다. bootstrap은 기존 prefix가 정확히 canonical일 때만 이
  suffix migration을 자동 수행하며 다른 header 차이는 중단한다.
- 기존 주문 backfill은 같은 테이블의 `PAID` 주문과 미결제 주문을 서로 다른 세션으로
  분리한다. 결제 완료분은 닫힌 이력 세션에 snapshot하고 미결제분만 열린 세션에 두어
  과거 결제 금액이 다시 청구되지 않게 한다.
- `tables/bill`은 결제 전에는 현재 주문으로 재계산하고, 결제 후에는 대표 세션에 확정된
  금액 snapshot을 반환한다. 이후 원본 주문 행이 정정되어도 확정 청구액은 바뀌지 않는다.
- 운영 화면의 `COOKING`/`READY`/`SERVED`는 프론트 계약 별칭이며 Sheet에는 각각
  `PREPARING`/`SERVING`/`COMPLETED`로 저장한다. `RECEIVED`는 그대로 저장한다.
- `orders/status`는 위 네 주문 단계만 바꾼다. `UNPAID`/`PAID`는 주문 상태 dropdown에서
  제외하며, 결제 확정은 반드시 `tables/confirm-payment`와 `expectedFinalAmount`를 거쳐
  처리한다.
- `tables/list.stationCounts`는 테이블 화면의 한 번의 poll로 네 navigation badge를 모두
  채운다. 별도의 `orders/queue` 중복 poll은 추가하지 않는다.
- 운영 주문 생성 계약에는 client request ID가 없으므로 서버가 내부 ID를 발급한다.
  네트워크 결과가 불명확한 요청의 자동 재전송은 하지 않으며, 후속 계약 개정 전까지
  고객 주문과 같은 client-side idempotent replay는 제공하지 않는다.
- Orders V에는 메모 노출 대상을, OrderItems K:L에는 항목 상태와 수정 시각을 suffix로
  추가한다. 기존 열을 이동하지 않으며 bootstrap은 canonical prefix 뒤 빈 열에만 자동
  migration한다.
- 항목 취소는 행 삭제가 아니라 `CANCELLED` 상태 변경이다. 주문 총액과 복구 payload는
  활성 항목만 합산하되 취소 항목의 가격·옵션 snapshot은 감사와 상세 표시를 위해 남긴다.
- A08 메모는 테이블의 가장 최근 활성 주문에 귀속한다. 별도 TableNotes Sheet를 만들지
  않아 기존 조회 구조를 유지하고, 노출 대상만 `note_audience`로 구분한다.

## 10. 구현 시 남은 결정

1. Netlify origin에서 Apps Script ContentService CORS가 목표 모바일 브라우저에서 안정적으로 동작하는가. 실패 시 Netlify Function proxy를 우선 검토한다.
2. 직원 호출을 Sheet row로 기록할지, 단순 현장 안내 Sheet로 끝낼지.
3. S05 주방 메모 UI가 확정될 때 `note`를 활성화할지.
4. 운영진의 상태 변경을 direct Sheet edit + trigger로 둘지, custom menu만 허용할지. 안정성은 custom menu 방식이 더 높다.

확정된 QR 형식은 `https://{netlify-domain}/t/{tableId}?token={random-token}`이며, `COMPLETED`는 결제와 무관하게 서빙까지 끝난 주문의 최종 완료를 뜻한다.
