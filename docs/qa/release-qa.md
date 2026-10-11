# 2차 대형 배포 전 기능 QA

**배포 판단: 보류.** 정상 주문·조리·서빙·할인 결제와 인증의 로컬 통합 흐름은 통과했지만, P1 2건(가격 overflow로 0원 주문, 필수 요청 ID 누락 시 중복 주문)이 남았다. P2 3건과 정책 확인 항목도 있다. 외부 staging/CDN 및 실제 기기 검증은 수행하지 않았다. 제품 코드는 수정하지 않았다.

상세 재현 절차·기대/실제 결과·영향·원인·관련 줄 번호는 [release-issues.md](release-issues.md)에 기록했다. 이전 [pre-release-qa.md](pre-release-qa.md)의 과거 결과를 이번 결과로 재사용하지 않았다.

## 1. 코드 버전과 환경

| 항목 | 검증 기준 |
|---|---|
| 날짜 | 2026-09-22, Asia/Seoul. API trace는 UTC |
| 브랜치 | `feat/qr-welcome-embers` |
| HEAD | `44a61677047e6109f65b76376154878ba026772d` |
| 최초 미커밋 변경 | `qr-order-frontend/src/components/staff/TableFloorPlan.tsx`, `src/hooks/useFloorPlanView.ts` 수정; `src/hooks/useFloorPlanView.test.tsx` 미추적 |
| 변경 보존 | 위 3개 SHA-1을 시작·종료 시 대조. 모두 동일. checkout/reset/commit 없이 QA 문서·재현 도구만 추가 |
| 지침 | 저장소와 상위 경로에서 AGENTS.md 미발견. README, UX-STRUCTURE, 마이그레이션/운영 정책/기존 QA 수정 PR 문서, 실행 설정·코드 검토 |
| OS/runtime | macOS 26.6.2 arm64; Node 25.9.0, npm 11.12.1; Temurin JDK 21.0.10 사용(기본 java는 26이므로 override); Docker 29.3.1 |
| 애플리케이션 | React/TypeScript/Vite 8.2.2, Spring Boot 4.1.1. Vitest 실행 버전 4.1.11 |
| DB | 일회용 `postgres:17-alpine` (17.11); 컨테이너 `qr-order-release-qa-20260922`; loopback `55433`, DB `qr_order_qa` |
| 테스트 주소 | API `http://127.0.0.1:18081`; 장애 프록시 `http://127.0.0.1:18082`; production Vite preview `http://localhost:4179` |
| 브라우저 | Codex In-app Browser. 엔진 상세 버전은 도구에서 확인하지 못함. 390×844 고객, 1024×768 운영 태블릿, 1440×900 운영 데스크톱 **뷰포트 에뮬레이션** |
| 인증/데이터 | 로컬 합성 passcode·서명 secret, API 생성 QR, QA 이름만 사용. 운영 URL·DB·실결제·배포 접근 없음 |

현재 경로는 **Firebase Hosting → Cloud Run Spring API → Cloud SQL PostgreSQL 17**이다. `firebase.json`, `cloudbuild.yaml`, `infra/main.tf`, 양쪽 README 및 `docs/qr-order/spring-gcp-migration.md`가 일치한다. `apps-script/`, Netlify는 추적/Cloud Build 업로드에서 제외된 legacy이므로 N/A. 로컬 `.env.local`에는 legacy 변수만 있고 `.env.development.local`에는 외부 API proxy 설정이 있어, 이번 검증에서는 API 주소를 명시적으로 loopback으로 덮어썼다. 실제 외부 서비스에 테스트 요청하지 않았다.

최신 `docs/qr-order/event-and-visit-policy.md`를 우선했다. 메뉴 옵션은 V7에서 제거되어 옵션 필수 선택·선택 수 제한·옵션 조합은 **N/A**다. 대신 엽전 주문, 입장/방문 분리, 개별 조리·서빙, 메뉴 영구 삭제 보존 정책을 포함했다.

## 2. 실행 명령과 결과

