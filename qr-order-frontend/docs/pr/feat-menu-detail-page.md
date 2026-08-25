# 개요

Figma `ui-ux` 파일의 **S04 — Menu Detail**(메뉴 상세) 화면을 구현했습니다.
뒤로가기가 있는 앱바, 히어로 영역, 메뉴명·가격·설명·알레르기 정보, 필수/선택
옵션 그룹, 수량 스테퍼, 그리고 실시간 합계를 표시하는 하단 고정 담기 버튼으로
구성됩니다.

옵션 선택·수량 변경에 따라 합계가 즉시 반영되며, 필수 옵션 그룹이 충족되지
않으면 담기 버튼이 비활성화됩니다.

## 변경 사항

### 화면

- `src/pages/MenuDetailPage.tsx` / `.css` — S04 화면 구성과 페이지 수준 상태
  (옵션 선택, 수량). 필수 그룹이 선택 항목보다 위로 정렬됩니다.

### 추가한 컴포넌트

| 컴포넌트 | Figma 노드 | 비고 |
|---|---|---|
| `OptionSelector` | `OptionSelector` (10:44) | Radio/Check × Unselected/Selected/Pressed/Disabled 전체 상태 |
| `OptionGroup` | `OptionGroup` (15:51, 15:67) | 그룹 헤드(라벨 + 필수/선택 칩) + 옵션 행 |
| `QuantitySelector` | `QuantitySelector` (9:20) | Min/Normal/Max 상태, 32×32 시각 크기 + 48×48 히트 영역 |

### 수정한 컴포넌트

- `AppBar` — 선택적 `onBack` 추가. S04는 뒤로가기 + 타이틀, S02는 타이틀 +
  장바구니 칩을 쓰므로 `cartCount`도 선택적으로 변경했습니다. 화면별로 앱바를
  복제하지 않고 하나를 재사용합니다.
- `Badge` — `size` 추가(`xsmall` 6/2, `small` 8/3). S02 품절 배지는 `xsmall`,
  S04 필수/선택 칩은 `small`로 Figma 지오메트리가 서로 다릅니다.

### 지원 파일

- `src/types/menu.ts` — `MenuOption`, `MenuOptionGroup`, `MenuItemDetail` 추가.
  `CartLine`에 `selectedOptionIds` 추가.
- `src/data/menu.ts` — 전 메뉴에 옵션 그룹·알레르기·원산지 목 데이터 추가.
- `src/assets/radio-selected.svg`, `radio-unselected.svg` — Figma에서 내보낸
  라디오 컨트롤 에셋.

### 추가한 디자인 토큰

- `--color-border-selected: #3182f6` — 선택된 행의 테두리
- `--radius-md: 6px` — 체크박스 박스
- `--radius-row: 12px` — 전체 너비 선택 행 (칩은 8, UX-STRUCTURE §4.3)
- `--layout-hero-height: 160px`

### 화면 연결 (프레임 범위 밖)

S04는 단독으로는 도달할 수 없으므로 최소한의 연결을 함께 넣었습니다.

- `src/App.tsx` — 로컬 상태 기반 화면 전환. 메뉴 행을 누르면 상세로,
  뒤로가기/담기를 누르면 메뉴로 돌아옵니다. 장바구니 상태를 App으로 끌어올려
  담기가 실제로 반영됩니다.
- `src/pages/MenuPage.tsx` — `cart`, `onSelectItem`을 props로 받도록 변경.

이는 실제 라우팅(`/menu`, `/menu/{itemId}`, UX-STRUCTURE §2.1)의 임시
대체물입니다. 라우터 도입 시 교체되어야 합니다.

## Figma

기준 프레임: **`S04 — Menu Detail`**, 노드 `15:39`
(`https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS/ui-ux`).
MCP 응답의 현재 선택 노드와 프레임 이름이 일치함을 확인했습니다.

컴포넌트 세트 `10:44`(OptionSelector), `9:20`(QuantitySelector)도 함께
조회했습니다. 프레임에는 체크박스의 Selected 상태와 스테퍼의 Max 상태가
등장하지 않기 때문에, 상호작용 구현에 필요한 나머지 상태를 컴포넌트 세트에서
가져왔습니다.

Figma 컴포넌트 문서를 다음과 같이 따랐습니다.

