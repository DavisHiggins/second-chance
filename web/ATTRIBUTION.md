# Third-party component attribution

## Animaster PRO (Awwwards Pack)

The motion components in `src/components/motion/` and the mobile menu in
`src/components/shell/` are adapted from a private, paid component pack held
locally at `~/Downloads/animmaster-pro1`. The pack is licensed for use on sites
its owner builds; it is **not** redistributable. Per its own terms, only the
individual files needed were copied, and each is recorded below with its
original path. The pack's `components/` tree contains only README pointers — the
real source lives in the `_raw/**/code.zip` archives, which is what these were
taken from.

| Local file | Behaviour | Original source |
| --- | --- | --- |
| `src/components/motion/SmoothScrollProvider.tsx` | Lenis smooth wheel scrolling driven from the GSAP ticker | `_raw/Awwwards Pack-20260628T224220Z-3-002/Awwwards Pack/Scroll Animation/56/code.zip` → `fall-master/src/components/SmoothScroll/Lenis.jsx` |
| `src/components/motion/RevealText.tsx` | Masked line reveal for headings (SplitText `mask: "lines"`) | `_raw/Awwwards Pack-20260628T224220Z-3-001/Awwwards Pack/Text Animations/14/code.zip` → `files/script.js` (mask technique); rhythm from the deployed Higgins Building Group `RevealText` |
| `src/components/shell/MobileMenu.tsx` + `.menu-sheet` in `globals.css` | Layered top-down wipe (two colour layers, then the panel), links rising out of line masks, single reversible transition | Animmaster `components/navigation/navigation-menus-018-pack-002/src/files/script.js`, `styles.css` (Navigation Menus 18). Replaced the earlier circular ink-blot reveal from Navigation Menus 10. |
| `src/components/motion/MagneticButton.tsx` | Magnetic pointer-following CTA | `_raw/Awwwards Pack-20260628T224220Z-3-001/Awwwards Pack/Physics Effects/3/code.zip` → `magnetic-button-main/src/components/gsap.jsx` |

### What changed on the way in

The originals are demo code. Each was rewritten rather than pasted:

* **Ported to strict TypeScript.** All shipped as `.jsx` or plain `.js` with
  untyped refs and globals.
* **Reduced motion is honoured in every one.** None of the originals check
  `prefers-reduced-motion`. `SmoothScrollProvider` does not create a Lenis
  instance at all; `RevealText` skips the DOM split; the menu sheet's
  transition collapses to an instant state change.
* **Server-rendered content first.** `RevealText` animates a heading that is
  already in the initial HTML. The hidden start state is scoped to `html.js`
  and to the pending phase, with a delayed CSS keyframe that uncovers the text
  if a timeline never attaches. The earlier character-level reveal (Text
  Animations 12) was retired because it rendered nothing on the server.
* **One animation loop.** Lenis runs with `autoRaf: false` from the GSAP
  ticker, forwards scroll to ScrollTrigger, and is destroyed on unmount. Touch
  stays native; nested scrollers opt out with `data-lenis-prevent`. Settings
  (1.1s exponential ease-out, wheel ×1, touch ×1.5) are the ones inspected on
  the deployed Higgins Building Group site.
* **The layered-wipe menu became a dialog.** The original is a paused GSAP
  timeline with SplitText line masks; here each step is a CSS transition
  keyed on `data-open` with the delays mirrored for closing, so a rapid
  double tap cannot strand the sheet half open, and the masks are plain
  `overflow: hidden` wrappers rather than a DOM split. Focus moves in, Tab is contained, Escape closes, the page behind is
  `inert`, and focus returns to the toggle. Links are interactive from the
  first frame; the stagger is decoration only.
* **`MagneticButton` only engages for a fine pointer**, cleans up its
  listeners, and its pull is clamped to 10px.

### Reviewed and not adopted

* **Page Transitions 12 and 14** (block reveal, SVG wipe) both depend on
  `next-transition-router` and delay navigation to play an exit. The product
  uses a 220ms Framer Motion entrance (`src/components/shell/PageTransition.tsx`)
  with no exit phase, so modified clicks, downloads and hash links behave
  exactly as the browser would.
* **Scroll Animation 58** (the previous `StaggerReveal`) was retired; section
  entrances now use Framer's `whileInView` in `RevealSection.tsx`, which
  server-renders its children.
* The pack has no line-divider or count-up component. `AnimatedDivider.tsx`
  and `CountUp.tsx` are the project's own.
* Nothing from `shaders/`, `3D / WebGL` or physics categories is used.

## Fonts

* **Manrope** and **IBM Plex Mono**, both SIL Open Font License 1.1, loaded
  through `next/font/google` in `src/app/layout.tsx`.

## Data

* **City of Austin Open Data Portal** — the four Austin Animal Center intake and
  outcome datasets, published as public domain. Dataset IDs, roles and refresh
  cadence are listed in `src/lib/austin/datasets.ts` and shown in the
  data-details drawer and on How it works.

## Licence

The SecondChance source code is released under the MIT License (see the
repository's `LICENSE`). That licence does not extend to the Animaster
components' original sources, which remain the pack owner's.
