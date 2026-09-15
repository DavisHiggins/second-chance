# SecondChance — web app

The front end for SecondChance, which estimates how long each animal at the
Austin Animal Center may wait for adoption so staff attention goes where it
changes an outcome. It reads the City of Austin's public open-data feeds
directly; there are no fixtures and no stored snapshot to fall back to.

**The rule that overrides everything:** the system routes help *toward*
animals. Nothing in this interface may present a score as a reason to
euthanise, refuse intake, or reduce care. A low predicted adoption probability
means "this one needs more help". The short policy sits under every
operational page title; the full policy is on Impact, How it works and in the
data drawer, one click from the footer on every page.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

For a production check:

```bash
npm run build && npx next start -p 3477
```

Everything is optional in `.env.example`; copy it to `.env.local` only if you
want to set a Socrata app token or repoint a dataset id. With no env file the
app reads Austin's feeds anonymously, which is fine for development.

If a feed cannot be read, the app shows an unavailable state. It never
substitutes stored data, and there is no code path that can.

## Stack

Next.js 15 (App Router), React 19, TypeScript strict, Tailwind v4, Recharts for
charts, Framer Motion and GSAP for motion. No component library.

Data flows in one direction and pages only ever see the last step:

```
lib/austin/datasets.ts      dataset ids and the columns we ask for
lib/austin/client.server.ts paged Socrata reads, retries, no found_address
lib/austin/schemas.ts       zod validation; rejected rows are counted
lib/austin/build-episodes.ts intake/outcome join -> episodes
lib/austin/current-inventory.ts open episodes at an as-of time
lib/model/registry.server.ts scores them against the committed artifact
lib/shelter.server.ts       the only module a page imports
```

An episode is one stay, not one animal, so an animal that comes back three
times has three episode ids. The view cache (thirty minutes, `VIEW_CACHE_SECONDS`
in `lib/austin/status.ts`) sits around the finished view in `shelter.server.ts`,
not around the source rows: a feed is several megabytes and Next's data cache
refuses anything over 2MB. `lib/austin/time.ts` converts Austin's floating
timestamps through America/Chicago before any comparison with a real clock.

This deviates from the original spec, which asked for Vite + Wouter +
TanStack Query. Everything else in the spec package is honoured.

## Conventions that are load-bearing

- **Colour only ever through CSS custom properties**, all defined in
  `src/app/globals.css`. A raw hex in a component is a bug. The one exception
  is `viewport.themeColor` in `src/app/layout.tsx`, which the browser reads
  before any stylesheet.
- **The brand is the logo.** Navy `#05274c` and teal `#0a9e84` are sampled from
  `logo.png`. Components ask for the *role* (`--accent`, `--accent-strong`,
  `--accent-soft`, `--accent-contrast`) so the dark theme can substitute a
  brighter teal without touching a component.
- **Numeric spacing utilities are Tailwind's own 4px scale.** They are no
  longer remapped onto `--space-*` (that made `h-11` render at 96px). Use
  `var(--space-N)` by name when a component wants the design-system scale.
- Every number goes through `src/lib/format.ts`. `null` renders as
  "not measured", never 0.
- Every string comes from `src/lib/content.ts`.
- Every metric definition comes from `src/lib/metrics/registry.ts`, and every
  prediction horizon label from `src/lib/model/horizon.ts`.
- Motion primitives live in `src/components/motion/`: `SmoothScrollProvider`,
  `RevealText`, `RevealSection`, `AnimatedDivider`, plus the shell's
  `PageTransition` and `MobileMenu`. One RAF owner (the GSAP ticker), and every
  one is immediate under reduced motion.
- **No page imports below `lib/shelter.server.ts`.** That module is the seam
  where source data, model output and metric definitions meet, and it is the
  only place allowed to decide what a page may claim.
- **A missing value is never a zero.** An unscored animal carries `null`, and
  the interface says "prediction unavailable" rather than rendering a filler.
- **Public routes get `PublicStay`, not `ScoredStay`.** Passing a scored object
  to a client component serialises the probability into the page payload even
  when no card renders it, so the public projection has no field to leak.
- **Nothing states a model fact that is not in the artifact.** Version,
  training date and every metric come from `src/data/model/model.json`. An
  artifact claiming a future training date is refused and scoring switches
  off.

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` skips `tests/live-austin.test.ts` by default; set `AUSTIN_LIVE_TESTS=1`
to run it against the real feeds. `tests/model-parity.test.ts` checks this
runtime's scoring against golden vectors written by the training script, so the
TypeScript evaluator and the Python trainer cannot drift apart silently.
