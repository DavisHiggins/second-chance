# SecondChance: build instructions for Claude Code

You are building the SecondChance web application from scratch. Everything you
need is in this directory. Read all of it before writing any code.

## What this is

SecondChance is a shelter operations tool for the Austin Animal Center. It
forecasts how long each animal will wait for adoption and surfaces the ones at
risk of becoming long-stay residents, so that limited staff attention goes where
it changes an outcome.

The models are already built, trained and evaluated. Real held-out numbers live
in `MEASURED_RESULTS.json` in this directory. **Every number you put on screen
must come from that file or from `data/`.** Do not invent a metric, a count, or a
sample animal. If a number you want does not exist, either leave the element out
or render the honest "not measured" state described in `PRODUCT_SPEC.md`.

## The one rule that overrides every other instruction

This system routes help *toward* animals. It never routes help away from them.

Nothing in this application may present a score as a reason to euthanise, refuse
intake, deprioritise medical care, or otherwise reduce what an animal receives. A
low predicted adoption probability means "this one needs more help", full stop.
The API returns a `use_policy` object on every response; the UI must render it in
the places `PRODUCT_SPEC.md` specifies, and you must not add a feature that
contradicts it. If a requirement anywhere seems to ask for a ranking that would
justify withholding care, do not build it, and say so.

## Files in this directory, in reading order

| File | What it gives you |
|---|---|
| `PRODUCT_SPEC.md` | Every page, every component, every state, and the acceptance criteria |
| `DESIGN_SYSTEM.md` | Colour, type, spacing, elevation, motion tokens. Do not improvise these |
| `ANIMATION_SPEC.md` | Exactly which things move, how far, how fast, and when they must not |
| `API_CONTRACT.md` | Endpoint shapes, error states, the offline fallback contract |
| `CONTENT.md` | Every string in the product, written and ready to paste |
| `MEASURED_RESULTS.json` | The real evaluation numbers, for the model transparency page |
| `data/` | Real exported JSON the app runs on with no backend |
| `ACCEPTANCE_CHECKLIST.md` | What "done" means. Work through it before you finish |

## Stack

- **Vite + React 18 + TypeScript.** Strict mode on.
- **Tailwind CSS** for layout and spacing, with the design tokens from
  `DESIGN_SYSTEM.md` declared as CSS custom properties in `src/styles/tokens.css`
  and mapped into `tailwind.config.js`. Never write a raw hex in a component.
- **Recharts** for charts. It is the least fussy library that respects a custom
  palette, and the chart specs in `PRODUCT_SPEC.md` are written against it.
- **Framer Motion** for the motion described in `ANIMATION_SPEC.md`.
- **TanStack Query** for data fetching, caching and the loading and error states.
- **Wouter** for routing. React Router is fine too; pick one and stay with it.
- **Vitest + React Testing Library** for the tests listed in the checklist.

No component library. No Bootstrap, no Material, no shadcn scaffold you then
fight. The design system here is specific and a generic kit will fight back.

## How the app gets its data

Two modes, and the app must work in both:

1. **Static mode (the default, and what you should build first).** Everything in
   `data/` is bundled and imported directly. No network. This is the mode the
   demo runs in and the mode a grader will see. It must be complete and it must
   never show a spinner that does not resolve.
2. **Live mode.** If `VITE_API_BASE_URL` is set, the app calls the real API
   described in `API_CONTRACT.md` instead. Every fetch falls back to the static
   fixture on failure, and the header shows a small "showing sample data" chip
   when it does. Silently serving stale data while looking live is the exact
   failure this project exists to argue against.

Implement this as a single `src/lib/dataSource.ts` module with the same interface
in both modes, so no component knows which one it is in.

## Non-negotiable behaviours

**Every screen that shows a prediction also shows two things:** the model version
and the data freshness timestamp. They come from the API response or the fixture
metadata. Put them in the header, always visible, never behind a click.

**Uncertainty is rendered, not hidden.** Where the data carries an interval,
draw it. A bare point estimate on a screen a person will act on is a design bug.

**Nothing important is conveyed by colour alone.** Every status colour ships with
an icon and a text label. Every chart with more than one series has a legend and
a table view toggle.

**Keyboard and screen reader support is part of the build, not a follow-up.**
Every interactive element is reachable by tab, has a visible focus ring using the
token in the design system, and has an accessible name. Charts have a
`role="img"` with a written summary, plus the table toggle.

**Respect `prefers-reduced-motion`.** `ANIMATION_SPEC.md` says what each
animation degrades to. It is not "turn everything off"; it is a specified
alternative for each one.

## Build order

Work in this order. Each step should end with something that runs.

1. Scaffold, tokens, Tailwind config, base layout shell, routing.
2. `dataSource.ts` plus the TypeScript types generated from `API_CONTRACT.md`.
3. The app shell: header with model version and freshness, navigation, footer
   with the use policy.
4. **Operations dashboard** (`/`). The highest value screen; build it first.
5. **Needs attention queue** (`/queue`). The second highest.
6. **Animal detail** (`/animals/:id`).
7. **Discovery** (`/discover`), the public-facing view.
8. **Outreach planner** (`/planner`).
9. **Model transparency** (`/model`), driven entirely by `MEASURED_RESULTS.json`.
10. Motion pass, following `ANIMATION_SPEC.md`.
11. Accessibility pass, then the acceptance checklist.

## Code standards

- TypeScript strict. No `any`, no non-null assertions to silence the compiler.
- One component per file, named the same as the file, default export at the
  bottom.
- Components take data as props. Data fetching lives in route-level containers or
  in hooks, never inside a presentational component.
- Comments explain *why*, not *what*. `// map over the animals` is noise;
  `// sorted by risk descending because the queue is worked top down` is useful.
- Numbers are formatted through `src/lib/format.ts`, never inline. Probabilities
  render as whole percents with a "%" sign, days as "12 days", counts with
  thousands separators.
- No `console.log` in committed code.

## What good looks like

The dashboard should load in under a second, feel considered rather than
decorated, and be something a shelter director would trust. The motion should be
the kind you notice only if you look for it. A number should never appear without
a unit, a timestamp, or a way to find out where it came from.
