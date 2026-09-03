# 로컬 프론트 Cloud Run API 연결

## 개요

로컬에서 Vite 개발 서버를 실행할 때 mock 데이터 대신 GCP Cloud Run에 배포된
Spring Boot API를 사용할 수 있도록 개발 전용 프록시를 추가했습니다.

기존 프론트는 `VITE_API_BASE_URL`이 없으면 `src/data`의 mock 데이터로 동작하고,
Cloud Run URL을 직접 지정하면 브라우저의 Origin이 `http://localhost:5173`이 되어
운영 도메인만 허용하는 백엔드 CORS 정책에 차단됐습니다. 이번 변경은 백엔드나 GCP의
CORS 허용 목록을 수정하지 않고 Vite 개발 서버가 API 요청을 중계하도록 구성합니다.

## 변경 사항

### Vite 개발 프록시

- `vite.config.ts`에서 `API_PROXY_TARGET`을 읽어 값이 있을 때만 개발 프록시를
  활성화합니다.
- 프론트가 `/__gcp_api__/api/v1/...`로 요청하면 Vite가 `/__gcp_api__` 접두사를
  제거한 뒤 Cloud Run으로 전달합니다.
- 브라우저와 Vite 사이의 요청은 same-origin이므로 브라우저 CORS 검사가 발생하지
  않습니다.
- Vite에서 Cloud Run으로 전달하는 server-to-server 요청에서는 `Origin` 헤더를
  제거해 운영 도메인 전용 CORS 정책에 의해 요청이 거절되지 않도록 했습니다.
- 기존 React, Tailwind, staff history fallback 플러그인은 그대로 유지합니다.

요청 흐름은 다음과 같습니다.

```text
Browser
  -> http://localhost:5173/__gcp_api__/api/v1/...
  -> Vite development proxy
  -> https://<cloud-run-service>.run.app/api/v1/...
```

고객/운영 API뿐 아니라 동일한 `VITE_API_BASE_URL`을 사용하는 SSE 연결도 같은
프록시를 통과합니다.

### 환경 변수 분리

로컬 개발자는 Git에서 제외되는 `.env.development.local`에 다음 값을 설정합니다.

```env
VITE_API_BASE_URL=/__gcp_api__
API_PROXY_TARGET=https://<cloud-run-service>.run.app
```

- `VITE_API_BASE_URL`은 브라우저 번들에서 사용하는 로컬 프록시 경로입니다.
- `API_PROXY_TARGET`은 Vite 개발 서버만 사용하는 실제 Cloud Run origin입니다.
  `VITE_` 접두사가 없으므로 브라우저 환경 변수로 노출되지 않습니다.
- `.env.development.local`은 development mode에서만 로드되므로 production build에
  로컬 프록시 경로가 포함되지 않습니다.
- 기존 Apps Script용 `VITE_APPS_SCRIPT_URL`, `VITE_STAFF_APPS_SCRIPT_URL`이 담긴
  `.env.local`은 현재 Spring Boot API 흐름에서 사용하지 않으므로 삭제할 수 있습니다.

`.env.example`과 `README.md`에도 실제 배포 주소를 커밋하지 않고 설정할 수 있도록
placeholder 기반 예시와 실행 방법을 추가했습니다.

## 실행 및 확인 방법

1. `qr-order-frontend/.env.development.local`을 생성합니다.
2. `API_PROXY_TARGET`을 현재 Cloud Run 서비스 URL로 교체합니다.
3. 개발 서버를 재시작합니다.

```bash
cd qr-order-frontend
npm run dev
```

4. 유효한 테이블 ID와 token을 포함한 URL로 접속합니다.

```text
http://localhost:5173/t/T01?token=<table-token>
```

5. 브라우저 Network 패널에서 `/__gcp_api__/api/v1/customer/...` 요청이 성공하고,
   mock 식당/메뉴가 아닌 서버 데이터가 표시되는지 확인합니다.

## 검증

- [x] `npm run build` 통과
- [x] `npm run lint` 통과
- [x] `git diff --check` 통과
- [x] 로컬 Vite 프록시를 통한 Cloud Run `/actuator/health` 요청 `200 OK`
- [x] Cloud Run health 상태 `UP` 확인

## 영향 범위와 제외 사항

- Vite 개발 서버에만 프록시가 추가되며 Netlify production 요청 경로는 변경하지
  않습니다.
- 백엔드 `ALLOWED_ORIGINS`와 Terraform 인프라 설정은 변경하지 않습니다.
- Cloud Run URL과 테이블 token은 Git에 커밋하지 않습니다.
- `API_PROXY_TARGET`이 없으면 프록시는 생성되지 않으며 기존 mock 기반 로컬 개발
  흐름을 계속 사용할 수 있습니다.
