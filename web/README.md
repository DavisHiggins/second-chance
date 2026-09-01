# SecondChance — web app

The front end for SecondChance, which forecasts how long each animal at the
Austin Animal Center will wait for adoption so staff attention goes where it
changes an outcome.

**The rule that overrides everything:** the system routes help *toward*
animals. Nothing in this interface may present a score as a reason to
euthanise, refuse intake, or reduce care. A low predicted adoption probability
means "this one needs more help". The full policy is in the footer of every
page, verbatim, and it is not collapsible.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

For a production check:

```bash
npm run build && npx next start -p 3477
```

Port 3210 is taken by another dev server on this machine; pick something else.

Copy `.env.example` to `.env.local` if you want to point at a live API. With no
env file the app runs on the fixtures in `src/data/` and says so in the header.

## Stack

Next.js 15 (App Router), React 19, TypeScript strict, Tailwind v4, Recharts for
charts, Framer Motion for motion. No component library. Data fetching is server
components calling `src/lib/dataSource.ts`; loading states are Suspense
boundaries with skeletons.

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
- **Numeric spacing utilities are remapped.** `@theme inline` binds
  `--spacing-1` … `--spacing-12` to the design system's space scale, so `h-7` is
  40px and `h-9` is 64px, not 28px and 36px. Measure before assuming.
- Every number goes through `src/lib/format.ts`. `null` renders as
  "not measured", never 0.
- Every string comes from `src/lib/content.ts`.
- Every motion variant comes from `src/lib/motion.ts`.
- No component imports from `src/data/`; everything goes through
  `dataSource.ts`.

## Checks

```bash
npx tsc --noEmit && npx eslint src && npm run build
```
