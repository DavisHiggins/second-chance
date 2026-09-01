# SecondChance web app — build handoff

Written 2026-09-01. Resume point for the Next.js front end in `web/`.

---

## What this is

Building the SecondChance web application from the spec package in
`website_build_package/`. Read these before touching code — they are the
contract, and the numbers on screen must all trace back to `data/` or
`MEASURED_RESULTS.json`:

| File | What it gives you |
|---|---|
| `website_build_package/CLAUDE.md` | The build brief and the one non-negotiable rule |
| `PRODUCT_SPEC.md` | Every route, component, state, acceptance criterion |
| `DESIGN_SYSTEM.md` | Tokens. No raw hex in a component |
| `ANIMATION_SPEC.md` | What moves, how far, and the reduced-motion alternative for each |
| `API_CONTRACT.md` | Endpoint shapes, error states, static/live fallback contract |
| `CONTENT.md` | Every string, written and ready to paste |
| `ACCEPTANCE_CHECKLIST.md` | The definition of done — work through it |

**The rule that overrides everything:** the system routes help *toward* animals.
Nothing may present a score as a reason to euthanise, refuse intake, or reduce
care. A low predicted adoption probability means "this one needs more help".

---

## Stack decision (deviation from the spec — deliberate)

The spec asks for **Vite + React 18 + Wouter + TanStack Query**. The build is
**Next.js 15 App Router + React 19 + TypeScript strict + Tailwind v4**, because
the scaffold in `web/` was already created that way in the previous session and
it matches the global default in `~/.claude/CLAUDE.md`. Everything else from the
spec is honoured: Recharts for charts, Framer Motion for motion, no component
library, tokens in CSS custom properties.

Consequences of the swap, all handled:

- Data fetching is server components calling `src/lib/dataSource.ts` directly.
  No TanStack Query; loading states come from Suspense boundaries + skeletons.
- Routing is the App Router, not Wouter.
- Env vars are `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_FIXTURE_DELAY`
  (spec says `VITE_*`).
- Fixtures live at `web/src/data/` (copied from `website_build_package/data/`,
  plus `measured_results.json`). The duplicate `model_summary.json` was deleted;
  it was byte-identical to `MEASURED_RESULTS.json`.

**Flag this deviation to Davis if he has not already signed off on it.**

---

## Current state: all six routes build and render

`npx tsc --noEmit`, `npx eslint src`, and `npx next build` are all clean.
490 static pages (250 animals × 2 public/staff detail routes + 6 routes).
First Load JS: dashboard 278 kB, queue 270 kB, model 277 kB — under the 350 kB
budget, Recharts is the bulk of it.

### Built and visually verified in Chrome

- **Shell** — sticky header with wordmark (three-quarter circle mark), nav with
  sliding `layoutId` underline, freshness chip, model-version chip, density and
  theme toggles (both persisted, no-flash inline bootstrap script), skip link,
  three-column footer with the full use policy verbatim.
- **`/` dashboard** — hero count-up (10, once per session via sessionStorage),
  population donut, four stat tiles with sparklines and per-metric delta
  polarity, 30-day forecast (labelled as a seasonal baseline, per the honest
  state requirement), life-stage bars, model-health rows linking into `/model`.
- **`/queue`** — filters in the URL query string, threshold slider (local while
  dragging, URL on release), search with debounce, risk bar from the API's
  `risk_band` (never re-derived), probability meter, plain-language driver chip,
  inline expansion with diverging SHAP bars + intervention card + horizons,
  mark-as-handled with a 5s undo toast, live region.
- **`/animals/[id]`** — two-column with sticky sidebar, prediction panel,
  driver bars, ranked interventions with measured/assumed distinction, timeline,
  similar animals with real outcomes, and the demo-only "what actually
  happened" panel with its caveat.
- **`/discover`** — public tone, no probability/score/model language anywhere,
  longest-waiting sort, chip filters, whole card is the link target,
  `/discover/[id]` public profile.
- **`/planner`** — capacity input, channel checkboxes with staff minutes,
  grouped plan with per-group time, measured lift read from
  `headline.long_stay_lift_at_50`, adjustable assumption clearly marked, CSV
  export, print view.
- **`/model`** — summary strip, AUC by target and model with bootstrap
  intervals, calibration by decile, precision-at-k, sortable subgroup table with
  gap flagging, SHAP importance for both targets, monthly ranking and
  calibration timelines as two charts (never a dual axis), full use policy.

### Honest "not measured" states already in place

The fixture is thinner than the spec assumes; these render as explicit
"not measured" rather than zeros:

- `survival_curve` is `null` at every horizon for all 250 animals → the curve
  card says so and points at the population curves.
- No per-animal `interval` or `confidence` fields → intervals render as
  "interval not measured"; the low-confidence caveat never fires.
- No per-bin reliability curve in the results file → the calibration plot uses
  `survival.survival_calibration_by_decile` (10 bins) and the caption says so.
