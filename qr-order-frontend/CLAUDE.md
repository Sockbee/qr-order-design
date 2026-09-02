# QR Order Frontend — Claude Instructions

## Project Overview

This project is a mobile-first QR restaurant ordering frontend.

Customers scan a QR code placed on a restaurant table and use the mobile web interface to browse menus and place orders without logging in.

Tech stack:

* React
* TypeScript
* Vite
* CSS
* ESLint
* Figma Desktop MCP

The primary design target is a mobile viewport of approximately 390px width.

### Current status

Implemented, with routing per `UX-STRUCTURE.md` §2.1:

| Screen | Route | Page | Figma node |
|---|---|---|---|
| S01 Table Confirmation | `/t/:tableId?token=...` | `TableConfirmationPage.tsx` | `14:2` |
| S02 Menu Browsing | `/menu` | `MenuPage.tsx` | `14:15` |
| S04 Menu Detail | `/menu/:itemId` | `MenuDetailPage.tsx` | `15:39` |
| S05 Cart | `/cart` | `CartPage.tsx` | `15:95` |
| S06 Order Confirmation | `/cart/confirm` | `OrderConfirmationPage.tsx` | `16:80` |
| S07 Order Complete | `/orders/:orderNumber/done` | `OrderCompletePage.tsx` | `16:106` |
| S08 Order Status | `/orders` | `OrderStatusPage.tsx` | `16:121` |

`/` resumes the last session; unknown routes redirect there.

Not yet implemented: S00, S02b, overlays T1/D1–D3/B1–B2, and error screens E1–E5.
**No Figma frames exist for these yet** — the file stops at S08. Do not invent them from
scratch; either wait for the frames or build strictly from `UX-STRUCTURE.md` §4.2/§5 and
record every judgement call in the PR document.

Routing uses `react-router-dom`. Session state (cart, orders) lives in `App` **above** the
router and is passed to route elements as props — route elements unmount on navigation, so
state or persistence effects owned by them would be lost mid-transition.

The S08 server state uses one session-level `useOrderPolling` instance. It consumes
Spring Boot SSE events, reconciles every 60 seconds, falls back to `orders/list` polling
every 15 seconds, and pauses while the document is hidden. Configure the deployment through
`VITE_API_BASE_URL`; never commit a real table token.

S01, S02 and S04 use the session-level `useStorefront` data source. It resolves the real
store/table and menu catalog from the Spring Boot API, then passes the same mapped menu objects to
the cart and confirmation screens. `src/data` is fallback content only when the API is not
configured; production paths must never silently fall back after an API or QR error.

---

## Sources of Truth

Use the following sources in this priority order.

### 1. Figma

For the screen currently being implemented, the selected Figma frame is the source of truth for:

* layout
* hierarchy
* spacing
* typography
* component placement
* visual states
* dimensions
* colors
* radius
* interaction structure

Use the Figma MCP to inspect the target frame and its child nodes before implementation.

**File key:** `u5pXNGrYEdVDbvqmJLglUS` (file `ui-ux`).

The Figma MCP available in this project is the **remote** server, not the Desktop server.
Every read tool (`get_design_context`, `get_metadata`, `get_screenshot`, `get_variable_defs`)
requires an explicit `fileKey` **and** `nodeId` — it cannot read "whatever is currently
selected" in the desktop app.

So a request to implement "the selected frame" must come with a node-specific URL:

```text
https://www.figma.com/design/u5pXNGrYEdVDbvqmJLglUS/ui-ux?node-id=<node-id>
```

Confirm the frame name in the response matches the screen being asked for before writing
code. A node id can easily point at a neighbouring frame.

Known frames:

```text
14:2     S01 — Table Confirmation
14:15    S02 — Menu Browsing
15:39    S04 — Menu Detail
15:95    S05 — Cart
16:80    S06 — Order Confirmation
16:106   S07 — Order Complete
16:121   S08 — Order Status
105:92   S09 — Call Staff (CallStaffSheet, asking state)
105:146  S09b — Call Staff · 호출 완료 (CallStaffSheet, called state)
105:189  S08b — Order History · 비어 있음 (OrderStatusPage empty state)
```

