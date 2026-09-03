# Third-party component attribution

## Animaster PRO (Awwwards Pack)

Three animation components in `src/components/motion/` are adapted from a
private, paid component pack held locally at `~/Downloads/animmaster-pro1`. The
pack is licensed for use on sites its owner builds; it is **not** redistributable.
Per its own terms, only the individual files needed were copied, and each is
recorded below with its original path.

The pack's `components/` tree contains only README pointers — the real source
lives in the `_raw/**/code.zip` archives, which is what these were taken from.

| Local file | Behaviour | Original source |
| --- | --- | --- |
| `src/components/motion/SplitTextReveal.tsx` | Character-level headline reveal | `_raw/Awwwards Pack-20260628T224220Z-3-001/Awwwards Pack/Text Animations/12/code.zip` → `next-text-reveal-animation/src/components/AnimatedHeader/AnimatedHeader.jsx` |
| `src/components/motion/MagneticButton.tsx` | Magnetic pointer-following CTA | `_raw/Awwwards Pack-20260628T224220Z-3-001/Awwwards Pack/Physics Effects/3/code.zip` → `magnetic-button-main/src/components/gsap.jsx` |
| `src/components/motion/StaggerReveal.tsx` | Scroll-triggered staggered list entrance | `_raw/Awwwards Pack-20260628T224220Z-3-004/Awwwards Pack/Scroll Animation/58/code.zip` → `abstract-cards-main/src/components/AbstractCards.jsx` |

### What changed on the way in

The originals are demo code. Each was rewritten rather than pasted:

* **Ported to strict TypeScript.** All three shipped as `.jsx` with untyped
  props and refs.
* **Reduced motion is honoured in every one.** None of the originals check
  `prefers-reduced-motion`. `SplitTextReveal` goes further and skips the DOM
  split entirely, because splitting a heading into per-character spans costs
  screen readers the sentence even when the result is left visible.
* **Cleanup was added.** `MagneticButton`'s source attaches two listeners and
  never removes them, which leaks on every unmount. `SplitTextReveal` now
  reverts its `SplitText` instance so navigating away does not leave headings
  permanently shredded into spans.
* **The scroll scrub was removed from `StaggerReveal`.** The original ties a
  long timeline to scroll position, which suits a hero collage and actively
  fights a data table — rows would sit half-transparent while somebody was
  reading them.
* **`MagneticButton` only engages for a fine pointer**, and its pull is clamped
  to 10px so the control stays where it was drawn.

### Components deliberately not taken

The pack has no animated number, count-up or odometer component; the full
436-entry index and the 863-file raw tree were both searched. `src/components/dashboard/CountUp.tsx`
is the project's own, and already handles reduced motion and replay suppression.

Nothing from the pack's `shaders/`, `3D / WebGL` or physics categories is used.
They carry a high performance cost on mobile and none of them earn it here.

## Fonts

* **Manrope** and **IBM Plex Mono**, both SIL Open Font License 1.1, loaded
  through `next/font/google` in `src/app/layout.tsx`.

## Data

* **City of Austin Open Data Portal** — the four Austin Animal Center intake and
  outcome datasets, published as public domain. Dataset IDs, roles and refresh
  cadence are listed in `src/lib/austin/datasets.ts` and shown in the footer and
  the data-details drawer.
