# QR Order Frontend

테이블 QR로 접속해 Apps Script Web App에서 식당, 테이블, 메뉴와 주문 상태를 불러오는
React + TypeScript + Vite 프론트엔드입니다.

## 환경 변수

`.env.example`을 참고해 로컬 `.env.local` 또는 Netlify 환경 변수에 다음 값을
설정합니다.

```text
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

실제 배포 URL과 테이블 token은 Git에 커밋하지 않습니다. Netlify 환경 변수를 변경하면
Vite bundle을 다시 만들도록 새 배포를 실행해야 합니다.

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

1. `resolve-table`에서 식당명, 안내 문구와 테이블을 확인합니다.
2. `menu`에서 활성 카테고리와 메뉴·옵션·품절 상태를 가져옵니다.
3. 메뉴 응답은 S02, S04, 장바구니와 주문 확인 화면에서 공유합니다.
4. `orders/list`를 기본 15초마다 조회해 주문 현황을 갱신합니다.

API가 설정된 배포에서는 서버 응답 전 mock 식당이나 메뉴를 표시하지 않습니다. API가
설정되지 않은 로컬 UI 개발 환경에서만 `src/data`의 fallback 데이터를 사용합니다.

현재 이 단계에서 식당·메뉴 조회와 주문 상태 조회는 실제 API에 연결되어 있습니다.
장바구니의 주문 확정 동작을 `orders/create`로 보내는 프론트 연동은 별도 작업입니다.