Do not approximate the design from screenshots if Figma metadata is available.

### 2. DESIGN.md

`DESIGN.md` defines the project's design language and design principles.

Use it for:

* typography philosophy
* spacing conventions
* color usage
* radius
* buttons
* information hierarchy
* interaction principles
* visual consistency

If Figma and DESIGN.md appear to conflict, preserve the actual Figma screen while avoiding unnecessary deviations from DESIGN.md.

Note: `DESIGN.md` currently exists as two identical copies — repository root and
`qr-order-frontend/`. Treat them as one document. If they ever diverge, the repository root
copy wins.

### 3. UX-STRUCTURE.md

`UX-STRUCTURE.md` (repository **root**, not `qr-order-frontend/`) is the product spec derived
from DESIGN.md. It defines the screen map, routes, per-screen information hierarchy, the
component inventory, and the interaction state machines.

Use it for:

* which screens exist and how they connect
* what ranks as primary on a screen
* component states that Figma does not draw (loading, empty, error, offline, images-off)
* price formatting and cross-cutting rules

**Priority.** Figma outranks UX-STRUCTURE.md for anything the frame actually draws — layout,
spacing, typography, which elements are present. UX-STRUCTURE.md governs everything the frame
does *not* draw, especially non-default states.

Where the two genuinely conflict on drawn output, follow Figma and record the difference in
the PR document rather than silently picking one.

### 4. Existing Code

Existing reusable components and tokens should be reused whenever appropriate.

Do not create duplicate components simply because a Figma node has a different name.

---

# Development Principles

## 1. Inspect Before Coding

Before implementing a screen:

1. Inspect the target Figma frame through Figma MCP, and confirm the frame name matches
   the screen requested.
2. Read relevant existing source files.
3. Check DESIGN.md and the screen's section in UX-STRUCTURE.md §3.
4. Identify reusable components already in `src/components/`.
5. Identify new components that genuinely need to be created.
6. Check `src/styles/tokens.css` for tokens that already cover the frame's values.
7. Briefly determine the implementation structure before editing files.

Do not start implementation based only on the frame name.

---

## 2. Component Architecture

Prefer reusable, product-level components over page-specific duplication.

Keep page components focused on composition and page-level state.

**Already built — reuse these, do not recreate them:**

| Component | File | Notes |
|---|---|---|
| `Button` | `src/components/Button.tsx` | Full TDS size ladder, `fill`/`weak`, `loading`, `block` |
| `Badge` | `src/components/Badge.tsx` | Descriptive only, never interactive |
| `AppBar` | `src/components/AppBar.tsx` | Title + cart chip, sticky |
| `CategoryTabs` | `src/components/CategoryTabs.tsx` | `role="tablist"`, keyboard navigable |
| `MenuItem` | `src/components/MenuItem.tsx` | Default + sold-out |
| `BottomOrderBar` | `src/components/BottomOrderBar.tsx` | Sticky, disabled when empty |

Still to build (see `UX-STRUCTURE.md` §4.2): `QuantitySelector`, `OptionSelector`,
`CartLine`, `TableChip`, `PriceBreakdown`, `StatusTracker`, `Sheet`, `Toast`, `Dialog`,
`EmptyState`, `Skeleton`, `InlineAlert`, `TextField`.

Current structure:

```text
src/
├── assets/       # exported Figma assets
├── components/   # reusable components (Component.tsx + Component.css)
├── data/         # fallback content for API-free UI development
├── hooks/        # shared hooks
├── pages/        # one file per screen
├── styles/       # tokens.css
├── types/        # shared domain types
└── utils/        # formatting helpers
```

