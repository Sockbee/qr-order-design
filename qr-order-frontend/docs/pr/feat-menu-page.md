# 개요

Figma `ui-ux` 파일의 **S02 — Menu Browsing**(메뉴 탐색) 화면을 구현했습니다.
상단 고정 앱바와 장바구니 칩, 가로 스크롤되는 고정 카테고리 탭 스트립,
구분선으로 나뉜 메뉴 행 목록(품절 상태 포함), 그리고 현재 장바구니 합계를
표시하는 하단 고정 주문 바로 구성됩니다.

이 저장소의 첫 번째 제품 화면이므로, Vite 스타터 템플릿을 `CLAUDE.md`에 정의된
프로젝트 구조(`components/`, `pages/`, `styles/`, `types/`, `utils/`)로 교체하고
Figma 변수에서 가져온 CSS 커스텀 속성 기반 디자인 토큰도 함께 정립했습니다.

## 변경 사항

### 화면

- `src/pages/MenuPage.tsx` / `.css` — S02 화면 구성과 페이지 수준 상태
  (선택된 카테고리, 장바구니). 카테고리 필터링은 목 데이터에 대해 `useMemo`로 처리합니다.
- `src/App.tsx` — `MenuPage`를 렌더링하도록 변경.
- `index.html` — `lang="ko"`, `viewport-fit=cover`
  (`env(safe-area-inset-bottom)` 사용을 위해 필요), Google Fonts의 Noto Sans KR,
  한글 타이틀 적용.

### 추가한 컴포넌트

| 컴포넌트 | Figma 노드 | 비고 |
|---|---|---|
| `Button` | `tds/Button` (7:74) | 32/r8 · 38/r10 · 48/r14 · 56/r16 전체 사이즈 래더, fill + weak, 너비를 유지하는 boolean `loading` |
| `AppBar` | `ext/AppBar` (14:16) | 높이 56, 고정, 타이틀 + 장바구니 칩 |
| `CategoryTabs` | `ext/CategoryTabs` (14:20) | 앱바 아래 고정, `role="tablist"` + roving tabindex, 좌우 방향키/Home/End 지원 |
| `MenuItem` | `ext/MenuItem` (12:31) | Default + SoldOut 상태, 80×80 썸네일, 1px 구분선 |
| `BottomOrderBar` | `ext/BottomOrderBar` (13:20) | 88px 버튼 영역 + 34px 세이프 에어리어, 비어 있을 때 비활성 |
| `Badge` | `tds/Badge` | 설명 전용, 절대 상호작용 요소가 아님 |

### 지원 파일

- `src/styles/tokens.css` — 신규. 색상, 라디우스, 간격, 타이포그래피 역할,
  레이아웃 상수를 Figma 변수와 동일하게 정의
  (`--color-bg-primary`, `--color-text-strong`, `--radius-btn-xl` 등).
- `src/types/menu.ts` — `MenuCategory`, `MenuItemSummary`, `CartLine`.
- `src/utils/price.ts` — `formatPrice` / `formatPriceDelta`.
  UX-STRUCTURE §4.4 규칙(천 단위 구분자, `원` 접미사, 부호 있는 옵션 차액) 구현.
- `src/data/menu.ts` — 목 메뉴 데이터와 초기 장바구니. API 연동 없음.
- `src/assets/spinner.svg` — Figma Button 컴포넌트에서 내보낸 에셋.
  버튼 로딩 상태에서 사용합니다.

### 삭제

- `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`,
  `src/assets/vite.svg` — Vite 스타터 잔여물. 새 `App.tsx`로 인해 미사용 상태가 됨.
- `src/index.css`의 스타터 스타일(1126px `#root`, 18px 기본 타이포, 다크 팔레트)은
  모바일 우선 리셋으로 교체했습니다. 디자인과 정면으로 충돌하던 부분입니다.

### 추가한 디자인 토큰

색상 `bg-canvas / bg-surface / bg-weak / bg-primary / bg-primary-pressed`,
`text-strong / text-body / text-muted / text-weak / text-on-primary`,
`border-default` · 라디우스 `sm / btn-sm / btn-md / btn-lg / btn-xl` ·
간격 `1–6` (4/6/8/16/24/32) · 타입 역할 `title-screen`, `title-section`,
`body-strong`, `body-default`, `label-button-xl`, `caption-strong`,
`caption-default`, `micro-badge` · 앱바, 탭 스트립, 최소 터치 타깃,
세이프 에어리어 레이아웃 상수.

## Figma

기준 프레임: **`S02 — Menu Browsing`**, 노드 `14:15`
(`https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS/ui-ux`).

