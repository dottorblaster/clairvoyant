# @clairvoyant/ui

The design system for Clairvoyant: **Game Boy DMG chrome, NES geometry.**

It ships one stylesheet and a small set of React primitives. There is no build
step for the CSS and no styling dependency of any kind.

```ts
import { Button, Panel, TextField } from '@clairvoyant/ui'
import { initTheme } from '@clairvoyant/ui'
import '@clairvoyant/ui/styles.css'

initTheme() // paint the stored theme before the first render
```

`apps/web/src/pages/StyleGuidePage.tsx` renders every token, component and state
at `/styleguide` in development. Start there when reviewing a change.

---

## The direction, and what it cost

| Decision | Choice | Why |
| --- | --- | --- |
| Palette | Game Boy DMG 4-shade ramp | The most cohesive "8-bit" identity available, and it is genuinely monochrome rather than "dark theme with green accents". |
| Geometry | NES: 2px hard outlines, 0 radius, 4px notched corners, 4px hard shadows | Reads as 8-bit from across the room, and it is all achievable with borders and `clip-path` — no image assets. |
| Fidelity | Retro-faithful | Pixel styling on structure and labels; plain monospace for dense text. See the legibility note below. |
| Fonts | System monospace only | Zero new dependencies. There is no true pixel font — see "Type". |
| Themes | Both, fully specified | Light *is* the DMG screen; dark is the same screen at night. |
| Accent colours | Exactly one (NES red), used only for failure | A monochrome ramp cannot distinguish success from error. Everything else stays on the ramp. |
| Motion | Quantised transitions, blinking block cursor, static scanlines | `steps()` easing is what makes a hover feel 8-bit. No flicker, no typewriter. |
| Sound | **Not implemented** | Deliberate. See "Motion and sound". |

### The one real tradeoff

A calendar app has `datetime-local` inputs, long opaque `did:plc:…` identifiers
and ISO timestamps. Strict pixel styling makes all three worse. The system
therefore keeps the pixel treatment on structure (borders, shadows, corners,
title bars, buttons, labels) and leaves dense text as ordinary monospace, with
`--text-sm`/`--text-md` sized for reading rather than for effect. A design system
that makes "create an event" painful has failed regardless of how it looks.

---

## Themes

`:root` is the dark theme, so the app works with no JavaScript at all.
`initTheme()` reads the stored preference and writes `<html data-theme>`.

- **dark — "CRT at night"**: off-ramp near-black page, shade-0 panels, shade-3 ink.
- **light — "the DMG screen"**: shade-3 page, shade-0 ink. The classic Game Boy.

`ThemeToggle` cycles `Auto → Light → Dark` and follows the OS live while in Auto.
`parseThemeMode`, `resolveTheme` and `nextThemeMode` are pure functions and are
tested; `localStorage` access is guarded so private modes degrade to `auto`
instead of throwing.

The light theme is declared **twice** in `tokens.css`: once under
`@media (prefers-color-scheme: light)` for the first paint before JavaScript runs,
and once under `[data-theme='light']` for the explicit override. That duplication
is a maintenance hazard, so `tokens.test.ts` slices the file on `@tokens` marker
comments and asserts both blocks declare the same tokens with the same values.

### Adding a token

1. Add it to the shared `:root` block (theme-independent) or to **all three**
   marked theme blocks.
2. Use it. A token that is read but never defined fails the test suite.

---

## Colour

```
--dmg-0 #0f380f   --dmg-1 #306230   --dmg-2 #8bac0f   --dmg-3 #9bbc0f
--nes-red #f83800                       the only accent
--crt-0 #081408   --crt-1 #041004       off-ramp near-blacks for the dark page
```

There is deliberately **no "danger text colour" token.** Red text on the dark
surface measures 3.5:1, which fails WCAG AA, and no single red clears both
themes' surfaces. So danger is always a filled block with near-black ink
(`--danger-fg` on `--danger-bg`, 5.0:1 in both themes). `tokens.test.ts` asserts
the token does not come back, and computes the contrast of every text and outline
pair from the token values themselves — the claims in the `tokens.css` header are
verified, not asserted.