`src/hooks/` holds shared hooks (`useOrderSession`, `usePersistentState`, `useStorefront`,
`useOrderPolling`). `src/data/` is used only when `VITE_API_BASE_URL` is absent.

Do not over-engineer abstractions for components used only once.

---

## 3. Design Tokens

Tokens live in **`src/styles/tokens.css`**, imported once from `src/index.css`. They mirror
the Figma variables published on the `ui-ux` file — keep the names aligned with Figma so a
`get_variable_defs` response maps straight onto CSS.

Established groups:

```text
--color-bg-*      canvas, surface, weak, primary, primary-pressed
--color-text-*    strong, body, muted, weak, on-primary
--color-border-*  default
--radius-*        sm, btn-sm, btn-md, btn-lg, btn-xl
--space-1..6      4, 6, 8, 16, 24, 32
--type-*          title-screen, title-section, body-strong, body-default,
                  label-button-xl, caption-strong, caption-default, micro-badge
--layout-*        max-width, side-margin, app-bar-height, category-tabs-height,
                  min-touch-target, safe-area
```

Typography tokens are `font` shorthand values, used as `font: var(--type-body-strong);`.

Three standing constraints, all from DESIGN.md:

* **No shadow tokens.** Separation is divider, scrim and whitespace only (§6).
* **No dark mode.** DESIGN.md supplies no dark values and §7 forbids inventing them.
* **Font substitution.** Toss Product Sans is unlicensed (§3), so the build uses Noto Sans KR
  loaded in `index.html`. Weight 600 maps to 700 — the family ships no Semi Bold.

