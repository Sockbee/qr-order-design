# QR Ordering — UX Structure Spec

Derived from `DESIGN.md` (Toss / TDS Mobile). Target: mobile web, 390px viewport,
QR table entry, no login.

Naming convention carried over from the DESIGN.md analysis:

- `tds/…` — component whose geometry and state contract are **verified** in DESIGN.md
- `ext/…` — **extension**, invented for this product. Per DESIGN.md §9, extensions are
  built but never presented as verified TDS.

---

## 0. Standing assumptions

These are stated so they can be overturned cheaply. Nothing downstream hides them.

| # | Assumption | Consequence if wrong |
|---|---|---|
| A1 | **Post-paid.** Diner orders, eats, pays at the counter or via the server. The supplied core flow contains no payment step. | Adds 2–3 screens between S06 and S07. Slot is marked. |
| A2 | **Cart is per-device; order history is per-table.** Two people at one table each build their own cart, but both see every order the table has placed. | If cart must be shared live, S05 gains realtime merge + attribution. |
| A3 | **Repeat ordering is normal.** A table orders 2–4 times per sitting. The flow is a loop, not a funnel. | Already designed as a loop. |
| A4 | **Korean primary, English secondary.** | Copy lengths change; layout holds. |
| A5 | The QR encodes `store_id` + `table_id`, and the server issues a `session_token`. | Session model in §6 changes. |

---

## 1. Frame & layout constants

```
Design frame           390 × 844
Worst-case viewport    390 × 730     (mobile browser chrome eats top + bottom)
Side margin            16            → content width 358
Section gap            24
Intra-section gap      8 | 16
Min touch target       48 × 48                            ext
App bar height         56
Sticky bottom bar      88   (56 button + 16 pad × 2)
Safe-area reserve      34                                 ext
Scroll bottom padding  122  (88 + 34)
```

**Fold rule.** Never rely on the fold. Any action required to progress is either in the
app bar or in the sticky bottom bar. The 730px worst case is the design target for
"is the CTA reachable," not 844.

**Thumb rule.** Destructive and high-frequency controls live in the lower third
(y > 560). Back and informational controls live in the app bar.

---

## 2. Screen map

```
        [QR scan]
             │
      S00 Session Resolve ──► E1 Invalid / E2 Expired / E3 Store closed
             │
      S01 Table Confirmation
             │
   ┌──► S02 Menu Browsing ◄──────────────────────┐
   │         │      │                            │
   │         │      └──► S02b Search             │
   │         ▼                                   │
   │  S04 Menu Detail  (contains option region)  │
   │         │                                   │
   │         └──► [add] ──► T1 Toast ──► S02     │
   │                                             │
   │  S05 Cart ◄── sticky bar from S02/S04       │
   │         │                                   │
   │  S06 Order Confirmation                     │
   │         │                                   │
   │  S07 Order Complete                         │
   │         │                                   │
   │  S08 Order Status ──────────────────────────┘
   │              "추가 주문" reopens S02
   └── persistent: sticky cart bar, app bar cart icon
```

### 2.1 Required screens

| ID | Name | Route | Type |
|---|---|---|---|
| S00 | Session Resolve | `/t/{token}` | transient |
| S01 | Table Confirmation | `/t/{token}/start` | full |
| S02 | Menu Browsing | `/menu` | full, scroll |
| S02b | Menu Search | `/menu/search` | full overlay |
| S04 | Menu Detail | `/menu/{itemId}` | full, scroll |
| S05 | Cart | `/cart` | full, scroll |
| S06 | Order Confirmation | `/cart/confirm` | full |
| S07 | Order Complete | `/orders/{id}/done` | full |
| S08 | Order Status | `/orders` | full, live |

### 2.2 Required overlays

| ID | Name | Surface |
|---|---|---|
| T1 | Added-to-cart toast | `ext/Toast` |
| D1 | Remove-item confirm | `ext/Dialog` |
| D2 | Clear-cart confirm | `ext/Dialog` |
| D3 | Leave-with-items warning | `ext/Dialog` |
| B1 | Call staff | `ext/Sheet` |
| B2 | Item unavailable (mid-flow) | `ext/Sheet` |

### 2.3 Required error screens

| ID | Condition | Recovery offered |
|---|---|---|
| E1 | QR invalid / malformed | "직원 호출" — no retry, the URL is not fixable by the diner |
| E2 | Session expired | "다시 스캔해 주세요" + retry button |
| E3 | Store closed / not accepting orders | Hours shown, "직원 호출" |
| E4 | Network failure | Inline retry, cart preserved |
| E5 | Order rejected by kitchen | Reason + "다시 주문하기" |

