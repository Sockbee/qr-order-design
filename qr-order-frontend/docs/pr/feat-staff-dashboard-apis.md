# 운영 대시보드 API 연동

## 개요

기존 운영 화면 브랜치를 정해진 순서로 통합하고, TypeScript 인터페이스를 계약의 단일
출처로 삼아 테이블 현황·상세, 주문 상태, 스테이션 queue, 메뉴 품절, 운영 주문 생성
API를 구현했습니다.

## 변경 사항

- `feat/staff-table-detail` → `feat/staff-table-operations` → `feat/staff-stations` 순서로
  병합하고 분리된 `StaffApp` entry에 운영 route를 연결했습니다.
- `staff/tables/list`와 `staff/tables/detail`에서 세션·청구·주문 snapshot·호출을 조립합니다.
- `tables/list.stationCounts`로 테이블 화면 navigation의 주방·서빙·결제 badge도 채웁니다.
- `staff/orders/status`는 `tableId` 또는 `orderId` 중 정확히 하나를 받고 상태를 변경합니다.
- 프론트 별칭 `COOKING/READY/SERVED`를 canonical `PREPARING/SERVING/COMPLETED`로
  변환합니다.
- `staff/orders/queue`는 주방, 서빙, 결제 queue와 공통 count를 한 번에 반환합니다.
- `staff/menu/list`, `staff/menu/availability`, `staff/orders/create`를 구현했습니다.
- 결제 상태는 금액 확인 없는 상태 변경에서 제외하고 기존 입금 확인 API로만 처리합니다.

## Figma

A01~A08 및 B01~B03 화면의 기존 레이아웃과 컴포넌트를 유지했습니다. 운영 앱은 iPad
가로 화면 1194×834와 1024×768에서 실제 route를 렌더링해 확인합니다.

## 검증

- [x] 테이블 목록·상세 response mapping과 station count
- [x] table/order 주소 방식 상태 변경과 모호한 요청 거절
- [x] canonical 상태 변환과 결제 상태 우회 차단
- [x] 주방·서빙·결제 queue 및 메뉴 품절 토글
- [x] 운영 주문 생성과 세션 연결
- [x] `node --test apps-script/tests/*.test.js`
- [x] `npm run lint`
- [x] `npm run build`
- [x] 운영 주요 route 실제 렌더와 수평 overflow 확인

## 참고 사항

- 결제는 `expectedFinalAmount`가 필수인 `tables/confirm-payment`만 사용합니다. 따라서
  공용 주문 상태 dropdown의 `UNPAID/PAID` 선택지는 제거했습니다.
- 운영 상태 별칭, badge, 운영 주문 idempotency 결정은
  `docs/qr-order/apps-script-api-design.md` §9에 기록했습니다.
- 실제 운영 배포 자격증명과 URL은 저장소에 포함하지 않았습니다.
- 현재 로컬 Node 25에서는 `node --test apps-script/tests/`가 디렉터리를 모듈처럼 읽어
  실패하므로 `node --test apps-script/tests/*.test.js`로 전체 8개 파일을 실행했습니다.
- 브라우저 제어 표면은 1280×720 고정이어서 이번 변경 route는 해당 실제 viewport에서
  overflow가 없음을 확인했습니다. 1194×834와 1024×768은 A01 분리 entry 작업에서
  확인했고, 추가 화면은 고정 rail/panel 합과 `min-width: 0`, wrapping grid 기준으로도
  1024px 폭을 넘지 않습니다.