| 명령/작업 | 결과 | 증거·주의 |
|---|---|---|
| frontend `npm run test` | PASS — 10파일, 40테스트 | [로그](release-evidence/frontend-test.log). jsdom/단위·mock 검증이며 실제 API 검증과 별개 |
| frontend `npm run lint` | PASS | [로그](release-evidence/frontend-lint.log) |
| `VITE_API_BASE_URL=http://127.0.0.1:18081 VITE_ENABLE_MOCKS=false npm run build` | PASS | [로그](release-evidence/frontend-build.log) |
| backend JDK21 `./gradlew test bootJar` | build PASS, 최초 test는 UP-TO-DATE | [로그](release-evidence/backend-checks.log). 캐시를 새 테스트 실행으로 세지 않음 |
| backend JDK21 `./gradlew test --rerun-tasks` | PASS — 46개, 실패/skip 0 | [로그](release-evidence/backend-test-fresh.log), [케이스 목록](release-evidence/backend-tests-summary.json). Testcontainers 실제 PostgreSQL 17, 45개 API/서비스 통합 + 1개 실제 HTTP capacity 테스트 |
| `VITE_API_BASE_URL=http://127.0.0.1:18082 VITE_ENABLE_MOCKS=false npm run build` | PASS | [브라우저용 build](release-evidence/frontend-proxy-build.log). 실제 로컬 API 앞 장애 프록시 사용 |
| `VITE_API_BASE_URL='' VITE_ENABLE_MOCKS=true npm run build` | PASS — 의도한 build 거절 | `VITE_API_BASE_URL is required` [로그](release-evidence/missing-api-build.log). 명령 자체 exit 1이 기대 결과 |
| `python3 docs/qa/release-start.py` | PASS | 전용 DB로 API 기동, Flyway V1~V10 + Hibernate validate |
| `python3 docs/qa/release-api-qa.py` | 실행 완료; assertion 80 PASS / 3 FAIL | [결과](release-evidence/api-results.json), [trace](release-evidence/api-trace.json), [실행 로그](release-evidence/api-run.log) |
| `python3 docs/qa/release-extra-qa.py` | 실행 완료; assertion 6 PASS / 3 FAIL | [결과](release-evidence/extra-results.json), [trace](release-evidence/extra-trace.json) |
| 브라우저 직접 조작 + 0원 주문 추가 재현 | 완료, 아래 표 | [0원 주문 증거](release-evidence/zero-price-order-proof.json), browser 증거 |
| QA DB 중지 → health 조회 → DB 재시작 | PASS | liveness 200 UP, readiness 503 DOWN(3.02초); [증거](release-evidence/db-down-health.json). 재기동 후 readiness 200 UP |
| `git diff --check` / 사용자 3파일 hash 검증 | PASS | 종료 점검 로그 |

스크립트의 종료 코드 0은 **실행 완료** 의미이며 assertion의 FAIL을 숨기지 않는다. 전체 92개 HTTP assertion 중 86 PASS, 6 FAIL. 6 FAIL은 원화 가격 2, 수량 2, 요청 ID 1, 호출 수명 가정 1이며, 호출 수명은 정책 확인 필요로 재분류했다. 브라우저 결함 2개는 이 92개와 별도로 기록했다.

초기 harness 작성 중 CSV ID 형식(`S-001`)과 서비스 주문 필드(`menuId`)를 잘못 사용한 오류, 결제 경합의 허용 응답을 409만으로 제한한 assertion 오류를 바로잡았다. **최종 API 결과는 빈 DB에서 처음부터 다시 실행한 결과**다. 결제 완료 뒤 404 `OPEN_SESSION_NOT_FOUND`도 정상 직렬 처리 결과로 인정하며 DB paid 금액 불변식을 별도 확인했다. 브라우저 증거는 그 전의 독립 실행 라운드이므로 최종 API trace의 주문번호와 같아도 동일 주문으로 해석하면 안 된다.

## 3. 기능별 결과

PASS는 표에 적은 시나리오에 한한다. `API`는 실제 HTTP·PostgreSQL, `IT`는 이번에 재실행한 기존 통합 테스트, `UI`는 실제 로컬 backend와 연결된 브라우저다.