### 2.4 On "option selection"

The core flow lists option selection as its own step. **It is a region inside S04, not a
separate route.** Splitting it adds a navigation step to every single item, and DESIGN.md
§10 ("Easy to answer", remove work) argues against that. It is nonetheless fully
specified: see `tds/OptionGroup` (§4.4) and the option state machine (§5.3).

The one exception: if an item has **more than 4 option groups**, groups 4+ collapse behind
a `ext/Sheet` labelled "옵션 더보기". This is a density escape hatch, not the default path.

---

## 3. Information hierarchy

Each screen declares exactly one primary. Everything else is ranked beneath it.
Type roles refer to the rescaled ladder established in the DESIGN.md analysis
(H1 36 reserved for a single figure; screen titles cap at H3 24).

### S00 — Session Resolve
Transient, ≤ 1.5s target. Store logo mark + `ext/Skeleton`. No copy beyond store name.
If it exceeds 3s, show "불러오는 중" in Body Small `#8b95a1`. Never show a bare spinner
with no context.

### S01 — Table Confirmation
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Table number** | H3 24/600 `#191f28`, inside `ext/TableChip` |
| 1 | "메뉴 보기" | `tds/Button` xlarge fill primary, sticky |
| 2 | Store name | H4 22/600 |
| 3 | Store status ("영업 중") | `tds/Badge` weak |
| 4 | Notice / wifi / hours | Body Small `#4e5968` |

The table number is co-primary with the CTA. This screen exists for exactly one reason:
the diner must trust the order routes to *their* table. That is the whole job.

### S02 — Menu Browsing
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Item name + price** | 16/600 `#191f28` |
| 2 | Category position | `ext/CategoryTabs`, sticky under app bar |
| 3 | Thumbnail | 80×80 r8 |
| 4 | Description | 14/400 `#4e5968`, max 2 lines, ellipsis |
| 5 | Tags (인기 / 신메뉴 / 매움) | `tds/Badge` weak xsmall |
| — | Cart total | `ext/StickyCartBar`, persistent |

Price is never demoted to `#8b95a1`. Per the DESIGN.md analysis, muted grey fails 4.5:1
and must not carry price, allergen, or availability information.

### S04 — Menu Detail
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Option groups** | `tds/OptionGroup`, the actual work of this screen |
| 1 | "담기 · {total}원" | sticky xlarge, live total |
| 2 | Item name + base price | H4 22/600 |
| 3 | Hero image | 390 × 260, full-bleed, `#f2f4f6` placeholder |
| 4 | Description | 16/400 `#4e5968` |
| 5 | Allergen / origin | Body Small `#4e5968` — **not** muted |
| 6 | Quantity | `ext/QtyStepper` above the sticky bar |

Required groups sort above optional groups regardless of authored order.

### S05 — Cart
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Line items + per-line total** | `ext/CartLine` |
| 1 | "주문하기 · {total}원" | sticky xlarge |
| 2 | Grand total | 22/600 |
| 3 | Price breakdown | `ext/PriceBreakdown`, Body Small |
| 4 | Selected options per line | Body Small `#4e5968`, comma-joined |
| 5 | "메뉴 더 담기" | `tds/Button` large weak |
| 6 | Request-to-kitchen note | `tds/TextField` box |

Every fee — service charge, VAT, minimum-order shortfall — appears **here**, not on S06.
DESIGN.md §11 "Value first, cost later": cost becomes fully legible before commitment,
never after.

### S06 — Order Confirmation
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Table number, restated** | `ext/TableChip`, prominent |
| 1 | "주문 확정" | sticky xlarge |
| 2 | Grand total | H4 22/600 |
| 3 | Read-only item summary | non-interactive `ext/CartLine` |
| 4 | Payment method note ("후불 결제") | Body Small |
| 5 | "수정하기" | text button, back to S05 |

This screen is deliberately read-only. It is the last irreversible moment, and DESIGN.md
§12.5 requires financial outcomes to be explicit states with clear next actions.
*(A1 payment slot: card entry inserts between S06 and S07 using `tds/TextField` +
`tds/Agreement`.)*

### S07 — Order Complete
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Total paid/owed** | **H1 36/700 `#191f28`** — the one H1 in the product |
| 2 | Confirmation + table | H4 22/600 "테이블 7 주문이 접수되었어요" |
| 3 | Order number | Body, `#4e5968`, selectable |
| 4 | "주문 현황 보기" | `tds/Button` xlarge fill primary |
| 5 | "추가 주문" | `tds/Button` large weak |

