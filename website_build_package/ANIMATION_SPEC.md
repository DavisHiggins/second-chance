# SecondChance motion specification

Motion here has three jobs and no others: show where something came from, draw
attention to a change the viewer did not cause, and make a wait feel shorter than
it is. Anything that moves for a fourth reason gets cut.

This product is about animals waiting in a shelter. The motion should read as
composed and confident, not playful. Nothing bounces for fun. Nothing celebrates.

Every entry below specifies its reduced-motion alternative. "Reduced motion" does
not mean "nothing happens"; it means the state change is instant or cross-fades
instead of travelling.

---

## Global rules

1. **Nothing animates on a route the user did not navigate to.** Off-screen
   components mount in their final state.
2. **Nothing animates twice.** Entrance animations fire once per mount, tracked
   with a `hasAnimated` ref. A list that re-renders because a filter changed
   re-orders; it does not re-enter.
3. **Layout never shifts after paint.** Reserve the space, then fill it. A card
   that grows 40px once its data arrives is a bug, not an animation.
4. **Nothing longer than 720ms.** One element in the whole product is allowed
   that long: the hero count-up on the dashboard.
5. **Transform and opacity only.** Never animate `width`, `height`, `top` or
   `left`. Use `transform: scaleX()` with `transform-origin` for bars.
6. `prefers-reduced-motion: reduce` is honoured through a single
   `useReducedMotion()` hook read once and passed down, not checked in twenty
   components.

---

## 1. Page entrance

**What:** The route's content rises 12px and fades in, children staggered.

**How:** Framer Motion. Container `staggerChildren: 0.045`, `delayChildren: 0.05`.
Child variants `{ opacity: 0, y: 12 }` to `{ opacity: 1, y: 0 }`, `--dur-base`,
`--ease-out`.

**Cap the stagger.** Only the first eight children stagger. The ninth onward
arrives with the eighth. A twenty item stagger at 45ms means the last item lands
almost a second late, which reads as slow, not as considered.

**Reduced motion:** opacity only, `--dur-fast`, no stagger.

---

## 2. The hero number (dashboard only)

**What:** The headline count on the dashboard, "N animals need attention this
week", counts up from zero.

**How:** `requestAnimationFrame` over `--dur-deliberate` with an ease-out cubic,
`Math.round` each frame, `tabular-nums` so the width never changes. Once only,
on first mount.

**Never** count up a probability, a percentage, or a per-animal figure. A number
attached to one animal's situation should appear, not perform.

**Reduced motion:** final value, immediately.

---

## 3. Stat tiles

**What:** Four tiles on the dashboard. Each has a small sparkline and a delta
chip.

- Tile entrance: part of the page stagger, above.
- Sparkline: path draws left to right using `stroke-dasharray` and
  `stroke-dashoffset`, `--dur-slow`, `--ease-out`, delayed 120ms after the tile.
- Delta chip: fades in at the end of the sparkline draw, `--dur-fast`.
- Hover: tile lifts to `--elev-2` and the hairline brightens, `--dur-instant`.

**Reduced motion:** sparkline renders complete; chip fades over `--dur-instant`.

---

## 4. Charts

**Line and area:** path draws left to right, `--dur-slow`, `--ease-out`. Area
fill cross-fades in behind the line over the last 40 percent of the draw.

**Bars:** grow from the baseline with `transform: scaleY()`,
`transform-origin: bottom`, `--dur-base`, `--ease-out`, staggered 30ms per bar,
capped at 12 bars of stagger.

**Horizontal bars:** the same with `scaleX()` and `transform-origin: left`.

**On data change (filter, date range):** do not re-draw. Interpolate to the new
values over `--dur-base` with `--ease-in-out`. A chart that re-animates from zero
every time a filter moves is exhausting.

**Crosshair and tooltip:** crosshair follows instantly, no easing, no lag. The
tooltip follows at `--dur-instant`. A tooltip that eases behind the cursor feels
broken.

**Reduced motion:** everything renders complete. Data changes swap instantly.

---

## 5. The needs-attention queue

**What:** A ranked list. Items reorder as filters change.

- Entrance: stagger, first eight only, per the global rule.
- **Reorder:** Framer Motion `layout` on each row, `--dur-base`, `--ease-in-out`.
  This is the one place motion is genuinely load-bearing: seeing a row travel
  from position 14 to position 3 tells the viewer the ranking changed, which a
  cross-fade cannot.
