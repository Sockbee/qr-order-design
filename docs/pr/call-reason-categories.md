# 직원 호출 사유를 물/수저/앞접시/기타 4개로 분리

## 개요

고객이 직원을 부를 때 고르는 사유를 기존 4개(물·수저가 하나로 합쳐진
`WATER_UTENSIL`, 앞접시, 주문 문의, 결제 요청)에서 **물 / 수저 / 앞접시 / 기타**
4개로 바꿨습니다. 물과 수저를 별도 사유로 나누려면 백엔드 enum 자체에 값이
필요해 프론트뿐 아니라 DB·백엔드도 함께 변경했습니다.

## 변경 사항

### 사유 값 분리 (백엔드)

- `qr-order-backend/src/main/resources/db/migration/V2__add_utensil_call_reason.sql`
  — 신규 마이그레이션. `calls.reason` CHECK 제약조건을 드롭 후 `UTENSIL`을 추가해
  재생성. 기존 값(`WATER_UTENSIL`, `SIDE_PLATE`, `ORDER_INQUIRY`, `PAYMENT_REQUEST`,
  `OTHER`)은 그대로 유지되므로 기존 데이터에는 영향이 없습니다.
- `CustomerOrderService.CALL_REASONS` — 허용 사유 목록에 `"UTENSIL"` 추가.
- `OpenApiRequests.CustomerCallCreate` — `@Schema(allowableValues = …)`에
  `"UTENSIL"` 추가.

### 픽커 축소 (프론트)

- `qr-order-frontend/src/types/call.ts`
  - `CallReason`에 `'UTENSIL'` 추가.
  - `WATER_UTENSIL` 라벨을 "물 · 수저"에서 "물"로 축소, `UTENSIL`은 "수저".
  - `CALL_REASON_OPTIONS`(픽커에 실제로 뜨는 목록)를 물/수저/앞접시/기타
    4개로 재구성.
  - `ORDER_INQUIRY`/`PAYMENT_REQUEST`는 픽커에서 제외하되, 과거에 그 사유로
    들어온 호출 기록의 라벨이 깨지지 않도록 `CALL_REASON_LABELS`(전체 사유 →
    라벨 매핑)에는 그대로 남겨뒀습니다. `callReasonLabel()`은 이 전체 매핑을
    보고, 스태프 화면(`CallRow`)이 이 함수를 쓰므로 영향 없음.
  - 아무 사유도 선택하지 않고 호출하면 이전과 동일하게 `OTHER`("기타")로
    전송됩니다.

### 관련 없는 사소한 변경

- `.gitignore`에 `**/bin/` 추가. VS Code Java 확장이 백그라운드 컴파일로
  만드는 `qr-order-backend/bin/`이 소스 컨트롤에 계속 뜨는 걸 막기 위함이며,
  이번 기능과는 무관합니다.

## 검증

- [x] `npm run lint` — 통과, 경고 없음
- [ ] `./gradlew compileJava` — 이 PC의 JDK 25와 Gradle 8.14.4에 내장된 Kotlin
      DSL 컴파일러 간 알려진 비호환(`IllegalArgumentException: 25.0.2`)으로
      빌드스크립트 해석 단계에서부터 실패해 로컬 컴파일 확인을 못 했습니다.
      이번 변경과 무관한 환경 문제이며, 코드 자체는 기존 5개 값 처리 패턴에
      `UTENSIL` 한 값만 추가한 형태라 리스크는 낮다고 판단합니다.
- [ ] 마이그레이션(`V2`) 실행 검증 — 로컬에 Docker/Postgres가 없어 직접 적용해
      제약조건이 의도대로 바뀌는지는 확인하지 못했습니다.
- [ ] 브라우저에서 픽커 4버튼 렌더링 실제 확인 — 아직 안 함.

## 영향 범위

- `calls` 테이블 CHECK 제약조건 확장뿐이라 기존 행에는 영향 없음(마이그레이션은
  추가만, 삭제/변경 없음).
- 고객 API(`POST /api/v1/customer/calls/create`)는 `reason`에 `UTENSIL`을 새로
  허용 — 하위 호환(기존 값들도 여전히 유효).
- 스태프 대시보드는 `callReasonLabel()`을 통해 신규·과거 사유 모두 정상 라벨로
  표시됨.
