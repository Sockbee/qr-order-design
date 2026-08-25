# Summary

Implements **S02 — Menu Browsing**, the QR ordering menu screen, from the Figma
`ui-ux` file. The screen renders a sticky app bar with a cart chip, a sticky
horizontally-scrollable category tab strip, a divider-separated list of menu
rows (including the sold-out state), and a persistent bottom order bar carrying
the running cart total.

This is the first product screen in the repo, so it also replaces the Vite
starter template with the project structure described in `CLAUDE.md`
(`components/`, `pages/`, `styles/`, `types/`, `utils/`) and establishes the
CSS-custom-property design tokens taken from the Figma variables.

## Changes

### Screen

- `src/pages/MenuPage.tsx` / `.css` — S02 composition and page-level state
  (selected category, cart). Category filtering is `useMemo`'d over mock data.
- `src/App.tsx` — now renders `MenuPage`.
- `index.html` — `lang="ko"`, `viewport-fit=cover` (needed for
  `env(safe-area-inset-bottom)`), Noto Sans KR from Google Fonts, Korean title.

### Components added

| Component | Figma node | Notes |
|---|---|---|
| `Button` | `tds/Button` (7:74) | Full size ladder 32/r8 · 38/r10 · 48/r14 · 56/r16, fill + weak, `loading` as a boolean that preserves width |
| `AppBar` | `ext/AppBar` (14:16) | 56h, sticky, title + cart chip |
| `CategoryTabs` | `ext/CategoryTabs` (14:20) | Sticky under the app bar, `role="tablist"` with roving tabindex and arrow/Home/End keys |
| `MenuItem` | `ext/MenuItem` (12:31) | Default + SoldOut states, 80×80 thumbnail, 1px divider |
| `BottomOrderBar` | `ext/BottomOrderBar` (13:20) | 88px row + 34px safe-area reserve, disabled-when-empty action |
| `Badge` | `tds/Badge` | Descriptive only, never interactive |

### Supporting files

- `src/styles/tokens.css` — new. Colors, radii, spacing, typography roles and
  layout constants, mirroring the Figma variables (`--color-bg-primary`,
  `--color-text-strong`, `--radius-btn-xl`, …).
- `src/types/menu.ts` — `MenuCategory`, `MenuItemSummary`, `CartLine`.
- `src/utils/price.ts` — `formatPrice` / `formatPriceDelta`, implementing the
  UX-STRUCTURE §4.4 rules (thousands separator, `원` suffix, signed deltas).
- `src/data/menu.ts` — mock catalogue and seeded cart. No API wiring.
- `src/assets/spinner.svg` — exported from the Figma Button component, used by
  the button's loading state.

### Removed

- `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`,
  `src/assets/vite.svg` — Vite starter leftovers, made dead by the new `App.tsx`.
- The starter styles in `src/index.css` (1126px `#root`, 18px base type, a dark
  palette) were replaced by a mobile-first reset; they actively conflicted with
  the design.

### Design tokens added

Colors `bg-canvas / bg-surface / bg-weak / bg-primary / bg-primary-pressed`,
`text-strong / text-body / text-muted / text-weak / text-on-primary`,
`border-default`; radii `sm / btn-sm / btn-md / btn-lg / btn-xl`; spacing
`1–6` (4/6/8/16/24/32); type roles `title-screen`, `title-section`,
`body-strong`, `body-default`, `label-button-xl`, `caption-strong`,
`caption-default`, `micro-badge`; layout constants for the app bar, tab strip,
touch target and safe area.

## Figma

Source of truth: **`S02 — Menu Browsing`**, node `14:15` in
`https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS/ui-ux`.

**Note on the node id.** The URL supplied for the task was `node-id=14-2`, which
is `S01 — Table Confirmation`, not the menu screen. `14:15` is the frame
actually named "S02 — Menu Browsing", and it matches both the request ("Menu
Browsing frame") and the branch name, so it was used as the source. Worth
confirming before merge.

Component documentation embedded in the Figma components was followed, notably:

- CategoryTab is a *button-like control, not a Badge* — badges are never
  actions (DESIGN.md §7).
- MenuItem separates by a 1px divider and whitespace, **never a shadow**
  (DESIGN.md §6). SoldOut is a disabled state, never danger red.
- Price stays at `text/body` when sold out, because `text/muted` (#8b95a1)
  fails 4.5:1 and must never carry price, allergen or availability.
- BottomOrderBar shows the action **disabled, never hidden**, when the cart is
  empty (UX-STRUCTURE §5.3).
- Button `loading` is orthogonal to pressed/disabled and preserves width
  (DESIGN.md §4).

## Verification

- [x] `npm run lint` — clean, no warnings
- [x] `npm run build` — `tsc -b && vite build` succeeded
- [x] Compared against Figma at 390×844 in the browser

Measured against the frame: app bar 56px, tab strip 48px + 1px divider,
thumbnail 80×80 flush to the 16px right margin, XLarge button 56px, safe-area
reserve 34px, no horizontal overflow at 320px or 390px. Category switching,
the sold-out disabled row, and the aria wiring between tabs and the panel were
verified in the running app.

## Notes

**Intentional differences**

- **Divider after the last row.** UX-STRUCTURE §4.2 specifies "none after last",
  but the Figma frame renders the divider on all three rows because it belongs
  to the MenuItem component. `CLAUDE.md` puts Figma above the written spec, so
  the divider is kept. Cheap to flip if the spec is the intent.
- **Single-line description ellipsis.** The Figma frame truncates the
  description to one line; UX-STRUCTURE §3 says "max 2 lines". Followed Figma.
- **Fluid width up to 480px.** The frame is a fixed 390px. The page is
  mobile-first and fluid, centred with a 480px max-width so it does not stretch
  on tablets, per `CLAUDE.md` §5.
- **Sticky, not fixed.** App bar, tab strip and order bar use `position: sticky`
  inside the page column rather than `fixed`, so they stay inside the centred
  max-width without duplicating the layout constant.
- **Safe area** is `max(34px, env(safe-area-inset-bottom))` rather than a flat
  34px, so notched devices get their real inset.
- **Mock total.** The seeded cart (김치찌개 + 골뱅이무침) sums to 25,300원 so the
  bar matches the frame's placeholder label exactly.

**Base branch.** The task named `dev` as the base, but no `dev` branch exists
locally or on `origin` — this branch was cut from `origin/main`.

**Limitations / follow-up**

- No routing yet: tapping a menu row or the cart chip is a no-op. Wiring waits
  on S04 (Menu Detail) and S05 (Cart).
- Cart state is local to the page and seeded from mock data. `localStorage`
  persistence (UX-STRUCTURE §6.2) is not implemented.
- Thumbnails render the `bg/surface` placeholder — the frame ships no images.
  `MenuItemSummary.imageUrl` is supported when real data arrives.
- Skeleton, empty, error and offline states (UX-STRUCTURE §5.6) are out of
  scope for this frame; only a minimal "준비 중인 메뉴입니다" fallback exists for a
  category with no items.
