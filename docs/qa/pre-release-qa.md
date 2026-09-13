# 실 배포 전 기능 QA / 결함 보고서

**배포 판단: 보류.** 확인된 P1 7건이 주문 중복, 결제 금액 불일치, 잘못된 테이블 인증 재사용 및 production mock 실행에 영향을 준다. 기존 자동 테스트와 빌드 통과를 출시 승인으로 해석하면 안 된다.

실행 검증일: 2026-09-13 KST. 보고서 작성 완료일: 2026-09-14 KST. 로컬 실행·브라우저 검증은 약 23:24–23:56에 수행했다. 제품 소스는 수정하지 않았다. 재현 스크립트와 이 보고서, 증거만 `docs/qa/`에 추가했다. 실제 결제, 외부 운영 데이터 변경, 배포는 수행하지 않았다.

## 1. 코드 버전·범위·환경

| 항목 | 확인 결과 |
|---|---|
| 브랜치 / 커밋 | `dev` / `4fa56f92bb0b3ba00a38cd97a311d9c447d63277` — 시작과 종료 동일 |
| 작업 시작 상태 | 최초 `git status --short` 출력 없음. 사용자 미커밋 변경 없음 |
| 보존 확인 | 종료 시 기존 tracked 파일 diff 없음. 추가 항목은 `docs/qa/`뿐 |
| AGENTS | 저장소 내부 및 프로젝트 상위 경로에서 적용되는 `AGENTS.md` 없음 |
| 배포 대상 | React 19 / TypeScript 6 / Vite 8.2.2, Spring Boot 4.1.1 / Java 21, PostgreSQL |
| legacy 범위 | `apps-script` 제외. `spring-gcp-migration.md`, backend README, 현행 API 클라이언트 및 Cloud Build가 Spring 전환을 명시. API 함수에 남은 AppsScript 이름은 Spring 호출 alias |
| 호스트 | macOS 26.6.2 (25G83), arm64; Node 25.9.0, npm 11.12.1 |
| Java | 기본 Java 26 대신 설치된 Temurin 21.0.10 사용 |
| DB | Docker Server 29.3.1; 별도 `qr-order-qa-20260913`, PostgreSQL 17.11 (`postgres:17-alpine`); `127.0.0.1:55432/qr_order_qa` |
| 기존 백엔드 테스트 | Testcontainers의 별도 PostgreSQL 17 + Spring MockMvc, 11개; mock DB 아님, 실제 HTTP 브라우저 테스트와는 별개 |
| 브라우저 | Codex In-app Browser (browserId 1). 정확한 브라우저 엔진 빌드 번호는 제공되지 않아 미기록 |
| 화면 | 고객 390×844 및 모바일 증거 375×812, 운영 1024×768, 보조 데스크톱 1280×720/800. 뷰포트 에뮬레이션이며 실제 모바일/iPad 검증 아님 |
| URL | 개발 UI `http://localhost:5178`; 실제 API `http://localhost:18080`; production QA UI `http://localhost:4178` → 로컬 장애 프록시 `http://localhost:18081` → 같은 API; 기본 production 산출물 `http://localhost:4179` |
| QR | `/t/T90?token=<테스트 토큰>`, `/t/T91?...`, `/t/T92?...`; 토큰 원문과 서명키는 보고서·응답 증거에서 제외 |
| 테스트 데이터 | Flyway seed 메뉴, QA 전용 테이블 T01–T18/T90–T92, QA 옵션 메뉴, S-901/S-902 합성 직원. 실명 명단·운영 계정 미사용 |

[코드·환경 기록](evidence/code-version.txt), [기동·Flyway 증거](evidence/backend-startup.json). `initial-status.txt`는 QA 디렉터리를 만든 뒤 저장한 보조 캡처이므로 자기 자신인 `?? docs/qa/`가 나온다. 최초 도구 실행의 clean 상태와 혼동하지 않는다.

확인한 문서: 루트 `DESIGN.md`/`UX-STRUCTURE.md`, 프론트·백엔드 README, `docs/qr-order/spring-gcp-migration.md`, `open-issues-action-plan.md`, `staff-pos-design.md`, `infra/README.md`, 실행·호스팅 설정 및 현행 구현. 과거 작업 계획의 “코드 미착수” 내용은 현재 코드와 다르다. 결제 후 현재 방문 조회, 메모 분리, 테이블 초기화, 항목별 조리는 이미 구현되어 있으므로 과거 이슈를 그대로 결함으로 전사하지 않았다.

## 2. 실행 명령과 결과

| 명령 / 실행 디렉터리 | 결과 | 증거·구분 |
|---|---|---|
| `npm run test` / frontend | PASS: 1 파일, 2 테스트 | [출력](evidence/frontend-test.txt); SSE parser의 mocked fetch/stream 단위 검증 |
| `npm run lint` / frontend | PASS, 종료 코드 0 | [출력](evidence/frontend-lint.txt) |
| `npm run build` / frontend | PASS, 종료 코드 0 | [출력](evidence/frontend-build.txt). **실제 동작은 mock: QA-001** |
| `JAVA_HOME=<Temurin21> bash gradlew test bootJar` / backend | PASS: test 11, skipped 0, failures 0, errors 0; bootJar 생성 | [출력](evidence/backend-checks.txt); `./gradlew test`, `./gradlew bootJar` 두 task를 한 실행에 지정 |
| `VITE_API_BASE_URL=http://localhost:18080 API_PROXY_TARGET= npm run dev -- --host 127.0.0.1 --port 5178` | PASS 기동 및 직접 API 연결 | [기동](evidence/frontend-server.txt) |
| `python3 docs/qa/start-local-backend.py` | PASS: 실제 jar, DB 연결, Flyway V1–V4 적용 | 동일 설정의 임시 스크립트로 실행 후 재현 파일 보존 |
| `VITE_API_BASE_URL=http://localhost:18081 npm run build -- --outDir /tmp/qr-order-qa/dist` / frontend | PASS | [production QA build](evidence/qa-production-build.txt) |
| `npm run preview -- --host 127.0.0.1 --port 4178 --outDir /tmp/qr-order-qa/dist` | PASS | [preview](evidence/qa-preview-server.txt) |
| `python3 docs/qa/api-qa.py` | 68개 관찰/assertion: PASS 62 / FAIL 6 | [결과](evidence/api-results.json), [요청·응답](evidence/api-trace.json) |
| `python3 docs/qa/api-extra-qa.py` | 22개: PASS 21 / FAIL 1 | [결과](evidence/api-extra-results.json), [요청·응답](evidence/api-extra-trace.json) |
| `python3 docs/qa/auth-expiry-qa.py` | PASS: 실제 서명된 만료 테스트 토큰 401 | [결과](evidence/auth-expiry.json) |
| `python3 docs/qa/payment-edit-race.py` | FAIL: 두 요청 200, 결제 10,000 / 주문 30,000 | [HTTP](evidence/payment-edit-race.json), [DB](evidence/payment-edit-race-db.txt) |
| `VITE_API_BASE_URL= npm run build -- --outDir /tmp/qr-order-qa/no-api-dist` | 빌드 성공 — QA-001 재확인 | [출력](evidence/production-without-api.txt) |
| DB 중지 후 readiness / 전체 health 조회 | readiness 200 UP, 전체 health 503 DOWN | [readiness](evidence/readiness-db-down.txt), [health](evidence/health-db-down.txt) |