| 영역/시나리오 | 결과 | 검증 방법·범위 |
|---|---|---|
| 정상 QR / 누락 / 형식 오류 / 다른 테이블 토큰 / 없는 테이블 | PASS | API 모두, UI 정상·누락·잘못된 QR. 이전 정상 테이블로 자동 복귀하지 않음 |
| 비활성 테이블 | PASS | API bootstrap 410; 운영 배치도 비활성 버튼 |
| 영업 종료 | FAIL | API 저장 차단 PASS, UI 안내/사전 차단 누락 RQA-005 |
| 카테고리·메뉴 상세·가격·품절 | PASS | API 카탈로그; UI 메인/일반·이벤트 목록, 상세; 운영 품절 변경 → 고객 버튼 disabled |
| 옵션 선택·옵션 조합 | N/A | 최신 확정 정책으로 제거. legacy selectedOptionIds 전송은 4xx |
| 장바구니 추가·수량 수정·합계 | PASS | UI 닭발 1→2(20,000원)→1(10,000원); API 수량 0,-1,11,1.5,문자열,overflow 차단; 최대10 허용 |
| 장바구니 삭제·최대 수량 버튼 전수 | NOT RUN | 코드 경로 검토만. 삭제 모달과 UI 10개 상한 클릭은 직접 실행하지 않음 |
| 주문 확인·완료·조회·누적 금액 | PASS | UI/API; A-1064 10,000원. 요청사항 정상/201자 거절은 API. 고객 note 입력 UI는 N/A/확인 필요 |
| 주문 버튼 연타·같은 ID 4개 동시 재전송 | PASS | UI dblclick + DB 한 건, API 동일 결과 |
| 서버 commit 후 응답 유실·새로고침·재시도 | PASS | 실제 API 저장 후 프록시가 응답을 버리고 502 반환; UI 재시도 후 동일 주문 한 건 [DB](release-evidence/browser-idempotency-db.txt) |
| 동일 ID 다른 payload | PASS | 고객 주문·호출·서비스·결제 409 |
| 요청 ID 없는 같은 주문 재전송 | FAIL | API 두 주문 생성. RQA-002 |
| 새로고침·직접 `/t`, `/cart/confirm`, `/staff/payment` | PASS | UI 상태 복원·라우팅 및 운영 인증 유지 |
| 브라우저 뒤로가기·탭을 닫았다 다시 열기 | NOT RUN | 화면의 뒤로/메뉴 이동 일부만 실행. 브라우저 history 및 새 탭 재접속 조합은 미실행 |
| 다른 QR의 인증·장바구니·주문 분리 | PASS (부분) | T21 미제출 cart → T22 `/cart` 비어 있음 → T21 confirm 복원; 고객 주문 cross-table 404. 다른 QR 이동 중 in-flight 응답 경합은 NOT RUN |
| 직원 호출 생성·취소·replay·제한 | PASS | API 생성·취소·중복429·교차 취소404; UI 생성 및 운영 확인 후 polling 해제 |
| 결제 후 호출 수명 | BLOCKED | 현상 재현, 기대 정책 필요. RQA-C01 |
| 로그인 실패·성공·직접 보호 화면/API | PASS | UI 잘못된 passcode/정상 인증/보호 화면 login redirect; API staff/admin/events 401 |
| 만료·해제 토큰 | PASS | 합성 secret로 서명한 만료 토큰 401; epoch 해제 후 UI login 이동 |
| 수동 로그아웃 | N/A / 확인 필요 | 노출된 기능 없음. 인증 해제 경로는 위에서 검증 |
| 테이블 현황·상세 | PASS | 30개 fixture, 기존 사용자 배치도 변경 포함; 23개 외 테이블도 별도 목록 표시 |
| 운영 주문 생성·수정·취소 | PASS / FAIL | 정상 생성·replay·수량3·항목취소 API PASS; 소수/overflow RQA-003. 생성 UI는 폐기된 범위 |
| 주방·개별 조리·서빙 | PASS | UI T20 1개 시작→완료→서빙; 고객은 실제 서빙 후 완료. 복수 개/묶음 경계·stale 요청은 IT |
| 할인·이동·합석·분리 | PASS (부분) | API 합계30,000→할인24,000, 분리 subtotal 보존, 이동 양쪽 QR 동일 주문. UI 20% 할인. 토폴로지 모달 전수는 NOT RUN |
| 결제 확정·동시성·새 방문 | PASS | UI 10,000→8,000원 가상 결제; 고객 내역 비움. API 결제2개 동시, stale금액/세션/ID충돌 차단, 다음 방문 유지 |
| 주문/결제·수정/결제 경합 | PASS (표본) | 각 2 worker, 404/409 또는 새 방문의 유효한 직렬 결과. PAID snapshot mismatch 0. IT 교차 경합도 PASS |
| 메뉴 가격 변경·snapshot | PASS / FAIL | 정상 가격변경 고객409, 기존 주문10,000원 유지, 삭제 후 이력 보존·ID재사용 차단. 비정상 가격 RQA-001 |
| 설정 편집·반영 | FAIL | 품절·EVENT_OPEN 서버 반영 PASS, 미저장 편집 유실 RQA-004. 표시 매장명 정책은 고정 브랜드와 설정의 역할 확인 필요 |
| QR 재발급 | PASS | API T18 rotate 후 이전 QR 401. 다운로드/인쇄 UI는 NOT RUN |
| 엽전 주문·수령·청구 분리 | PASS | UI 9개 주문 dblclick 한 건, API 원화0/엽전18·수령 전 서빙/정산409·동시수령·서빙·0원 세션종료 |
| 직원 명단·서비스·정산 | PASS (API/IT) | 합성 직원1명 import, 서비스10,000→부담8,000/고객0, replay/충돌, 정산확정·되돌리기·재확정. UI 전수 NOT RUN |
| 판매 통계·예약·운영일 전환 | PASS (IT만) | 이번 IT의 할인 분류/엽전 집계/개별단위/시작 시각 cutover 케이스. 개별 HTTP/UI 전수는 NOT RUN |
| SSE 종료 → polling / 재연결 | PASS (단기) | 고객 약15~17초, 운영 queue 약10초 fallback. 503 해제 후 SSE200 및 후속 품절 이벤트 반영 |
| 화면 반복 이동 중 구독 누적 | NOT RUN | 여러 이동은 했지만 활성 연결·메모리 수를 계측하지 않음. unit cleanup 테스트로 실측 대체하지 않음 |
| 4xx/5xx·느린 응답 복구 | PASS (주입 범위) | 409 종료 메시지, 502 주문 복구, fail-all503→다시 시도, 12.044초 지연→disabled 후 성공 |
| 무한 응답 대기·OS offline·물리 네트워크 단절 | NOT RUN | 프록시 HTTP 장애와 유한 지연만 사용. 일반 fetch 자체 timeout 부재는 코드 관찰이지 영구 멈춤 실행 결과가 아님 |
| 반응형·모달·버튼 가림 | PASS (관찰 범위) | 고객390×844, 운영결제1024×768 modal 입력/확정, 설정1440×900. 확인한 화면에서 버튼 가림 없음 |
| 실제 모바일/iPad·OS 키보드·safe area·카메라 QR | NOT RUN | 해당 기기 미사용. viewport와 실제 기기를 혼동하지 않음 |

