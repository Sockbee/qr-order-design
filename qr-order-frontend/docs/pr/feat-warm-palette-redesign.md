# 개요

고객용 앱 7개 화면(S01, S02, S04~S08)과 직원 호출 시트(S09/S09b), 빈 주문
내역(S08b) 전체에 새 Figma 시안을 반영했습니다. 기존 "Toss 블루" 팔레트를
따뜻한 크림/burnt-orange 팔레트로 교체하고, 제목 계열 타이포에 BM을지로
서체를 적용했습니다. S01에는 솥가마 로고 이미지를 추가했습니다.

지난 세션에서 이미 고객용 앱을 Tailwind 유틸리티 클래스 기반으로 전환해
둔 덕분에, 이번 작업의 대부분은 토큰 값 교체만으로 끝났습니다. 다만
검증 과정에서 심각한 기존 버그(아래 참고)를 발견해 함께 수정했습니다.

## 변경 사항

### 토큰/폰트 인프라

- `src/styles/tailwind.css` — 고객 전용 `:root` 팔레트 오버라이드 블록,
  BM을지로 `@font-face`, `--font-display` 테마 키 추가. `tokens.css`는
  손대지 않았습니다(staff 앱과 공유) — 같은 커스텀 프로퍼티 **이름**을
  고객 전용 파일에서 나중에 재선언해 캐스케이드로 덮어씁니다.

### 제목 계열 폰트 교체 (font-bold → font-display font-normal)

`AppBar`(뒤로가기 "←"), `TableChip`, `MenuPage`("추천 메뉴"),
`MenuDetailPage`(이름 행), `PriceBreakdown`, `OrderCompletePage`(마크·헤드라인·
총액), `OrderStatusPage`(합계 행), `CallStaffSheet`(제목 양쪽 상태, 완료 마크).
크기는 대부분 동일하며, `TableConfirmationPage`만 Title/Screen(24/36)에서
Display/Total(36/54)로 커졌습니다.

### S01 — TableConfirmationPage

- `src/assets/logo.png`(솥가마 로고, 198×198) 추가.
- 영업 중/영업 종료 `Badge` 제거 — 새 프레임 어디에도 없습니다.
- 레이아웃을 상단 정렬에서 `items-center justify-center`로, 간격을
  `gap-4`에서 `gap-9`로 변경(Figma `Content` 프레임 그대로).

### StatusTracker — 전면 재구현

기존 "4개 flat chip" 대신 도트+연결선 진행 트래커로 새로 만들었습니다.
`grid-cols-4` + 각 li 내부 상대 위치 연결선(`right-1/2 w-full`) 방식으로,
고정 픽셀 좌표 없이 반응형으로 동작합니다. 완료/현재 단계는
`bg-border-selected`, 예정 단계는 `bg-border-default`. 현재 단계 도트만
14px(나머지 10px), 라벨은 현재만 `font-bold text-strong` 나머지
`font-normal text-muted`.

### 정적 에셋

- `src/assets/radio-selected.svg` — 링 `#3182F6` → `#a62c2d`
- `src/assets/radio-unselected.svg` — 링 `#E5E8EB` → `#a69182`

### 문서

- `CLAUDE.md` §3에 고객 전용 팔레트 오버라이드 패턴과 `--font-display`
  설명 추가, §Sources of Truth의 Known frames 표에 이번에 참조한 노드
  10개를 모두 추가했습니다.

### 버그 수정 — CSS 캐스케이드 레이어

작업 중 `src/index.css`의 전역 리셋 규칙 `h1,h2,h3,p{font:inherit}`,
`button{font:inherit;color:inherit}`, `:where(button):focus-visible{...}`이
**레이어 없이(unlayered)** 작성되어 있어, Tailwind의 `@layer utilities`
안에 있는 모든 유틸리티 클래스보다 명세(specificity)와 무관하게 항상
우선 적용되고 있던 것을 발견했습니다. CSS Cascade Layers 스펙상
레이어가 없는 규칙은 항상 모든 레이어보다 우선하기 때문입니다.

결과적으로 고객 앱의 모든 `<h1>/<h2>/<h3>/<p>`와 모든 `<button>`이
Tailwind로 지정한 폰트·크기·굵기·(버튼은 색상까지) 값을 무시하고
`body`의 기본값(Noto Sans KR 16px 400, `text-strong` 색)으로 렌더링되고
있었습니다 — 지난 Tailwind 마이그레이션 커밋(`dabc1d1`)부터 있던 버그로,
이번 리디자인 검증(사용자가 S01 폰트/크기/문구가 Figma와 다르다고 신고)
과정에서 처음 발견했습니다. 세 규칙을 `@layer base { ... }`로 감싸는
것으로 해결했습니다 — staff 앱은 컴포넌트별 CSS가 이미 클래스 명세로
이겨서 영향 없습니다.

## Figma

`ui-ux` 파일(`u5pXNGrYEdVDbvqmJLglUS`), 노드 14:2, 14:15, 15:39, 15:95,
16:80, 16:106, 16:121, 105:92, 105:146, 105:189. `get_design_context`로
10개 프레임 전부 확인.

## 검증

- [x] `npm run lint` — 통과
- [x] `npm run build` — 통과, staff 번들 해시 불변(영향 없음 확인)
- [x] Playwright로 390px/320px에서 S01→S02→직원호출(양쪽 상태)→S04→
      담기→S05→S06→S07→S08(트래커 포함)→S08b(빈 상태) 전체 흐름 스크린샷
      비교, Figma와 시각적으로 일치 확인
- [x] 320px에서 가로 오버플로 없음
- [x] `getComputedStyle`로 버튼/제목 요소의 실제 font-family·size·weight·
      color가 의도한 값과 일치하는지 직접 확인(캐스케이드 버그 수정 전/후 대조)
- [x] `/staff/login` 렌더 및 컴퓨티드 스타일 재확인 — 기존 블루 팔레트,
      Noto Sans KR 그대로

## 참고 사항

**의도적인 차이**

- **TableChip 사이즈.** Figma에서 S01 인스턴스는 22/33, S06 인스턴스는
  24/36으로 서로 다르게 그려져 있습니다(아마 의도치 않은 불일치). 컴포넌트를
  단일 사이즈(24/36, S06 기준)로 유지하고 별도 variant는 추가하지 않았습니다.
- **StatusTracker와 `UX-STRUCTURE.md` §5.4 불일치.** 문서는 "Four flat
  chips... No progress bar"라고 규정하지만 새 Figma 프레임은 명확히
  도트+진행선 트래커입니다. `CLAUDE.md` 규칙에 따라 Figma를 따르고 여기에
  차이를 기록합니다. `UX-STRUCTURE.md`는 수정하지 않았습니다.
- **S09/S09b 배경("추천 메뉴").** 두 프레임의 `Backdrop`은 시트가 열려 있는
  동안 뒤에 보이는 MenuPage를 Figma가 맥락상 함께 그린 것일 뿐, 새 기능
  요구가 아니라고 판단했습니다. `CallStaffSheet`는 기존처럼 오버레이로만
  구현되어 있고, 어떤 배경 위에도 뜰 수 있습니다.

**한계 / 후속 작업**

- `--color-bg-primary-pressed`(`#9c4403`)는 이번 배치의 어떤 프레임에도
  pressed 상태 목업이 없어 추정치입니다. 실제 pressed 프레임이 나오면
  갱신이 필요합니다.