**노드 ID 관련 참고.** 작업 시 전달된 URL은 `node-id=14-2`였으나 이는
`S01 — Table Confirmation`으로, 메뉴 화면이 아닙니다. 실제로
"S02 — Menu Browsing"이라는 이름을 가진 프레임은 `14:15`이며, 요청 내용
("Menu Browsing 프레임")과 브랜치명 모두와 일치하므로 이를 기준으로 삼았습니다.
머지 전 확인이 필요합니다.

Figma 컴포넌트에 포함된 문서를 다음과 같이 따랐습니다.

- CategoryTab은 *버튼 성격의 컨트롤이며 Badge가 아님* — 배지는 결코 액션이
  될 수 없습니다 (DESIGN.md §7).
- MenuItem은 1px 구분선과 여백으로 구분하며 **그림자를 쓰지 않습니다**
  (DESIGN.md §6). SoldOut은 비활성 상태이며 danger 레드가 아닙니다.
- 품절 시에도 가격은 `text/body`를 유지합니다. `text/muted`(#8b95a1)는
  4.5:1 대비를 충족하지 못하므로 가격·알레르기·판매 여부를 전달할 수 없습니다.
- BottomOrderBar는 장바구니가 비어 있을 때 액션을 **숨기지 않고 비활성화**합니다
  (UX-STRUCTURE §5.3).
- Button의 `loading`은 pressed/disabled와 직교하며 버튼 너비를 유지합니다
  (DESIGN.md §4).

## 검증

- [x] `npm run lint` — 통과, 경고 없음
- [x] `npm run build` — `tsc -b && vite build` 성공
- [x] 브라우저 390×844에서 Figma와 비교

프레임 대비 실측: 앱바 56px, 탭 스트립 48px + 1px 구분선, 우측 16px 마진에
정확히 맞닿은 80×80 썸네일, XLarge 버튼 56px, 세이프 에어리어 34px,
320px·390px 모두에서 가로 오버플로 없음. 카테고리 전환, 품절 행 비활성화,
탭과 패널 간 aria 연결을 실행 중인 앱에서 확인했습니다.

## 참고 사항

**의도적인 차이**

- **마지막 행의 구분선.** UX-STRUCTURE §4.2는 "마지막 행 뒤에는 구분선 없음"으로
  규정하지만, Figma 프레임은 구분선이 MenuItem 컴포넌트에 속하기 때문에 세 행 모두에
  렌더링합니다. `CLAUDE.md`가 Figma를 문서보다 우선하므로 구분선을 유지했습니다.
  문서 쪽이 의도라면 되돌리기 쉽습니다.
- **설명 한 줄 말줄임.** Figma 프레임은 설명을 한 줄로 자르지만
  UX-STRUCTURE §3은 "최대 2줄"로 규정합니다. Figma를 따랐습니다.
- **480px까지 유동 너비.** 프레임은 390px 고정이지만, 페이지는 모바일 우선
  유동 레이아웃으로 구성하고 태블릿에서 늘어지지 않도록 480px max-width로
  가운데 정렬했습니다 (`CLAUDE.md` §5).
- **fixed가 아닌 sticky.** 앱바, 탭 스트립, 주문 바는 `fixed` 대신 페이지 컬럼
  내부에서 `position: sticky`를 사용합니다. 레이아웃 상수를 중복하지 않고도
  가운데 정렬된 max-width 안에 머무릅니다.
- **세이프 에어리어**는 34px 고정값 대신
  `max(34px, env(safe-area-inset-bottom))`을 사용해 노치 기기에서 실제 인셋을
  반영합니다.
- **목 합계.** 초기 장바구니(김치찌개 + 골뱅이무침)의 합이 25,300원이 되도록 하여
  프레임의 플레이스홀더 라벨과 정확히 일치시켰습니다.

**베이스 브랜치.** 작업 지시에서는 `dev`를 베이스로 지정했으나 로컬과 `origin`
어디에도 `dev` 브랜치가 존재하지 않아 `origin/main`에서 분기했습니다.

**한계 / 후속 작업**

- 라우팅 미적용: 메뉴 행이나 장바구니 칩을 탭해도 동작하지 않습니다. 연결은
  S04(메뉴 상세)와 S05(장바구니) 작업에 달려 있습니다.
- 장바구니 상태는 페이지 로컬 상태이며 목 데이터로 초기화됩니다.
  `localStorage` 영속화(UX-STRUCTURE §6.2)는 미구현입니다.
- 썸네일은 `bg/surface` 플레이스홀더로 렌더링됩니다. 프레임에 이미지가 없기
  때문이며, 실제 데이터가 들어오면 `MenuItemSummary.imageUrl`로 지원됩니다.
- 스켈레톤·빈 상태·오류·오프라인 상태(UX-STRUCTURE §5.6)는 이 프레임의 범위를
  벗어납니다. 항목이 없는 카테고리를 위한 최소한의 "준비 중인 메뉴입니다"
  대체 문구만 존재합니다.
