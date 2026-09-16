# 메뉴 옵션 제거와 테이블 입장·예약·엽전 주문 지원

빈 테이블을 입장 전에 합석하고 예약 퇴장 시간을 관리할 수 있도록 방문 상태를 확장한다. 고객은 일반 주문과 별도로 엽전 주문을 접수하며, POS는 음식과 음료를 담당 화면에 나누어 표시하고 엽전 수령·서빙·판매 통계를 각각 기록한다. 사용하지 않는 메뉴 옵션은 화면·API·DB에서 제거한다.

작업 브랜치는 `feat/event-management`다. Figma 원본을 유지하고 기존 화면 아래에 만든 `입장·엽전 운영 v3` 사본을 구현 기준으로 사용했다.

## 대표 동작

1. 빈 T17과 T18을 합치면 입장 시간 없이 준비 상태가 된다. 관리자가 입장 처리하거나 둘 중 한 테이블에서 고객이 주문하면 그룹 전체가 활성화된다. 이후 예약 시간을 지정해도 최초 입장 시각은 유지한다.
2. 닭발과 소주를 함께 주문하면 닭발은 주방에, 소주는 서빙에 즉시 표시된다. 닭발은 조리 완료 후 서빙으로 이동한다.
3. 소주 2개를 엽전으로 주문하면 원화 결제액은 0원, 필요한 엽전은 18개다. 수령 전에는 미수령 18개로 집계하고, 직원 수령 확인 후 실제 사용량 18개로 반영한다. 반복 수령 요청으로 사용량이 증가하지 않는다.
4. 원화 주문에 학생회비 할인을 적용해 결제하면 해당 원화 판매만 할인 금액으로 재분류한다. 같은 방문의 엽전 주문에는 할인이 적용되지 않는다.

## 변경 결과

- 고객·POS·Spring API에서 메뉴 옵션을 제거했다. Flyway V7은 `order_item_options`, `options`, `option_groups`를 삭제하며 기존 주문 수량·단가 스냅샷·결제 금액은 재계산하지 않는다.
- 빈 테이블도 `PREPARED` 방문으로 미리 합칠 수 있다. 이 상태에서는 입장 시간이 없다. 관리자 입장 또는 첫 고객 주문이 그룹 전체를 활성화하고, 이미 시작된 입장 시간은 유지한다.
- 테이블마다 입장 경과 분과 예약 퇴장까지 남은 분 또는 초과 분을 표시한다. 당일 방문은 제한 없음이다. 날짜를 포함한 KST 예약 시각을 DB에 저장하며 19:50·21:50·23:50·다음 날 01:50을 제안/선택한다.
- 주류·음료는 접수 즉시 서빙으로, 조리 메뉴는 주방으로 보낸다. 한 주문에서도 항목별로 나뉘며 주방 완료와 실제 서빙 완료가 분리된다.
- 고객의 `이벤트 주문`은 일반 주문과 장바구니·접수 요청을 분리한다. 주문 내역은 일반/엽전 주문을 함께 표시하되 결제 단위를 구분한다.
- 엽전 가격은 소주·맥주 9개, 바나나우유 하이볼·믹스커피 하이볼 10개, 식혜·얼박사 8개다.
- 서빙 탭의 엽전 수령 확인은 주문별 한 번만 기록한다. 필요한 수량이 바뀌면 재확인을 요구하며, 수령 전 서빙 완료를 거부한다.
- 판매 통계에 엽전 판매 수량·수령한 엽전·미수령 엽전을 추가했다. 엽전에는 학생회비/서비스 할인을 적용하지 않고 원화 매출에 합산하지 않는다.
- 결제 완료 시 합석 그룹 전체 방문을 종료한다. 엽전만 주문하여 원화가 0원인 방문도 별도 입금자 입력 없이 종료할 수 있다.

## Figma

- [테이블 배치와 시간 표시](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=390-4947)
- [테이블 상세·예약 변경](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=390-5027)
- [입장·예약 선택](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=391-11051)
- [주방](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=390-5614) / [서빙·엽전 수령](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=390-5641)
- [판매 통계](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=390-5660)
- [이벤트 메뉴](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=391-12157) / [엽전 장바구니](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=391-12293)
- [일반·엽전 주문 내역](https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS?node-id=391-12081)

POS 원본 12개 화면의 텍스트가 변경되지 않았음을 작업 전 기준과 비교했다. 새 화면만 수정했으며, 기존 배치 방향과 T17~T19 위치를 유지했다.

## API·DB

