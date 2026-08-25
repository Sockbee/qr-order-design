# 개요

Google Sheets bootstrap 이후 행사 카테고리와 메뉴를 수동으로 입력하지 않아도 되도록
Apps Script 카탈로그 초기 데이터 기능을 추가했습니다.

`seedCatalog()`를 실행하면 최신 `menu-list.md`를 기준으로 Categories 4개와 Menu
19개를 추가합니다. 동일한 ID가 이미 존재하면 운영자가 수정한 값을 유지하며, 여러 번
실행해도 중복 행이 생기지 않습니다.

## 변경 사항

### 카탈로그 초기 데이터

다음 카테고리와 메뉴를 추가합니다.

| category_id | 표시명 | 메뉴 수 |
|---|---|---:|
| `main` | 메인 | 5 |
| `side` | 사이드 | 5 |
| `alcohol` | 주류 | 5 |
| `beverage` | 음료 | 4 |
| 합계 |  | 19 |

메뉴명과 판매가는 `docs/qr-order/menu-list.md`의 최신 값과 일치합니다.

- Categories와 Menu의 ID를 기준으로 누락된 행만 추가합니다.
- 기존 `category_id`, `menu_id`가 있으면 해당 행을 덮어쓰지 않습니다.
- 모든 신규 카테고리와 메뉴는 활성 상태로 추가합니다.
- `min_quantity`는 1, `max_quantity`는 Settings의
  `DEFAULT_MAX_QUANTITY`를 사용합니다.
- sort order는 카테고리 및 카테고리 내 메뉴 순서에 따라 10 단위로 설정합니다.
- 별도 설명 원문이 없는 메뉴는 초기 `description`을 메뉴명과 동일하게 저장합니다.
- 이미지 URL, 알레르기, 원산지와 badge는 빈 값으로 두어 운영자가 추후 보완합니다.

### Spreadsheet 메뉴

Spreadsheet의 `QR 주문 관리` 메뉴에 다음 항목을 추가했습니다.

```text
카테고리/메뉴 초기 데이터 추가
```

Apps Script 함수 목록에서 `seedCatalog()`를 직접 실행할 수도 있습니다.

### 안전한 append 위치

checkbox validation이 적용된 빈 셀은 Apps Script에서 `false`로 읽힐 수 있습니다.
기존 `appendObjectsBySchema_()`가 `getLastRow() + 1`을 사용하면 빈 checkbox 행을 지나
1001행부터 데이터가 추가될 수 있었습니다.

append 위치를 실제 데이터 행의 `__rowNumber` 기준으로 계산하도록 변경했습니다.
데이터가 없으면 2행부터, 기존 데이터가 있으면 마지막 실제 데이터 바로 다음 행부터
추가합니다.

### 문서 및 버전

- Apps Script README에 seed 실행 순서와 반복 실행 정책을 추가했습니다.
- Sheet schema의 초기 category ID를 실제 seed 값과 일치시켰습니다.
- Apps Script 설계 문서의 프로젝트 구조에 `CatalogSeed.gs`를 추가했습니다.
- bootstrap 버전을 `1.1.0`으로 올렸습니다.

## 반복 실행 정책

첫 실행:

```text
추가 Categories: 4개
기존 Categories: 0개
추가 Menu: 19개
기존 Menu: 0개
```

같은 Spreadsheet에서 다시 실행하면 다음과 같이 기존 데이터를 유지합니다.

```text
추가 Categories: 0개
기존 Categories: 4개
추가 Menu: 0개
기존 Menu: 19개
```

가격 등 기존 데이터가 seed 값과 달라도 자동으로 되돌리지 않습니다. 이후 가격과 판매
상태 변경은 Spreadsheet의 운영값을 기준으로 합니다.

## 검증

- [x] 모든 Apps Script `.gs` 파일 구문 검사 통과
- [x] `appsscript.json` JSON parsing 통과
- [x] category ID 4개 및 menu ID 19개 중복 없음
- [x] 모든 메뉴가 존재하는 seed category를 참조
- [x] 모든 판매가가 0 이상의 정수
- [x] 19개 메뉴명과 판매가가 `menu-list.md`와 일치
- [x] 첫 실행 시 Categories 4개, Menu 19개 추가 확인
- [x] 두 번째 실행 시 추가 0개로 idempotency 확인
- [x] 빈 checkbox 행이 append 위치를 1001행으로 이동시키지 않는 것 확인
- [x] 실제 Google Spreadsheet 실행 성공
- [x] 프론트엔드 변경 없음

실제 Spreadsheet 실행 결과:

```text
카탈로그 초기 데이터 처리 완료
추가 Categories: 4개
기존 Categories: 0개
추가 Menu: 19개
기존 Menu: 0개
진단: 오류 0개 / 경고 2개
```

경고 2개는 카탈로그 seed와 무관한 초기 운영 설정입니다.

- `NO_TABLES`: 아직 테이블이 등록되지 않음
- `PLACEHOLDER_EVENT_ID`: Settings의 `EVENT_ID`가 기본값

## 적용 방법

1. Apps Script 프로젝트에 `CatalogSeed.gs`를 추가합니다.
2. 변경된 `Config.gs`, `Repositories.gs`, `Setup.gs`를 반영합니다.
3. Spreadsheet를 새로고침합니다.
4. `QR 주문 관리 > 카테고리/메뉴 초기 데이터 추가`를 실행합니다.
5. Categories와 Menu의 입력값을 검토합니다.
6. `runDiagnostics()`에서 오류가 0개인지 확인합니다.

## 영향 범위

- Categories와 Menu에 누락된 초기 행만 추가합니다.
- 기존 카탈로그 행과 Settings 값은 변경하지 않습니다.
- 주문, 테이블, token, QR 발급 기능은 이번 PR 범위에 포함하지 않습니다.
- 프론트엔드 코드는 변경하지 않습니다.
