# Spring 서비스 지급·정산 API

## 개요

`feat/staff-service`에서 확정한 서비스 지급·정산 정책과 스태프/고객 화면
계약을 Spring Boot 백엔드에 반영했다.

스태프가 선택한 테이블에 메뉴를 무상 지급하면 손님 청구액은 0원으로 유지하고,
지급을 요청한 스태프의 부담금을 지급 시점의 값으로 동결한다. 행사 종료 후에는
스태프별 미정산 합계를 조회하고 예상 금액이 일치할 때만 정산을 확정한다.

## API

| endpoint | 역할 |
|---|---|
| `POST /api/v1/staff/members/list` | 부담 스태프 선택용 명단 조회 |
| `POST /api/v1/staff/orders/service` | 0원 서비스 주문 생성 |
| `POST /api/v1/staff/settlements/list` | 스태프별 지급 내역·부담금·정산 상태 조회 |
| `POST /api/v1/staff/settlements/confirm` | 예상 부담금 일치 검증 후 정산 확정 |
| `POST /api/v1/admin/staff-members/import` | 비공개 CSV를 운영 DB의 스태프 명단으로 import |

모든 스태프·관리 endpoint는 기존 Bearer 인증을 그대로 사용하며, 추가된 request
shape는 OpenAPI 컴포넌트에 문서화했다.

## 저장 구조

Flyway `V2__staff_service_and_settlements.sql`이 다음 구조를 추가한다.

- `staff_members`: 불변 `staff_id`, 이름, 소속, 활성 상태, 정렬 순서, 정산 snapshot
- `orders.order_kind`: `GUEST` / `SERVICE`
- `orders.service_message`: 손님 기기에 표시할 선택 메시지
- `orders.charged_staff_id`: 부담 스태프 FK
- `orders.staff_charge_amount`: 지급 시점에 동결한 부담금
- `STAFF_DISCOUNT_RATE`: 테이블 할인과 분리된 스태프 서비스 할인율

DB check constraint로 `SERVICE` 주문의 `total_amount=0`, `payment_status=WAIVED`,
부담자·부담금 필수 규칙을 보장한다. 기존 주문은 마이그레이션 후 `GUEST`로
읽힌다.

## 금액·정산 정책

부담금은 주문 총액에 할인액 버림을 한 번만 적용한다.

```text
gross_amount  = ACTIVE OrderItems line_total 합
discount      = floor(gross_amount * STAFF_DISCOUNT_RATE / 100)
charge_amount = gross_amount - discount
```

- 손님 세션 subtotal은 `orders.total_amount`를 합산해 `SERVICE` 주문을 0원으로 처리한다.
- 결제 확정은 `GUEST` 주문만 `PAID`로 바꾸고 `SERVICE` 주문의 `WAIVED`를 유지한다.
- `SERVICE` 주문의 수량·항목·메모 수정은 `SERVICE_ORDER_NOT_EDITABLE`로 거절한다.
- 오지급은 주문 취소 후 다시 지급한다. 취소 시 동결 부담금은 audit을 위해 남겨
  두지만 정산 합계와 내역에서는 제외한다.
- 정산 확정은 `expectedChargeAmount`와 서버 재계산값을 비교한다. 금액 변경과 이중
  확정은 각각 `SETTLEMENT_AMOUNT_CHANGED`, `SETTLEMENT_ALREADY_SETTLED`로 거절한다.

## 응답 노출 정책

- 고객 `orders/list`: `orderKind`, `serviceMessage`, `chargedStaffName` 포함
- 스태프 `tables/bill`: 서비스 건수, 정가 합계, 메시지, 부담자 이름 포함
- 주방·서빙 `orders/queue`: `orderKind`만 포함하고 이름, 메시지, 부담금은 필드 자체를
  내려보내지 않음
- 정산 API: 정산 주체와 근거 확인을 위해 이름·메시지·주문별 금액 포함

## 실명 명단 관리

공개 저장소의 Git history에 실명·소속을 남기지 않도록 실제 명단은 마이그레이션에
넣지 않았다.

- 추적되는 파일: `docs/examples/staff-members.example.csv`, import script, API 코드
- 추적되지 않는 파일: `.local-data/StaffMembers.csv`(기존 `.gitignore` 규칙 적용)
- import CSV: `staff_id,name,affiliation,active,sort_order`
- 동일 `staff_id`를 재import해도 정산 상태·수금 snapshot은 보존
- AuditLogs에는 import action만 남기고 CSV 본문이나 실명은 기록하지 않음

배포 후 운영 API와 로그인 token으로 다음 명령을 실행한다.

```bash
./scripts/import-staff-members.sh \
  https://api.example.com \
  "$STAFF_TOKEN" \
  .local-data/StaffMembers.csv
```

## Audit

- 서비스 지급: `SERVICE_ORDER_CREATED`
- 정산 확정: `STAFF_SETTLEMENT_CONFIRMED`
- 명단 import: `STAFF_MEMBERS_IMPORTED`

## 검증

- [x] JDK 21 `./gradlew test`
- [x] Testcontainers PostgreSQL 17에서 Flyway V1 → V2 적용
- [x] 명단 조회, 비활성 부담자 거절
- [x] 서비스 주문 0원·`WAIVED`·동결 부담금
- [x] 고객 내역 노출과 주방·서빙 비노출
- [x] 서비스 주문 수정 차단
- [x] 정산 금액 mismatch·이중 확정 거절
- [x] 취소 후 정산 합계 제외·동결 부담금 보존
- [x] 비공개 CSV import와 기존 정산 상태 보존
- [x] OpenAPI request schema·Bearer security 회귀
- [x] 통합 테스트 8개, 실패 0
- [x] `git diff --check`

## 배포 전 확인

1. Flyway V2를 운영 DB에 적용한다.
2. 스태프 명단의 이용 목적·노출 범위를 당사자에게 고지한다.
3. Git에서 제외된 `.local-data/StaffMembers.csv`를 import한다.
4. `POST /api/v1/staff/members/list`에서 인원 수·소속·정렬을 확인한다.
5. 테스트 서비스 주문을 1건 만들어 고객 내역·정산 화면을 확인한다.