## 4. 심각도순 결함

| ID | 심각도 | 구분 | 제목 |
|---|---|---|---|
| RQA-001 | P1 | 실행으로 재현 | 가격 overflow가 0원 저장·주문으로 전파 |
| RQA-002 | P1 | 실행으로 재현 | 필수 요청 ID 누락 시 동일 요청이 중복 주문으로 저장 |
| RQA-003 | P2 | 실행으로 재현 | 운영 수량 소수·overflow 절삭 허용 |
| RQA-004 | P2 | 실행으로 재현 | 다른 주문 수신으로 설정 미저장 입력 유실 |
| RQA-005 | P2 | 실행으로 재현 | 영업 종료를 최종 주문에서만 안내 |

P0는 발견하지 못했다. 범위 전체에 P0가 없음을 보장하지 않는다. P1 2건은 **API 계약 위반/경계값**이며 정상 UI 주문 멱등성 PASS와 구별한다. 정책 후보 C01~C03은 확정 결함에 포함하지 않았다.

## 5. 브라우저·배포 증거와 한계

- 고객 [주문 화면](release-evidence/mobile-order.png), [응답 유실](release-evidence/lost-response.png), [종료 오류](release-evidence/closed-order.png)는 실제 파일390×844. [태블릿 결제](release-evidence/tablet-payment.png)는1024×768. 직접 이미지를 열어 버튼·금액·모달 배치를 확인했다.
- [브라우저 console 수집](release-evidence/browser-console.json)은 두 탭 모두 error/warn 0개였다. 도구가 수집한 범위의 결과이며 브라우저 DevTools 전체 Network export와 동일하지 않다.
- [프록시 trace](release-evidence/proxy-trace.jsonl)는 인증 header/body를 기록하지 않는다. 502 1회, 주입503 17회, 영업종료409 1회, 토큰해제401 5회를 관찰했다. 이는 위 의도된 시나리오로 분류했다. proxy 밖 이미지·정적 asset 요청은 포함하지 않는다.
- 정상/장애 시 SSE와 polling은 확인했지만 장시간 연결, 재시작·복수 Cloud Run 인스턴스, 누락 이벤트 재생·연결 수 증가, 장시간 부하는 이번 추가 수동 검증에서 미실행이다. 기존 capacity IT는 실행했지만 이를 실제 운영 부하 보장으로 일반화하지 않는다.