- No partial-dependence data → the age PD panel says it is not carried.
- Only 57 of 250 animals have a detail fixture; `getAnimal` falls back to the
  queue record and renders the missing sections as empty, never invented.
- Discover has no size chips because the export carries no size field.

---

## Three earlier fixes — verified in the browser 2026-09-01

1. `RiskBar.tsx` — `h-full` computed to 0 inside the flex row, so the coloured
   band was invisible. Changed to `self-stretch`. **Confirmed:** the band renders
   full-height on every queue row.
2. `StatTile.tsx` — the delta caption clipped ("vs this month last"). Sparkline
   narrowed to 96px and the chip stacked into two lines. **Confirmed:** "vs this
   month last year" reads in full on the adoption-rate tile.
3. `lib/motion.ts` — **the important one.** Framer's `staggerChildren` has no
   cap, so on `/discover` only the first card had appeared: 250 children × 45ms
   is an eleven-second entrance. The stagger is now an explicit per-child delay
   capped at eight children (`childVariant(index)`, cached), and the container
   no longer sets `staggerChildren`. **Confirmed:** all 250 discover cards are
   present and the grid settles immediately.

---

## Branding — applied 2026-09-01

The palette is now the logo's, sampled from `logo.png`: navy `#05274c` and teal
`#0a9e84`. Nothing was redesigned; the hues were swapped underneath the existing
token structure, so no layout, route or animation moved.

What changed, all of it in `globals.css` unless noted:

- **Brand tokens.** `--brand-navy`, `--brand-teal`, `--brand-teal-strong` (the
  one that clears 4.5:1 on light surfaces, so text may use it), plus the
  *role* tokens components actually ask for: `--accent`, `--accent-strong`,
  `--accent-soft`, `--accent-contrast`. The dark theme substitutes a brighter
  teal (`#2fc3a5`) by redefining the roles, never by editing a component.
- **Series slot 1 is the brand teal.** The blue that used to sit there moved to
  slot 3, displacing a green that would otherwise have sat next to the teal.
  Eight distinct hues, same fixed slot order, no cycling.
- **The sequential ramp is now pale mint → brand teal → brand navy**,
  interpolated in OKLab so lightness falls evenly across all thirteen stops.
  This is what recoloured the population donut, the life-stage bars and the
  SHAP importance charts.
- **Neutrals cooled** toward the navy in light mode; the dark ground is now a
  navy-black (`#06111b` / `#0c1b27`) rather than a neutral black, so the mark
  sits on its own colour family in both themes.
- **Header** carries the real mark plus the wordmark set two-tone the way the
  logo sets it — "Second" in the ink, "Chance" in the teal.
- **Footer is the navy band**, holding its colour in both themes: the mark, the
  wordmark, a one-line statement of the use rule, then the existing three
  columns. `--brand-band-*` tokens; `.brand-band` draws its own focus ring
  because the page ring is drawn against `--surface-card`, which is not the
  colour underneath it there.
- **`MonogramTile`** uses `--accent-soft` / `--accent-strong`. Since `photo_url`
  is null for nearly every animal, a wall of monograms now reads as one family
  rather than as a wall of missing images.
- **Icons and metadata.** `src/app/icon.png` and `src/app/apple-icon.png` are
  the mark on a navy square; `viewport.themeColor` is the brand navy. Those two
  hexes in `layout.tsx` are the only raw colour outside `globals.css` and they
  have to be — the browser reads them before any stylesheet.

Assets in `web/public/`, generated from `logo.png` at the repo root:
`logo-mark.png` and `logo-lockup.png` (navy cut, light grounds),
`logo-mark-dark.png` and `logo-lockup-dark.png` (pale cut, dark grounds).
`.brand-mark-light` / `.brand-mark-dark` show exactly one, keyed off the same
`data-theme` the pre-paint bootstrap sets, so there is no flash and no swap.

### A trap worth knowing about

`@theme inline` binds `--spacing-1` … `--spacing-12` to the design system's
space scale. **Numeric Tailwind spacing utilities are therefore remapped:**
`h-7` is 40px, `h-9` is 64px, `px-6` is 32px. Not 28, 36 and 24. A footer mark
set to `h-12` rendered at 128px. Measure in the browser before trusting a
number.

That same remapping meant the header row already overflowed 375px before the
mark was added (three 64px icon boxes plus a wordmark inside 375px of padding
and gaps). The header now uses `gap-2 px-4` and a 32px mark below `sm`, and
48px icon boxes — still clear of the 44px tap-target minimum. Measured at
375px: `scrollWidth === clientWidth`, with 7px of slack left in the spacer.

## How to run

```bash
cd web
npx next build && npx next start -p 3477
```

Two environment gotchas that cost time last session:

- **Port 3210 is taken by another of Davis's dev servers** (the Phi Delta Theta
  site). `next start` failed with EADDRINUSE and the browser showed a completely
  different app. Use 3477 or another free port.
