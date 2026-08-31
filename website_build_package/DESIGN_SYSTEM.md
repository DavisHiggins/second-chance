# SecondChance design system

Every value here is fixed. Declare them once in `src/styles/tokens.css`, map them
into `tailwind.config.js`, and reference them by role. A raw hex code in a
component is a bug.

The palette is not decorative. The categorical slots were validated for colour
vision deficiency separation on adjacent pairs, and the ordering is the safety
mechanism, not a preference. Reordering the slots or adding a ninth breaks the
validation.

---

## Colour

### Surfaces and ink

| Role | Light | Dark |
|---|---|---|
| `--surface-page` | `#f9f9f7` | `#0d0d0d` |
| `--surface-card` | `#fcfcfb` | `#1a1a19` |
| `--surface-raised` | `#ffffff` | `#232322` |
| `--surface-sunken` | `#f2f1ee` | `#131312` |
| `--ink-primary` | `#0b0b0b` | `#ffffff` |
| `--ink-secondary` | `#52514e` | `#c3c2b7` |
| `--ink-muted` | `#898781` | `#898781` |
| `--border-hairline` | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` |
| `--grid-line` | `#e1e0d9` | `#2c2c2a` |
| `--axis-line` | `#c3c2b7` | `#383835` |

### Categorical series, in fixed slot order

Assign in order. Never cycle. Never generate a ninth.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

**Series cap.** In any chart where every pair of series can sit side by side
(scatter, bubble, small multiples) only the first three slots are safe. Past
three, fold the rest into "Other" or facet into small multiples.

Three light-mode slots (magenta, yellow, aqua) fall below 3:1 contrast on the
light card surface. Where you use them, ship visible direct labels or the table
view. That is the relief rule and it is not optional.

### Sequential ramp: one hue, light to dark

Used for magnitude: wait-time heat, capacity fill, density.

| step | hex | step | hex |
|---|---|---|---|
| 100 | `#cde2fb` | 450 | `#2a78d6` |
| 150 | `#b7d3f6` | 500 | `#256abf` |
| 200 | `#9ec5f4` | 550 | `#1c5cab` |
| 250 | `#86b6ef` | 600 | `#184f95` |
| 300 | `#6da7ec` | 650 | `#104281` |
| 350 | `#5598e7` | 700 | `#0d366b` |
| 400 | `#3987e5` | | |

For an **ordinal** ramp (discrete ordered steps such as wait-time tiers) start no
lighter than step 250 on light, and no darker than step 600 on dark.

### Diverging pair: blue to red, gray midpoint

For anything with a signed centre: predicted minus observed, above or below
target. Midpoint gray is `#f0efec` light, `#383835` dark. Equal step count each
arm. Never a hue at the midpoint.

### Status colours: fixed, never themed, never reused as a series colour

| Role | Hex | Icon | Used for |
|---|---|---|---|
| good | `#0ca30c` | check circle | on track, model healthy, fresh data |
| warning | `#fab219` | triangle | drift warning, calibration slipping |
| serious | `#ec835a` | alert circle | approaching long-stay threshold |
| critical | `#d03b3b` | alert octagon | long-stay risk, stale data, alarm |

On the light surface, `warning` and `serious` are below 3:1 by design. **Every
status colour ships with its icon and a text label.** A coloured dot on its own
never carries meaning.

---

## Type

System sans throughout. No display face, no serif, anywhere.

```css
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;
```

| Token | Size / line height | Weight | Tracking | Used for |
|---|---|---|---|---|
| `--text-hero` | 44px / 1.04 | 600 | -0.022em | the single number on a stat tile |
| `--text-display` | 32px / 1.12 | 600 | -0.018em | page titles |
| `--text-title` | 22px / 1.22 | 600 | -0.012em | card titles |
| `--text-subtitle` | 17px / 1.35 | 500 | -0.006em | section headers |
| `--text-body` | 15px / 1.55 | 400 | 0 | prose |
| `--text-small` | 13px / 1.45 | 400 | 0 | secondary detail |
| `--text-caption` | 11.5px / 1.35 | 500 | 0.012em | axis labels, chips, timestamps |
| `--text-overline` | 11px / 1.2 | 600 | 0.09em | section eyebrows, uppercase |