Auto-advances to S08 after 4s, cancelled by any tap. No confetti, no animation beyond
`ext/motion` fade — DESIGN.md §6 forbids invented ornament.

### S08 — Order Status
| Rank | Content | Treatment |
|---|---|---|
| 1 | **Current state** | `ext/StatusTracker`, flat chips |
| 2 | Per-round order cards | grouped by order, newest first |
| 3 | Session running total | 22/600 — all rounds combined |
| 4 | "추가 주문" | `tds/Button` xlarge fill primary |
| 5 | "직원 호출" | `tds/Button` large weak |

Accumulates every round for the session. Reachable by re-scanning the same QR — this is
the recovery path for a lost tab (DESIGN.md §13, "recovering from an interrupted flow").

---

## 4. Reusable components

### 4.1 Verified — direct from TDS

**`tds/Button`**
Ladder `32/r8 · 38/r10 · 48/r14 · 56/r16`. Variants fill|weak × primary|danger|light|dark.
States: default, pressed, loading, disabled, focus.
Loading **preserves width** (DESIGN.md §4) — mandatory on the S06 confirm button.
Disabled = `#f2f4f6` bg + `#8b95a1` text.

**`tds/TextField`** — box variant only. Used for the kitchen note (S05) and, under A1
reversal, payment fields. States: default, focus, error, disabled, read-only.

**`tds/Badge`** — descriptive only, never tappable (DESIGN.md §7).
Uses: 인기 / 신메뉴 (weak primary), 품절 (weak, `#8b95a1`), 매움 (weak danger),
영업 중 (weak). Category filters are **not** badges — they are buttons.

**`tds/OptionGroup`** — retitled `Agreement`. Inherits checked / unchecked / disabled /
**nested hierarchy** verbatim. Nested hierarchy maps 1:1 onto conditional sub-options
(e.g. "사이즈 → L 선택 시 토핑 추가 가능"). This is the single highest-value transfer in
the whole system.

### 4.2 Extensions

| Component | Spec | States |
|---|---|---|
| `ext/AppBar` | 56h, back + title + cart icon w/ count | scrolled (adds `#e5e8eb` hairline) |
| `ext/TableChip` | `#e8f3ff` bg, `#1b64da` text, r8, 32h | static |
| `ext/CategoryTabs` | sticky, h-scroll, 48h, underline indicator | active, inactive, scrolled-into |
| `ext/MenuRow` | 358w, 80×80 thumb r8, 16 v-pad, `#e5e8eb` bottom divider, none after last | default, pressed, sold-out, skeleton |
| `ext/Thumbnail` | r8, `#f2f4f6` fill placeholder | loading, loaded, failed, dimmed(40%) |
| `ext/OptionRow` | 358w, r12, radio or check glyph | see §5.3 |
| `ext/QtyStepper` | two 32×32 r8 buttons + 40w numeral | min(−disabled), normal, max(+disabled) |
| `ext/StickyCartBar` | 88h, `#ffffff`, top hairline, xlarge button | empty(disabled), filled, updating |
| `ext/CartLine` | thumb 56×56, name, options, price, stepper | editable, read-only, unavailable |
| `ext/PriceBreakdown` | label/value rows, Body Small | normal, below-minimum |
| `ext/StatusTracker` | 4 flat chips, no shadow, no progress bar | see §5.4 |
| `ext/Sheet` | bottom, r16 top corners, scrim `rgba(0,12,30,0.6)` | opening, open, closing |
| `ext/Toast` | above sticky bar, 3s, r8, `#191f28` bg | in, hold, out |
| `ext/Dialog` | centered, r16, 2 buttons | open, closed |
| `ext/EmptyState` | icon + 16/600 line + 14/400 line + CTA | cart-empty, search-empty, no-orders |
| `ext/Skeleton` | `#f2f4f6` blocks, no shimmer | loading |
| `ext/InlineAlert` | `#e8f3ff` or danger tint, r8 | info, warning, error |
| `ext/motion` | 160ms ease-out; honours `prefers-reduced-motion` | — |

**No shadows anywhere.** Sheets and dialogs separate by scrim + radius, per DESIGN.md §6.

### 4.3 The one selection pattern

Applied identically to option rows, category chips, and any future choice control.
Radio and checkbox differ **only** by glyph, never by container.

```
unselected   bg #ffffff   border 1px #e5e8eb   text #191f28
selected     bg #e8f3ff   border 1px #3182f6   text #1b64da
disabled     bg #f2f4f6   border 1px #e5e8eb   text #8b95a1     ("품절")
pressed      bg #f2f4f6   border 1px #e5e8eb
```
Radius 8 for chips, 12 for full-width rows.