- Radio와 Check는 **컨트롤 글리프만 다르고 컨테이너 스타일은 동일**합니다
  (UX-STRUCTURE §4.3).
- 옵션 차액은 `+0원`을 포함해 **항상 부호와 함께 표시**합니다 (§4.4).
- Disabled는 품절을 의미하며 danger 레드가 아닙니다.
- 스테퍼 시각 크기는 32×32, **히트 영역은 48×48로 확장**합니다 (§6.8).
- Min에서 감소 버튼, Max에서 증가 버튼이 비활성화되며 `text/muted`를 씁니다.
- 필수 그룹 미충족 시 담기 버튼은 **숨기지 않고 비활성화**합니다 (§5.3).

## 검증

- [x] `npm run lint` — 통과, 경고 없음
- [x] `npm run build` — `tsc -b && vite build` 성공
- [x] 브라우저 390×844에서 Figma와 비교

프레임 대비 실측(프레임 좌표 = 구현 좌표):

| 요소 | Figma | 구현 |
|---|---|---|
| AppBar | 0, 56 | 0, 56 |
| Hero | 56, 160 | 56, 160 |
| Head | 232, 83 | 232, 83 |
| OptionGroup 1 | 339, 144 | 339, 144 |
| OptionGroup 2 | 507, 144 | 507, 144 |
| 옵션 행 | 52 | 52 |
| QuantityRow | 675, 32 | 675, 32 |
| SafeArea | 810, 34 | 810, 34 |

동작 검증: 옵션 선택 시 합계 반영(공기밥 추가 → 10,000원), 수량 2 →
20,000원, 담기 후 장바구니 3건 / 45,300원으로 갱신, 뒤로가기 복귀,
필수 그룹 미선택 상태(제육볶음)에서 담기 비활성화 → 선택 시 활성화,
품절 옵션 비활성화, 확장 히트 영역 48×48, 320px에서 가로 오버플로 없음.

## 참고 사항

**의도적인 차이**

- **옵션 행 테두리를 `outline`으로 구현.** Figma는 inside stroke라 행 높이가
  정확히 52px, 콘텐츠 인셋이 16px입니다. CSS `border`를 쓰면 54px가 되어
  두 번째 옵션 그룹이 4px, 수량 행이 8px 밀립니다. `outline` +
  `outline-offset: -1px`은 레이아웃을 차지하지 않아 Figma와 정확히 일치하며,
  `box-shadow` 링과 달리 forced-colors 모드에서도 표시됩니다.
- **품절 표기.** Figma는 라벨 텍스트에 "계란후라이 (품절)"로 직접 적혀
  있습니다. 데이터에는 `label: '계란후라이'` + `soldOut: true`로 두고
  `OptionSelector`가 비활성 시 " (품절)"을 덧붙입니다. 렌더링 결과는
  동일하되 데이터가 의미를 갖습니다.
- **필수 그룹 기본 선택.** 프레임은 "보통"이 선택된 상태입니다. 목 데이터의
  `defaultOptionIds`로 재현했습니다. 기본값이 없는 그룹(제육볶음 "양 선택")도
  함께 두어 미충족 시 비활성화 로직이 실제로 동작함을 확인할 수 있습니다.
- **`maxSelections`** 는 타입과 컴포넌트에 구현되어 있으나 현재 목 데이터에는
  사용되지 않습니다. UX-STRUCTURE §5.3의 max-reached 상태 대비입니다.

**한계 / 후속 작업**

- 화면 전환이 `App.tsx`의 로컬 상태입니다. 라우터 도입 시 실제 경로로 교체가
  필요합니다. 뒤로가기 제스처, 딥링크, 새로고침 복원이 아직 없습니다.
- 담기 후 T1 토스트(UX-STRUCTURE §2.2)가 없습니다. 현재는 조용히 메뉴로
  돌아옵니다.
- 장바구니는 여전히 메모리 상태이며 `localStorage` 영속화(§6.2)는
  미구현입니다.
- 히어로는 `bg/surface` 플레이스홀더입니다. 프레임에 이미지가 없으며
  `MenuItemSummary.imageUrl`이 들어오면 렌더링됩니다.
- 옵션 그룹이 4개를 넘을 때의 "옵션 더보기" 시트(§2.4)와 중첩 옵션 계층은
  범위 밖입니다.
- 스켈레톤·오류·오프라인 상태(§5.6)는 이 프레임의 범위를 벗어납니다.
