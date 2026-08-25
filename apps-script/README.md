# QR Order Apps Script bootstrap

Google Spreadsheet의 canonical 10개 Sheet를 생성하고 schema, Settings, validation,
보호 범위와 무결성 진단을 설정하는 Apps Script V8 프로젝트다.

## 포함 파일

- `Config.gs`: 10개 Sheet의 정확한 header, enum, 초기 Settings, 보호 범위
- `Repositories.gs`: header 기반 Spreadsheet read/write helper
- `Setup.gs`: `bootstrapSpreadsheet()`, formatting, validation, protection
- `CatalogSeed.gs`: 카테고리 4개와 메뉴 19개의 idempotent 초기 데이터
- `Diagnostics.gs`: `runDiagnostics()`와 FK/금액/snapshot 무결성 검사
- `appsscript.json`: Asia/Seoul, V8, 향후 anonymous web app 설정

## 최초 실행

1. Spreadsheet에서 `확장 프로그램 > Apps Script`를 연다.
2. 이 디렉터리의 `.gs` 파일을 같은 이름으로 프로젝트에 추가한다.
3. 프로젝트 설정의 Script Properties에 다음을 저장한다.
   - `SPREADSHEET_ID`: 대상 Spreadsheet URL의 `/d/`와 `/edit` 사이 값
   - `TOKEN_PEPPER`: `openssl rand -hex 32` 등으로 만든 32바이트 이상 난수
4. 함수 목록에서 `bootstrapSpreadsheet`를 선택해 실행하고 권한을 승인한다.
5. Spreadsheet를 새로고침하면 `QR 주문 관리` 메뉴가 표시된다.
6. `QR 주문 관리 > 카테고리/메뉴 초기 데이터 추가`를 실행한다.
7. `QR 주문 관리 > 무결성 진단`을 실행한다.

초기 데이터가 아직 없으면 `NO_TABLES`, `NO_MENU`, `PLACEHOLDER_EVENT_ID` 경고는
정상이다. 오류가 0개이면 `ok: true`다.

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
Settings
AuditLogs
```

기준 문서: `../docs/qr-order/google-sheets-schema.md`