Numerals in tables, stat tiles and axes use `font-variant-numeric: tabular-nums`
so digits stop jittering when a value updates.

---

## Space

A 4px base. Use the scale; do not invent an 18px.

```
--space-1: 4px    --space-5: 24px   --space-9:  64px
--space-2: 8px    --space-6: 32px   --space-10: 80px
--space-3: 12px   --space-7: 40px   --space-11: 96px
--space-4: 16px   --space-8: 48px   --space-12: 128px
```

Layout: 12 column grid, 24px gutters, max content width 1440px, page padding
24px on mobile and 40px from 1024px up.

---

## Shape and elevation

```
--radius-sm: 6px      inputs, chips
--radius-md: 10px     buttons, small cards
--radius-lg: 16px     cards, panels
--radius-xl: 24px     modals, the hero panel
--radius-full: 9999px pills, avatars
```

Elevation is a hairline border plus a soft shadow. Never a shadow alone; on the
near-white surface a borderless card dissolves.

```css
--elev-0: none;
--elev-1: 0 1px 2px rgba(11,11,11,0.04), 0 1px 1px rgba(11,11,11,0.03);
--elev-2: 0 2px 6px rgba(11,11,11,0.05), 0 1px 2px rgba(11,11,11,0.04);
--elev-3: 0 8px 24px rgba(11,11,11,0.07), 0 2px 6px rgba(11,11,11,0.04);
--elev-4: 0 20px 48px rgba(11,11,11,0.10), 0 4px 12px rgba(11,11,11,0.05);
```

In dark mode, shadows do almost nothing. Swap to a raised surface plus a slightly
brighter hairline instead of deepening the shadow.

---

## Focus

One ring, everywhere, on every focusable element:

```css
--focus-ring: 0 0 0 2px var(--surface-card), 0 0 0 4px #2a78d6;
```

Applied with `:focus-visible`, never removed, never replaced with a colour change
alone.

---

## Motion tokens

Durations and easings live here; what actually moves is in `ANIMATION_SPEC.md`.

```css
--dur-instant:  90ms    /* hover, focus, colour shifts */
--dur-fast:    160ms    /* chips, tooltips, small state */
--dur-base:    240ms    /* cards, list items, panels */
--dur-slow:    420ms    /* page transitions, chart draw-in */
--dur-deliberate: 720ms /* the one hero number count-up */

--ease-out:     cubic-bezier(0.22, 1, 0.36, 1);
--ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);
```

`--ease-spring` overshoots. Use it only for something arriving that should feel
physical, never for anything that could be read as playful about an animal's
situation.

---

## Charts

- Line weight 2px, `stroke-linecap: round`.
- Data-ends on bars rounded 4px, anchored square to the baseline.
- 2px gap of surface colour between adjacent fills and stacked segments.
- Markers at least 8px, with a 2px surface-coloured ring where marks overlap.
- Gridlines: horizontal only, `--grid-line`, 1px, behind the data.
- No axis line on the value axis; a 1px `--axis-line` on the category axis only.
- Direct-label selectively: first, last, and any point being discussed. Never
  every point.
- Text in charts wears ink tokens, never the series colour. The coloured mark
  beside the label carries identity.
- Every chart gets a hover layer: crosshair plus tooltip on lines and areas,
  per-mark tooltip on bars, dots and cells.
- Every chart with two or more series gets a legend and a "view as table" toggle.

**Never a dual-axis chart.** Two measures on different scales become two charts,
small multiples, or one chart with both series indexed to a common base.

---

## Density

Two modes, toggled in settings and stored per viewer.

- **Comfortable** (default): 48px table rows, `--space-5` card padding.
- **Compact**: 36px table rows, `--space-4` card padding, `--text-small` in
  tables. This is the mode a kennel manager with 900 animals will live in.

---

## Iconography

Lucide, 1.5px stroke, 20px in body context and 16px inside chips. Every icon that
carries meaning gets an `aria-label`; every decorative icon gets
`aria-hidden="true"`.
