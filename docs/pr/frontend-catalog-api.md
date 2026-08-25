# 프론트 실제 식당·메뉴 API 연동

## 개요

Netlify 프론트가 mock 식당과 메뉴 대신 Apps Script의 `resolve-table`, `menu` 응답을
표시하도록 연결했습니다. 실제 API가 설정된 배포에서는 서버 응답이 없을 때 mock 값을
대신 노출하지 않습니다.

## 변경 사항

### Storefront API adapter

- QR의 `tableId`, `tableToken`으로 두 API를 병렬 호출
- Apps Script 응답을 기존 `TableSession`, `MenuCategory`, `MenuItemDetail` 타입으로 변환
- `basePrice`, `available`, option selection 규칙을 기존 화면 모델에 매핑
- API URL과 원본 token을 로그에 기록하지 않음

### 실제 식당과 테이블

- S01 식당명을 Settings의 `STORE_NAME`으로 표시
- Settings의 `NOTICE`와 Tables의 table ID를 화면에 반영
- API 응답 전에는 shimmer 없는 skeleton 표시
- 일시적 오류는 마지막 mock 값 대신 오류와 재시도 버튼 표시
- 잘못된 QR처럼 재시도 불가능한 오류는 재시도 버튼을 표시하지 않음

### 실제 메뉴와 옵션

- Categories 순서와 label/heading을 S02 탭에 반영
- Menu 이름, 설명, 가격, 이미지와 품절 상태 반영
- S04에 수량 최소/최대, 필수 option, selection 제한과 품절 option 반영
- 품절된 default option은 자동 선택하지 않음
- 장바구니에 메뉴·option 이름 snapshot을 저장해 새로고침 후에도 현재 선택 표시
- 장바구니와 S06 주문 확인도 현재 API 카탈로그를 사용

### 세션 격리

- live 장바구니 저장 key를 기존 UI mock key와 분리
- 다른 테이블 QR로 전환할 때 이전 테이블 상태를 새 key에 쓰지 않도록 persistence 수정
- API가 없는 로컬 UI 개발에서만 기존 mock 카탈로그 유지

## 검증

- [x] TypeScript production build 통과
- [x] ESLint 통과
- [x] Apps Script table/catalog regression test 통과
- [x] Apps Script create/query regression test 통과
- [x] `git diff --check` 통과
- [ ] Netlify에서 실제 QR 진입 후 `STORE_NAME` 확인
- [ ] 카테고리 4개와 메뉴 19개 표시 확인
- [ ] Spreadsheet 가격/품절 변경 후 새로고침 반영 확인
- [ ] 잘못된 token에서 mock 식당·메뉴가 노출되지 않는지 확인

검증 명령:

```bash
(cd qr-order-frontend && npm run build && npm run lint)
node apps-script/tests/table-auth.test.js
node apps-script/tests/order-create.test.js
node apps-script/tests/order-query.test.js
git diff --check
```

## 배포 방법

1. Netlify에 `VITE_APPS_SCRIPT_URL`이 현재 Apps Script `/exec` URL인지 확인합니다.
2. `main` merge 후 Netlify production deploy를 실행합니다.
3. 실제 `https://caucse.shop/t/T01?token=...` QR URL로 접속합니다.
4. S01의 식당명·테이블·안내와 S02의 카테고리·가격을 확인합니다.
5. Menu Sheet의 가격 또는 `available`을 바꾸고 새로고침해 반영 여부를 확인합니다.

## 영향 범위와 제외 사항

- 기존 Figma 화면 구조와 시각 hierarchy는 유지했습니다.
- API loading/error를 위해 기존 화면 안에 최소한의 skeleton과 재시도 상태를 추가했습니다.
- Apps Script backend와 Sheet schema는 변경하지 않습니다.
- 프론트 `orders/create` 호출과 서버 응답 기반 S07 전환은 이번 PR에 포함하지 않습니다.