- `POST /api/v1/staff/tables/check-in`: `tableId`, `expectedSessionId`(기존 방문이면 전달), `departureAt`(ISO 8601 또는 null).
- `POST /api/v1/staff/orders/coins/receive`: `orderId`, `expectedCoinTotal`. 인증된 직원만 사용한다.
- 고객 주문 생성의 `paymentMethod`: `KRW`(기본값) 또는 `COIN`. `expectedTotalAmount`는 해당 결제 단위의 합계다. 주문 항목은 `menuId`, `quantity`만 받는다.
- 메뉴 응답: `coinPrice`, `preparationStation`. 주문 응답: `paymentMethod`, `coinTotal`, `coinReceived`, 항목별 `coinUnitPrice`, `preparationStation`.
- 테이블 응답: `sessionStatus=PREPARED|OPEN|EMPTY`, `openedAt`, `departureAt`. PREPARED도 합석 그룹은 표시한다.
- 통계 응답: 기존 분류 외 `type=COIN`, `receivedCoins`, `pendingCoins`. COIN의 `amount`는 0이다.
- 실제 수령 시각/운영 기기는 `orders.coin_received_at`, `coin_received_by`에 보존한다. 통계 조회 날짜는 기존처럼 주문일 기준이며 해당 주문의 수령 여부가 이후 갱신된다.
- 방문/합석/수령 변경은 트랜잭션으로 직렬화하고, SSE를 발행해 다른 기기의 조회를 갱신한다.

## 경계 동작

- 미수령 엽전이 남아 있으면 결제로 방문을 종료할 수 없다. 먼저 수령하거나 미수령 주문을 취소한다.
- 마지막 엽전 항목을 취소하면 주문 전체도 취소 처리하여 0개 미수령 주문이 남지 않는다.
- 수령한 엽전 주문은 수량 변경·항목 취소·전체 취소·테이블 초기화로 수령 기록을 지울 수 없다. 서빙과 결제 완료로 방문을 종료한다. 별도 실물 엽전 환불 기능은 이번 범위에 포함하지 않는다.
- 예약 시각 경과로 자동 퇴장/주문 차단하지 않는다. 기존 입장 시간을 다시 설정하지 않는다.
- 서비스 주문은 기존 직원 부담 할인 스냅샷을 유지하며 엽전 주문으로 생성하지 않는다.

## 검증

아래 결과는 구현 완료 시 실행한 검증 기준이다.

- PostgreSQL Testcontainers 통합 테스트 **31개 통과**: 기존 주문·합석·결제·서비스·SSE 회귀 및 신규 요구사항.
- V6 데이터에 과거 옵션과 유료 옵션 단가를 넣고 V7로 이행하여 옵션 테이블 삭제, 수량 2·단가 11,500원·금액 23,000원 보존 확인.
- 동시 고객 주문/입장, 동시 엽전 수령, 잘못된 수령 수량, 수령 전 서빙, 결제 후 주문 수정, 원화/엽전 통계 분리, 원화 0원 방문 종료 확인.
- 프런트엔드 **18개 테스트 통과**: 예약 날짜 경계·경과/초과 분·사전 합석 매핑·통계 집계 테스트, TypeScript/Vite 빌드와 ESLint 통과.
- 로컬 브라우저에서 이벤트 메뉴 6종·장바구니 19개·접수·엽전 주문 내역, POS 예약 선택·시간 표시·수령 후 서빙 버튼 전환·통계 펼침 확인.

재현 명령은 각 프로젝트 디렉터리에서 실행한다. 백엔드는 Java 21과 Docker가 필요하다.

```sh
# qr-order-backend
bash gradlew test --no-daemon

# qr-order-frontend
npm run test
npm run lint
VITE_API_BASE_URL=http://localhost:8080 npm run build
```

## 배포 및 호환성

- 운영 환경 배포와 운영 DB 마이그레이션 실행은 하지 않았다.
- V7은 옵션 테이블과 과거 옵션 내역을 삭제한다. 기존 주문 수량·금액은 보존하지만 삭제한 옵션 내역은 애플리케이션 롤백만으로 복원되지 않는다.
- 구버전 API는 삭제된 옵션 테이블을 참조하므로 V7 적용과 새 백엔드·프런트엔드 배포를 함께 진행해야 한다. `selectedOptionIds`를 보내는 구버전 클라이언트도 갱신해야 한다.
- 실물 엽전 환불 기능은 포함하지 않는다. 수령 완료 후 주문 취소를 제한하는 동작은 위 경계 동작에 명시했다.
- 기존 `infra/main.tf` 변경은 이번 PR 범위에서 제외한다.

관련 정책: [입장·예약·엽전 주문 확정 정책](../qr-order/event-and-visit-policy.md).
