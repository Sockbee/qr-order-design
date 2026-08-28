# 운영 인증 연동과 번들 분리

## 개요

A09 운영 인증 화면을 실제 `staff/login` API 계약에 연결하고 고객/운영 앱을 별도 Vite
entry로 분리했습니다. 고객이 내려받는 JavaScript에는 운영 Apps Script URL이 포함되지
않습니다.

이 브랜치는 `feat/apps-script-staff-auth` 위에 기존 `feat/staff-login`을 순서대로 병합한
후 연동 변경을 추가했습니다.

## 변경 사항

- 고객 앱은 `index.html`/`src/main.tsx`/`App.tsx`, 운영 앱은
  `staff.html`/`src/staff-main.tsx`/`StaffApp.tsx`를 사용합니다.
- Netlify와 Vite dev server 모두 `/staff/*`를 `staff.html`로 rewrite합니다.
- 운영 API 공통 클라이언트가 action에 `staff/` prefix를 정규화합니다.
- `STAFF_AUTH_REQUIRED`를 재로그인 오류로 처리합니다.
- `STAFF_LOGIN_THROTTLED`의 `error.details.retryAfter`를 카운트다운 기준으로 사용하고,
  값이 없거나 잘못된 경우에만 기존 10분 fallback을 사용합니다.
- `.env.example`에는 실제 값이 아닌 고객/운영 배포 URL 자리표시자만 유지했습니다.

## Figma

- A09 — Staff Login: `113:1795`
- A09 상태 — 인증 실패/제한/만료: `114:1797`

기존 구현의 화면 구조와 스타일은 변경하지 않고 API와 배포 entry만 분리했습니다.

## 검증

- [x] `npm run lint`
- [x] `VITE_STAFF_APPS_SCRIPT_URL=https://staff-api.invalid/exec npm run build`
- [x] marker URL은 `dist/assets/staff-*.js`에만 존재하고 고객 entry/chunk에는 없음
- [x] `/staff/login`이 운영 title과 A09 접근성 구조로 직접 렌더링
- [x] 1194×834: document scroll width 1194px
- [x] 1024×768: document scroll width 1024px
- [x] 고객 `/` 390px/320px: 각 viewport와 scroll width 일치, staff root 없음
- [x] `git diff --check`

## 참고 사항

- 실제 운영 URL, staffToken, passcode는 빌드와 브라우저 검증에 사용하지 않았습니다.
- 번들 분리와 `staff/` action prefix 결정은
  `docs/qr-order/apps-script-api-design.md` §9에 기록했습니다.
- 실제 Web App 연동 smoke test는 배포 자격증명이 없어 수행하지 않았습니다.
