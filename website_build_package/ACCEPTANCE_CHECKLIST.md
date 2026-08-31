# SecondChance acceptance checklist

Work through this before calling the build finished. Each item is checkable in a
minute or less. If an item cannot be checked because the feature is not built,
the build is not finished.

## Correctness of what is on screen

- [ ] Every number on `/model` traces to a field in `MEASURED_RESULTS.json`.
      Grep the source for numeric literals inside JSX; there should be none
      except axis bounds and layout values.
- [ ] No animal, name, breed or outcome anywhere in the app was invented. All of
      them come from `data/`.
- [ ] Where the data has `null`, the UI says "not measured", never "0".
- [ ] Probabilities render as whole percents with a `%`. Days render as
      "N days". Counts use thousands separators.
- [ ] Every probability that has an interval in the data shows that interval.
- [ ] The survival curve's caption explains that `still_in_shelter` and
      `adopted_by` do not sum to one.
- [ ] `risk_band` comes from the API, not from a client-side threshold.

## The rules that are not negotiable

- [ ] Model version and data freshness are visible on every route, in the header,
      without a click.
- [ ] The use-policy banner is present on `/`, `/queue` and `/planner` and is not
      dismissible.
- [ ] The full use policy appears in the footer and on `/model`, verbatim from
      `CONTENT.md`.
- [ ] Nothing in the product ranks animals in a way that could justify reducing
      care. No "low priority" label, no red "not viable" state, no sort that
      surfaces animals to remove.
- [ ] `/discover` contains no probability, no score, no risk band and no model
      vocabulary of any kind.
- [ ] Interventions marked `assumed` are visibly distinguished from those marked
      `measured`.

## Data source behaviour

- [ ] With the network disabled, every route renders completely from `data/`.
- [ ] With `VITE_API_BASE_URL` set to an unreachable host, every route falls back
      to the fixture **and** the header shows the sample-data chip.
- [ ] No component imports from `data/` directly; everything goes through
      `dataSource.ts`.
- [ ] A 404 on an animal renders the not-found empty state, not an error banner.

## Motion

- [ ] The hero number counts up exactly once. Navigate away and back; it does not
      count again in the same session.
- [ ] No per-animal number counts up anywhere.
- [ ] Queue rows reorder with a layout animation rather than a re-mount. Change
      the sort and watch a specific row travel.
- [ ] Changing a filter does not replay the entrance stagger.
- [ ] The stagger stops after eight children. Load a 200-row queue and confirm
      the last row is not still arriving a second later.
- [ ] Charts interpolate on data change rather than redrawing from zero.
- [ ] The freshness chip pulses only in the stale state, and nothing else in the
      product pulses.
- [ ] With `prefers-reduced-motion: reduce` set in the OS: nothing travels,
      nothing shimmers, the count-up shows its final value, and every route is
      still fully usable.

## Accessibility

- [ ] Tab through every route. Focus is always visible, uses the design system
      ring, and never disappears behind a sticky header.
- [ ] Every interactive element has an accessible name. Icon-only buttons have
      `aria-label`.
- [ ] Every chart has `role="img"` with a written `aria-label` summary, and a
      working "view as table" toggle.
- [ ] Every status colour is accompanied by an icon and a text label. Turn the
      display to greyscale; all state is still readable.
- [ ] Colour contrast: body text at least 4.5:1, large text and UI components at
      least 3:1. Check the magenta, yellow and aqua series slots specifically, and
      confirm the relief rule is applied where they fall short.
- [ ] Filter changes announce through a live region.
- [ ] The skip link is the first focusable element and works.
- [ ] Run axe on every route. Zero violations.

## Responsive

- [ ] 375px: no horizontal scroll on any route. Queue rows are stacked cards.
- [ ] 768px: two-column tiles, charts full width, no clipped labels.
- [ ] 1024px: sticky sidebar on animal detail behaves.
- [ ] 1440px and up: content is centred and capped, not stretched.
- [ ] Charts remain legible at every breakpoint. No overlapping axis labels.

## Performance

- [ ] Lighthouse performance at least 90 on the dashboard.
- [ ] Cumulative layout shift under 0.05 on every route.
- [ ] Total JavaScript under 350KB gzipped. Check the bundle report.
- [ ] The queue stays smooth at 1,000 rows. Virtualisation kicks in above 200.
- [ ] No skeleton flashes for content that arrives in under 400ms.

## Code quality

- [ ] TypeScript strict passes with zero errors and zero `any`.
- [ ] ESLint passes with zero warnings.
- [ ] No raw hex colour in any component. All colour comes from tokens.
- [ ] No `console.log` in committed code.
- [ ] Every number formatted through `src/lib/format.ts`.
- [ ] Motion variants live in `src/lib/motion.ts` and are imported, not
      redefined.

## Tests

- [ ] `dataSource.ts` returns the same shape in both modes. Test both.
- [ ] The fallback path sets `usingFallbackData` and renders the chip.
- [ ] `format.ts` handles null, zero, negative and very large values.
- [ ] The queue filters correctly for each species and each threshold value.
- [ ] The risk band shown matches the band in the fixture for every animal.
- [ ] `/model` renders correctly when a results field is missing, showing "not
      measured" rather than crashing.
- [ ] A snapshot test on the driver-label mapping, so a new feature name cannot
      silently render as a raw column name.

## The final look

- [ ] Open every route at 1440px and screenshot it. Look at the screenshots, not
      the code.
- [ ] Nothing is centred that should be left-aligned. Data is left-aligned;
      numbers are right-aligned in tables.
- [ ] Spacing comes from the scale. Nothing is 18px.
- [ ] The dashboard reads as one composition, not five cards that happen to be on
      the same page.
- [ ] A shelter director could look at this for thirty seconds and know what to
      do next.
