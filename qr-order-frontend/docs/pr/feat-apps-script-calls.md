# Apps Script 고객 직원 호출 API

## 개요

고객 앱에 이미 연결된 `calls/create`, `calls/cancel` 요청이 실제 Apps Script
배포에서 `NOT_FOUND`로 실패하던 문제를 해결합니다. API 설계 문서 §4.7과 §4.8,
Google Sheets schema §14의 호출 생명주기와 재전송 규칙을 구현했습니다.

## 변경 사항

- `Calls` canonical Sheet, 호출 사유/상태 enum, validation, 보호 범위를 bootstrap에 추가했습니다.
- `CALL_MIN_INTERVAL_SECONDS=60` 기본 Settings를 추가했습니다.
- `calls/create`는 table token, table 활성 상태, 행사 오픈 상태, 호출 간격을
  검증하고 `clientRequestId`로 멱등 재전송을 처리합니다.
- 같은 `clientRequestId`에 다른 table/사유를 담은 요청은 `DUPLICATE_REQUEST`로
  거절합니다.
- `calls/cancel`은 자신의 table 호출만 찾고 `PENDING` 상태에서만 취소합니다.
  이미 확인/취소된 호출은 `CALL_ALREADY_RESOLVED`로 거절합니다.
- 생성, 빈도 제한, 취소 사건을 `AuditLogs`에 민감 정보 없이 기록합니다.
- Calls FK, UUID, 상태별 timestamp 무결성 진단을 추가했습니다.

## Figma

이 변경은 기존 고객 화면이 호출하는 백엔드 API만 추가하며, 화면 구성과
스타일은 변경하지 않았습니다.

## 검증

- [x] `node --test apps-script/tests/*.test.js` — 4개 테스트 파일 통과
- [x] 생성, 멱등 replay, 충돌 replay, 호출 간격 제한 검증
- [x] 비활성 table과 종료된 행사의 신규 호출 거절 검증
- [x] `PENDING` 취소와 해결된 호출의 재취소 거절 검증
- [x] 호출 ID/table 권한 범위, 사유 allowlist, payload allowlist 검증
- [x] 원본 table token 미저장 검증
- [x] 전체 `.gs` 파일 결합 후 `node --check` 통과
- [x] `git diff --check` 통과

## 참고 사항

- 요청서의 `node --test apps-script/tests/` 명령은 현재 Node.js 25에서 디렉터리를
  모듈로 해석해 `MODULE_NOT_FOUND`로 실패했습니다. 동일 전체 범위를
  `apps-script/tests/*.test.js`로 명시해 검증했습니다.
- Apps Script Script Properties와 실제 Web App URL이 로컬 작업 환경에 제공되지
  않아 실배포 smoke test는 수행하지 않았습니다.
- 프론트엔드 소스는 변경하지 않았으며, 이미 `?action=calls/create`/
  `?action=calls/cancel` 규약을 사용하므로 추가 매핑은 필요하지 않습니다.