| 배포 항목 | 결과 | 범위/잔여 조건 |
|---|---|---|
| Hosting·deep link | 코드 확인 + 로컬 PASS | Firebase `/staff`, `/staff/**`→staff.html, 나머지→index.html. Vite preview 직접 진입 확인. 실제 CDN rewrite는 NOT RUN |
| API URL·mock | PASS | production API 누락은 mock flag와 무관하게 build 거절. 로컬 주소를 주입한 production build와 실제 DB 사용. 최종 배포 substitution 값은 NOT RUN |
| CORS | 로컬 PASS | 명시 허용 origin200/다른 origin403; POST SSE/Bearer는 로컬 프록시 사용. 외부 실제 origin NOT RUN |
| 캐시 | 코드 근거로 확인 | Firebase assets 1년 immutable, `/*.html` no-cache. 확장자 없는 rewrite 경로의 실제 응답 header·구버전 chunk 업데이트 NOT RUN |
| 배포 파이프라인 | 코드 근거로 확인 | Cloud Build frontend test/lint/build, backend test, image→Cloud Run→readiness smoke→Hosting. 실행/배포하지 않음 |
| CI runtime | NOT RUN | Cloud Build Node22.12, JDK21. 이번 호스트 Node25.9이며 Node22 별도 재현 안 함 |
| DB migration | 빈 DB PASS | V1~V10 모두 성공, Hibernate validate, Testcontainers 실행 가능. 실데이터가 있는 이전 버전→V10 upgrade·backup restore·락 시간 NOT RUN |
| Health | 로컬 PASS | DB down readiness503/liveness200, 복구 후UP. Cloud Run 실제 probe/traffic NOT RUN |
| Secret/OpenAPI | 코드 근거로 확인 | Terraform Secret Manager 주입, production OpenAPI/Swagger false. 배포 환경의 실제 값·권한·회전 NOT RUN |
| 운영일 전환 | IT PASS | migration 자체는 starts_at을 설정하지 않음. 실제 행사 예정 시각/운영 DB cutover 설정은 확인하지 않음 |

테스트 전용임이 확인된 외부 staging 정보가 없으므로 외부환경을 사용하지 않았다. 외부 재검증에는 테스트 origin, 격리 DB/fixture, 배포 artifact와 환경변수 구성, 실제 기기가 필요하다. 이는 로컬 핵심 검증을 중단할 이유가 아니므로 로컬 가능한 검증을 완료했다.

