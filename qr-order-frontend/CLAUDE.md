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

Use the Figma Desktop MCP to inspect the currently selected frame and its child nodes before implementation.

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

### 3. Existing Code

Existing reusable components and tokens should be reused whenever appropriate.

Do not create duplicate components simply because a Figma node has a different name.

---

# Development Principles

## 1. Inspect Before Coding

Before implementing a screen:

1. Inspect the selected Figma frame through Figma MCP.
2. Read relevant existing source files.
3. Check DESIGN.md.
4. Identify reusable components.
5. Identify new components that genuinely need to be created.
6. Briefly determine the implementation structure before editing files.

Do not start implementation based only on the frame name.

---

## 2. Component Architecture

Prefer reusable, product-level components over page-specific duplication.

Examples include:

* `MenuItem`
* `CategoryTab`
* `QuantitySelector`
* `OptionSelector`
* `BottomOrderBar`
* `Button`
* `Price`
* common headers

Keep page components focused on composition and page-level state.

Suggested structure:

```text
src/
├── components/
├── pages/
├── styles/
├── hooks/
├── types/
└── utils/
```

Do not over-engineer abstractions for components used only once.

---

## 3. Design Tokens

Repeated design values should be represented as reusable tokens whenever reasonable.

Prefer CSS custom properties for:

* colors
* spacing
* radius
* typography
* shadows
* layout constants

Example:

```css
:root {
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --space-2: ...;
  --radius-md: ...;
}
```

Avoid scattering repeated arbitrary values throughout component CSS.

However, do not create a token for every unique pixel value.

---

## 4. Styling

Use plain CSS unless the existing project introduces another styling system.

Keep styling colocated or organized consistently with the existing project structure.

Prefer:

* semantic class names
* CSS variables
* flexbox / grid
* mobile-first styles

Avoid:

* unnecessary absolute positioning
* excessive fixed heights
* duplicated inline styles
* CSS hacks used only to visually imitate the Figma screenshot

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

For the current UI implementation phase, prefer simple local/mock data unless integration requirements explicitly require otherwise.

Separate UI representation from future API integration where practical.

Do not introduce a global state library unless the application's actual complexity requires one.

---

## 9. Figma-to-Code Mapping

Figma component names do not have to dictate React component names exactly.

Map them based on product semantics.

Example:

```text
Figma                     React
ext/MenuRow          ->   MenuItem
ext/CategoryTab      ->   CategoryTab
ext/QuantityStepper  ->   QuantitySelector
tds/OptionSelector   ->   OptionSelector
ext/BottomOrderBar   ->   BottomOrderBar
```

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

Branch naming:

feat/<short-feature-name>

Examples:

feat/menu-page
feat/menu-detail-page
feat/cart-page

4. Implement only the requested scope.
5. Run verification before committing:
    - npm run lint
    - npm run build

6. Write a PR document under:

docs/pr/<branch-name-with-slashes-replaced-by-hyphens>.md

Example:

docs/pr/feat-menu-page.md

The PR document should contain:

# Summary

A concise description of the implementation.

## Changes

- Main UI changes
- Components added or modified
- Design tokens added or modified

## Figma

Describe which Figma screen or component was used as the source of truth.

## Verification

- [ ] npm run lint
- [ ] npm run build
- [ ] Compared against Figma

## Notes

Document intentional differences from Figma, limitations, or follow-up work.

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