90개 HTTP 진단의 FAIL 7개 중 3개는 동일한 입력 검증 결함(QA-012)의 변형이다. 카테고리 비활성화 1개는 판매 정책 확인이 필요해 QA-C01로 분리했다. 진단 스크립트는 FAIL을 누적 출력하며 프로세스 종료 코드 0 자체를 PASS 기준으로 사용하지 않는다. 별도 만료 토큰·동시 수정/결제 및 브라우저 결과는 이 90개 집계에 포함하지 않았다.

첫 작성 시 영업 종료 bootstrap의 HTTP 계약, 허용 할인율, QR 오류 코드, 직원 ID 형식에 대한 QA 기대값/fixture를 수정했다. 최종 두 진단은 초기화한 테스트 DB에서 다시 실행했다. 최종 결과 JSON이 기준이며, `service-*.json/txt`는 앞선 서비스 정산 확인의 보조 증거다. 변경은 재현 스크립트에만 적용했다.

Docker socket, Gradle cache, 로컬 listen/connect가 초기 sandbox 실행에서 차단되어 승인된 로컬 실행으로 재시도했다. 최종적으로 이 제약 때문에 차단된 기본 테스트는 없다. 다운로드나 CI 실행을 근거 없이 성공으로 간주하지 않았다.

## 3. 기능별 결과

PASS는 표에 적힌 층위와 조건만 의미한다. **API PASS를 브라우저 PASS나 실제 기기 PASS로 확장하지 않는다.**

| 기능 / 조건 | 상태 | 실행 범위·결과 |
|---|---|---|
| 정상 QR, 알려지지 않은 테이블, 잘못된 형식/누락/다른 테이블 토큰 | PASS / FAIL | API는 차단. 브라우저는 저장된 인증이 있으면 잘못된 QR 대신 이전 테이블 사용(QA-006) |
| 비활성 테이블 | PASS | API bootstrap 410; 브라우저 표시 세부는 NOT RUN |
| 영업 종료 | PASS / FAIL | bootstrap `store.open=false`, 신규 주문 409. 저장 완료 주문 재전송도 409(QA-013). 영업 종료 안내 UI 상세는 NOT RUN |
| 메뉴 카테고리·상세·가격 | PASS | 브라우저 메뉴/상세 탐색 및 실제 catalog 표시 |
| 필수 옵션·복수 선택 상한 | PASS | API 0/3개·중복·소속 불일치 거부, 브라우저 필수 미선택 담기 비활성·상한 차단 |
| 단일 옵션 변경·상한 표시 | FAIL | 선택 후 다른 radio 비활성, 상한으로 막힌 옵션도 “품절”(QA-009) |
| 품절 메뉴/옵션 재검증 | PASS | 품절 변경 후 신규 주문 API 409 |
| 비활성 카테고리 판매 | BLOCKED(정책) | 메뉴를 숨겨도 주문 접수 가능, QA-C01 |
| 장바구니 추가·수량 수정·합계·삭제 | PASS / FAIL | 실제 옵션 합계, 수량 0 삭제 확인, 빈 상태 0원 통과. 상한 10 메뉴를 11개까지 허용(QA-010) |
| 서로 다른 옵션 조합의 장바구니 병합/분리 | NOT RUN | 선택 조합 1개 및 합계 검증만 수행; 모든 조합 병합 조작 미수행 |
| 주문 확인·접수·완료·조회 | PASS | 실제 HTTP/DB 주문, 완료번호, 고객·운영 총액, 브라우저 연타 1건 |
| 요청사항 | PASS / N/A | API 문자열 저장·201자 거부 및 운영 주방 표시 확인. 고객 UI 입력은 제공하지 않고 `note:''` 전송(QA-C02) |
| 상태 변경·스테이션 | PASS | 브라우저 접수→조리 중→품목 조리 완료→서빙 큐→서빙 완료; 고객 상태 갱신 확인 |
| 동일 요청 ID / 다른 payload | PASS | 기존 주문 replay, 다른 payload 409, 같은 요청 4개 동시 전송 모두 같은 orderId |
| 저장 후 응답 유실·새로고침 재시도 | FAIL | 실제 저장 응답만 버리는 프록시 사용, 다음 확정에서 2건/20,000원(QA-002) |
| 가격 변경·주문 snapshot | PASS / FAIL | 이전 주문 금액 snapshot 보존. 장바구니 확인 금액보다 높은 실제 접수(QA-005) |
| 직원 호출 생성·취소·중복·간격 | PASS | API 생성/replay/conflict/429, 다른 테이블 취소 차단; 브라우저 생성/완료 후 취소 오류 복구 |
| 직원 호출 확인 고객 반영 | FAIL | 운영 확인 후 고객 대기 지속, reload도 동일(QA-008) |
| 새로고침·직접 URL·탭 재접속 | PASS | cart 유지, `/orders`, `/cart`, `/t/...`, `/staff/tables` 및 staff payment reload; 탭 닫고 재접속 시 테이블/금액 복원 |
| 정상 다른 테이블 QR 전환 | PASS(부분) | T91→정상 T92 전환 시 T92/빈 cart, 이후 별도 주문. in-app history를 통한 모든 호출 상태 전환은 NOT RUN |
| 로그인 실패/성공·보호 API·만료 | PASS | 브라우저 재입력, 실제 API 401, 만료 토큰 401, epoch 변경 후 운영 화면 재로그인 |
| 수동 로그아웃 | N/A / 확인 필요 | 노출된 사용자 로그아웃 진입점 미발견. hook의 logout은 인증 오류 처리용(QA-C02) |
| 테이블 현황/상세 및 운영 주문 생성 | PASS | 브라우저 테이블 상세; 운영 주문 생성은 API |
| 운영 주문 수정/항목 취소·합계 | PASS / FAIL | 순차 수정/취소 API 재계산 정상. 수정과 결제 동시 실행 시 불일치(QA-004) |
| 테이블 할인·이동·합석·분리 | PASS(API) | 20% 할인, 합석 합계 30,000→24,000, 분리 subtotal 보존, 이동 후 원본/목적 QR 조회. 대화상자별 UI 및 동시 합석은 NOT RUN |
| 결제 확정·금액 변경 감지 | PASS / FAIL | 금액 변경 409, 브라우저 정상 결제. 과거 요청이 동일 금액 새 방문을 닫음(QA-003) |
| 결제 후 새 방문 | PASS | 정상 순차 흐름에서 과거 주문 제외, 0원/새 주문만 조회. 재전송·동시 수정은 별도 FAIL |
| 운영 결제 완료 이력 | FAIL | 오늘 완료·완료 목록 0 유지(QA-011) |
| 방문 메모·초기화 | PASS(API/기존 통합) | 메모 저장, 방문 reset, 과거 reset 재전송이 새 방문 보존. 전체 UI reset 조작은 NOT RUN |
| 메뉴·가격·옵션·설정 변경 | PASS(API/부분 UI) | admin PUT 및 catalog; 브라우저 새 옵션/가격 표시. 카탈로그 편집 화면 전체 조작은 NOT RUN |
| QR 재발급 | PASS(API) | 이전 QR 401; SVG 인쇄 품질·카메라 재스캔은 NOT RUN |
| 직원 명단·서비스·정산 | PASS / FAIL | 합성 명단, 고객 무료, 직원 부담금, 정산 확정·재확정 409. 서비스 생성 재전송 중복(QA-007). 서비스/정산 UI 전체는 NOT RUN |
| 동시 주문/번호 배정 | PASS | 동일 4개/서로 다른 4개 HTTP, 기존 통합 테스트; 고유 번호 |
| 동시 결제 / 주문·결제 | PASS(소규모) | 결제 2개 중 성공 1개, 주문·결제 4쌍; DB에서 이전 PAID/새 UNPAID 세션 분리 |
| 동시 수정·결제 | FAIL | 2개 요청의 순서를 QA 지연 트리거로 제어, QA-004 |
| SSE 정상 / 장애 polling / 재연결 | PASS / FAIL | 정상 상태 이벤트 확인, 장애 후 첫 재조회 45.29초(QA-014). 24/25분 장시간 재연결·다중 인스턴스 replay는 NOT RUN |
| 화면 이동·재접속 중 중복 구독 누적 | NOT RUN(정량) | 여러 경로를 이동했으나 구독 수/메모리의 반복 부하 계측 미수행 |
| 4xx/503 복구·느린 응답 | PASS(유한 지연) | 오류 후 재시도 복구. 65초 지연에서 32초에도 대기/앱 뒤로가기 불가, 65초 후 400 복구. 무기한 단절 및 취소 정책은 확인 필요 |
| 콘솔 / 실패 네트워크 | PASS(관찰) | 수집 가능한 console error/warn 0. 주입 502/503 및 검증용 4xx는 proxy/API 기록으로 확인. 모든 브라우저 resource 요청의 HAR 수집은 미제공 |
| 모바일/태블릿 레이아웃 | PASS(관찰) / BLOCKED | 관찰한 주문·호출·상세·옵션에서 치명적 버튼 가림 없음. 실제 기기, OS 키보드, Safari/Android Chrome은 환경 부재로 BLOCKED |
| production 설정 / health | FAIL | 기본 build mock(QA-001), DB down에도 readiness UP(QA-015) |
| 실제 호스팅 deep link·캐시·CORS | NOT RUN(외부) | 설정 검토와 로컬 direct/reload·CORS만 수행. 테스트 전용 배포라는 확인 없이 외부 접근하지 않음 |
| Apps Script 현행 배포 QA | N/A | 현재 Spring 경로에 포함되지 않음 |

