# 개요

운영 기기 인증 화면 **A09 — Staff Login**과 그 상태(인증 실패 / 시도 제한 / 인증 중 /
만료 후 재로그인)를 구현하고, 모든 staff 라우트 앞에 인증 가드를 붙였다.

`feat/staff-table-home` 위에 쌓은 브랜치다.

# 변경 사항

## 라우트

| 경로 | 동작 |
|---|---|
| `/staff/login` | `StaffLoginPage`. 세션이 있으면 `/staff/tables`로 redirect |
| `/staff/tables` | `RequireStaffAuth`로 감쌌다. 세션이 없으면 `/staff/login`으로 redirect |

`VITE_STAFF_APPS_SCRIPT_URL`이 없으면 가드는 통과시킨다 — 배포 없이 폴백 UI를
띄우는 개발 경로를 막지 않기 위해서다.

`StaffTableHomeRoute`는 `unauthorized`를 받으면 세션을 버리고 `/staff/login`으로
보낸다. 거절된 토큰은 그 화면에서 복구할 방법이 없다.

## 새 컴포넌트

| 컴포넌트 | Figma |
|---|---|
| `StationPicker` | `Stations` (113:1800) |
| `PasscodeField` | `PasscodeField` (113:1810) |

`StaffInlineAlert`에 `tone` prop(`danger` / `info`)을 추가했다. 만료는 실패가 아니라
14시간 뒤의 정상 상태라 파란 톤을 쓴다(114:1828).
`OperationalButton`에 `block`을 추가했다(A09 제출 버튼이 full width).

## 데이터

- `src/api/staff/auth.ts` — `staff/login`(§4.9). 운영 endpoint 중 유일하게
  `staffToken`을 요구하지 않으므로 `callStaffApi`에 `anonymous` 옵션을 추가했다.
- `src/api/staff/client.ts` — 토큰 문자열 대신 `StaffSession`
  (`staffToken` / `deviceLabel` / `expiresAt`)을 저장한다. `readStaffSession`은
  만료된 세션을 읽는 즉시 버리고, `hasExpiredStaffSession`으로 "로그인한 적 없음"과
  "만료됨"을 구분한다.
- `src/hooks/useStaffAuth.ts` — 로그인, 로그아웃, 만료 타이머, 오류 메시지 매핑.

## 토큰

`--radius-sheet: 16px` 추가 (로그인 카드 113:1796).

# Figma

| 프레임 | 노드 |
|---|---|
| A09 — Staff Login | `113:1795` |
| A09 상태 — 인증 실패 / 제한 / 만료 | `114:1797` |

# 검증

- `npm run lint` / `npm run build` 통과.
- 1194×834, 1024×768 양쪽 가로 스크롤 없음.
- 상호작용 확인: 스테이션 선택 시 2px 선택 테두리 + weak 배경, passcode 입력 시
  제출 버튼 활성화, `보기`/`숨기기` 토글 동작.
- 접근성: 스테이션은 `role="radiogroup"` + `role="radio"` + `aria-checked`,
  passcode 입력은 `aria-label`과 실패 시 `aria-invalid`.

# 참고 사항

## 오류 코드를 그대로 보여주지 않는다

`114:1838`이 "고객에게는 노출되지 않는 화면이므로 오류 코드를 그대로 보여주지 않고
다음 행동만 말한다"고 명시한다. 그래서 `describe()`가 코드를 화면 문구로 매핑하고,
알 수 없는 코드는 passcode 불일치와 같은 문구로 처리한다 — 운영자가 할 수 있는
다음 행동이 어느 쪽이든 동일하기 때문이다.

## `STAFF_PASSCODE_MISMATCH`는 문서에 없는 코드다

`docs/qr-order/apps-script-api-design.md` §5에 passcode 불일치 코드가 명시되어
있지 않다. 우선 이 이름으로 매핑해 두었고, default 분기가 같은 문구를 쓰므로 서버가
어떤 코드를 주든 화면은 올바르게 동작한다. 실제 코드가 정해지면 이름만 맞추면 된다.

## 판단한 것

| 항목 | 선택 | 근거 |
|---|---|---|
| 시도 제한 카운트다운 | 클라이언트에서 10분 (`THROTTLE_MINUTES`) | Figma가 `10분 후 다시 시도`를 그리지만 남은 시간의 출처는 없다. 서버가 `retryAfter`를 주면 그 값으로 바꾸는 게 맞다 |
| 실패 후 passcode | 지운다 | 스테이션 선택은 유지하라고 Figma가 명시(114:1799). passcode는 반대로 남길 이유가 없다 |
| 만료 감지 | 클라이언트에서 `expiresAt` 비교 | 죽은 토큰을 굳이 서버까지 보내지 않는다. 서버 판정(`STAFF_TOKEN_EXPIRED`)도 그대로 처리한다 |
| 마스킹 기본값 | 마스킹 + `보기` 토글 | Figma가 `••••` 와 `보기`를 함께 그린다. 태블릿 키보드로 12자 이상 문구를 치므로 확인 수단이 없는 쪽이 더 위험하다 |

## 그 외

- passcode는 state에만 두고 전송 즉시 비운다. 저장·로그·오류 문구 어디에도 남기지
  않는다(§4.9).
- `#root`의 480px 컬럼 탈출 선택자를 `.staff-home`에서 `[data-staff-app]`로
  일반화했다. 남은 staff 화면들이 같은 규칙을 쓴다.
- 스테이션 프리셋 4개는 `STAFF_STATIONS`로 `src/api/staff/client.ts`에 두었다.
  서버가 `INVALID_DEVICE_LABEL`로 강제하는 값이라 API 계층이 소유하는 게 맞다.
