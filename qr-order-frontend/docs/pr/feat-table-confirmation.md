# 개요

Figma `ui-ux` 파일의 **S01 — Table Confirmation**(테이블 확인) 화면을
구현했습니다. QR 스캔 후 처음 만나는 진입 화면으로, 매장명·영업 상태·테이블
번호·안내 문구와 하단의 "메뉴 보기" CTA로 구성됩니다.

이 화면의 목적은 하나입니다. **주문이 자기 테이블로 간다는 것을 손님이 믿게
하는 것**(UX-STRUCTURE §3 S01). 그래서 테이블 번호가 CTA와 함께 co-primary로
다뤄집니다.

앱의 시작 화면이 되도록 진입점도 함께 바꿨습니다.

## 변경 사항

### 화면

- `src/pages/TableConfirmationPage.tsx` / `.css` — S01 화면 구성.

### 추가한 컴포넌트

| 컴포넌트 | Figma 노드 | 비고 |
|---|---|---|
| `TableChip` | `ext/TableChip` (14:7) | bg/weak + text/weak, r8, 24/700. 설명 요소이며 상호작용하지 않습니다 |

### 수정한 컴포넌트

- `Badge` — `medium` 사이즈 추가(padding 6/12, radius 8). 기존 `xsmall`(2/6),
  `small`(3/8)과 달리 S01의 영업 상태 칩은 라디우스가 8입니다. 화면마다 칩을
  새로 만들지 않고 하나의 Badge로 흡수했습니다.

### 지원 파일

- `src/types/session.ts` — `TableSession` 추가. QR로 해석되는 세션의 UI 단계
  자리표시자입니다 (UX-STRUCTURE §5.1).
- `src/data/session.ts` — S01 프레임 값과 동일한 목 세션.

### 진입점 변경

- `src/App.tsx` — `screen` 상태(`'start' | 'menu'`)를 추가해 앱이 S01에서
  시작하도록 했습니다. "메뉴 보기"를 누르면 S02로 진입하며, 기존
  S02 → S04 흐름은 그대로입니다.

여전히 `App.tsx`의 로컬 상태 기반이며, 실제 라우팅(`/t/{token}/start`,
`/menu`, `/menu/{itemId}`, UX-STRUCTURE §2.1)의 임시 대체물입니다.

## Figma

기준 프레임: **`S01 — Table Confirmation`**, 노드 `14:2`
(`https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS/ui-ux`).

이 화면에는 앱바가 없습니다. 콘텐츠 상단 여백 80px이 이 화면 자체의 프레이밍
역할을 하므로 레이아웃 상수로 토큰화하지 않고 페이지 CSS에 그대로 두었습니다.

Figma Button 컴포넌트 문서(XLarge 56/r16, 패딩 0/20은 검증된 지오메트리라
간격 스케일에 묶지 않음)를 그대로 따랐습니다.

## 검증

- [x] `npm run lint` — 통과, 경고 없음
- [x] `npm run build` — `tsc -b && vite build` 성공
- [x] 브라우저 390×844에서 Figma와 비교

프레임 대비 실측(프레임 좌표 = 구현 좌표):

| 요소 | Figma | 구현 |
|---|---|---|
| 매장명 | 80, 36 | 80, 36 |
| 영업 상태 칩 | 132, 30 | 132, 30 |
| TableChip | 178, 60 | 178, 60 |
| 안내 문구 | 254, w358 | 254, w358 |
| Footer | 722, 88 | 722, 88 |
| Button | 738, 56 | 738, 56 |
| SafeArea | 810, 34 | 810, 34 |

색상·타이포 실측: 버튼 `rgb(49,130,246)` = `#3182f6`, r16, 17/700 ·
TableChip `rgb(232,243,255)` / `rgb(27,100,218)`, r8, 24/700/36, padding 12/16 ·
영업 상태 칩 `rgb(242,244,246)` / `rgb(78,89,104)`, r8, padding 6/12.

동작 검증: "메뉴 보기" → S02 진입, 이어서 메뉴 행 → S04 진입까지
S01 → S02 → S04 연결 확인. 320px에서 가로 오버플로 없고 Footer + SafeArea가
뷰포트 하단에 정확히 닿습니다.

## 참고 사항

**의도적인 차이**

- **영업 상태 칩의 톤.** UX-STRUCTURE §4.1은 영업 중을 `tds/Badge` **weak**로
  규정하지만, Figma 프레임은 `bg/surface` + `text/body`의 중립 톤으로
  그려져 있습니다. `CLAUDE.md`가 Figma를 우선하므로 Figma를 따랐습니다.
- **TableChip 높이.** UX-STRUCTURE §4.2는 32h로 적고 있으나 S01 프레임은
  padding 12/16 + 24/36 텍스트로 60h입니다. §3 S01이 테이블 번호를 H3 24로
  규정하는 것과 일치하므로 Figma를 따랐습니다. S05~S08에서 쓰일 컴팩트
  변형은 해당 화면이 들어올 때 추가하면 됩니다.
- **Footer가 sticky가 아님.** S02·S04와 달리 S01 Footer에는 상단 구분선이
  없고, 콘텐츠가 `flex: 1`이라 자연스럽게 하단에 놓입니다. 프레임 구조를
  그대로 따랐습니다.

**한계 / 후속 작업**

- 세션 해석(S00)과 에러 화면 E1/E2/E3(잘못된 QR·만료·영업 종료)이 아직
  없습니다. `TableSession.open`이 `false`인 경로는 현재 배지 문구만 바뀝니다.
- 화면 전환이 `App.tsx`의 로컬 상태입니다. 뒤로가기 제스처, 딥링크,
  새로고침 복원이 없습니다. QR 재스캔 시 기존 세션 재참여(§5.1)도 미구현입니다.
- `session_token`의 `localStorage` 영속화(§5.1, §6.2)는 미구현입니다.
- 매장 브랜드 컬러 헤더 밴드(§6.6)는 프레임에 없어 구현하지 않았습니다.