## 4. 심각도순 결함

총 **P1 7건, P2 8건**, P0/P3 확인 없음. 아래의 “실행으로 재현”은 기재한 로컬 조건에서만 확인한 의미다. 공개 환경에서 발생했다고 주장하지 않는다.

### QA-001 / production API 설정이 없어도 mock 모드로 빌드·실행 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** 현재 체크아웃의 기본 production 환경. `.env.local`에는 legacy 변수 이름만 있고 `VITE_API_BASE_URL`은 development 전용 파일에만 존재.
- **최소 재현 절차:** frontend에서 `npm run build` → `npm run preview -- --port 4179` → 새 origin의 `/staff/tables` 및 `/` 직접 접속.
- **기대 결과:** 운영용 API 설정 누락은 build/시작 단계에서 명확히 실패해야 하며 mock 데이터로 실제 운영처럼 진행하면 안 된다.
- **실제 결과:** 빌드는 성공. 로그인 없이 mock 테이블 T01–T15/가상 주문 표시. 고객은 mock 식당·테이블 7로 진입. 실제 API 연결 없는 완료 흐름이 가능하다.
- **사용자 영향:** 이 산출물을 배포하면 주문/운영 조작이 실제 서버에 반영되지 않는다. 실제 API 인증 우회로 확인한 것은 아니다.
- **증거:** [기본 build](evidence/frontend-build.txt), [API 공백 build](evidence/production-without-api.txt), [운영 mock 화면](evidence/default-production-mock-no-auth.jpg), [DOM](evidence/default-production-mock-no-auth.txt)
- **관련 파일·줄:** `qr-order-frontend/src/api/client.ts:41–42`, `src/StaffApp.tsx:40`, `src/App.tsx:254–257`, `vite.config.ts:38–81`; `cloudbuild.yaml:20–24`
- **추정 원인·최소 수정 방향:** API 유무로 mock/live를 결정하고 production guard가 없다. production에서 URL 필수 검증 및 명시적인 개발 전용 mock flag를 적용하고 CI에 필수 변수를 주입한다.

