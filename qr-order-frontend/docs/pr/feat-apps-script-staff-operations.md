# Apps Script 운영 호출·테이블 정산

## 개요

운영 A01/A02/A04/A05/A06/A07/B03에 필요한 직원 호출 확인과 테이블 세션 기반 청구,
할인, 이동, 합석, 분리, 결제 확정 API를 구현했습니다. 기존 주문 데이터는 bootstrap 시
안전하게 TableSessions로 이관합니다.

## 변경 사항

- `staff/calls/list`는 미확인 호출을 table별로 묶고 첫 호출 순서로 반환합니다.
- `staff/calls/acknowledge`는 같은 table의 모든 미확인 호출을 동일 시각에 확인 처리합니다.
- `TableSessions` Sheet와 Orders U열 `session_id`를 추가했습니다.
- 결제 완료 기존 주문과 미결제 기존 주문을 별도 세션으로 backfill해 재청구를 방지합니다.
- `staff/tables/bill`, `discount`, `move`, `merge`, `split`, `confirm-payment`를 구현했습니다.
- 결제 전 청구액은 현재 주문으로 계산하고, 결제 후에는 확정 snapshot을 반환합니다.
- 결제 확정 시 그룹의 모든 세션을 닫고 모든 Orders 결제 상태를 mirror합니다.
- session FK, 열린 테이블 중복, 합석 chain, 결제 snapshot 진단을 추가했습니다.

## Figma

이 브랜치는 운영 백엔드만 구현하며 화면 레이아웃은 변경하지 않습니다. 기존 운영 화면의
호출 확인, 할인, 이동, 합석, 분리, 입금 확인 동작을 위한 계약을 제공합니다.

## 검증

- [x] 호출 그룹 조회, 중복 사유 제거, 일괄 확인과 동시 클릭 무해성
- [x] 기존 Orders U열 suffix migration과 결제/미결제 분리 backfill
- [x] 청구 합산, 할인 버림, 합석·분리·이동 제약
- [x] 확인 금액 변경 감지와 결제 후 snapshot 불변성
- [x] 결제 후 모든 세션·Orders mirror 및 재확정 거절
- [x] `node --test apps-script/tests/*.test.js`
- [x] 전체 `.gs` 결합 `node --check`
- [x] `git diff --check`

## 참고 사항

- 확정한 migration과 결제 snapshot 결정은
  `docs/qr-order/apps-script-api-design.md` §9와 schema 문서에 기록했습니다.
- 실제 운영 Spreadsheet와 배포 자격증명이 없어 배포 Web App smoke test는 수행하지
  않았습니다.