---

## Type

No webfont is shipped, so `--font-pixel` and `--font-text` both resolve to the
system monospace stack. The display role is separated by **case, weight and
tracking**, not by face: headings, labels, buttons and nav are uppercase with
`--track-wide` letter-spacing.

To adopt a real pixel font, set `--font-pixel` to it and self-host the file. That
one line is the entire seam — every heading, label, button and nav item follows
it. This is the intended upgrade path if the "no new dependencies" constraint is
ever relaxed.

---

## Geometry: two shape rules

Everything in the system follows one of these, and nothing else:

1. **Outlined** surfaces — panels, buttons, inputs, lists, the modal — use a 2px
   hard border plus a 4px hard offset shadow. On press, a button translates by its
   own shadow offset and the shadow collapses, so it looks pushed into the screen.
2. **Filled** surfaces — primary/danger buttons, filled notices, field errors,
   ink badges — are notched with `--clip-notch` (a 4px square cut from each
   corner) and carry **no border**.

The reason for the split is mechanical: a `clip-path` slices the border off at
the corners, leaving gaps. Outlined shapes therefore use real borders, filled
shapes use the notch, and both degrade sensibly — under `forced-colors: active`
the notch is dropped and the shape is still visible.

`border-radius` must always be `var(--radius)` (which is `0px`); the test suite
rejects any other value, and any `box-shadow` that is not the sanctioned hard
offset, the pressed-to-nothing state, or an inset.

---

## Motion and sound

Transitions use `steps(2, end)` so state changes land in discrete frames rather
than easing — that is what makes a hover read as 8-bit. The busy state ends in a
hard-blinking block cursor (`steps(1)`).

The CRT effect is a fixed `body::after` overlay: a 1px scanline comb every 3px
plus a vignette. It never takes pointer events, its alpha is capped at 0.25 (and
tested), and it sits **below** the modal layer so dialogs stay crisp. Opt out with
`<html data-scanlines="off">`.

There is no flicker animation and no typewriter reveal: both are unpleasant within
about ten seconds.

**There is no sound.** 8-bit blips on click are the single most common way a retro
UI becomes irritating, so this is left out rather than hidden behind a flag. If
you want it, the seam is `Button` and `Notice`: add an optional `useUiSound()` hook
and call it from the `onClick`/mount paths, defaulting to off and persisted
alongside `clairvoyant.theme`.

Reduced motion is handled **where motion is declared** (`.cursor-blink` in
`utilities.css`, `.btn` in `components.css`) rather than with a blanket
`!important` override, which the linter rejects. Anything you add that animates
must handle `prefers-reduced-motion` itself.

---

## Components

| Component | Notes |
| --- | --- |
| `PixelIcon` | 8×8 SVG sprite. `name`, `size` (use multiples of 8), `title` for an accessible name. Decorative by default (`aria-hidden`). |
| `Button` | `variant: default \| primary \| danger \| ghost`, `icon`, `iconOnly`, `pending`. Defaults to `type="button"`. `pending` disables, sets `aria-busy` and appends the cursor. |
| `Panel` | The surface. `title`, `headingLevel` (default 1), `meta`, `actions`, `variant: default \| flush`. Renders an NES-style inverted title bar. |
| `TextField` / `TextArea` | `label`, `hint`, `error`. Wires `htmlFor`/`id` with `useId`, `aria-invalid`, and `aria-describedby`. |
| `Badge` | `tone: default \| ink \| muted`, optional `icon`. |
| `Notice` | `tone: info \| error \| success`, `title`, `icon`. Only `error` gets `role="alert"`. |
| `Loading` | Uppercase busy line with the block cursor, `role="status"`. |
| `Modal` | `title`, `onClose`, `closeLabel`, `initialFocusRef`. Escape, backdrop dismissal, scroll lock, focus restore. |
| `VisuallyHidden` | For labels on icon-only controls. |
| `ThemeToggle` | The three-state theme cycle. |
| `cx` | Conditional class-name join. |
| `ICON_GRIDS`, `ICON_NAMES`, `paintedPixels` | Icon data and the grid→offset helper. |

