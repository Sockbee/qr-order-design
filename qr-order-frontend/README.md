# QR Order Frontend

테이블 QR로 접속해 Cloud Run의 Spring Boot API에서 식당, 테이블, 메뉴와 주문 상태를 불러오는
React + TypeScript + Vite 프론트엔드입니다.

## 환경 변수

`.env.example`을 참고해 로컬 `.env.local` 또는 빌드 환경 변수에 다음 값을
설정합니다. Cloud Build에서는 `_FRONTEND_API_BASE_URL`로 전달합니다.

```text
VITE_API_BASE_URL=https://qr-order-staging-PROJECT_NUMBER.asia-northeast3.run.app
```

실제 배포 URL과 테이블 token은 Git에 커밋하지 않습니다. API 환경 변수를 변경하면
Vite bundle을 다시 빌드한 뒤 Firebase Hosting에 배포해야 합니다.
루트 `firebase.json`의 배포 대상은 `qr-order-frontend/dist`입니다.

사용 종료한 `apps-script/`, `netlify.toml`, `.netlify/`는 Git 추적과 Cloud Build
소스 업로드에서 제외합니다. 로컬에 남아 있어도 현재 앱의 빌드에는 사용하지 않습니다.
과거 Apps Script 설계 및 PR 문서는 이력 참고용이며 현재 실행 의존성이 아닙니다.

Cloud Run이 운영 도메인만 CORS 허용하는 상태에서 로컬 프론트를 실제 API에 연결하려면
`.env.development.local`에 다음처럼 설정합니다. 개발 서버가 요청을 Cloud Run으로
프록시하므로 GCP의 CORS 설정을 변경할 필요가 없고, 이 값은 production build에
포함되지 않습니다.

```text
VITE_API_BASE_URL=/__gcp_api__
API_PROXY_TARGET=https://qr-order-staging-PROJECT_NUMBER.asia-northeast3.run.app
```

## 실행

```bash
npm ci
npm run dev
```

검증:

```bash
npm run build
npm run lint
```

## 실제 데이터 흐름

최종 QR URL은 다음 형식입니다.

```text
https://caucse.shop/t/T01?token=<64자리 원본 token>
```

1. `customer/bootstrap` 한 요청에서 식당·테이블·메뉴·옵션·품절 상태를 가져옵니다.
2. 메뉴 응답은 S02, S04, 장바구니와 주문 확인 화면에서 공유합니다.
3. 고객과 운영 앱은 SSE 변경 알림을 받으면 최신 snapshot을 다시 조회합니다.
4. SSE 연결이 끊기면 고객 15초·운영진 10초 polling으로 자동 복구합니다.

API가 설정된 배포에서는 서버 응답 전 mock 식당이나 메뉴를 표시하지 않습니다. API가
설정되지 않은 로컬 UI 개발은 `VITE_ENABLE_MOCKS=true`를 명시했을 때만 `src/data`의
fallback 데이터를 사용합니다. Production build는 mock flag와 관계없이
`VITE_API_BASE_URL`이 없으면 실패합니다.

운영 앱의 `/staff/settings`에서는 메뉴·가격·옵션·매장 설정·테이블과 QR을 관리합니다.
