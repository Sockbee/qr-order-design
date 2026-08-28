# 운영 주문 수정·취소 연동

## 개요

A08 주문 수정 화면의 수량 변경, 항목 취소, 메모 저장과 테이블 전체 주문 취소를 실제
Apps Script API에 연결했습니다. 취소 이력과 가격 snapshot은 삭제하지 않고 보존합니다.

## 변경 사항

- `staff/orders/update`에 `quantity`, `cancel-item`, `note` 작업을 구현했습니다.
- 수량 변경 시 항목 금액, 활성 항목 기준 주문 총액, 복구 payload를 같은 Script Lock
  안에서 갱신합니다.
- 항목 취소는 `OrderItems.status=CANCELLED`로 남기고 마지막 항목이면 부모 주문도
  취소합니다.
- `staff/orders/cancel`은 현재 billing group의 모든 미결제 주문과 항목을 취소합니다.
- 메모는 A08의 테이블 단위 UX에 맞춰 가장 최근 활성 주문에 귀속하고
  `GENERAL/KITCHEN/SERVING` 노출 대상을 저장합니다.
- 기존 Orders/OrderItems 열 위치를 보존하는 suffix migration과 legacy backfill을
  추가했습니다.
- 수정·취소 hook, 항목 취소 확인 dialog, 전체 취소 진행 상태를 연결했습니다.

결정 근거와 request 계약은 `docs/qr-order/apps-script-api-design.md` §4.18~§4.19 및 §9,
열 정의는 `docs/qr-order/google-sheets-schema.md`에 기록했습니다.

## Figma

A08의 기존 420px 편집 panel과 narrow confirm dialog를 유지했습니다. 항목 취소는 해당
메뉴명·수량·금액과 결제 금액 제외 결과를 확인한 뒤 실행되며, 전체 취소는 기존 A08
경고 문구와 금액 요약을 사용합니다.

## 검증

- [x] 수량 변경과 주문 총액/write payload 원자적 갱신
- [x] 항목 취소 이력, 마지막 항목 부모 주문 취소
- [x] 최신 활성 주문 메모 귀속과 audience 저장
- [x] 전체 주문 취소와 결제 완료 세션 변경 차단
- [x] legacy suffix migration 및 활성 항목 기준 진단
- [x] `node --test apps-script/tests/*.test.js`
- [x] `npm run lint`
- [x] `npm run build`
- [x] 고객 bundle의 운영 URL/token/action marker 부재 확인
- [x] A08 편집·항목 취소·메모·전체 취소 route 실제 렌더와 1280×720 수평 overflow 확인
- [ ] 실제 운영 Apps Script 배포 URL smoke test

## 참고 사항

- 취소 항목은 통계·청구 합계에서 제외하지만 행과 가격·옵션 snapshot은 보존합니다.
- 실제 Web App 자격증명과 배포 URL이 저장소에 없어 로컬 계약 테스트까지만 수행합니다.
- Node 25에서는 test directory 직접 지정 대신 glob(`apps-script/tests/*.test.js`)으로
  전체 9개 파일을 실행합니다.
