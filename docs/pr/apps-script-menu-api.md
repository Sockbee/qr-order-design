# 개요

테이블 QR 인증 이후 프론트엔드가 Google Sheets의 최신 카탈로그를 조회할 수 있도록
Apps Script Web App의 `POST /menu` API를 구현했습니다.

기존 `resolve-table`과 같은 table ID/token 인증을 매 요청마다 수행하며, 활성 카테고리와
그 카테고리에 속한 메뉴·옵션을 프론트엔드 API 계약 형태로 반환합니다. 품절 항목은
숨기지 않고 `available=false`로 전달해 고객 화면에서 품절 상태를 표시할 수 있습니다.

프론트엔드 코드는 변경하지 않았습니다.

## 변경 사항

### 메뉴 조회 endpoint

다음 endpoint와 query fallback을 추가했습니다.

```text
POST {WEB_APP_URL}/exec/menu
POST {WEB_APP_URL}/exec?action=menu
```

요청 body는 `resolve-table`과 동일합니다.

```json
{
  "apiVersion": "v1",
  "tableId": "T01",
  "tableToken": "<64자리 원본 token>"
}
```

요청 처리 순서는 다음과 같습니다.

1. table ID와 원본 token 형식 검사
2. `Tables.token_hash` constant-time 검증
3. 테이블 활성 상태 확인
4. Settings의 `EVENT_OPEN` 확인
5. Categories, Menu, MenuOptionGroups, MenuOptions batch read
6. 활성 카탈로그 필터링과 응답 조립

인증 실패 및 행사 종료 오류는 기존 공통 JSON envelope를 그대로 사용합니다.

### 카탈로그 응답 규칙

- `active=true`인 Categories만 반환합니다.
- 활성 카테고리에 속한 Menu만 반환합니다.
- Menu는 `available=false`여도 품절 UI 표시를 위해 반환합니다.
- `active=true`인 MenuOptionGroups만 반환합니다.
- MenuOptions는 `available=false`여도 반환합니다.
- 카테고리, 메뉴, 옵션은 `sort_order` 오름차순으로 정렬합니다.
- option group은 필수 그룹을 먼저 배치하고 같은 우선순위에서는 `sort_order`를 따릅니다.
- 동일한 sort order에서는 ID를 사용해 응답 순서를 결정적으로 유지합니다.
- `allergens`, `badge_tags`의 `|` 구분 문자열은 배열로 변환합니다.
- 빈 `image_url`, `origin`은 JSON `null`로 반환합니다.
- Sheet의 `SINGLE/MULTIPLE`은 API의 `single/multiple`로 변환합니다.
- 잘못된 integer 또는 selection type은 임의 보정하지 않고 내부 오류로 fail closed합니다.
- 응답의 `generatedAt`은 ISO 8601 timestamp입니다.

메뉴 응답은 cache하지 않습니다. 이후 주문 생성 API는 이 응답의 가격을 신뢰하지 않고
주문 시점의 Sheet 값을 다시 검증해야 합니다.

### 문서

Apps Script README에 `menu` endpoint, query fallback, 품절·비활성 항목 처리 정책을
추가했습니다.

## 검증

- [x] 모든 Apps Script `.gs` 파일 Node 구문 검사 통과
- [x] `POST /menu` 성공 envelope 확인
- [x] 실제 catalog seed 기준 Categories 4개 반환 확인
- [x] 실제 catalog seed 기준 Menu 19개 반환 확인
- [x] 메뉴명과 판매가 변환 확인
- [x] `sort_order` 기반 카테고리·메뉴·옵션 정렬 확인
- [x] 품절 메뉴와 품절 옵션이 응답에 포함되는지 확인
- [x] 비활성 category와 option group 제외 확인
- [x] 알레르기와 badge의 pipe-delimited 배열 변환 확인
- [x] 기본 선택 option ID와 selection type 변환 확인
- [x] `EVENT_OPEN=FALSE`의 `EVENT_CLOSED` 응답 확인
- [x] `git diff --check` 통과
- [x] 프론트엔드 변경 없음
- [ ] 실제 Apps Script 프로젝트에 변경 파일 반영
- [ ] 실제 Web App 배포 URL에서 `/menu` smoke test

로컬 테스트 명령:

```bash
node apps-script/tests/table-auth.test.js
for file in apps-script/*.gs; do node --check < "$file" || exit 1; done
git diff --check
```

## 적용 및 수동 확인 방법

1. Apps Script 프로젝트의 `Code.gs`, `TableCatalogService.gs`를 반영합니다.
2. 새 버전으로 Web App deployment를 업데이트합니다.
3. 테스트용 테이블 QR의 table ID와 원본 token을 준비합니다.
4. 성공 응답을 확인할 때만 Settings의 `EVENT_OPEN`을 잠시 `TRUE`로 변경합니다.
5. `POST /exec/menu`에 `Content-Type: text/plain;charset=utf-8`로 JSON을 전송합니다.
6. Categories 4개와 Menu 19개가 반환되는지 확인합니다.
7. 테스트 후 `EVENT_OPEN`을 다시 `FALSE`로 변경합니다.
8. `runDiagnostics()`에서 오류가 0개인지 확인합니다.

이번 변경에는 Sheet schema나 Settings key 추가가 없으므로
`bootstrapSpreadsheet()`를 다시 실행할 필요가 없습니다.

## 영향 범위

- Categories, Menu, MenuOptionGroups, MenuOptions를 읽기만 합니다.
- Tables와 Settings는 인증 및 행사 운영 상태 확인을 위해 읽기만 합니다.
- 메뉴 조회 중 Sheet 데이터를 수정하거나 AuditLogs를 추가하지 않습니다.
- 주문 생성, 주문 조회, 주문 상태 변경 API는 이번 PR 범위에 포함하지 않습니다.
- Netlify 프론트엔드의 API 연동과 화면 route는 변경하지 않습니다.

## 브랜치 의존성

현재 브랜치는 `codex/feat/apps-script-table-auth` 위에 생성된 stacked branch입니다.
table-auth PR이 아직 `main`에 병합되지 않았다면 다음 중 하나로 진행합니다.

1. table-auth PR을 먼저 병합한 뒤 이 PR을 `main` 대상으로 생성합니다.
2. stacked PR로 먼저 검토할 경우 base를 `codex/feat/apps-script-table-auth`로 지정합니다.

이 PR의 핵심 변경은 `resolve-table`에서 제공한 인증 helper와 공통 HTTP envelope를
전제로 합니다.
