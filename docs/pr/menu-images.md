# 메뉴 이미지 배포와 표시 개선

투명 배경 메뉴 일러스트 13개를 기존 메뉴에 연결했습니다. 가로로 넓은 음식과 세로로 긴 음료 그림을
`object-cover` 영역에 넣으면 일부가 잘리는 문제를 해결하고, Cloud Storage에서 앱과 독립적으로 배포합니다.

작업 브랜치는 `feat/menu-images`입니다.

## 변경 사항

- `MenuImage`: `object-contain`, 공통 배경과 여백, 오류·누락 시 식기 아이콘, URL 변경 시 오류 상태 초기화.
- 메뉴 목록·상세·장바구니·이벤트 메뉴에서 공통 컴포넌트 사용. 상세는 eager, 나머지는 lazy loading.
- PNG 13개를 원본 크기·알파 채널을 보존한 WebP로 변환: 4,477,275 → 579,246 bytes.
- `assets/menu/manifest.json`과 내용 해시 파일명으로 메뉴별 매핑 및 버전 관리.
- Terraform에 이미지 전용 서울 Standard 버킷, 공개 읽기 IAM, 캐시 메타데이터를 가진 객체 13개 추가.
- Cloud SQL의 기존 `image_url`에 연결하는 운영 스크립트 추가. 변경 전 URL 백업, transaction,
  감사 로그, `menu.updated`/`pg_notify`, 재실행 시 무변경 확인을 포함합니다.
- [메뉴 이미지 운영 가이드](../qr-order/menu-images.md) 및 [아키텍처 문서](../qr-order/spring-gcp-migration.md) 갱신.

## Figma

기존 화면의 배치·크기·토큰을 유지했습니다. 이미지 소스는 `메뉴판(최종)`의 PNG 13개입니다.
Figma 파일은 수정하지 않았으며 새 프레임 비교는 수행하지 않았습니다.

## 검증

아래 결과는 2026-09-16 구현·배포 시 실행한 검증 기준입니다.

- `npm run lint`, API URL을 지정한 `npm run build`: 통과.
- `npm run test`: 5개 파일, 18개 테스트 통과.
- `terraform validate`: 통과. 최초 제한 plan: 16개 생성, 변경·삭제 0개.
- 적용 후 이미지 리소스 대상으로 다시 plan: 변경 없음.
- 이미지 13개 익명 GET, `image/webp`, SHA-256 검증 통과.
- 기존 메뉴 13개 모두 빈 이미지 URL임을 확인 후 연결. 재실행 dry run에서 변경 0개 확인.
- 실제 Chrome에서 로컬 및 배포된 `caucse.shop`의 목록·상세·장바구니·이벤트 화면을
  390px/320px로 확인. 공개 GCS 이미지 로딩, contain, 상세 eager, 수평 overflow 없음, page error 없음.
- 브라우저 시각 검증은 테스트용 테이블·카탈로그 API 응답을 주입하고 실제 배포 이미지를 로드했습니다.
  실제 주문·직원 호출 API를 실행하지 않았습니다. 운영 메뉴 연결은 별도 실제 DB 검증으로 확인했습니다.
- 이미지 로딩 실패 시 fallback 표시 및 같은 마운트에서 URL 변경 후 정상 이미지 복구 확인.
- `caucse.shop`의 JS/CSS 파일명이 로컬 production build와 일치함을 확인.

## 참고 사항

- 투명 일러스트 전체가 보이도록 `object-cover`를 `object-contain`으로 바꾼 것은 의도한 디자인 변경입니다.
  기존 `bg-surface` 토큰과 화면별 이미지 영역 크기를 사용했습니다.
- 첨부 이미지가 없는 나머지 메뉴에는 기본 아이콘이 표시됩니다. 가격·카테고리·판매 상태는 바꾸지 않았습니다.
- `qr-order-507407`의 현재 서비스 API는 이름이 `staging`인 Cloud Run입니다. 해당 DB와
  `qr-order-507407-staging-menu-assets` 버킷을 연결했습니다.
- Terraform의 기존 서버 image 입력과 실제 배포 상태가 달라 이미지 관련 리소스만 대상으로 적용했습니다.
  Cloud Run은 `backend:d035f8d`를 유지했습니다. 전체 Terraform 상태 동기화는 이번 범위에 포함하지 않습니다.
- Firebase Hosting 배포 및 실제 메뉴 13개의 URL 연결을 2026-09-16 완료했습니다.