- **The Chrome MCP tab pauses `requestAnimationFrame` when it is not visible.**
  Framer animations then freeze mid-flight and screenshots show blank or
  half-faded content. This is an automation artifact, not an app bug — a click
  or scroll in the tab resumes it. Verify content with `read_page` (the
  accessibility tree) rather than trusting a blank screenshot, and re-screenshot
  after an interaction.

---

## Remaining work, roughly in order

1. **Re-verify the three fixes above** at 1440px, light and dark.
2. **Tests.** Vitest and React Testing Library are not installed yet. The
   checklist names these: `dataSource` returns the same shape in both modes; the
   fallback path sets `using_fallback_data` and renders the chip; `format.ts`
   handles null, zero, negative and very large values; queue filtering per
   species and threshold; the rendered risk band matches the fixture for every
   animal; `/model` renders "not measured" when a field is missing; a snapshot
   test on the driver-label mapping so a new feature name cannot leak a raw
   column name.
3. ~~**Live-mode check.**~~ Done 2026-09-01. Built and served with
   `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:9/unreachable`; all seven route
   shapes returned 200 off the fixture and every one rendered the
   "Showing sample data" chip.
4. **Accessibility pass.** Run axe on every route, tab through each one, confirm
   focus is never lost behind the sticky header, check the greyscale test.
5. **Responsive pass.** 375, 768, 1024, 1440. The header is done — it now fits
   375px, measured. The queue rows are the hard one: below 640px they should
   read as stacked cards. Note that the Chrome MCP `resize_window` did not
   actually change the viewport on this machine; widths had to be measured by
   injecting the small-screen rules and reading `scrollWidth`. Use a real
   narrow window for the rest of this pass.
6. **Reduced-motion pass.** With `prefers-reduced-motion: reduce`, nothing
   travels, nothing shimmers, the count-up shows its final value.
7. **Lighthouse** ≥ 90 on the dashboard; confirm CLS < 0.05.
8. ~~`web/.env.example` and `web/README.md`.~~ Done 2026-09-01. `.gitignore`
   gained a `!.env.example` negation so the example survives the `.env*` rule.
9. ~~**Nothing is committed yet.**~~ Committed 2026-09-01 on the branch
   `feat/web-app`, in three units: scaffold and config, the app itself, then
   this handoff. `.gitignore` covers `node_modules`, `.next` and
   `*.tsbuildinfo`. **Nothing has been pushed and the branch is not merged** —
   `main` is still at the initial commit.

### Two known deviations to either fix or document

- **Virtualisation.** The spec wants windowing above 200 rows. What is built is
  progressive rendering: 100 rows, then 100 more as a sentinel scrolls into
  view. True windowing fights the inline row expansion and the `layout` reorder
  animation, which is why it went this way. The fixture never exceeds 250 rows.
- **Route exit fade.** ANIMATION_SPEC wants outgoing content to fade over 120ms.
  The App Router unmounts the old route immediately; only the entrance is
  implemented.

---

## File map

```
web/src/
  app/                     layout, globals.css (all tokens), 6 routes
  components/
    shell/                 Header, Footer, Preferences, Providers, PageMotion,
                           FreshnessChip, UsePolicyBanner
    ui/                    Card, Status, MonogramTile
    charts/                ChartFrame (role=img + table toggle), DriverBars,
                           SurvivalCurve
    dashboard/             CountUp, PopulationDonut, StatTile, ForecastChart,
                           SegmentBars, ModelHealthPanel
    queue/                 QueueClient, QueueControls, QueueRow, ExpandedCard,
                           ProbabilityMeter, RiskBar, InterventionCard, skeleton
    detail/                PredictionPanel, Timeline, SimilarAnimals
    discover/              DiscoverGrid
    planner/               PlannerClient
    model/                 AucByTarget, CalibrationPlot, PrecisionAtK,
                           SubgroupTable, ShapImportance, MonthlyTimeline
  lib/                     dataSource, format, motion, content, driverLabels,
                           publicCopy
  types/api.ts             generated from API_CONTRACT.md
  data/                    the fixtures, imported only by dataSource.ts
  app/icon.png             the mark on a navy square, favicon + apple-icon
web/public/                logo-mark{,-dark}.png, logo-lockup{,-dark}.png
```

Conventions that are load-bearing and easy to break:

- Every number goes through `lib/format.ts`. `null` renders as "not measured",
  never 0.
- Every string comes from `lib/content.ts`, verbatim from CONTENT.md.
- Every motion variant comes from `lib/motion.ts`.
- No component imports from `src/data/` — everything goes through
  `dataSource.ts`.
- Colour only ever via CSS custom properties. `eslint` will not catch a raw hex;
  grep for `#` in `src/components` before calling it done. The only permitted
  exception is `viewport.themeColor` in `layout.tsx`.
- Components ask for the accent *role* (`--accent`, `--accent-strong`,
  `--accent-soft`, `--accent-contrast`), never `--brand-teal` directly. Charts
  keep using `--series-*` and `--ramp-*`.
- Numeric Tailwind spacing utilities are remapped to the space scale. `h-9` is
  64px. See the trap noted under Branding.