Add a new token when a value repeats or is a design decision worth naming. Do not create a
token for every unique pixel value; verified component geometry that falls outside the scale
stays literal (for example the XLarge button's `0 20px` padding).

**Customer-only palette override.** `tokens.css` is shared by both apps (`index.css` imports
it, and both `main.tsx` and `staff-main.tsx` import `index.css`), so its `:root` values are
the staff app's palette. The customer app's warm/hanok palette (Figma verified 2026-09-02)
lives as a second `:root` override block in **`src/styles/tailwind.css`** — same custom
property *names*, new values, later in cascade order, and that file is only ever imported
from `main.tsx`. Never edit `tokens.css`'s color values to reskin the customer app; add or
change the override block in `tailwind.css` instead. Non-color tokens (radius, spacing,
layout) and the status colors are still shared and unchanged.

**Display font.** Title/Screen, Title/Section and Display/Total render in **BM을지로**
(`src/assets/font/BMEULJIROTTF.ttf`), a single-weight face wired as `@font-face` +
`--font-display` in `tailwind.css`, customer-only. Always pair the `font-display` utility
with `font-normal` — the face has no bold master. Body/Caption/Label/Micro tokens stay Noto
Sans KR as before, on both apps.

---

## 4. Styling

The customer app and the staff app style differently — they are separate SPAs
sharing one Vite build, and only the customer app moved to Tailwind.

**Customer app** (`src/pages/*`, `src/components/*` excluding `components/staff/`
and the two forked exceptions below): use Tailwind utility classes. Tailwind is
wired in `src/styles/tailwind.css` (imported from `main.tsx` only, never from
`staff-main.tsx`) with an `@theme` block that re-exposes the brand tokens from
`src/styles/tokens.css` as utilities (`bg-primary`, `text-strong`,
`rounded-btn-lg`, ...). Prefer those named utilities when a token exists; fall
back to Tailwind's arbitrary-value syntax (`h-[38px]`, `bg-[var(--color-status-accepted-bg)]`)
for one-off or not-yet-themed values rather than inventing new `@theme` entries
for something used once. Figma is no longer the source of truth for this app —
the customer app is being redesigned and Tailwind's job here is iteration speed,
not reproducing a Figma frame pixel-for-pixel.

**Staff app** (`src/pages/staff/*`, `src/components/staff/*`): unchanged, plain
CSS. Each component owns a sibling stylesheet imported from the component file
(`Component.tsx` imports `./Component.css`). Class names are BEM-ish and
namespaced by component (`.menu-item__price`, `.category-tab--active` style).
There is no CSS-in-JS anywhere in this project — do not add one.

**The two exceptions**: `CategoryTabs` and `QuantitySelector` were shared by
both apps before this split. Each now exists twice — the original plain-CSS
version at `src/components/CategoryTabs.tsx` / `QuantitySelector.tsx` (staff
only), and a Tailwind version at `src/components/customer/CategoryTabs.tsx` /
`QuantitySelector.tsx` (customer only), same prop contract. Do not let these
two drift apart in behavior — only in styling mechanism. Do not add a third
shared component this way without a real reason; fork only when a component
genuinely needs both a customer (Tailwind) and staff (plain CSS) consumer.

Prefer, for both apps:

* semantic class names / utility composition
* CSS variables (`tokens.css`) as the source of truth for values
* flexbox / grid
* mobile-first styles

Avoid, for both apps:

* unnecessary absolute positioning
* excessive fixed heights
* duplicated inline styles

The implementation should behave correctly, not merely resemble a static screenshot.

---

## 5. Responsive Behavior

The Figma design is primarily based on a 390px mobile viewport.

The UI must still behave reasonably across common mobile widths.

Do not assume exactly 390px.

Prefer:

* fluid widths
* appropriate max-widths
* flexible layout
* safe bottom spacing for fixed CTAs

Avoid hardcoding the entire screen around a single viewport.

Established layout approach:

* The page column is centred with `--layout-max-width` (480px), so the design does not
  stretch on tablets.
* Sticky chrome uses `position: sticky` inside that column rather than `position: fixed`,
  which keeps it inside the max-width without duplicating the constant.
* Bottom safe spacing is `--layout-safe-area`, i.e. `max(34px, env(safe-area-inset-bottom))`.
  `index.html` sets `viewport-fit=cover` so `env()` resolves.
* Use `100dvh`, not `100vh` — mobile browser chrome makes `vh` wrong.

---

## 6. Accessibility

Use semantic HTML where appropriate.

Requirements include:

* actual `button` elements for actions
* labels for form controls
* meaningful alt text where necessary
* keyboard-accessible interactions
* visible interaction states
* adequate tap targets

Do not use clickable `div` elements when a semantic interactive element exists.

Decisions already made, keep them consistent:

* Sold-out rows are `disabled` buttons, never removed and never danger red.
* `--color-text-muted` (#8b95a1) fails 4.5:1 and must never carry price, allergen or
  availability — including on sold-out rows, where price stays at `--color-text-body`.
* Category tabs use `role="tablist"` with roving tabindex and arrow/Home/End keys, and are
  wired to the panel via `aria-controls` / `aria-labelledby`.
* Minimum touch target 48×48, expanding the hit area around smaller visuals rather than
  enlarging them.
* Every transition honours `prefers-reduced-motion`.

---

## 7. TypeScript

Maintain strict, useful typing.

Avoid:

* `any`
* unnecessary type assertions
* duplicated domain types

Create shared types when data structures are reused.

Keep component props small and explicit.

---

## 8. State and Data

Store/table, menu catalog and order status use the Spring Boot API when
`VITE_API_BASE_URL` is configured. Fallback content lives in `src/data/`, typed against
`src/types/`, and is only for API-free UI development. Components and pages take mapped
domain types as props and must not import fallback data directly.

Keep backend response types and mapping inside `src/api/`; UI components must not depend
on backend field names.

Do not introduce a global state library unless the application's actual complexity requires one.
Cart and order history live in `useOrderSession`, persisted to `localStorage` under
`qr-order:{token}:*` (UX-STRUCTURE §5.1, §6.2). Every storage call is guarded — Safari private
mode throws — so losing persistence degrades to in-memory state rather than breaking the flow.

---

## 9. Figma-to-Code Mapping

Figma component names do not have to dictate React component names exactly.

Map them based on product semantics.

Example:

Established mappings:

```text
Figma                     React
tds/Button           ->   Button
tds/Badge            ->   Badge
ext/AppBar           ->   AppBar
ext/CategoryTabs     ->   CategoryTabs        (strip; the Figma CategoryTab child
                                               is not a separate exported component)
ext/MenuItem         ->   MenuItem
ext/BottomOrderBar   ->   BottomOrderBar
ext/QtyStepper       ->   QuantitySelector     (not built yet)
tds/OptionGroup      ->   OptionSelector       (not built yet)
```

Figma components carry usage documentation in their description field, and it encodes real
design decisions. `get_design_context` returns it — read it and follow it.

Reuse an existing React component if it already represents the same concept.

---

## 10. Implementation Scope

Implement only the screen or component requested in the current task.

Do not proactively implement unrelated screens.

Do not refactor unrelated files unless required for correctness or reuse.

Do not introduce backend/API functionality unless explicitly requested.

---

# Verification

After implementation:

1. Run the project.
2. Check for TypeScript errors.
3. Check ESLint.
4. Verify the implemented screen renders.
5. Compare the result against the selected Figma frame.
6. Fix obvious spacing, hierarchy, typography, and layout mismatches.

Comparing against Figma means actually rendering the screen and measuring it, not reading the
code back. Check at 390px and at least one narrower width (320px), and confirm there is no
horizontal overflow at either.

`npm run dev` uses port 5173 and falls back to the next free port when it is taken — read the
port from the dev server output rather than assuming.

Useful commands:

```bash
npm run dev
npm run lint
npm run build
```

Do not consider a task complete merely because code was written.

---

# Working Style

Make incremental changes.

For each screen:

```text
Inspect Figma
→ inspect existing code
→ identify components
→ implement
→ run
→ compare
→ adjust
```

Prefer correctness and design fidelity over speed.

Avoid generating large amounts of speculative architecture before the UI requires it.

When uncertain about an intentional design choice, preserve the Figma design rather than inventing a new pattern.

## Git Workflow

For implementation tasks, follow this workflow unless explicitly told otherwise.

1. Inspect the current Git status before modifying files.
2. Never discard or overwrite unrelated uncommitted user changes.
3. Create a dedicated feature branch before implementation.

**Base branch is `main`.** There is no `dev` branch on `origin`. If a task names a base that
does not exist, say so and branch from `origin/main` rather than creating it silently.

Branch naming:

feat/<short-feature-name>

Examples:

feat/menu-page
feat/menu-detail-page
feat/cart-page

4. Implement only the requested scope.
5. Run verification before committing (from `qr-order-frontend/`):
    - npm run lint
    - npm run build

6. Write a PR document under:

qr-order-frontend/docs/pr/<branch-name-with-slashes-replaced-by-hyphens>.md

Example:

qr-order-frontend/docs/pr/feat-menu-page.md

PR documents are written in **Korean**, following `docs/pr/feat-menu-page.md`.
Section headings in that document are the template:

```text
# 개요            — concise description of the implementation
## 변경 사항       — UI changes, components added/modified, design tokens added/modified
## Figma          — which frame (name AND node id) was the source of truth
## 검증            — lint / build / Figma comparison results
## 참고 사항       — intentional differences from Figma, limitations, follow-up work
```

Keep file paths, component names, Figma node ids, CSS token names and shell commands in
English inside the Korean prose — they are identifiers that must stay greppable.

Record every intentional deviation from Figma or UX-STRUCTURE.md under 참고 사항, with the
reason. That section is the audit trail for design decisions.

7. Review `git diff` before committing.

8. Commit using Conventional Commits.

Examples:

feat: implement menu browsing screen
feat: add menu item components
fix: adjust bottom order bar layout

9. Push the branch to origin:

git push -u origin <branch>

Do not merge branches.
Do not force push.
Do not delete remote branches.
Do not modify unrelated commits.
