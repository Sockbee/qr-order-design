# Apps Script 운영 인증

## 개요

별도 운영 Web App 배포에서 사용할 `staff/login`과 모든 운영 endpoint 공통 인증
미들웨어를 구현했습니다. 운영 토큰은 request body로 전달하며 HMAC 서명, 만료 시각,
`STAFF_TOKEN_EPOCH`를 검증합니다.

## 변경 사항

- `카운터`, `주방`, `서빙`, `결제`만 `deviceLabel`로 허용합니다.
- `SHA-256(TOKEN_PEPPER + ':' + passcode)`를 `STAFF_PASSCODE_HASH`와 상수 시간으로
  비교하며 passcode는 응답, 로그, AuditLog에 저장하지 않습니다.
- 토큰은 `base64url(payload).base64url(HMAC_SHA256(signature))` 형식이고 기본 14시간
  동안 유효합니다.
- token epoch는 CacheService에 60초 캐싱하고 Settings 값과 다르면
  `STAFF_TOKEN_REVOKED`로 거절합니다.
- 기기별/전역 로그인 실패를 10분 동안 집계하며 5회 실패 시
  `STAFF_LOGIN_THROTTLED`와 `error.details.retryAfter`를 반환합니다.
- 운영 action은 고객 endpoint와 충돌하지 않도록 모두 `staff/` prefix로 분기합니다.
- 필수 Settings와 Script Properties 진단을 추가했습니다.

## Figma

이 브랜치는 인증 백엔드만 구현하며 화면 레이아웃은 변경하지 않습니다. A09 연동과 고객
번들 분리는 후속 프론트엔드 브랜치에서 검증합니다.

## 검증

- [x] staff token 발급, 서명 변조 거부, 만료, epoch 무효화
- [x] epoch 60초 캐시 재사용
- [x] deviceLabel allowlist와 payload allowlist
- [x] passcode 불일치와 5회 실패 throttle/retryAfter
- [x] 운영 endpoint 공통 staffToken 요구
- [x] passcode/hash/token secret AuditLog 미저장
- [x] `node --test apps-script/tests/*.test.js`
- [x] 전체 `.gs` 결합 `node --check`
- [x] `git diff --check`

## 참고 사항

- 확정된 오류 코드, retryAfter, 운영 action prefix와 번들 분리 방식은
  `docs/qr-order/apps-script-api-design.md` §9에 기록했습니다.
- 실제 Script Properties와 배포 URL은 저장소에 포함하지 않았습니다.
- 로컬 환경에는 실제 운영 배포 자격증명이 없어 Web App smoke test는 수행하지 않았습니다.