### QA-002 / 주문 저장 후 응답 유실·새로고침 재시도로 중복 주문 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** 실제 백엔드에 연결한 production QA UI, T91 cart 닭발 1개/10,000원, localhost 장애 프록시.
- **최소 재현 절차:** `fault.json`을 `{"mode":"drop-next-order"}`로 지정 → 주문 확정 → 오류 표시 → 새로고침 → 같은 장바구니 주문 확정 → 주문 내역 조회.
- **기대 결과:** 응답을 못 받은 최초 주문의 요청 ID를 유지·복구하여 주문 1건/10,000원이어야 한다.
- **실제 결과:** 프록시는 서버의 200/저장 완료 후 원본 JSON만 버리고 빈 502를 반환했다. 새로고침 후 새 ID가 발급되어 A-1056/A-1057 2건, 합계 20,000원. 이는 TCP 자체 단절 대신 응답 유실을 주입한 테스트다.
- **사용자 영향:** 사용자가 같은 의도로 재시도한 주문을 두 번 조리·청구할 수 있다.
- **증거:** [오류 화면](evidence/response-lost-error-1280.jpg), [중복 주문 DOM](evidence/duplicate-order-after-reload-390.txt), [실제 DB 두 요청 ID](evidence/browser-order-db.txt), [프록시 기록](evidence/proxy-trace.jsonl)
- **관련 파일·줄:** `qr-order-frontend/src/App.tsx:230,265–266`, `src/hooks/useOrderSession.ts:34–40`
- **추정 원인·최소 수정 방향:** cart는 저장되지만 요청 ID는 route의 useRef라 reload/unmount 시 소실된다. pending 주문 payload+ID를 방문 범위로 영속화하고 성공 여부 조회/재전송으로 복구한 뒤에만 제거한다.

### QA-003 / 과거 결제 요청이 동일 금액인 다음 방문을 결제 완료 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** T01 방문 A 주문 10,000원/20% 할인, 방문 B도 동일 구성.
- **최소 재현 절차:** A에 `tables/confirm-payment {tableId:T01,expectedFinalAmount:8000}` → B 새 주문/동일 할인 → A의 결제 body를 그대로 재전송.
- **기대 결과:** A 요청의 replay는 A 결과만 반환하거나 stale session 오류여야 하며 B를 닫으면 안 된다.
- **실제 결과:** 두 번째 요청도 200이며 B 세션까지 CLOSED/PAID. API가 tableId와 금액만 비교한다.
- **사용자 영향:** 새 방문의 미수금을 결제 완료로 오인해 결제/정산 이력을 오염시킨다.
- **증거:** [API 결과 old payment request 항목](evidence/api-results.json), [요청·응답](evidence/api-trace.json), [초기 재현 DB](evidence/browser-order-db.txt)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/api/StaffController.java:106–107`, `domain/StaffOperationsService.java:343–360`
- **추정 원인·최소 수정 방향:** 현재 열린 세션을 새로 조회하므로 요청에 방문 식별자가 없다. expectedSessionId/billVersion 및 결제 요청 ID를 받도록 계약을 바꾸고 해당 세션에만 원자적으로 적용한다.

### QA-004 / 주문 수정과 결제가 겹치면 결제 10,000원·주문 30,000원 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** T16 열린 방문, 닭발 1개/10,000원. 일회용 DB에만 `payment-edit-race.sql`의 수량 UPDATE 1.5초 지연 trigger 설치.
- **최소 재현 절차:** 수량 3으로 수정 요청 시작 → 0.35초 후 10,000원 결제 확정 요청 → 두 응답/DB 조회. 요청 2개이며 제품 코드는 변경하지 않음.
- **기대 결과:** 동일 세션 쓰기 잠금으로 직렬화하여 수정 후 결제 금액 conflict 또는 결제 후 수정 거부. 결제 snapshot과 결제된 주문 합계가 일치해야 한다.
- **실제 결과:** 수정 200, 결제 200. 같은 세션 CLOSED/PAID, `final_amount=10000`, 주문 A-1066 `total_amount=30000`, quantity=3, 주문도 PAID. 지연 trigger는 증거 저장 직후 제거했다.
- **사용자 영향:** 실제 수금 기록과 주문 금액이 달라져 부족 청구·정산 불일치 발생.
- **증거:** [HTTP 전후](evidence/payment-edit-race.json), [DB 증거](evidence/payment-edit-race-db.txt), [재현 스크립트](payment-edit-race.py), [순서 제어 SQL](payment-edit-race.sql)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/StaffOperationsService.java:343–357,506–563`
- **추정 원인·최소 수정 방향:** 수정은 order_items만 잠그고 세션 OPEN 여부를 미리 읽는다. 결제는 세션/주문을 갱신하는 동안 수정이 계속된다. 모든 주문 금액 변경과 결제가 같은 세션/청구 그룹 잠금 순서를 사용하고 잠금 획득 뒤 상태를 다시 검증해야 한다.

### QA-005 / 고객 확정 화면 금액보다 높은 가격으로 주문 접수 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** T92 QA 옵션 메뉴 base 12,000 + 옵션 300원으로 cart 생성. 관리 API로 base를 13,000원으로 변경.
- **최소 재현 절차:** cart를 유지한 채 주문 확인 → “주문 확정 12,300원” 클릭 → 완료 화면/DB 확인.
- **기대 결과:** 가격 변경을 감지해 새 13,300원을 보여주고 재확인받거나 주문을 거부해야 한다. 서버는 가격 계산의 권한을 계속 유지해야 한다.
- **실제 결과:** 확정 화면 12,300원, 즉시 완료 화면과 실제 주문은 13,300원. 현재 catalog가 변경되어도 cart의 unitPrice snapshot을 표시한다.
- **사용자 영향:** 고객이 확인한 청구 금액과 실제 청구 금액이 달라진다.
- **증거:** [확정 전](evidence/price-changed-confirm-old-390.jpg), [접수 후](evidence/price-changed-charged-new-390.jpg), [관리 가격 변경](evidence/control-trace.jsonl), [DB](evidence/browser-order-db.txt)
- **관련 파일·줄:** `qr-order-frontend/src/pages/OrderConfirmationPage.tsx:31,53`, `src/api/orders.ts:34–51`; `qr-order-backend/src/main/java/com/caucse/qrorder/domain/CustomerOrderService.java:362–404`
- **추정 원인·최소 수정 방향:** 고객 snapshot과 서버 재계산 사이에 가격 버전/견적 검증이 없다. 서버 quote/catalog version을 제출·검증하고 바뀌면 재가격 산정 및 재확인한다.