### 4.4 Price formatting

- Option deltas always signed and always shown, including zero: `+0원`, `+2,000원`
- Thousands separator always present
- Currency suffix `원`, never a bare number
- Live totals recompute on every interaction, in the sticky bar

---

## 5. Interaction states

### 5.1 Session state machine (S00)

```
RESOLVING ──► VALID ────────────► [S01]
    │
    ├──► INVALID        ──► E1
    ├──► EXPIRED        ──► E2
    ├──► STORE_CLOSED   ──► E3
    └──► NETWORK_FAIL   ──► E4 (retry, cart preserved)
```
`session_token` persists to `localStorage`. Re-scanning the same QR **rejoins** the
existing session rather than starting a new one — otherwise a diner who reloads loses
their order history.

### 5.2 Order state machine

```
DRAFT ──► PLACING ──► PLACED ──► ACCEPTED ──► PREPARING ──► SERVED ──► CLOSED
            │                        │
            └─► FAILED (E4)          └─► REJECTED ──► E5
```
- `DRAFT` — cart, locally mutable
- `PLACING` — S06 button in loading state, **width preserved**, screen input-locked
- `PLACED` — S07 renders; no longer cancellable from the diner side
- Diner-visible labels: 접수됨 / 조리 중 / 서빙 완료

### 5.3 Option selection states

| State | Trigger | Presentation |
|---|---|---|
| untouched | detail opens | required groups show `필수` badge |
| valid | all required groups satisfied | sticky "담기" enabled, total live |
| incomplete | required group empty | "담기" **disabled, not hidden**; tapping scrolls to the first unsatisfied group and flashes its header |
| max-reached | multi-select cap hit | remaining unselected rows go disabled, helper text appears |
| option sold out | server-flagged | row disabled, "품절" appended |
| item sold out mid-flow | server push | `B2` sheet, item removed, return to S02 |

Never hide the primary button to express invalidity. Disabled + a pointer to the blocker
is the DESIGN.md §12.3 reading of an explicit state contract.

### 5.4 Status tracker states

Four flat chips: 접수됨 → 조리 중 → 서빙 완료 → 완료.
Completed `#e8f3ff`/`#1b64da`, current `#3182f6`/white, upcoming `#f2f4f6`/`#8b95a1`.
No progress bar, no shadow, no pulsing. Polls every 15s; on poll failure holds the last
known state and shows a Body Small "업데이트 중" line rather than an error.

### 5.5 Cart states

empty (CTA disabled, `ext/EmptyState`) · has-items · below-minimum (CTA disabled +
`ext/PriceBreakdown` shows the shortfall) · updating (line dims to 40%, no layout shift) ·
line-unavailable (`ext/InlineAlert` error, that line excluded from the total).

### 5.6 Global states every screen must define

Loading (`ext/Skeleton`, never a bare spinner) · loaded · empty · error · offline ·
**images-off**. Images-off is a designed state, not a fallback: every screen must be fully
usable with zero images loaded, showing `#f2f4f6` placeholders. Restaurant wifi makes this
a common case, not an edge case.

---

## 6. Cross-cutting rules

1. **Table number is visible on S01, S05, S06, S07, S08.** It is the diner's only proof
   the order is routed correctly.
2. **Cart survives refresh and tab loss** via `localStorage`, keyed to session.
3. **`D3` warns before leaving with items in the cart** — back gesture, external link.
4. **Blue never touches food photography.** No tints, gradients, or overlays on or near
   imagery. Blue is action and selection only.
5. **`#e42939` is reserved for order-level failure.** Sold-out is a disabled state.
   Removing a cart line is not danger — it is trivially reversible.
6. **Restaurant brand colour lives in the S01 header band and nowhere else.** The order
   path is `#3182f6` at every venue. This is the store/system surface split.
7. **No login, no account, no onboarding, ever.**
8. **Every interactive element ≥ 48×48**, including the quantity stepper's 32px visual
   with an expanded hit area.

---

## 7. Figma build order (next session)

1. Tokens + text styles (rescaled ladder)
2. `tds/` primitives — Button ladder, TextField, Badge, OptionGroup
3. `ext/` primitives — MenuRow, OptionRow, QtyStepper, StickyCartBar, CartLine, Badge chips
4. S01 → S02 → S04 → S05 → S06 → S07 → S08 at 390 × 844
5. Overlays T1, D1–D3, B1–B2
6. Error screens E1–E5
7. State variant sheet: every component, every state from §5