Layout is utilities, not components: `.stack`, `.cluster`, `.split`, `.muted`,
`.small`, `.mono`, `.data-list`, `.visually-hidden`, `.cursor-blink`,
`.pixel-notch`.

### Authoring an icon

Add an 8×8 grid of `#` (painted) and `.` (transparent) to `ICON_GRIDS`, and the
name to `ICON_NAMES`. The tests enforce exactly 8 rows of exactly 8 characters,
only those two characters, and at least one painted pixel. There is no build step
and no sprite sheet: each painted pixel becomes one `<rect>` on an `8 8` viewBox,
so it stays crisp at any multiple of 8.

---

## Testing

```bash
pnpm --filter @clairvoyant/ui test   # or: pnpm test  (turbo, from the root)
```

Tests run under [Vitest](https://vitest.dev). The static suites use the `node`
environment (no DOM) and cover:

- **Render output** — `renderToStaticMarkup` over every component: ARIA wiring,
  variant classes, disabled/busy states, label association, heading levels.
- **Icon data** — grid invariants and pixel counts.
- **Theme logic** — `parseThemeMode`, `resolveTheme`, `nextThemeMode`, and
  `initTheme` against a fake root, including `localStorage` that throws.
- **The stylesheet as data** — every `var()` is defined; dark and light declare
  the same tokens; the two light blocks agree exactly; the DMG ramp is unchanged;
  nothing is rounded; shadows are sanctioned; the CRT overlay is subtle and
  cannot intercept clicks; and every text/outline pair is **contrast-checked**.

The `src/__tests__/interaction/*.test.tsx` suites opt into jsdom with a
`// @vitest-environment jsdom` docblock and cover the live-DOM behaviour:

- **Modal** — Escape and backdrop dismissal, the close control, body scroll lock
  and restore, initial focus and focus restoration on unmount.
- **ThemeToggle** — the auto → light → dark cycle, `localStorage` persistence,
  `data-theme` painting, and the `matchMedia` listener lifecycle.

**Tests import the compiled `dist/`, not `src/`.** Testing the built artifact
catches the most likely failure of a NodeNext library — a missing `.js`
extension in an emitted import. `pnpm test` builds first, so the suite never runs
against a stale `dist/`.

---

## Accessibility notes

- Focus is a 2px ring pulled 2px off the element, so it never collides with the
  2px border. Visible on both themes against every surface.
- Links are always underlined, never distinguished by colour alone.
- `color-scheme` is set per theme so native chrome (date pickers, scrollbars,
  caret) follows the theme.
- Disabled controls use `opacity: 0.55`, which is exempt from contrast minimums.
- **Known limitation:** `Modal` does not trap Tab. Everything behind the backdrop
  remains tabbable. Acceptable for one dialog in a small app; replace it with a
  focus-trap primitive before stacking dialogs.

---

## Layout

```
src/
├─ components/     one file per component; TextField.tsx also exports TextArea
├─ icons/grids.ts  the 8x8 sprite data
├─ lib/            cx.ts (class names), theme.ts (all theme logic)
├─ styles/
│  ├─ index.css    the entry point — @imports the four layers below, in order
│  ├─ tokens.css   palette, type, space, geometry, motion, and the three themes
│  ├─ base.css     reset, CRT overlay, typography, focus, links
│  ├─ components.css
│  └─ utilities.css
└─ __tests__/      icons, components, theme, tokens
```

The CSS is exposed straight from `src/styles/index.css` through the package
`exports` map rather than being copied into `dist/`. `tsc` does not process CSS,
and this way the file Vite consumes is byte-identical to the file a designer
edits — no build step to forget.