### QA-006 / 잘못된 다른 테이블 QR이 저장된 이전 인증으로 진입 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** 브라우저가 정상 T91 QR을 사용한 적 있고 인증이 localStorage에 저장되어 있음.
- **최소 재현 절차:** 같은 origin에서 `/t/T92?token=bad` 직접 접속. 주문 시작 화면의 테이블과 활성 버튼 확인. 누락 토큰도 동일 fallback 코드 경로.
- **기대 결과:** 명시적으로 들어온 T92 QR이 유효하지 않으면 인증 오류로 멈춰야 한다.
- **실제 결과:** 오류 없이 T91 테이블 확인 화면과 “메뉴 보기”가 표시된다. T92 URL을 처리하면서 T91의 저장된 자격증명을 사용한다.
- **사용자 영향:** 잘못된/잘린 QR로 진입한 고객의 주문이 이전 테이블로 전달될 수 있다. 서버가 다른 토큰을 허용한 것은 아니다.
- **증거:** [브라우저 화면](evidence/invalid-qr-resumes-previous-table-390.jpg), [DOM](evidence/invalid-qr-resumes-previous-table-390.txt); 테스트 URL은 민감값 없는 `http://localhost:4178/t/T92?token=bad`
- **관련 파일·줄:** `qr-order-frontend/src/App.tsx:79–87,100–107,339–348`
- **추정 원인·최소 수정 방향:** URL parse 실패와 URL 없는 재접속을 같은 null fallback으로 처리한다. /t 진입은 URL 자격증명만 검증하고 실패 시 저장된 인증으로 대체하지 않는다.

### QA-007 / 서비스 주문 생성 재전송을 구분할 키가 없어 직원 부담금 중복 / P1

- **구분:** 실행으로 재현
- **환경·사전 조건:** 미정산 합성 직원 S-901, T12; 서비스 닭발 1개, 직원 할인 20%.
- **최소 재현 절차:** 동일 `staff/orders/service` body를 두 번 전송(최초 응답을 소비하지 못한 재시도와 같은 입력). settlements/list 조회.
- **기대 결과:** 재시도를 표시할 clientRequestId를 받아 기존 서비스 주문을 복구할 수 있어야 한다. 의도적인 추가 제공은 별도 요청 ID를 사용해야 한다.
- **실제 결과:** 둘 다 200, 서로 다른 주문 ID, 직원 부담금 8,000→16,000원. 이 API는 clientRequestId를 받지 않고 매번 내부 UUID를 생성한다. 동일 body만으로 서로 다른 사용자 의도를 판별할 수 없는 계약상의 결함이다.
- **사용자 영향:** 응답 유실 재시도 시 서비스 중복 제공과 직원 이중 부담 가능.
- **증거:** [최종 추가 API 결과](evidence/api-extra-results.json), [최종 요청·응답](evidence/api-extra-trace.json), [보조 서비스·정산 기록](evidence/service-trace.json)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/CustomerOrderService.java:107–109,154–156`; `domain/StaffServiceService.java:39–56`
- **추정 원인·최소 수정 방향:** 고객 주문과 달리 외부 요청 키가 없다. 서비스 주문에도 동일한 요청 ID·fingerprint·DB unique 제약과 replay 경로를 제공한다.

### QA-008 / 운영에서 확인한 직원 호출이 고객 화면에는 계속 대기 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 고객 T90에서 물 호출을 생성한 상태.
- **최소 재현 절차:** 운영 테이블 화면의 T90 호출 확인 클릭 → 고객 호출 sheet 확인 → 고객 새로고침 후 호출 sheet 재오픈.
- **기대 결과:** 확인된 호출은 고객 화면에 완료/확인 상태로 반영되어 다음 호출을 할 수 있어야 한다.
- **실제 결과:** 운영은 확인됨/호출 0, 고객은 “직원을 불렀어요 / 잠시만 기다려 주세요 / 호출 취소”가 유지된다. 고객이 호출 취소를 눌러 409 CALL_ALREADY_RESOLVED를 받은 뒤에야 로컬 상태가 해제된다.
- **사용자 영향:** 고객이 직원 확인 여부를 알지 못하고 새 호출을 정상적으로 시작하기 어렵다.
- **증거:** [확인 후](evidence/call-ack-stale-1024.jpg), [새로고침 후](evidence/call-ack-after-reload.jpg), [DOM](evidence/call-ack-after-reload.txt)
- **관련 파일·줄:** `qr-order-frontend/src/hooks/useStaffCall.ts:46–57,103–151`, `src/hooks/useOrderPolling.ts:104–113`
- **추정 원인·최소 수정 방향:** activeCall이 로컬 상태에만 있고 호출 확인 이벤트가 이 hook으로 전달되지 않는다. 호출 snapshot 또는 인증된 이벤트에 따라 상태를 갱신하고 방문 종료도 반영한다.

### QA-009 / 단일 옵션 선택 후 변경 불가·선택 상한을 품절로 표시 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** QA 메뉴에 required SINGLE min=1/max=1, 선택지 2개. 옵션 모두 available=true.
- **최소 재현 절차:** 상세에서 단일 1 선택 → 단일 2 활성 상태 확인. MULTIPLE max=2에서도 두 항목 선택 후 나머지 표시 확인.
- **기대 결과:** 단일 옵션은 다른 선택지로 바꿀 수 있어야 한다. 선택 상한과 실제 품절은 다른 사유로 표시해야 한다.
- **실제 결과:** 단일 2 radio가 disabled되어 변경 불가. 단일/복수의 상한으로 비활성화된 항목에도 “(품절)” 표시.
- **사용자 영향:** 메뉴 상세를 나갔다 다시 열어야 선택 변경 가능. 판매 상태를 잘못 안내.
- **증거:** [모바일 화면](evidence/single-option-cannot-change-mobile.jpg), [DOM의 disabled/품절](evidence/single-option-cannot-change-mobile.txt)
- **관련 파일·줄:** `qr-order-frontend/src/components/OptionGroup.tsx:16–18,47`, `src/components/OptionSelector.tsx:74`
- **추정 원인·최소 수정 방향:** maxReached 차단을 radio에도 적용하고 disabled를 soldOut으로 간주한다. MULTIPLE 상한만 비선택 항목을 막고 soldOut prop/상한 사유를 분리한다.

### QA-010 / 장바구니 수량 상한이 메뉴 상한과 달라 최종 주문 실패 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 닭발 maxQuantity=10, 장바구니 수량 1.
- **최소 재현 절차:** cart의 수량 늘리기 10회 → 11개/110,000원 주문 확인 → 확정.
- **기대 결과:** 장바구니에서도 메뉴 min/max를 적용하여 제출할 수 없는 수량을 제한해야 한다.
- **실제 결과:** 11개 확인과 확정을 허용한 뒤 서버 400 “메뉴 수량을 확인해 주세요”. 더 줄이고 재시도하는 우회는 가능.
- **사용자 영향:** 정상 UI 조작만으로 접수 불가능한 주문이 만들어지고 확인 단계에서 실패.
- **증거:** [오류 화면](evidence/cart-exceeds-menu-limit-390.jpg), [DOM](evidence/cart-exceeds-menu-limit-390.txt), [API 상한](evidence/api-results.json)
- **관련 파일·줄:** `qr-order-frontend/src/components/CartLine.tsx:51–58`, `src/components/customer/QuantitySelector.tsx:36–40`, `src/hooks/useOrderSession.ts:45–60`
- **추정 원인·최소 수정 방향:** cart selector 기본 max=99 사용, 추가 병합도 상한 검증 없음. 해당 메뉴 제한을 전달하고 병합 후 총 수량도 검증한다.

### QA-011 / 결제 후 운영 결제 완료 목록과 오늘 완료 건수가 0 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 실제 T90 20,000원 주문을 조리·서빙 완료한 상태.
- **최소 재현 절차:** 운영 결제 화면 T90 “입금 확인” 클릭 → 완료 섹션 → 새로고침.
- **기대 결과:** 성공한 결제는 오늘 완료 건수·완료 목록에서 조회되어야 한다(현재 UI에 해당 영역이 제공됨).
- **실제 결과:** T90은 결제 대기에서 사라지고 고객 내역도 비워지지만 오늘 완료 0 / 결제 완료 0. reload 이후에도 동일. DB는 PAID.
- **사용자 영향:** 운영자가 이미 처리한 결제를 화면에서 확인하기 어렵고 완료 건수를 신뢰할 수 없다.
- **증거:** [운영 화면](evidence/payment-history-empty-1024.jpg), [DOM](evidence/payment-history-empty-1024.txt), [PAID DB](evidence/browser-order-db.txt)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/StaffOperationsService.java:453–465`; `qr-order-frontend/src/pages/staff/StaffStationRoutes.tsx:150–151`
- **추정 원인·최소 수정 방향:** queue API가 OPEN/UNPAID만 내려주는데 프론트는 같은 응답에서 paid 항목을 찾는다. 날짜 범위가 정의된 결제 완료 snapshot/API를 제공한다.

