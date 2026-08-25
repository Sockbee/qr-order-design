# 개요

Google Sheets bootstrap 직후 `runDiagnostics()`가 비어 있는 checkbox 행을 실제
데이터로 오인해 35,964개의 `MISSING_REQUIRED_VALUE` 오류를 보고하던 문제를
수정했습니다.

Sheet, header, Settings, validation과 보호 범위 생성은 정상적으로 완료된 상태였지만,
잘못된 진단 결과와 과도한 실행 로그 때문에 bootstrap 성공 여부를 판단하기
어려웠습니다.

## 원인

bootstrap은 boolean 열 전체에 checkbox validation을 적용합니다. Google Sheets에서
아직 사용하지 않은 checkbox 셀은 Apps Script `getValues()` 결과에서 `false`로 읽힐
수 있습니다.

기존 `readSheetTable_()`는 모든 셀이 `''`, `null`, `undefined`인 행만 빈 행으로
판단했습니다. 따라서 checkbox의 `false` 하나만 존재하는 행도 데이터 행에 포함됐고,
나머지 필수 열이 모두 비었다는 오류가 발생했습니다.

오류 35,964개는 checkbox가 있는 5개 Sheet의 초기 999개 데이터 행에서 정확히
발생한 합계입니다.

| Sheet | 빈 행마다 누락으로 판정된 필수 열 | 오류 수 |
|---|---:|---:|
| Tables | 7 | 6,993 |
| Categories | 5 | 4,995 |
| Menu | 9 | 8,991 |
| MenuOptionGroups | 8 | 7,992 |
| MenuOptions | 7 | 6,993 |
| 합계 |  | 35,964 |

## 변경 사항

### 빈 checkbox 행 제외

- `readSheetTable_()`가 Sheet schema의 checkbox 열 위치를 확인합니다.
- checkbox 열의 `false`와 일반 빈 셀로만 구성된 행은 빈 행으로 제외합니다.
- checkbox 외의 열에 값이 있거나 checkbox가 `true`인 불완전 행은 계속 데이터로
  취급하므로 필수값 진단이 유지됩니다.

### 진단 로그 제한

- 오류와 경고 상세 항목은 각각 최대 100개까지만 report와 실행 로그에 포함합니다.
- `summary.errorCount`, `summary.warningCount`에는 제한 전 전체 개수를 기록합니다.
- `truncated`에는 로그에서 생략된 오류·경고 개수를 기록합니다.
- Spreadsheet 알림은 배열 길이가 아닌 전체 진단 개수를 표시합니다.

### 버전

- bootstrap 버전을 `1.0.0`에서 `1.0.1`로 올렸습니다.

## 검증

- [x] 모든 Apps Script `.gs` 파일 구문 검사 통과
- [x] 빈 행 및 unchecked checkbox 행 제외 확인
- [x] 일반 열에 값이 있는 불완전 행은 제외되지 않는 것 확인
- [x] checkbox가 `true`인 행은 제외되지 않는 것 확인
- [x] 999개의 자동 생성 checkbox 행이 0개의 데이터 행으로 처리되는 것 확인
- [x] 오류 35,964개 입력 시 상세 100개, 생략 35,864개, 전체 35,964개로 집계 확인
- [x] 실제 Spreadsheet에서 bootstrap 재실행 확인

실제 재실행 결과:

```text
QR 주문 bootstrap 완료
생성된 Sheet: 없음
추가된 Settings: 없음
진단: 오류 0개 / 경고 3개
```

초기 데이터가 없을 때의 경고 3개는 예상된 결과입니다.

- `NO_TABLES`
- `NO_MENU`
- `PLACEHOLDER_EVENT_ID`

## 영향 범위

- Apps Script의 Spreadsheet 행 읽기와 진단 출력만 변경합니다.
- 기존 Sheet와 Settings 데이터를 변경하거나 삭제하지 않습니다.
- 주문 schema, header, validation 및 보호 범위는 변경하지 않습니다.
- 프론트엔드 변경은 없습니다.