- Row hover: background moves to `--surface-sunken` over `--dur-instant`, and the
  risk bar on the left grows 2px wider.
- Expanding a row for the explanation card: height auto-animates over
  `--dur-base` with the content fading in over the last 60 percent.
- Marking an animal as actioned: the row fades to 40 percent opacity, a check
  icon scales in with `--ease-spring` over `--dur-fast`, then the row collapses
  after 600ms. **This is the only spring in the product**, and it fires on a
  human's own deliberate action, never on data arriving.

**Reduced motion:** rows swap position instantly; the expansion opens instantly;
the actioned state applies with no scale.

---

## 6. Risk bars and probability meters

**What:** The horizontal bar showing predicted adoption probability.

**How:** `transform: scaleX()` from 0, `transform-origin: left`, `--dur-base`,
`--ease-out`, once on mount. The uncertainty band renders at the same time and
does not animate separately.

The number beside the bar does not count up. See rule 2 above: this number
belongs to one animal.

**Reduced motion:** full width immediately.

---

## 7. Navigation

- Active indicator: a 2px underline that slides between items using a shared
  `layoutId`, `--dur-base`, `--ease-out`.
- Route change: outgoing content fades out over 120ms, incoming runs its page
  entrance. No slide, no crossfade of two full pages, no directional transition.
- Mobile drawer: slides from the left with `--ease-out`, `--dur-base`, backdrop
  fades over `--dur-fast`.

**Reduced motion:** the indicator jumps; the drawer fades.

---

## 8. Loading

**Skeletons, not spinners.** A skeleton is the shape of the thing that is coming,
in `--surface-sunken`, with a shimmer sweeping left to right over 1.4s on an
infinite loop.

Shimmer is a `linear-gradient` moved by `background-position`, at 6 percent
opacity. Anything brighter turns a loading state into the most eye-catching thing
on the page.

**After 400ms of loading, and not before.** Content that arrives in 80ms should
never flash a skeleton. Use a delayed-visibility hook.

**Reduced motion:** static skeleton, no shimmer.

---

## 9. Data freshness and staleness

**What:** The freshness chip in the header.

- Fresh (under 24 hours): static, `good` colour, check icon.
- Stale (24 to 48 hours): `warning` colour, triangle icon, and a slow 3s
  opacity pulse between 100 and 70 percent.
- Very stale (over 48 hours) or fallback data: `critical` colour, octagon icon,
  static, with the text "showing sample data" or "data is N hours old".

The pulse exists on exactly one element in the product. It is reserved for the
case where the screen might be lying to you.

**Reduced motion:** no pulse. The colour, icon and label already carry it.

---

## 10. The discovery page

**What:** The public-facing view of overlooked animals.

- Card grid: entrance stagger, first eight.
- Card hover: lifts 4px to `--elev-3`, image scales to 1.04 inside a clipped
  frame, both `--dur-base` `--ease-out`.
- Image load: blurred low-resolution placeholder cross-fades to the full image
  over `--dur-base`. Reserve the aspect ratio first.
- "Been waiting N days" badge: static. Do not animate a number that describes how
  long an animal has been in a kennel.

**Reduced motion:** no lift, no scale; a 1px border colour change on hover
instead.

---

## 11. Model transparency page

Charts follow section 4. One addition: the calibration plot's diagonal reference
line draws first, over `--dur-fast`, then the data points fade in staggered at
25ms. The reference arrives before the thing it is a reference for.

**Reduced motion:** both render complete.

---

## 12. What must never animate

- A euthanasia-adjacent field. There are none in this product, and this line
  exists so it stays that way.
- The use-policy banner. It is static text and it stays put.
- An error message. Errors appear instantly and stay until resolved.
- Any number describing an individual animal's wait.
- The model version and freshness stamps.

---

## Implementation notes

Put the variants in `src/lib/motion.ts` and import them. Twelve components each
defining their own `{ opacity: 0, y: 12 }` will drift apart within a week.

```ts
export const pageContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

export const pageChild = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
};
```

Wrap the app in Framer Motion's `MotionConfig` with `reducedMotion="user"` so the
library honours the preference for free, then use the hook only where you need a
different visual result rather than merely a shorter one.
