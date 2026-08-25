# 개요

학생회 일일호프의 테이블별 QR 주문 시스템을 위한 Google Sheets 데이터 모델과
Apps Script bootstrap을 추가했습니다. 프론트엔드 코드는 변경하지 않았습니다.

이번 PR은 실제 API endpoint 구현 전 단계로, 운영 Spreadsheet를 재현 가능하게
생성하고 행사 전 데이터 오류를 진단할 수 있는 기반을 마련합니다.

## 변경 사항

### 설계 문서

- Netlify 프론트엔드와 Apps Script Web App 사이의 전체 구조 및 보안 경계를 정의했습니다.
- 10개 canonical Sheet의 정확한 header, 타입, 관계, 상태 모델을 문서화했습니다.
- QR URL은 `https://{netlify-domain}/t/{tableId}?token={random-token}` 형식을 사용합니다.
- `COMPLETED`는 결제 완료와 분리된 “서빙까지 완료” 상태로 정의했습니다.
- 행사 메뉴를 `메인 / 사이드 / 주류 / 음료`와 판매가 기준으로 정리했습니다.

### Spreadsheet bootstrap

`bootstrapSpreadsheet()` 실행 시 다음 10개 Sheet를 생성하거나 안전하게 복구합니다.

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

- 총 102개 canonical header를 고정 순서로 설정합니다.
- 기존 데이터가 있는 Sheet의 header가 다르면 덮어쓰지 않고 중단합니다.
- text, integer, money, datetime 표시 형식을 열 단위로 설정합니다.
- boolean 열에는 checkbox, enum 열에는 입력 거부형 dropdown을 적용합니다.
- Settings의 필수 초기값 10개는 누락된 key만 추가합니다.
- ID, token hash, 주문 snapshot, audit log, display counter 등 관리 열을 보호합니다.
- bootstrap이 만든 보호 범위만 description prefix로 찾아 재설정하므로 사용자가 만든
  별도 보호 범위는 유지합니다.

### 무결성 진단

`runDiagnostics()`는 Spreadsheet를 수정하지 않고 다음 항목을 검사합니다.

- 필수 Sheet와 정확한 header
- dropdown, checkbox, 보호 범위
- Script Properties 및 Settings 타입
- PK, 단일·복합 unique, FK
- 메뉴 수량과 옵션 선택 규칙
- 주문 총액과 item/option snapshot 계산
- 주문 상태와 public status mapping
- 취소·결제 timestamp 및 불완전한 write 상태

오류와 경고는 실행 로그에 JSON으로 기록하며 Spreadsheet UI에는 요약을 표시합니다.

### 민감정보 보호

다음 로컬 파일은 `.gitignore`에 추가했습니다.

- `.clasp.json`, `.clasprc.json`
- Script Properties 덤프
- OAuth client secret, service account, 기타 credentials JSON

실제 `SPREADSHEET_ID`와 `TOKEN_PEPPER`는 저장소가 아니라 Apps Script의 Script
Properties에 저장합니다.

## 검증

- [x] 모든 `.gs` 파일 Node 구문 검사 통과
- [x] `appsscript.json` JSON parsing 통과
- [x] schema invariant 검사 통과: 10 Sheets, 10 Settings, 102 headers
- [x] 민감정보 패턴 및 실제 Google Spreadsheet/Script URL 미검출
- [x] 프론트엔드 변경 없음

실제 Google Spreadsheet 실행은 프로젝트 연결과 권한 승인이 필요한 단계라 로컬에서
수행하지 않았습니다.

## 적용 방법

1. Google Spreadsheet에서 Apps Script 프로젝트를 생성합니다.
2. `apps-script` 디렉터리의 `.gs` 파일과 manifest를 프로젝트에 추가합니다.
3. Script Properties에 `SPREADSHEET_ID`, 32바이트 이상의 `TOKEN_PEPPER`를 설정합니다.
4. `bootstrapSpreadsheet()`를 실행하고 권한을 승인합니다.
5. Spreadsheet를 새로고침한 뒤 `QR 주문 관리 > 무결성 진단`을 실행합니다.

초기 catalog와 table 데이터가 없을 때 표시되는 `NO_TABLES`, `NO_MENU`,
`PLACEHOLDER_EVENT_ID`는 예상된 경고입니다.
