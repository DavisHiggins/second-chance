# SecondChance upgrade checklist (September 2026)

Working checklist for the refinement described in `SecondChance-Claude-Code-Upgrade.md`.
Ticked items are implemented and verified locally; unticked items are open.

## Phase 1 — baseline and facts

- [x] Baseline: typecheck, lint, 25 unit tests green; dev server on :3477 reads live Austin feeds
- [x] Source map recorded below
- [x] Animaster selection recorded in `web/ATTRIBUTION.md`
- [x] Timestamp semantics: floating source timestamps are America/Chicago (verified against Austin `rowsUpdatedAt`)
- [x] Fix false "feed delayed" warning (source rows were compared to UTC wall clock)
- [x] Detail page title from animal name + ID, not the episode-id tail
- [x] Long-stay horizon labelled as an intake-time estimate; "Already waiting over 60 days" leads when true
- [x] Planner evidence labels: "Historical evidence" not "Measured"; scenario uplift in percentage points, capped
- [x] Adoption-rate tile spark is a monthly rate with eligible denominators; partial months labelled
- [x] Life-stage chart shows adopted sample per median, inside the twelve-month window
- [x] Calibration intercept wording matches the implemented regression
- [x] Dead-on-arrival rows in the evaluation set disclosed on the Model page (retraining left as a documented task)
- [x] Server-render the H1 and initial record batch; motion attaches to existing DOM

## Phase 2 — shared foundation

- [x] Tokens: 16px body, larger operational/story H1 scales, spacing tokens separated from utilities
- [x] Button component with variants and states
- [x] Header: content-fit breakpoints, Learn disclosure, 44px targets, scroll state, one status control
- [x] Mobile menu: two-line hamburger → X, branded sheet, numbered links, focus trap, Escape, body/Lenis lock release
- [x] Footer: concise summary, compact nav, source link, data-details access, team credit
- [x] Motion: SmoothScrollProvider (Lenis), RevealText, RevealSection, AnimatedDivider, PageTransition
- [x] Reduced motion: every primitive is immediate and readable

## Phase 3 — operational pages

- [x] Dashboard: H1, context strip, KPI disclosures, attention panel with honest horizon, numbered dividers, workflow guide
- [x] Queue: visible labels, filter chips, reset, URL-backed filters/sort/view, scroll restore, separated horizons, supportive labels, View record / Add to plan
- [x] Records: search, age and wait filters, bounded batches, "match vs shown" summary, URL filters
- [x] Detail: breadcrumb with origin, timeline, age now vs at intake, unknown ≠ No, official contact link, closed/invalid IDs
- [x] Planner: three steps, queue-to-plan selection, removal/reassignment, planning estimate, local checklist, safe CSV, print
- [x] Shared metric registry used by tiles, drawer, detail and Model

## Phase 4 — story and methodology

- [x] About page with approved copy and four names
- [x] Impact refined into short sections with dividers and reveal headings
- [x] How it works: plain-language intro, anchored sections, TOC, wording fixes, calibration panel renamed
- [x] Source/refresh explanation with the implemented cadence

## Phase 5 — verification

- [x] typecheck, lint, unit tests (new tests for time, status, horizon, planner math, CSV, titles)
- [x] Production build
- [x] Browser pass: light/dark; 360, 390 and 1440 widths (the latter via iframe emulation, since the test browser's viewport is pinned at 1022px by a docked panel); menu and drawer keyboard, Escape, focus restoration, rapid toggling; queue → record → back filter and scroll restoration
- [x] Reduced motion: verified by code path (Lenis not created, RevealText skips the split, Framer `reducedMotion="user"`, CSS overrides) — not exercised through an OS toggle in this session
- [x] Exports: CSV content verified in-browser; print stylesheet written, not printed in this session
- [x] README overhaul, MIT LICENSE, ATTRIBUTION updated
- [ ] Performance: no lab or field Web Vitals measured in this session; first-load JS is 341 kB on `/` (Recharts + GSAP + Lenis), 173 kB on `/queue`
- [ ] 200% zoom and 768/1024 breakpoints not screenshotted (layouts are fluid between the tested widths)
- [ ] Retrain to exclude dead-on-arrival records (documented issue; requires the Python trainer and a new evaluation)

## Source map

| Requirement | Where it lives |
| --- | --- |
| Timestamps and zones | `web/src/lib/austin/time.ts`, `status.ts`, `current.server.ts` |
| Episode pairing | `web/src/lib/austin/build-episodes.ts` |
| Metrics and windows | `web/src/lib/austin/metrics.ts`, `web/src/lib/shelter.server.ts` |
| Metric registry | `web/src/lib/metrics/registry.ts` |
| Horizon labels | `web/src/lib/model/horizon.ts` |
| Scoring | `web/src/lib/model/*` |
| Planner math and CSV | `web/src/lib/planner.ts`, `web/src/components/planner/*` |
| Shell, nav, footer, menu | `web/src/components/shell/*` |
| Motion primitives | `web/src/components/motion/*` |
| Page copy | `web/src/lib/content.ts` |
