# 예약 주문 안정화 구현 및 운영 검증 기록

작성: 2026-09-16 KST

대상 이슈: [CAP-01~03](reservation-order-capacity-issues.md)

기준 코드: `dev`, `aef949c` (PR #60 병합본)

상태: 코드 구현·로컬 검증 완료, 운영 반영·운영 용량 판정 대기

## 적용 범위와 배포 조건

현재 브랜치는 운영 리비전 `qr-order-staging-00010-kzm`보다 이전 기능을 포함한다. 따라서 이 작업 트리를 운영에 직접 배포하지 않았다. 최신 배포 기준 브랜치에 변경을 통합하고 그 코드에서 다시 회귀 시험한 후 배포해야 한다. 작업 중 운영 DB는 연결 예산 확인을 위해 읽기만 수행했다. 추가 운영 주문·부하 시험, Cloud Run 설정 변경, Git push는 수행하지 않았다.

기존 운영 시험에서 발생한 50명 주문 5건·조회 4건의 실패가 운영에서 해소됐다는 뜻은 아니다. 아래 수치는 PostgreSQL 17 Testcontainers와 개발 머신의 애플리케이션을 사용한 결과다. Cloud Run 1 vCPU 환경과 직접 비교할 수 없다.

## CAP-01: 주문 처리의 잠금 범위

주문 경로에서 공통 **배타 잠금**을 공통 **공유 잠금 + 테이블/청구 그룹 배타 잠금**으로 변경했다.

| 작업 | 잠금 순서 | 효과 |
|---|---|---|
| 고객·직원 주문 생성, 서비스 주문 | 공통 공유 → 테이블 ID → 현재 청구 그룹 → 필요한 행 → 마지막 이벤트 | 독립된 테이블 주문은 함께 실행된다. 같은 테이블 첫 방문과 중복 요청, 합석 그룹·이동 전 QR은 순서가 보장된다. |
| 결제·초기화·이동·합석·분리·입장·조리/주문 변경·관리자 변경 | 공통 배타 → 요청 ID/행 → 마지막 이벤트 | 주문과 구조 변경의 경합을 막는다. 그룹 구성은 공유 잠금을 기다린 뒤 다시 조회한다. |
| 직원 서비스 정산 | 공통 배타 → 직원 행 | 서비스 생성과 정산을 함께 보호한다. 서비스 생성은 공유 잠금을 직원 행보다 먼저 얻는다. |
| 청구·직원 테이블 목록·주문 큐 조회 | 읽기 전용 REPEATABLE READ | 공통 배타 잠금 없이 같은 연결과 일관된 스냅샷을 사용한다. |

공통 잠금 ID `7319021`은 이전 리비전과의 호환을 위해 유지한다. 공유 잠금을 배타 잠금으로 승격하는 경로를 피하고, 다중 테이블 구조 변경은 배타 잠금 아래에서 기존 정렬된 행 잠금을 사용한다. 직원 변경 작업까지 모두 그룹 단위 병렬화한 것은 아니다. 이는 데이터 일관성을 우선한 이번 구현의 명시적인 범위다. 직원 변경 빈도가 높을 때의 추가 최적화 여부는 운영 측정 후 결정한다.

테이블 ID와 청구 그룹은 각각 별도 advisory lock namespace `7319022`, `7319023`을 쓴다. 해시 충돌은 불필요한 직렬화만 만들며 보호를 없애지 않는다. QR 인증·테이블 활성 여부도 잠금 대기 후 다시 검증한다.

### 직원 화면 조회에서 발견한 추가 병목

이벤트에 따른 직원 큐 재조회를 부하 시험에 추가하자, 트랜잭션 밖의 JDBC 행 변환 코드가 내부 조회용 연결을 추가로 빌려 풀 10개를 점유하는 문제가 재현됐다. `queues`와 `listTables`를 읽기 전용 트랜잭션으로 묶어 중첩 조회가 같은 연결을 사용하게 했다. 번호 할당용 별도 연결 문제와 다른 경로다.

직원 SSE는 모든 이벤트 ID를 즉시 기록하면서 화면 갱신 알림만 고정 100ms 창으로 합친다. 연속 이벤트가 와도 타이머를 계속 뒤로 미루지 않는다. 직원용 유휴 중지 정책을 추가한 것은 아니다. 큐의 주문별 조회 자체는 남아 있어, 장시간 주문 누적 조건의 SQL 횟수/지연은 후속 검증 대상이다.

### 주문번호

`NEXT_DISPLAY_NUMBER` 할당을 **별도 연결에서 한 번의 UPDATE … RETURNING으로 자동 커밋**한다. 주문 본문의 INSERT, 항목 저장, 감사 로그, 이벤트까지 번호 행 잠금을 유지하지 않는다. 기존 리비전도 같은 행을 잠그므로 동일 DB에서 번호 할당의 유일성을 유지할 수 있다.

- 표시 형식과 기존 번호 진행 상태를 그대로 사용한다. 스키마 마이그레이션은 없다.
- 주문이 이후 롤백되면 할당된 번호는 비어 있을 수 있다. 번호는 되돌리지 않는다.
- sequence 전환은 이번에 하지 않았다. 이전 리비전과 번호 할당기가 달라지는 배포 위험을 피하면서 잠금 유지 구간을 줄였다.
- 요청 풀과 별개인 연결을 사용하므로, 모든 요청이 기존 연결을 점유한 상태에서 두 번째 요청 풀 연결을 기다리는 교착을 만들지 않는다.

### 이벤트 순서와 오류

독립 주문의 커밋 순서가 바뀌어도 숫자 SSE 커서가 이벤트를 놓치지 않도록, 이벤트 ID 생성 직전의 짧은 공통 잠금 `7319024`를 유지한다. 주문 응답 조회를 가능한 한 그 이전에 수행한다. 이벤트 INSERT와 `pg_notify`는 주문 트랜잭션에 남아 있어 롤백된 이벤트는 발행되지 않는다. 이 마지막 직렬화 구간도 고부하에서는 추가 측정 대상이다.

연결 확보/자원 장애·잠금 획득 실패는 `503 SERVER_BUSY`, `retryable=true`, `Retry-After: 1`로 응답한다. 무제한 또는 자동 주문 재전송은 추가하지 않았다. 사용자 재시도는 기존 `clientRequestId`를 유지하는 경로를 사용한다. 종료된 SSE에는 JSON 오류를 쓰지 않는다.

### 연결 예산과 측정

운영 DB를 2026-09-16 22시대 KST에 읽기 점검한 결과:

| 항목 | 값 |
|---|---:|
| PostgreSQL `max_connections` | 100 |
| superuser 예약 / 일반 reserved | 3 / 0 |
| 당시 연결 | qr_order 3, cloudsqladmin 2, DB명 없는 백그라운드 6 |
| 일반 요청 풀 / 확보 제한 | 인스턴스당 10 / 3초, 변경 없음 |
| 인프라 풀 | 인스턴스당 최대 2: LISTEN 1 + 짧은 번호 할당 1 |
| 인스턴스 2 / 3 / 5개 시 앱 최대 연결 | 24 / 36 / 60 |

계획 예산은 앱 60 + 관측된 시스템 연결 8 + 예약 3 + 운영 여유 20 = 91개다. 관측값은 한 시점의 스냅샷이며 항상 8개라는 보장은 없다. 배포 중 겹치는 리비전·일시적인 인스턴스 초과도 포함해 실제 연결 수를 확인해야 한다. 인스턴스 최대나 풀 크기를 더 늘리기 전에 예산을 다시 계산한다.

추가 지표:

- `qr.visit.lock.wait` (`scope=exclusive`, `table-group`): 잠금 획득 대기.
- `qr.visit.lock.hold`: 첫 보호 잠금 획득 후 트랜잭션 완료까지.
- `qr.order.number.allocation`: 번호 연결 대기 및 할당.
- Hikari 기본 지표: 요청 풀 및 `qr-infrastructure` 풀의 active/idle/pending/acquire/timeout.
- `qr.sse.connections` (`audience=customer`, `staff`): 서버에 남아 있는 SSE 등록 수.

SQL별 실행 횟수·운영 잠금 대기 전후 비교는 아직 수집하지 않았다. 지표가 생긴 것과 실제 운영 관측 완료를 구분한다.

## CAP-02: 예약 전 준비

Terraform 변수 `service_min_instances=1`, `service_max_instances=5`, `revision_max_instances=5`, `request_concurrency=100`을 추가했다. `min ≤ service max ≤ revision max`를 검증하고, 인스턴스 상한은 현재 연결 예산의 5개까지 허용한다. Cloud Build의 기존 이미지 갱신은 이 설정을 별도로 덮어쓰지 않는다.

[사전 준비 도구](../../scripts/reservation-capacity.py)는 서비스 최소 인스턴스만 바꾼다. 같은 호스트의 중복 실행은 파일 잠금으로, 원격 동시 변경은 Cloud Run etag로 방어한다. 변경 전에 이전 값을 저장하고, 복원 시 서비스 UID·리비전·템플릿·트래픽과 현재 최소값을 확인한다. 중간 실패 시 상태 파일을 보존한다. 자동 일정은 생성하지 않았다.

예시 절차: 20시 예약이면 19:50 적용, 19:55 확인. **2개·3개 중 검증된 수량만 사용한다. 현재 최종 수량은 미확정이다.**

```bash
python3 scripts/reservation-capacity.py prepare \
  --project qr-order-507407 --service qr-order-staging \
  --instances 2 --state .local-data/reservation-capacity-state.json

python3 scripts/reservation-capacity.py status \
  --project qr-order-507407 --service qr-order-staging \
  --state .local-data/reservation-capacity-state.json

python3 scripts/reservation-capacity.py restore \
  --project qr-order-507407 --service qr-order-staging \
  --state .local-data/reservation-capacity-state.json
```

`prepare` 성공은 설정 반영만 뜻한다. `status`의 Ready뿐 아니라 **적용 후 시각의 최신 연속 2개 인스턴스 샘플이 목표 이상**인지 확인한다. 샘플이 현재보다 3분 이상 오래되거나 누락되면 준비 완료로 판단하지 않는다. Monitoring 반영 지연을 고려해 30초 간격으로 최대 5분 확인하고, 이후에도 확인되지 않으면 운영 담당자가 로그·DB 연결을 점검한 뒤 `restore`한다. 단일 readiness URL 성공은 모든 인스턴스의 정상 상태를 증명하지 않는다. 새 리비전의 시작 로그, readiness, Hikari 대기·오류도 함께 확인한다.

수정된 코드로 동일 사양 격리 환경에서 최소 1/2/3개를 비교해야 한다. 100개 고객 + 직원 4개에서 40/50명 주문과 이벤트 후 재조회를 반복하고, 오류 0·제안 지연 기준을 충족하는 수량을 택한다. 피크 종료 시 위 `restore`를 실행해 성공 출력을 확인한다. 중간에 다른 배포가 있었다면 도구가 복원을 거부하므로 상태 파일의 `previous`를 확인하고 새 리비전에 맞춰 수동 조정한다. 실패한 복원을 완료로 처리하지 않는다.

이 도구는 영구 설정을 바꾸는 Terraform 변경과 별개인 일시 운영 조정이다. 피크 동안 Terraform apply/배포를 겹쳐 실행하지 않으며, 종료 후 최소값을 복원해 선언값과 일치시킨다. 상태 파일을 복원 전에 삭제하지 않는다. 실제 적용·복원 API 변경은 이번 작업에서 실행하지 않았다.

비용 비교는 `(준비 인스턴스 수 - 평소 1개) × 추가 유지 시간`을 기준으로 CPU·메모리 과금과 함께 기록한다. 실제 SSE 요청이 있으면 단순 유휴 인스턴스 비용과 다를 수 있어 현재 가격표와 Billing으로 산정한다. 현재 2/3개 운영 시험을 하지 않았으므로 비용 절감/증가 금액도 확정하지 않았다.

근거: [서비스 최소 인스턴스](https://docs.cloud.google.com/run/docs/configuring/min-instances), [서비스 갱신](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update), [Cloud Run 지표](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z).

## CAP-03: 고객 유휴 상태

- `/menu`, `/menu/:itemId`에서 조작 없이 5분 지나면 주문 SSE·정기 조회·재접속 예약을 함께 멈춘다.
- `VITE_CUSTOMER_IDLE_MS`로 빌드 시 설정할 수 있다. 유효 범위 1초~24시간, 잘못된 값은 5분을 사용한다.
- pointer/touch, 키 입력, 휠 조작만 시간을 연장한다. 렌더링·heartbeat·자동 조회는 시간을 연장하지 않는다.
- 카트·확인·주문 현황·완료·이벤트 주문 화면은 유휴 중지 대상이 아니다. 직원 화면에는 고객용 유휴 정책을 적용하지 않는다.
- 활동 재개/화면 복귀 시 메뉴 갱신과 주문 조회를 재개한다. 주문 조회/SSE 재개에는 0~500ms 분산을 적용하며, 실제 주문 전송은 지연하지 않는다.
- 카트·테이블 인증·방문 정보는 그대로 유지한다. 메뉴 로딩 상태와 기존 서버 가격 검증을 사용한다.
- 숨김에서는 기존 중지 정책을 유지한다. 닫힌 SSE는 완료/오류/heartbeat 실패에서 서버 등록을 제거한다.

로컬 SSE 정리 시험은 heartbeat를 100ms로 줄여 실행했다. 운영의 20초 heartbeat와 프록시 조건에서 정리까지 걸리는 시간은 추가 확인이 필요하다.

## 로컬 검증

실행 명령:

```bash
JAVA_HOME=/Users/samso/Library/Java/JavaVirtualMachines/temurin-21.0.10/Contents/Home \
  ./qr-order-backend/gradlew -p qr-order-backend test --console=plain
npm --prefix qr-order-frontend run test
npm --prefix qr-order-frontend run lint
VITE_API_BASE_URL=https://qr-order-staging-etxejs37pq-du.a.run.app \
  npm --prefix qr-order-frontend run build
python3 -m unittest discover -s scripts/tests -v
terraform -chdir=infra validate
```

상세 수치는 아래 실행 결과 표에 기록한다. 부하 시험은 전용 Testcontainers DB만 사용한다. 인원 100명에는 주문자 40/50명이 포함된다. 50명 주문+조회는 순간 HTTP 요청 100개이며, SSE 104개와 별도로 센다. 직원 4개 SSE는 실제 이벤트를 읽어 카운터의 테이블 목록과 나머지 3개 화면의 주문 큐를 다시 조회한다(100ms 단위 합침).

- 같은 테이블 50건, 동일 요청 ID 12개 동시 재전송, 서로 다른 내용의 ID 재사용 충돌.
- 주문과 합석/분리/이동/결제/초기화/조리 변경의 동시 실행 및 이동 전 QR 정합성.
- 트랜잭션 롤백 시 주문·이벤트 미생성, 번호 누락 후 다음 번호의 유일성.
- 요청 풀을 실제로 고갈시킨 뒤 503 응답과 동일 요청 복구.
- 커밋된 주문 이벤트 420개가 직원 4개 스트림 각각에 420개씩, 커서 순서대로 전달되는지 검증.
- 고객 SSE 100→60 감소, 직원 4개 유지, 종료 후 두 집단 모두 등록 0.
- 프런트엔드 실제 hook 렌더링으로 유휴/숨김/복귀/페이지 이동/오프라인 재접속 중지와 타이머 정리.

### 최종 실행 결과

백엔드 35개, 프런트엔드 30개, 운영 도구 5개 테스트가 모두 통과했다. 프런트엔드 lint·실제 API 주소를 지정한 production build, Terraform validate도 통과했다. 아래는 최종 1회 실행의 값이며 개발 머신 성능의 예시다.

| 시나리오 | 성공 | p95 | 최대 |
|---|---:|---:|---:|
| 50 tables round 1 | 50/50 | 211ms | 215ms |
| idempotent replay round 1 | 50/50 | 38ms | 40ms |
| 50 tables round 2 | 50/50 | 197ms | 204ms |
| idempotent replay round 2 | 50/50 | 51ms | 55ms |
| 50 tables round 3 | 50/50 | 196ms | 198ms |
| idempotent replay round 3 | 50/50 | 49ms | 49ms |
| 50 orders on one table | 50/50 | 379ms | 407ms |
| 50 orders plus 50 reads | 50/50 | 205ms | 208ms |
| concurrent reads | 50/50 | 224ms | 226ms |
| 40 reservation orders round 1 | 40/40 | 132ms | 135ms |
| 40 reservation orders round 2 | 40/40 | 268ms | 286ms |
| 40 reservation orders round 3 | 40/40 | 312ms | 322ms |
| synthetic +100ms transaction delay | 50/50 | 797ms | 889ms |

CAPACITY SSE customer connections 100 -> 60 after closing 40 streams; staff=4.0 event-triggered refreshes=139

## 남은 운영 완료 조건

1. 최신 배포 기준 브랜치에 통합 후 동일 회귀 테스트.
2. 운영과 같은 사양의 격리 환경에서 최소 1/2/3개 비교 및 10분 지속 부하 시험.
3. SQL 횟수·잠금/연결 대기·인스턴스 수·SSE 지표의 개선 전후 비교와 준비 수량·비용 확정.
4. 한정된 운영 재검증의 시간·최대 주문 수·중단 기준·정리 범위를 정해 실행하고 리비전 기록.
5. 운영 heartbeat·프록시 조건의 유휴 연결 감소와 실제 준비/복원 확인.

위 항목 전에는 “운영 50명 동시 주문 보장” 또는 CAP 전체 완료로 판정하지 않는다.
