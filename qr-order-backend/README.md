# QR Order Spring Boot API

Spring Boot 4.1 / Java 21 API that replaces Google Apps Script and Google
Sheets. PostgreSQL is the source of truth and Flyway owns its schema.

## Local development

Start PostgreSQL, copy the non-production values from `application.yml`, then:

```bash
./gradlew bootRun
```

Required production variables:

- `DB_URL`, `DB_USER`, `DB_PASSWORD`
- `TOKEN_PEPPER` — preserve the existing value while printed QR codes remain in use
- `STAFF_PASSCODE_HASH` — `SHA-256(TOKEN_PEPPER + ':' + passcode)`
- `STAFF_TOKEN_SECRET` — independent random secret of at least 32 bytes
- `ALLOWED_ORIGINS`, `FRONTEND_BASE_URL`
- `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` — staging은 `true`, production은 `false`

## OpenAPI / Swagger UI

로컬 기본값과 Terraform staging 배포에서는 Swagger UI가 활성화됩니다.

- Swagger UI: `http://localhost:8080/swagger-ui.html`
- 전체 OpenAPI JSON: `http://localhost:8080/v3/api-docs`
- 기본 전체 JSON: `/v3/api-docs/all`
- 그룹별 JSON: `/v3/api-docs/customer`, `/v3/api-docs/staff`, `/v3/api-docs/admin`

Swagger UI는 `all` 문서를 기본 선택해 모든 API를 태그별로 표시합니다. 상단
definition 선택에서 customer, staff, admin만 따로 확인할 수도 있습니다.

운영·관리 API는 Swagger UI 오른쪽 위 `Authorize`에 로그인 응답의
`staffToken`만 입력합니다. 고객 API는 별도 Authorization header 대신 기존 QR의
`tableId`와 원본 `tableToken`을 request body에 포함합니다. `/events`는 일반 GET
EventSource가 아니라 body와 header를 보낼 수 있는 fetch 기반 POST SSE입니다.

## Private staff roster import

스태프 실명과 소속은 공개 Git 기록에 저장하지 않습니다. 양식은
`docs/examples/staff-members.example.csv`를 복사해 이미 Git에서 제외된
`.local-data/StaffMembers.csv`에 작성합니다. 배포 후 운영 로그인으로 받은
token을 사용해 다음처럼 가져옵니다.

```bash
../scripts/import-staff-members.sh \
  https://api.example.com \
  "$STAFF_TOKEN" \
  .local-data/StaffMembers.csv
```

CSV 열은 `staff_id,name,affiliation,active,sort_order`입니다. 동일 `staff_id`를 다시
가져오면 이름·소속·활성·정렬 값만 갱신하고 기존 정산 상태와 금액은
유지합니다. 명단을 가져온 사실만 AuditLogs에 남고 CSV 내용은 로그에
저장하지 않습니다.

Terraform은 staging에서만 문서 JSON과 UI를 켜고 production에서는 두 endpoint를
모두 비활성화합니다. 로컬에서도 끄려면 두 환경 변수를 `false`로 지정합니다.

## Verification

```bash
./gradlew test
./gradlew bootJar
```

The integration suite uses Testcontainers PostgreSQL 17 and verifies Flyway,
QR authentication, bootstrap, idempotent ordering, calls, staff login,
dashboard snapshots, status updates, call acknowledgement, database login
throttling, concurrent display-number allocation, and merge/split/move/payment
transactions.
It also validates the generated customer/staff/admin OpenAPI documents, Bearer
security declaration, common error envelope, and SSE media type.

## API groups

- `/api/v1/customer/**`: QR table authentication, catalog, orders, calls, SSE
- `/api/v1/staff/**`: passcode login, station operations, dashboard, SSE
- `/api/v1/admin/**`: catalog, settings, tables, token rotation, table/staff roster import
- `/actuator/health/liveness`, `/actuator/health/readiness`: Cloud Run probes
