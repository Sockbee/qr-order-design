# Google Apps Script API 설계

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

개념적으로는 `GET /menu`, `POST /orders`, `GET /orders/:id`지만 Apps Script adapter에서는 위처럼 표현한다. 모든 POST는 다음 조건을 지킨다.

- `Content-Type: text/plain;charset=utf-8`: JSON 문자열을 보내되 불필요한 CORS preflight를 만들지 않는다.
- custom header를 사용하지 않는다. Apps Script event object는 일반 서버처럼 임의 request header를 다루기 어렵다.
- browser는 redirect를 따르는 기본 `redirect: "follow"`를 사용한다. ContentService 응답이 일회성 `script.googleusercontent.com` URL로 redirect되는 것은 [공식 동작](https://developers.google.com/apps-script/guides/content)이다.
- 실제 배포 URL에 대한 cross-origin fetch가 허용되는지는 구현 1순위 smoke test다. 실패하면 same-origin proxy 또는 HTMLService 방식으로 전환한다.

## 2. Apps Script 프로젝트 구조

Apps Script V8의 `.gs` 파일은 실행 시 하나의 전역 namespace로 합쳐지고 ESM import/export를 사용하지 않는다. IDE에서 폴더 계층도 실질적인 module 경계가 아니므로 다음처럼 9개 파일 정도로만 나눈다.

```text
appsscript.json
Code.gs              # doGet/doPost, path dispatch
Config.gs            # Sheet 이름, enum, limits
Http.gs              # envelope, ApiError, parse/serialize
Repositories.gs      # header 기반 batch read/write/update
TableCatalogService.gs # table 인증, Settings, menu 조립
OrderService.gs      # 주문 생성/조회/idempotency/snapshot
Validation.gs        # 주문/옵션/상태 전이 검증
AdminTriggers.gs     # onOpen, 설치형 edit trigger, 운영진 상태 변경 guard
Setup.gs             # Sheet/header/validation/bootstrap/diagnostics
Diagnostics.gs       # runDiagnostics, FK/금액/snapshot 무결성 검사
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
  "tableToken": "raw-random-token-from-qr"
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

검증 순서: 형식 → Tables에 ID 존재 → token hash constant-time 비교 → table active → `EVENT_OPEN`. 존재하지 않는 table과 token mismatch를 외부에서 구분시키면 table ID enumeration에 도움이 될 수 있지만, Figma/UX 복구 문구가 다르므로 계약상 코드는 구분한다. 고객 UI는 둘 다 “유효하지 않은 QR”로 표현해도 된다.

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
  "tableToken": "raw-random-token-from-qr",
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

## 5. 오류 코드

| code | 고객 메시지 | retryable | UI 공개 | 운영 로그 |
|---|---|---:|---:|---:|
| `INVALID_REQUEST` | 요청 정보를 확인해 주세요. | N | Y | Y |
| `INVALID_TABLE` | 유효하지 않은 테이블 QR입니다. | N | Y | Y |
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
  if (!tableId || !tableToken || String(tableToken).length < 20) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
  const table = readSheet_(SHEET.TABLES).rows.find(row => row.table_id === tableId);
  if (!table) throw new ApiError('INVALID_TABLE', '유효하지 않은 테이블 QR입니다.', false);

  const pepper = PropertiesService.getScriptProperties().getProperty('TOKEN_PEPPER');
  if (!pepper) throw new Error('Missing TOKEN_PEPPER Script Property');
  const actualHash = sha256Hex_(pepper + ':' + tableToken);
  if (!constantTimeEquals_(actualHash, table.token_hash)) {
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

## 9. 구현 시 남은 결정

1. Netlify origin에서 Apps Script ContentService CORS가 목표 모바일 브라우저에서 안정적으로 동작하는가. 실패 시 Netlify Function proxy를 우선 검토한다.
2. 직원 호출을 Sheet row로 기록할지, 단순 현장 안내 Sheet로 끝낼지.
3. S05 주방 메모 UI가 확정될 때 `note`를 활성화할지.
4. 운영진의 상태 변경을 direct Sheet edit + trigger로 둘지, custom menu만 허용할지. 안정성은 custom menu 방식이 더 높다.

확정된 QR 형식은 `https://{netlify-domain}/t/{tableId}?token={random-token}`이며, `COMPLETED`는 결제와 무관하게 서빙까지 끝난 주문의 최종 완료를 뜻한다.
