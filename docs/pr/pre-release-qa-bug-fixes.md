# 출시 전 QA 결함 수정

## 개요

`dev` 브랜치 기준 출시 전 QA에서 확인한 P1 7건과 P2 8건을 수정했다.
주문·결제처럼 금액과 방문 상태가 바뀌는 요청에는 클라이언트가 확인한 값과
멱등 키를 함께 전달하도록 계약을 강화했고, 프론트에서는 응답 유실·새로고침에도
같은 요청을 복구하도록 보완했다.

옵션 선택, 장바구니 수량, 직원 호출, 결제 완료 내역, SSE 장애 fallback도 실제
화면 흐름에 맞게 수정했다. 운영 빌드의 API 주소 누락과 DB 장애를 놓치던 readiness
설정도 함께 강화했다.

수정 전 재현 절차와 증거는
[`docs/qa/pre-release-qa.md`](../qa/pre-release-qa.md)에 보존했다. 해당 보고서의
배포 보류 판단과 FAIL 결과는 `dev` 커밋 `4fa56f9`에서 수집한 수정 전 기준선이며,
이번 변경 이후 결과로 해석하지 않는다.

## 주요 변경 사항

### 주문 생성 무결성 및 재시도

- 고객 주문 요청에 `expectedTotalAmount`를 추가했다. 서버 재계산 금액과 다르면
  `ORDER_PRICE_CHANGED`로 거절해 확인 화면과 실제 접수 금액이 달라지지 않게 했다.
- 제출 중인 주문의 payload 서명과 `clientRequestId`를 테이블 토큰 범위로 저장한다.
  응답 유실이나 새로고침 후 같은 장바구니를 제출하면 같은 요청 ID를 재사용하고,
  성공 또는 명시적인 변경 확인 뒤에만 pending 정보를 제거한다.
- 이미 저장된 동일 요청의 replay를 영업 종료 검사보다 먼저 처리한다. 영업 종료
  직전 저장된 주문도 같은 요청으로 결과를 복구할 수 있다.
- 주문 fingerprint 생성 중 발생한 입력 검증 예외를 500으로 감싸지 않고 원래의
  4xx 오류로 반환한다.
- 잘못된 QR로 진입했을 때 저장된 이전 테이블 인증으로 복귀하지 않도록 인증 복원
  조건을 분리했다.

### 결제·주문 수정 동시성

- 결제 확정 요청에 `expectedSessionId`와 `clientRequestId`를 추가했다.
  화면에서 본 방문에만 결제를 적용하고, 응답 유실 재시도는 동일 결과로 처리한다.
- 주문 수량 변경과 품목 취소 전에 현재 billing group을 잠그고 미결제 상태를 다시
  검증한다. 결제와 수정이 겹쳐 결제 snapshot과 주문 합계가 달라지는 경합을 막는다.
- 결제 스테이션 응답에 `sessionId`를 포함하고, 행사 시간대 기준 오늘 결제 완료된
  방문도 함께 반환한다. 프론트의 완료 건수와 완료 목록이 실제 PAID 세션을 표시한다.

### 서비스 주문 멱등성

- 서비스 지급 요청에 필수 `clientRequestId`를 추가하고 요청 fingerprint를 저장한다.
  동일 요청 재전송은 기존 서비스 주문을 반환하며, 같은 ID의 다른 payload는
  `IDEMPOTENCY_CONFLICT`로 거절한다.
- 서비스 주문 생성 시 적용한 직원 할인율을 주문 row에 snapshot으로 보존한다.
  replay 응답은 현재 설정이 아니라 저장된 할인율·부담금·직원 정보를 사용한다.

### 고객·운영 화면 안정화

- 고객 주문 목록에 현재 대기 중인 `activeCall` snapshot을 포함했다. 운영에서 호출을
  확인하면 다음 polling/SSE reconciliation 때 고객 호출 상태와 로컬 저장값이 해제된다.
- SSE 재연결 backoff와 주문 polling 타이머를 분리했다. 짧은 SSE 실패가 반복되어도
  15초 fallback polling 시계가 계속 밀리지 않는다.
- 단일 선택 옵션은 다른 항목으로 변경할 수 있게 하고, 선택 상한으로 disabled된
  옵션을 품절로 표시하지 않도록 상태를 분리했다.
- 메뉴의 `maxQuantity`를 장바구니 line snapshot에 저장한다. 같은 구성의 수량 병합과
  `+` 버튼 모두 서버 상한을 넘지 않는다.
- 운영 결제와 서비스 지급 화면은 요청이 실패할 때까지 같은 `clientRequestId`를
  유지하고 성공 후에만 새 ID를 발급한다.

### 배포 안전장치

- production build는 `VITE_API_BASE_URL`이 없으면 실패한다. mock은 로컬 개발에서
  `VITE_ENABLE_MOCKS=true`를 명시한 경우에만 사용할 수 있다.
- Cloud Build에 `_FRONTEND_API_BASE_URL` substitution을 추가하고 frontend build에
  전달한다.
- readiness health group에 `db`를 포함하고 liveness는 `livenessState`로 분리했다.
  DB 연결이 끊기면 readiness와 배포 smoke check가 실패한다.

## QA 결함 대응표