## 6. 재현 방법과 데이터 정리

아래는 **새 일회용 DB**에서 한 번 실행하는 절차다. 이미 존재하는 동일 이름의 컨테이너를 덮어쓰지 않는다. 테스트 인증 상수는 로컬 fixture 전용이며 운영에 사용하지 않는다.

```bash
# repo root; Docker daemon 및 JDK21 필요
export JAVA_HOME="<JDK21 경로>"
export QA_JAVA_HOME="$JAVA_HOME"
(cd qr-order-backend && ./gradlew test --rerun-tasks && ./gradlew bootJar)
docker run -d --name qr-order-release-qa-20260922 \
  -p 127.0.0.1:55433:5432 \
  -e POSTGRES_DB=qr_order_qa -e POSTGRES_USER=qa \
  -e POSTGRES_PASSWORD=local-release-qa-only postgres:17-alpine
python3 docs/qa/release-start.py
# 별도 terminal: readiness UP 확인 후
python3 docs/qa/release-api-qa.py
python3 docs/qa/release-extra-qa.py
python3 docs/qa/release-fault-proxy.py
# 별도 terminal
cd qr-order-frontend
VITE_API_BASE_URL=http://127.0.0.1:18082 VITE_ENABLE_MOCKS=false npm run build
VITE_API_BASE_URL=http://127.0.0.1:18082 npm run preview -- --host 127.0.0.1 --port 4179 --strictPort
```

프록시 모드는 `/tmp/qr-order-release-qa/fault.json`의 `mode`: `drop-next-order`(실제 commit 후502), `sse-off`, `fail-all`, `hang-order`(12초), 또는 `{}`. 원본 인증은 로그로 출력하지 않는다. [control 도구](release-control.py)는 loopback API만 조작하며 설정/품절/운영 API 재현을 돕는다.

- 두 라운드(브라우저 라운드, 최종 API 재실행)를 분리했다. 마지막 DB에는 테이블30개, 주문23개(0원 재현 포함), 호출3개, 합성 직원1명이 있었다. DB 생성 시 기본 메뉴19개 및 QA 경계값 메뉴를 추가/삭제했다. [최종 DB 검증](release-evidence/final-db.txt), [0원 추가 주문](release-evidence/zero-price-order-proof.json).
- QA 컨테이너·전용 볼륨 및 직접 실행한 API/preview/proxy를 정리했다. 기존 `wevo-postgres`, `wevo-redis`에는 손대지 않았다. Testcontainers도 테스트 수명주기로 정리되었다.
- QA 브라우저 탭을 닫고 viewport override를 reset했다. 브라우저 localStorage는 별도 삭제하지 않았으며 남은 합성 인증은 삭제된 일회용 DB용이다. 실제 사용자 origin의 저장소를 조작하지 않았다.
- 임시 원문 QR/인증·backend 로그·초기 diff 사본은 `/tmp/qr-order-release-qa`에서 삭제했다. 추적할 증거는 인증 필드 마스킹을 확인했다.
- QA API 주소를 포함한 frontend `dist`는 배포용이 아니므로 정리했다. 소스·기존 사용자 변경은 보존했다.

## 7. 출시 재판정 조건

1. RQA-001/002 수정 후 비정상 입력 거절, DB 미생성/기존 금액 보존, 정상 멱등 replay 회귀를 통과해야 한다.
2. RQA-003~005 수정 또는 명시적인 릴리스 수용 결정을 남기고, 설정 draft·영업 종료·수량 경계 화면/API를 재검증한다.
3. 호출 종료와 고객 할인 합계·수동 로그아웃의 정책을 확정한다.
4. 테스트 전용 staging에서 최종 artifact, CORS, deep link/cache, 기존 DB migration을 검증하고 실제 모바일/iPad 핵심 주문·결제·키보드 검증을 완료한다.

이번 결과만으로 배포 가능으로 판단하지 않는다. 테스트 통과 수와 별개로 확인된 P1이 남아 있다.