### QA-012 / 잘못된 수량/옵션 입력이 재시도 가능한 500으로 응답 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 정상 테스트 테이블 자격증명, orders/create.
- **최소 재현 절차:** quantity=1.5 또는 문자열 "2", 혹은 selectedOptionIds=7을 넣어 각각 새 요청 ID로 제출.
- **기대 결과:** 잘못된 client payload는 400 INVALID_REQUEST 등 비재시도 오류.
- **실제 결과:** 세 경우 모두 500 INTERNAL_ERROR, retryable=true. 외부 응답에 stack trace 노출은 없었다.
- **사용자 영향:** 사용자 입력 문제를 서버 장애로 오인하고 불필요한 재시도를 유도한다.
- **증거:** [quantity/invalid options FAIL](evidence/api-results.json), [요청·응답](evidence/api-trace.json)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/CustomerOrderService.java:457–467`
- **추정 원인·최소 수정 방향:** fingerprint()가 validation ApiException까지 catch(Exception)으로 감싸 IllegalStateException으로 바꾼다. 검증 예외를 보존하고 serialization 예외만 별도로 처리한다.

### QA-013 / 저장 완료 주문 재전송도 영업 종료 후 거부 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 동일 요청 ID/payload 주문이 이미 성공해 DB에 존재.
- **최소 재현 절차:** EVENT_OPEN=false로 변경 → 저장된 주문의 동일 요청을 orders/create에 재전송.
- **기대 결과:** 인증된 최초 결과 복구는 신규 주문 제한과 분리해 기존 orderId/replay를 반환해야 한다(멱등 처리 및 응답 유실 복구 요구).
- **실제 결과:** 기존 주문이 있지만 409 EVENT_CLOSED. orders/get/list로 별도 확인하는 우회는 가능.
- **사용자 영향:** 영업 종료 직전 응답 유실을 겪은 고객은 재시도만으로 저장 여부를 복구할 수 없다.
- **증거:** [committed replay after closing](evidence/api-results.json), [요청·응답](evidence/api-trace.json)
- **관련 파일·줄:** `qr-order-backend/src/main/java/com/caucse/qrorder/domain/CustomerOrderService.java:53–56,72–77`
- **추정 원인·최소 수정 방향:** 영업/활성 검증이 idempotent replay 조회보다 앞선다. 자격증명은 검증하되 이미 저장된 동일 요청을 먼저 복구하고 신규 생성에만 영업 제한을 적용한다.

### QA-014 / SSE 재시도가 polling 타이머를 밀어 첫 fallback이 약 45초 / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** 고객 주문 화면, proxy의 sse-off로 events만 503, orders/list는 정상 응답.
- **최소 재현 절차:** sse-off 설정 후 reload → SSE 0/2/6/14/30초 실패 기록 → 운영 상태 변경 → 첫 다음 orders/list 시간 비교.
- **기대 결과:** 문서의 고객 15초 polling(+코드 jitter 최대 2초)을 SSE 재시도와 독립적으로 유지해야 한다.
- **실제 결과:** 첫 orders/list 시각 1789310521.151809, 다음 1789310566.446309: 45.29초 간격. 42초 관찰에서도 화면은 이전 접수 상태. sse-off는 약 42초에 해제했고 다음 poll은 새 SSE 연결 이전에 발생했다.
- **사용자 영향:** 실시간 연결 장애 중 주문 변경 반영이 문서보다 늦어짐. polling이 영구 중단되었다고 주장하지 않는다.
- **증거:** [프록시 요청 시각](evidence/proxy-trace.jsonl); 정상 조리 상태 SSE 반영은 별도로 브라우저 검증
- **관련 파일·줄:** `qr-order-frontend/src/hooks/useOrderPolling.ts:49–60,117–127`; `qr-order-frontend/README.md:53`
- **추정 원인·최소 수정 방향:** SSE finally마다 schedule(15s)이 기존 polling 타이머를 취소·재예약한다. stream 재시도와 polling 시계를 분리하고 fallback을 시작할 때만 타이머를 전환한다.

### QA-015 / DB가 중지되어도 readiness가 UP / P2

- **구분:** 실행으로 재현
- **환경·사전 조건:** QA API 기동 후 의존 PostgreSQL 컨테이너만 중지. 설정은 저장소 기본 health 구성.
- **최소 재현 절차:** `/actuator/health/readiness` 및 `/actuator/health`를 각각 GET.
- **기대 결과:** 주문 서비스를 받을 수 없게 만드는 DB 장애는 배포 검증/트래픽 준비 상태에서 감지해야 한다.
- **실제 결과:** readiness 200 {status:UP}, 전체 health 503 {status:DOWN}. Cloud Build smoke는 readiness를 확인하고 Cloud Run probes는 liveness를 사용한다.
- **사용자 영향:** API가 DB 요청을 처리하지 못해도 배포 smoke가 통과할 수 있다. 실제 Cloud Run 장애를 재현한 것은 아니다.
- **증거:** [readiness 응답](evidence/readiness-db-down.txt), [전체 health 응답](evidence/health-db-down.txt)
- **관련 파일·줄:** `qr-order-backend/src/main/resources/application.yml:29–39`; `infra/main.tf:195–211`; `cloudbuild.yaml:59–66`
- **추정 원인·최소 수정 방향:** readiness group에 DB 의존 상태를 포함하지 않았다. DB 장애 처리 정책에 맞춰 readiness group과 smoke를 구성하고 liveness는 프로세스 생존 확인과 구분한다.

## 5. 추가 확인 필요 — 확정 결함으로 세지 않은 항목

| ID | 구분·관찰 | 기대 동작의 근거 / 필요한 결정 | 증거·관련 코드 |
|---|---|---|---|
| QA-C01 | 추가 확인 필요. active=false 카테고리 메뉴가 bootstrap에서 숨겨지지만 신규 주문은 200/12,100원 | 비활성이 단순 목록 숨김인지 판매 중단인지 현재 계약에서 명확하지 않다. 판매 중단이라면 P2 결함이며 서버 category.active 재검증 필요 | `api-results.json`의 inactive category, `CustomerOrderService.java:362–365`, `TableCatalogService.java:77–81,116–130` |
| QA-C02 | 추가 확인 필요. 고객 요청사항 입력·수동 로그아웃·운영 대행 주문 UI는 현재 화면에서 제공되지 않음 | 서버 note/운영 주문 API가 있다는 사실만으로 UI 누락을 버그로 단정하지 않는다. staff-pos-design은 대행 주문 UI 폐기를 명시. 요청사항·로그아웃의 출시 필수 여부 확정 필요 | `src/api/orders.ts:46`, `src/pages/OrderConfirmationPage.tsx`, `src/StaffApp.tsx:70`, `src/hooks/useStaffAuth.ts:140`, `staff-pos-design.md:35–40` |
| QA-C03 | 추가 확인 필요. 호출 state는 토큰 범위로만 저장되며 세션 변경 시 초기화 코드가 없음 | 같은 앱 인스턴스의 history로 서로 다른 정상 QR을 오가는 경우와 결제 직후 호출의 수명 정책·실행 검증 필요. 실제 호출 혼입으로 단정하지 않음 | `src/hooks/useStaffCall.ts:42–57`; 정상 QR full navigation의 cart 격리는 별도로 PASS |
| QA-C04 | 추가 확인 필요. 일반 API client에 자체 timeout 없고 제출 중 뒤로가기 무효 | 65초의 유한 지연 후 오류 복구는 확인. 무기한 응답 정지에서 허용할 대기 시간·취소/저장 여부 확인 UX 결정 필요. 32초 대기만으로 영구 멈춤이라 단정하지 않음 | `src/api/client.ts:45–74`, `src/App.tsx:230–282`, [지연 화면](evidence/slow-order-no-timeout.jpg), `proxy-trace.jsonl`의 65.022초 |
| QA-C05 | 추가 확인 필요. 고객 주문 합계는 할인 전 주문 합계, 운영 bill은 할인 후 금액 | 할인·합석 시 고객이 보여줄 금액을 “자기 세션 주문 합계”로 유지할지 “그룹 최종 결제액”으로 통일할지 확인. 현재 서로 다른 의미의 합계를 바로 금액 오류로 세지 않음 | `CustomerOrderService.java:239–247`, `StaffOperationsService.java:629–637` |

## 6. 배포 설정 검토와 남은 검증

| 영역 | 저장소에서 확인 | 실행 범위 / 제한 |
|---|---|---|
| 프론트 hosting | README·`netlify.toml`은 Netlify, 루트 `firebase.json`도 존재 | 현재 실제 서비스가 어느 설정으로 배포되는지 외부 확인 안 함. Netlify/Firebase 모두 현행 설정 후보로 검토 |
| deep links | Vite dev/preview에서 staffHistoryFallback이 `/staff`와 하위 경로를 staff.html로 rewrite. Firebase도 exact `/staff`, `/staff/**`; Netlify는 `/staff/*`와 나머지 catch-all | 로컬 `/t/...`, `/staff/tables`, 결제 페이지 reload PASS. CDN의 exact `/staff`, 하위 URL 응답·404는 NOT RUN |
| API URL | `VITE_API_BASE_URL` 단일 Spring origin. 개발 전용 proxy는 Origin을 제거하여 서버로 전달 | 로컬 production 누락/legacy 변수 잔존 QA-001. 외부 배포의 환경 변수, URL, 빌드 artifact는 NOT RUN |
| CORS | SecurityConfig의 명시 origin allowlist, JSON/Bearer/Last-Event-ID 허용 | 허용 로컬 origin 200, 비허용 origin 403. 외부 staging/production origin은 NOT RUN |
| cache | Firebase assets 1년 immutable, `/*.html` no-cache; Netlify 파일에는 명시 header 정책 없음 | 실제 CDN 응답 헤더·업데이트 직후 오래된 index/chunk 조합은 NOT RUN |
| API/DB hosting | Cloud Build → Artifact Registry → Cloud Run, Cloud SQL PostgreSQL. 기존 Apps Script로 write rollback하지 않는 정책 | Docker image 빌드·Cloud Build 실행·Terraform apply·실제 배포 안 함 |
| CI 실행 환경 | Cloud Build frontend Node 22.12.0, backend Gradle/JDK21 | 이번 호스트 Node 25.9.0으로 검증. CI Node22 재현 및 Cloud Build 내부 Testcontainers 접근은 NOT RUN |
| schema migration | Flyway enabled, Hibernate validate, V1–V4 존재 | 빈 PostgreSQL17 DB의 전체 적용 PASS. 기존 운영 DB에서 V3→V4 upgrade·대용량 migration/lock·백업 복원은 NOT RUN |
| health | liveness/readiness 노출, Cloud Build readiness smoke, Terraform liveness probes | 양성 기동 및 DB down 비교 실행. QA-015. Cloud Run traffic 실제 동작은 NOT RUN |
| 인증·secret | Secret Manager references, staging에서만 OpenAPI enabled 구성 | 실제 secret 값/회전·배포 파라미터 확인 안 함. 고정 QA fixture 인증만 사용 |

**미검증 영역과 필요한 조건:**

- 실제 iPhone/Safari, Android Chrome, iPad 및 OS 키보드·safe-area·카메라 QR 스캔: 해당 기기와 테스트 origin 필요. 브라우저 viewport를 실제 기기로 표현하지 않았다.
- 운영 설정·이동/합석/분리/서비스/정산/초기화 다이얼로그의 전체 UI 조작, 옵션 조합별 cart 병합: 독립 API 검증은 수행했지만 화면 조합 전수 검증은 남음. 데이터/정책이 확정된 후 같은 일회용 환경에서 이어갈 수 있다.
- 동시 합석·분리·이동, 여러 항목 동시 수정, 동시에 서로 다른 직원의 상태 변경·정산, reset과 결제의 모든 교차 순서: 이번에는 고유 주문 4개, 동일 요청 4개, 결제 2개, 주문/결제 4쌍, 수정/결제 2개로 제한했다. QA-004 수정 후 공통 잠금 전략에 맞춘 시나리오 확대 필요.
- SSE 장시간 만료(24분), Last-Event-ID 실제 재전송/중복 이벤트, Cloud Run 복수 인스턴스·재기동, 반복 화면 이동의 connection/memory 계측: 해당 시간과 연결 계측을 갖춘 격리 환경 필요. 기존 parser 2개 테스트로 대체하지 않았다.
- 네트워크 완전 단절, 무기한 응답 없음, 사용자 취소와 서버 commit의 경합: 이번에는 실제 DB 저장 후 원본 응답을 버린 502, events 503, API 503, 65초 지연을 사용했다. 물리 Wi-Fi 차단이나 OS offline 상태는 NOT RUN.
- 외부 실제 hosting의 라우팅/캐시/TLS/CORS, Cloud Build의 test 실행, 운영 DB upgrade/restore: **명확히 테스트 전용인 배포 환경과 fixture 준비**가 필요. 환경 확인 없이 외부 변경을 하지 않았다.

## 7. 재현 자료와 데이터 정리

주요 자동 재현:

1. 테스트용 `postgres:17-alpine`을 **새 빈 DB**로 실행한다. 이름 `qr-order-qa-20260913`, loopback host port 55432, DB `qr_order_qa`. fixture 설정은 `start-local-backend.py`에 있으며 모두 합성 로컬 값이다. 운영에 재사용하지 않는다.
2. Java21로 jar를 만든 뒤 저장소 루트에서 `python3 docs/qa/start-local-backend.py` 실행. health UP 확인.
3. `python3 docs/qa/api-qa.py`, 이어서 `python3 docs/qa/api-extra-qa.py`. 실패 결과는 JSON에서 확인한다. 이 두 스크립트는 고정 localhost만 사용하며 **같은 fixture에 반복 실행하는 용도가 아니다**. 반복하려면 일회용 DB를 다시 생성한다.
4. `python3 docs/qa/auth-expiry-qa.py`로 만료 토큰 응답 확인.
5. 순서 제어 동시성: 테스트 DB에서만 `payment-edit-race.sql` 설치 → `payment-edit-race.py` → `payment-edit-race-db.txt`의 SELECT 확인 → trigger/function 제거. SQL 지연은 경합 순서를 만들 뿐 주문/결제 데이터를 대신 수정하지 않는다.
6. 브라우저 장애 재현은 `fault-proxy.py`, production build/preview 4178을 사용한다. `/tmp/qr-order-qa/fault.json`의 mode로 제어한다. proxy는 원본 인증 header/body를 로그에 남기지 않고 요청 경로·HTTP 상태·시간만 기록한다.

[브라우저 시나리오 기록](evidence/browser-scenarios.json), [스크린샷 메타데이터](evidence/screenshots.json), [전체 브라우저 콘솔 수집](evidence/browser-console.json). 스크린샷은 도구가 반환한 JPEG 원본이며 실제 이미지 크기를 메타데이터에 적었다. 일부 캡처 크기는 요청한 viewport와 다르므로 파일 이름보다 이 메타데이터와 DOM/DB 증거를 우선한다.

정리 상태:

- Testcontainers 테스트는 자체 임시 PostgreSQL 수명주기로 실행했다. 별도로 만든 QA PostgreSQL은 중지 후 `docker rm -v qr-order-qa-20260913`로 컨테이너와 전용 볼륨을 제거했다.
- 최종 fixture는 테이블 21개, 주문 27개, 호출 2개, 합성 직원 2개였다. 앞선 브라우저 실행 라운드는 최종 API 진단 전에 초기화했다. [최종 수량](evidence/final-fixture-counts.txt)
- QA-004의 임시 DB trigger/function을 제거했고 custom trigger 0을 확인했다.
- 이번에 실행한 backend, dev/preview 서버 3개, fault proxy를 종료했다. 테스트 탭 모두 닫고 viewport override를 reset했다.
- `/tmp/qr-order-qa`에 보관했던 토큰·서버 로그·임시 build는 증거 마스킹 확인 후 삭제했다. 로컬 원문 인증정보는 보고서에 포함하지 않았다.
- IAB의 localhost 테스트 origin localStorage는 별도 purge를 수행하지 않았다. 탭은 닫았으며 저장된 합성 토큰은 삭제된 일회용 DB용이다. 실제 사용자 origin의 저장소는 조작하지 않았다.
- 정상 `npm run build`의 `qr-order-frontend/dist`는 Git ignore 대상 build 산출물로 남는다. **QA-001로 mock임이 확인된 산출물이므로 배포하지 않는다.**
- 테스트 증거의 `tableToken`, `staffToken`, QR URL의 token, QR SVG는 마스킹했다. API trace의 주문 ID·요청 ID는 재현 비교를 위한 일회용 테스트 식별자다.

## 8. 출시 판단과 후속 완료 기준

**보류.** 기존 테스트 13개(프론트 2 / 백엔드 11)와 두 build task가 통과했지만 실제 브라우저/DB에서 주문 중복, 고객 확인 금액과 접수 금액 불일치, 결제된 주문 금액 변경, 이전 방문 요청의 새 방문 처리 등 P1을 확인했다.

출시 검토를 다시 진행하려면 최소한 다음이 필요하다.

1. QA-001–007 수정 후 같은 HTTP/브라우저 시나리오를 재실행하고 DB 금액·방문·멱등성 불변식을 확인한다.
2. 고객 호출·옵션·수량·결제 이력 및 실패 응답(QA-008–013)을 수정하고 실제 화면 회귀 검증을 수행한다. SSE fallback/health(QA-014–015)는 운영 요구에 맞게 검증한다.
3. 테스트 전용 staging에서 최종 배포 artifact·환경 변수·CORS·deep link·cache·migration 검증을 완료한다.
4. 실제 모바일/iPad 핵심 주문·정산·키보드 검증 및 남은 동시성/재접속 시나리오를 수행한다.

본 작업에서는 수정 방향만 제안했으며 제품 코드를 변경하거나 배포하지 않았다.