| ID | 심각도 | 해결 내용 |
|---|---:|---|
| QA-001 | P1 | 운영 API URL 필수 검증 및 명시적 로컬 mock flag |
| QA-002 | P1 | pending 주문과 요청 ID 영속화·재사용 |
| QA-003 | P1 | 방문 ID·결제 요청 ID 기반 stale/replay 방지 |
| QA-004 | P1 | 주문 수정과 결제에 동일 billing group 잠금 적용 |
| QA-005 | P1 | 고객 확인 금액과 서버 재계산 금액 비교 |
| QA-006 | P1 | 잘못된 QR에서 이전 테이블 인증 fallback 차단 |
| QA-007 | P1 | 서비스 주문 요청 ID·fingerprint·replay 지원 |
| QA-008 | P2 | 고객 주문 snapshot으로 직원 호출 해결 상태 동기화 |
| QA-009 | P2 | 단일 옵션 재선택 허용 및 상한/품절 표시 분리 |
| QA-010 | P2 | 장바구니에 메뉴별 최대 수량 적용 |
| QA-011 | P2 | 오늘 결제 완료 방문을 스테이션 응답에 포함 |
| QA-012 | P2 | 잘못된 수량·옵션 요청을 비재시도 4xx로 유지 |
| QA-013 | P2 | 영업 종료 검사 전 저장 완료 주문 replay |
| QA-014 | P2 | SSE 재시도와 15초 fallback polling 타이머 분리 |
| QA-015 | P2 | readiness에 DB health 포함 |

## API 계약 변경

프론트와 백엔드를 함께 배포해야 하는 request/response 변경이다.

| API | 변경 |
|---|---|
| `POST /api/v1/customer/orders/create` | `expectedTotalAmount` 필수 추가 |
| `POST /api/v1/staff/tables/confirm-payment` | `expectedSessionId`, `clientRequestId` 필수 추가 |
| `POST /api/v1/staff/orders/service` | `clientRequestId` 필수 추가 |
| `POST /api/v1/customer/orders/list` | `activeCall` 추가 (`null` 또는 대기 호출 snapshot) |
| `POST /api/v1/staff/orders/queue` | payment row에 `sessionId` 추가, 오늘 PAID 방문 포함 |

기존 필수 필드를 보내지 않는 구버전 프론트는 주문 생성·결제 확정·서비스 지급이
실패하므로 백엔드만 먼저 배포한 상태를 오래 유지하지 않는다.

## DB 마이그레이션

Flyway `V5__payment_idempotency_and_service_snapshots.sql`이 다음 변경을 적용한다.

- `table_sessions.payment_request_id uuid` 추가
- 값이 있는 결제 요청 ID에 unique partial index 추가
- `orders.staff_discount_rate integer` 추가 및 0~100 CHECK 적용
- 기존 `SERVICE` 주문에 현재 `STAFF_DISCOUNT_RATE` 값을 backfill
- 서비스 주문 shape CHECK에 할인율 snapshot 필수 조건 추가

기존 주문·결제 데이터는 삭제하지 않는다. 운영 적용 전 DB 백업과 V4 → V5 migration
실행 시간을 확인한다.

## 검증

- [x] 프론트 `npm run test` — 1개 파일, 2개 테스트 통과
- [x] 프론트 `npm run lint` — 통과
- [x] `VITE_API_BASE_URL=https://api.example.test npm run build` — 통과
- [x] API URL이 없는 production build — 의도한 설정 오류로 실패
- [x] JDK 21 `./gradlew --no-daemon test bootJar` — 통합 테스트 15개 및 bootJar 통과
- [x] 주문 replay, 가격 변경, 서비스 replay, stale 결제, 결제 replay, 수정/결제 경합
      회귀 테스트 추가
- [x] `git diff --check`

수정 전 QA의 전체 브라우저·장애 프록시 시나리오는 변경 후 다시 전수 실행하지 않았다.
머지 전에는 최소한 주문 응답 유실 복구, 호출 확인 동기화, 결제 완료 목록, SSE 장애
fallback을 staging에서 다시 확인한다.

## 배포 및 리뷰 체크리스트

- [ ] Cloud Build의 `_FRONTEND_API_BASE_URL`을 실제 Spring API origin으로 설정
- [ ] V5 적용 전 운영 DB 백업 및 migration 성공 확인
- [ ] 백엔드와 프론트의 필수 request 필드 배포 순서 조율
- [ ] production artifact에서 mock 테이블·주문 데이터가 노출되지 않는지 확인
- [ ] DB 중지 또는 연결 실패 시 readiness가 DOWN인지 확인
- [ ] 모바일에서 옵션 변경과 장바구니 최대 수량 UX 재확인
- [ ] 응답 유실 후 새로고침해도 주문·서비스·결제가 한 번만 반영되는지 확인
- [ ] 결제 완료 목록의 날짜 경계가 `TIME_ZONE` 설정과 일치하는지 확인

## 리뷰 포인트

1. 고객 주문의 `expectedTotalAmount`가 가격 변경을 차단하면서 동일 payload replay는
   계속 허용하는지 확인한다.
2. 주문 수정, 품목 취소, 결제가 같은 table/billing group 잠금 순서를 사용하는지
   확인한다.
3. 결제·서비스 `clientRequestId`의 fingerprint 범위와 conflict 응답이 충분한지
   확인한다.
4. 결제 완료 조회가 합석의 primary session만 한 번 반환하고 행사 시간대의 날짜
   경계를 올바르게 사용하는지 확인한다.
5. pending 주문 저장값에 테이블 토큰 원문이나 결제 정보가 추가로 저장되지 않는지
   확인한다.
