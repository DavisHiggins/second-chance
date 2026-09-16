# SecondChance — Claude Code implementation handoff

Prepared September 15, 2026. Target: https://secondc.vercel.app. Repository: https://github.com/DavisHiggins/SecondChance.

## 1. Objective and working rules

Implement a comprehensive refinement of the existing SecondChance platform: stronger branding, polished motion, clearer navigation, simpler analytics explanations, and a useful About page. The primary audience is animal shelter owners and workers. Make the product impressive through clarity, craft, and useful interactions. Preserve its research purpose, existing functionality, core wording, and responsible-use constraints.

This is an implementation assignment, not a request to return another plan. Read this entire file, inspect the local repository and its instructions, document the actual implementation locations, then work through every applicable requirement. Preserve uncommitted work. Use the current project’s package manager and supported framework versions. Do not replace the application with a template or rewrite its data pipeline merely to restyle it. Do not publish, deploy, or push changes unless separately requested.

### Audit coverage and limits

The audit read the deployed HTML and public application assets for `/`, `/queue`, `/discover`, `/impact`, `/planner`, `/model`, and the linked Latke animal record. It inspected the shared header, footer, data-status payload, chart definitions, CSS tokens, and relevant client logic. It also checked Austin dataset metadata, HBG’s public page/source, and reference content from Lakeside and CrownCode.

The GitHub connection returned 404 for the supplied repository and no accessible DavisHiggins repositories. Therefore, source filenames, server refresh logic, training code, tests, and deployment configuration were NOT verified. Interactive browser rendering, mobile screenshots, animation timing in motion, and every dynamic record were NOT tested. Treat visual specifications below as proposed improvements; do not misreport them as screenshot-confirmed defects. Complete the local source and browser audit before editing. Public compiled chunks are evidence of behavior, not files to edit.

### Preserve and extend what already exists

- Dashboard, attention queue, record discovery/detail, Impact, outreach planning, and methodology pages.
- Austin current and archive feed distinctions; inferred stays versus verified adoption availability.
- Model lineage, subgroup reporting, unavailable-score handling, accessible chart tables, queue filters, CSV/print exports, theme and density preferences.
- Existing dog/circular brand mark, navy/teal identity, Manrope and IBM Plex Mono. Reuse actual source assets corresponding to `/logo-mark.png` and `/logo-mark-dark.png`.
- Most main text. Simplify locally, add short explanations and expandable detail, and remove duplicated presentation rather than deleting necessary information. Correct inaccurate wording even when preserving text generally.

## 2. Required local inspection

1. Inspect `git status`, current branch, project instructions, README, package manifest/lockfile, route tree, assets, shared styles, providers, data clients, episode matching, scoring, training/evaluation artifacts, and existing tests.
2. Map each requirement below to real source files. Search for visible labels and tokens instead of assuming filenames. Useful anchors: `heroHeadline`, `reveal-init`, `section-rule`, `brand-navy`, `Needs attention`, `currentEpisodeCount`, `intakesUpdatedAt`, `evidenceMeasured`, `secondchance-outreach-plan.csv`.
3. Start the app and review every route in light/dark themes and at mobile, tablet, laptop, and desktop widths. Open menus, data drawer, disclosures, row details, chart tables, filters, theme control, and planner exports. Record a baseline.
4. Inspect the user's local `/downloads/animmaster-pro1` folder. If that literal path is unavailable, resolve the current user's Downloads directory and search for the exact `animmaster-pro1` folder, including case differences and Windows/WSL equivalents. Do not claim to have used assets you cannot access.
5. Select compatible Animaster examples for smooth scrolling, masked text reveals, menu transitions, page entrance/exit, line draws, and button hovers. Copy/adapt only the components needed into the project; retain required attribution/license notices. Do not import the entire collection or reference Downloads from production code. Record original component paths and their adapted destinations. If missing, continue with the installed motion stack and report the limitation.
6. Inspect HBG’s actual scroll/reveal code when a local checkout or authorized GitHub access is available: https://github.com/DavisHiggins/higginsbg. Match its smoothness and reveal rhythm, scaled to a practical analytics interface. Avoid copying construction content or another project's colors. Lakeside can inform spacing and card restraint; CrownCode can inform branded introductory sections. Neither is a reason to turn SecondChance into a storefront or marketing-only page.

## 3. Correctness and clarity fixes to prioritize

These are specific findings from the deployed site, not hypothetical feature requests. Confirm their source and fix the presentation/calculation as appropriate.

| Finding | Required implementation |
|---|---|
| Queue/home show animals waiting 299, 215, and 189 days with a 71% probability labeled “past 60 days.” The Model page says inputs are known at intake. | Label this as an **intake-time estimate** if that is what the model actually computes. For a confidently open stay already exceeding 60 days, lead with “Already waiting over 60 days” and actual days. Place the original estimate in secondary detail. Never describe it as a future probability from today. Apply the same horizon clarification to adoption within 30 days. Do not fabricate a conditional remaining-stay prediction. |
| Latke’s document title is `Record 00.000 · SecondChance`. | Derive title/metadata from the resolved animal name and ID, not the final segment of a timestamp-bearing episode ID. Preserve composite episode IDs and deep links. Example: `Latke · Animal 18333 · SecondChance`. |
| “Austin feed delayed” reports roughly six hours, while payload source timestamps omit offsets and retrieval time uses UTC. | Audit timestamp semantics and parsing before trusting the warning. Distinguish publisher update time, source-row time, latest animal event, successful fetch, and cached snapshot time. Floating timestamps must be interpreted using the publisher’s documented timezone; verify rather than assume. Use UTC internally and show a timezone in details. Test DST and differing client/server zones. |
| Planner labels foster, medical/behavioral support, and senior outreach “Measured,” but supporting text describes historical associations. | Replace with “Historical evidence” or “Observed association” where appropriate. Reserve “Measured intervention effect” for an actual intervention evaluation supporting causality. Label time estimates and scenario uplift separately as assumptions. Historical animal characteristics do not prove an action changes adoption outcomes. |
| Current Dashboard shows seniors with a shorter median among adopted animals, while Planner says seniors are slowest and cites archive-era adoption incidence. | State dataset, era, cohort, and metric beside both. These can differ because the median includes only adopted animals while incidence includes other outcomes. Remove blanket claims such as “seniors are the slowest” unless supported by the relevant current metric. Identify archived evidence explicitly. |
| Dashboard adoption-rate tile has a spark payload of counts such as 505 and 492 beneath a 31% value. | Trace the spark calculation. A rate tile must show comparable monthly rates with eligible denominators, not unrelated adoption counts. Label all sparkline windows and units; omit a sparkline when comparable data is unavailable. Check open-stay sparks for month-end versus current-snapshot differences and label partial months. |
| Life-stage chart sample counts sum to much more than the Dashboard adoption median sample. | Verify whether `n` describes all stays, adopted stays, or a different time period. For adoption medians, expose the adopted sample used in each median, plus cohort/window. Do not place an unrelated count beside a statistic. |
| Model page says positive calibration intercept means predictions are too high. | Inspect the implemented calibration regression. Under `logit(observed probability) = intercept + slope × logit(prediction)`, a positive intercept indicates upward correction of predictions, not the stated direction. Explain the actual convention. Do not conflate this with the separately defined predicted-minus-observed subgroup gap. |
| Model page contains “Intake condition: Dead” in evaluation groups and reports completed-stay training with recent held-out arrivals. | Audit target-population eligibility and outcome maturity. Determine whether animals dead on arrival belong in the intended support model and how this affects validation. Inspect censoring, repeated-animal leakage, and feature availability at intake. Report genuine issues; retraining is conditional on evidence, not a cosmetic requirement. Never silently remove rows and retain old metrics. |
| Homepage headline and some narrative content are absent from initial HTML, although referenced in client code; Discover's initial HTML omits record cards. | Verify hydrated behavior and progressive rendering. Server-render the H1, important copy, and a useful initial record batch. Animate existing readable DOM instead of waiting for a client-only import to create essential content. Ensure content remains available if motion initialization fails. |
| Header renders six compact links starting at the `sm` breakpoint, with 32–36 px icon controls. | Rework navigation breakpoints around actual fit and enlarge touch targets to at least 44×44 px. Do not assume this is visibly broken without checking; prevent crowding when About is added. |
| Footer repeats long source and responsible-use passages on every page. | Keep a concise summary, source/freshness access, and team credit in the footer. Relocate full detail into About, Impact, Model, and the data drawer with clear links. Preserve access to every substantive point. |

Also inspect the current data-quality states: the observed snapshot disclosed 11 ambiguous joins, 1,051 unmatched outcomes, 30 possibly stale records, and 62 unscored stays. These are audit examples, NOT constants to put into code. Keep dynamic counts and explain their implications.

## 4. Visual system

### Direction

Create a refined, humane shelter analytics product. Strong typographic hierarchy, generous but purposeful spacing, clean data surfaces, navy introductory sections, teal accents, restrained warmth, and precise animated rules. Avoid generic neon AI styling, excessive glass panels, decorative charts, giant empty heroes, autoplay video, and motion on every cell.

Use the existing tokens as the foundation:

| Role | Current value / refinement |
|---|---|
| Navy / deep navy | `#05274C` / `#041D38` |
| Teal / strong teal | `#0A9E84` / `#0A7A66` |
| Light surface | `#F6F8F8`; card `#FCFDFD` |
| Primary text | `#0A1620` |
| Dark page / card | `#06111B` / `#0C1B27` |
| Warm accent | Existing orange, used sparingly; never blur the meaning of warning/error colors |
| Typography | Manrope for prose/UI; IBM Plex Mono for IDs and occasional technical metadata; tabular numerals for aligned values |

- Keep a 1440 px maximum working canvas, with reading columns around 65 characters. Use intentional two-column story sections and consistent chart/card grids.
- Increase normal explanatory text to 16 px with roughly 1.55–1.65 line height. Use 13–14 px supporting text; reserve smaller text for nonessential metadata. Check contrast instead of relying on pale gray.
- Marketing/story H1: responsive approximately 36–64 px; operational page H1: approximately 30–44 px. Keep dashboard information within easy reach.
- Standardize page gutters, section spacing, card padding, border radii, shadows, icon weight, and button sizes. Separate spacing tokens from utility naming if current custom tokens cause surprising results.
- Make all dark-mode charts, hover states, dividers, tooltips, placeholders, and disabled states intentional. Preserve existing preferences without a theme flash.
- Reuse the dog mark consistently in header, footer, loading/empty states, favicon, and sharing image. Neutral branded silhouettes/initials remain correct when animal photos are unavailable. Never substitute stock dog photos as real animal portraits.

## 5. Header, navigation, footer, and routes

Preserve existing URL paths. Improve labels and titles as follows:

| Path | Navigation | Page title |
|---|---|---|
| `/` | Dashboard | Shelter overview |
| `/queue` | Needs attention | Animals that may need extra support |
| `/discover` | Shelter records | Explore shelter records |
| `/discover/[existing episode ID]` | Detail via records/queue | Animal name and ID |
| `/planner` | Outreach planner | Build this week’s outreach plan |
| `/impact` | Impact | Turning shelter data into earlier support |
| `/model` | How it works | Understand the data and predictions |
| `/about` | About | About SecondChance |

- Header: clear logo left, navigation center where space permits, compact data-status and theme controls right. Put raw model-version strings inside data details/How it works rather than permanently occupying the main row.
- Show core work links on wide screens; group Impact, How it works, and About under a clearly labeled “Learn” disclosure when needed. Keep all seven destinations visible in the mobile menu. Use a content-fit breakpoint, likely wider than the current `sm` threshold.
- Preserve sticky navigation without jumps. Add a subtle scroll-state border/background and animated active-link underline. One useful status control is enough per viewport; mobile and desktop variants must not both appear to assistive technology.
- Mobile: right-aligned animated two-line hamburger morphing into an X, with a 44 px minimum hit area. Use a branded overlay/sheet, grouped numbered links, short descriptions, restrained stagger, visible close action, and data status at the bottom. Menu items must be available immediately; decorative stagger cannot delay interaction.
- Implement `aria-expanded`, `aria-controls`, active-page state, Escape, focus management, and restoration. If using a modal, contain focus and make the background inert. Close on navigation; cancel animation safely on rapid toggling. Release body/Lenis locks on close, route change, and unmount.
- Footer: logo, one-sentence purpose, compact navigation, Austin source link, data-details access, research/non-affiliation note, and this exact small but readable credit:

  **Built by Davis Higgins, Bennett Shearin, Seth Sumter, and Hunter Pace.**

- Keep full source and use-policy text reachable. Avoid duplicating the About page beneath every dashboard table.

## 6. Motion implementation specification

Create or consolidate reusable equivalents of `SmoothScrollProvider`, `RevealText`, `RevealSection`, `AnimatedDivider`, `PageTransition`, and an accessible animated menu. Adapt names to existing architecture. Use the installed Motion/Framer Motion stack where possible; add Lenis only if absent and justified. Use GSAP only for selected components that require it. Never run two scroll controllers or multiple animation loops for the same system.

Verified HBG reference: its public client code initializes Lenis with `duration: 1.1`, exponential ease-out, `smoothWheel: true`, `wheelMultiplier: 1`, and `touchMultiplier: 1.5`; it connects scroll events to ScrollTrigger and drives Lenis from the GSAP ticker, with cleanup and a reduced-motion guard. Content entrances use `power3.out`, approximately 0.9–1.0 seconds, and 0.08–0.12-second staggers. Image masks use longer reveals. Its mobile menu uses a wave-shaped clip-path curtain. Borrow that controlled movement; shorten operational-page entrances and simplify the curtain so shelter staff can navigate immediately. These are inspected deployed settings, not guesses about source filenames.

| Interaction | Required behavior |
|---|---|
| Smooth scrolling | HBG-inspired controlled desktop wheel smoothing; start around 0.8–1.1 seconds and tune by actual feel. Preserve native touch, keyboard, selection, browser find, anchors, sticky elements, nested tables/drawers, and browser history. Disable smoothing for reduced motion. |
| Page transitions | Brief 180–300 ms content fade/8–12 px translation, or one restrained navy/teal wipe if compatible. Persistent header/footer stay stable. No fake loaders or enforced waiting. Do not intercept modified clicks, downloads, external links, or hash links. Preserve back/forward scroll and filter state. |
| Headline reveal | Masked line or word rise, around 500–700 ms total with 30–50 ms stagger. Only main titles and selected section headings. Recalculate safely after fonts/resize, avoid duplicate screen-reader text, and keep semantic headings present. |
| Section entrance | 12–20 px rise plus opacity over 350–500 ms, once on entry. Stagger small groups by 50–70 ms; never stagger hundreds of records. Do not replay every time a filter changes. |
| Section dividers | Real 1 px borders with a short teal segment; animate overlay scaleX from 0 to 1 over 600–800 ms once. Optional small section number. Use a static visible baseline so structure survives motion failure. Place between major sections, not every row. |
| Buttons and links | Consistent primary teal/secondary outline/text variants; 150–220 ms color/border transitions, modest arrow translation, underline reveal. Clear hover, keyboard focus, pressed, loading, disabled, and success states. Keep labels fixed and readable. |
| Cards | Subtle border change and up to 2 px lift on appropriate interactive cards. No misleading hover effect on noninteractive cards; no motion that changes table alignment. |
| Charts and numbers | One short entrance for the chart container; preserve immediate access to final values. Avoid counting probabilities up from zero or redrawing all series on every interaction. Never animate artificial data. |
| Hero background | Optional slow, low-opacity movement of existing radial/topographic motif on story sections only. Pause when offscreen/hidden; static on mobile or reduced motion. No continuous decorative animation behind tables. |

Technical requirements: clean up observers/tickers/listeners; one RAF owner; account for Next.js route changes and font loading; exclude nested scrolling from smoothing; use transform/opacity rather than repeated layout changes; remove `will-change` after transitions. Keep reduced-motion behavior immediate and fully readable. Do not let client-only reveal wrappers erase server-rendered headings. Integrate the local Animaster components into this single motion language rather than mixing unrelated demos.

## 7. Page-by-page work

### Dashboard

- Preserve `/` as the practical overview. Refine the existing branded hero rather than creating a separate splash screen. Add a clear visible H1, preserve the existing purpose sentence, and provide “Review animals needing support” and “How to use the data” actions.
- Follow with one source/freshness context strip and the four existing KPI cards. Show date window, units, relevant sample, and a short definition. Add a consistent “What this means” disclosure.
- Give “Needs attention” enough prominence to initiate work. Show actual waiting time and honest score horizon; add a clear route into Queue and Planner.
- Standardize chart headings, axes, legends, gridlines, tooltips, table toggle, and empty states. Do not imply causation from trends. Explain partial months and cohort differences.
- Use subtle numbered/animated dividers between overview, attention, trends, and model context. Keep advanced model metrics in a concise expandable summary with a route to How it works.
- Add a short “Read the pattern → review the animal → plan support” guide linked to the actual workflow. Do not repeat the whole Impact page.

### Needs attention

- Preserve existing search, species/life-stage/risk/wait filters, stale toggle, sorting, table/cards, expansion, and load-more behavior.
- Add visible input labels, active filter chips, reset, compact result summary, and URL-backed filters/sort/view. Restore filters and scroll after opening a record and returning.
- Separate “Already waiting over 60 days,” “Elevated intake-time estimate,” and “Prediction unavailable.” Do not automatically bury the unscored animals; retain descriptive wait sorting and a review path.
- Replace alarming unsupported “Critical” language with supportive operational labels, or define existing thresholds clearly as outreach triage, not medical urgency. Do not change model thresholds silently.
- Add persistent, accessible column labels and row focus/hover. Keep names/IDs readable rather than truncating all useful detail. Include explicit “View record” and “Add to plan” actions.
- Expanded detail: what was observed, what was estimated and when, why the suggested outreach was selected, source completeness, and a staff-verification reminder. Rule-based suggestions must say they are rules; global importance is not an individual explanation.
- Keep mobile cards compact. Make filters an accessible sheet when necessary. Load bounded batches; avoid hundreds of animated DOM nodes.

### Shelter records and animal details

- Add name/ID search and useful age/wait filters to Discover, reusing Queue primitives. Keep its distinct purpose: browsing records, not duplicating risk triage.
- Paginate or load a bounded initial batch. Preserve filters in the URL. Clarify “995 records match; 24 shown” rather than claiming all matching records are rendered.
- Use intentional branded placeholders with species/name/ID, actual waiting time, record-status label, and action. No invented photos, temperament, adoption fees, or availability badges.
- Detail layout: breadcrumb/back with preserved origin; name/ID hero; actual stay timeline; organized recorded facts; predictions only when available with horizon/model context; data-quality notes; support suggestion; add-to-plan action.
- Clearly distinguish current age from age at intake and “altered at intake” from current status. Define unknown/missing values without converting them to “No.”
- Link to a verified official shelter contact/adoption-information page with “Check current availability.” Do not imply a specific official animal listing exists without a verified match.
- Handle closed, missing, invalid, and stale IDs with useful messages. Do not mark an animal adopted merely because it disappears from a feed.

### Outreach planner

- Preserve capacity input, channel choices, generated assignments, CSV, and print. Arrange as three clear steps: capacity, available actions, review plan. Keep the summary visible without covering content.
- Add queue-to-plan selection, individual removal/reassignment, and clear automatic-versus-manual assignments. Staff can revise recommendations. No medical action should appear automatically prescribed.
- Identify channel matching as an outreach suggestion based on recorded information. Separate source evidence from assignment logic, time estimate, and assumed benefit.
- Replace “What this buys you” with “Planning estimate.” Define the slider as either **absolute percentage-point change** or **relative change**, based on the real formula. If 20 animals × 0.10 produces 2, call it an assumed 10-percentage-point increase, not an ambiguous 10% increase. Where baseline probabilities are used, cap increases at 100% per animal and use a compatible time horizon.
- An intake-time 30-day prediction for an animal already waiting 299 days is not a next-month baseline. For such records, use a clearly labeled hypothetical scenario without claiming model-based expected future adoptions.
- Explain top-50 lift as retrospective test performance; do not claim the current live queue is guaranteed to achieve the same lift or that intervention creates that lift.
- Optional small local progress checklist: planned/in progress/completed, with “Saved on this device” labeling, reset, and explicit export. No pretend shared workspace or server persistence. Do not build accounts/multitenancy for this update.
- CSV/print must preserve animal/episode IDs, source snapshot, plan date, assumptions, estimate horizon, and relevant notes. Escape CSV values and prevent spreadsheet formula injection. Print without navigation, clipped tables, animations, or hidden text.

### Impact

- Preserve its current mission, responsible-use principles, national applicability, and project context. Refine structure into short sections with animated rules and selective reveal headings.
- Emphasize three concrete uses: earlier individual support, shelter-level planning, and evaluation of outreach results.
- Clarify potential benefits versus measured results. Do not invent animals saved, adoption improvements, nationwide users, or partnerships.
- Preserve the distinction already made here: the workflow can transfer nationally, while each shelter's predictions need local data and evaluation.

### How it works

- Put a plain-language introduction first: what the site reads, what it calculates, what the model estimates, and what staff should do with it.
- Organize deeper content into anchored sections: data/refresh, metric guide, predictions, testing, subgroup checks, limitations, and technical lineage. Desktop table of contents; accessible mobile section selector/disclosures.
- Preserve all existing model evidence, technical metrics, source IDs, training/validation/test windows, and archive discussion. Make advanced detail expandable, not deleted.
- Fix the specific wording issues in section 3. Replace the claim that PR AUC asks “the same question” as ROC AUC with the distinct precision–recall interpretation. Avoid implying ROC AUC becomes inherently dishonest for rare outcomes.
- Rename “Before and after calibration” unless actual matched pre/post metrics on the same evaluation set are supplied. Current text presents fitted-validation and calibrated-test figures, which are not a clean before/after comparison.
- Reliability plots require actual prediction/outcome bins, counts, and a labeled evaluation set. Keep the current omission if these are unavailable; never draw a decorative reliability curve from summary metrics.
- Report percentage-point subgroup gaps, sample sizes, missing outcomes, and whether uncertainty can be estimated. Do not call small-group performance reliable or fairness proven.

## 8. Plain-language metric guide

Implement a shared metric-definition registry so cards, chart help, animal details, and Model do not contradict each other. Each entry needs: title, one-sentence meaning, unit, formula/cohort, date window, sample/exclusions, practical use, limitation, and source/model context. Keep one sentence visible; put detail in a keyboard/touch-accessible disclosure. Display data-derived examples dynamically; examples below are explanatory, not constants.

| Metric | Meaning and practical implication |
|---|---|
| Open shelter stays | Cat/dog intake episodes with no confidently matched recorded outcome as of the snapshot. Helps estimate records needing review; not verified adoption availability or exact kennel occupancy. A repeat arrival is a new stay. |
| Days waiting | Elapsed time from this stay's intake to the snapshot, for an inferred open stay. Helps identify long waits. Define rounding and timezone; stale open records may overstate current waiting. |
| Median days to adoption | Middle wait among animals actually adopted in the stated cohort: about half waited less and half more. Useful for comparing observed adoption timelines. Excludes animals still waiting and non-adoption outcomes, so it is not every animal's expected wait. |
| Adopted within 30 days, observed | Eligible intake stays adopted by day 30 divided by eligible intake stays with a full 30-day observation opportunity. Shows historical early-adoption frequency; describe how competing outcomes and recent arrivals are handled. |
| Stays longer than 60 days, observed | Completed stays lasting over 60 days divided by completed stays in the stated cohort. Describes completed history; not the fraction of all current animals already waiting 60 days. |
| Predicted long-stay probability | Model estimate at its documented prediction time that total stay exceeds 60 days. A 70% estimate means roughly 70 out of 100 comparable scored cases would experience the event if calibration holds. It is not certainty, temperament, or an animal's value. |
| Predicted 30-day adoption probability | Estimated adoption by day 30 from the stated origin, normally intake. Not “within the next 30 days” unless explicitly modeled and evaluated that way. It is not generally one minus the long-stay probability. |
| Monthly intakes/adoptions | Separate counts of arrival events and adoption events during each month. They may involve different animals; do not divide the lines to claim a cohort adoption rate. Mark an incomplete current month. |
| Life-stage adoption median | Median among adopted animals in each age group and the specified window. Compare alongside adoption probability and sample size; a short median among successful adoptions can coexist with low overall adoption incidence. |
| Outcome share | Each recorded ending category divided by eligible completed stays in the displayed window. Define adopted, transfer, reclaimed/returned to owner, return to habitat, euthanasia, and other/unknown using the actual schema. Transfer is not adoption. |
| Sample size (`n`) | Number of eligible stays contributing to that specific calculation. A small sample can change sharply when a few records change. Use “Based on … stays/adoptions” in ordinary views. |
| ROC AUC | How often the model ranks a randomly selected positive example above a negative example, allowing for ties. 0.5 indicates chance ranking. 0.694 is not 69.4% accurate predictions. |
| PR AUC / average precision | Summarizes precision versus recall as the selection threshold changes. Name the actual statistic computed, which may be average precision rather than trapezoidal PR area. Compare with event prevalence and explain that false alarms and missed cases trade off. |
| ECE | Weighted gap between predicted and observed rates across probability groups, using the implemented binning. 0.047 corresponds to about 4.7 percentage points on that evaluation, not an individual ±4.7-point confidence interval. |
| Calibration slope/intercept | Describe probability distortion and systematic correction under the actual regression convention. Show the ideal slope/intercept of 1/0; avoid standalone claims that either metric proves trustworthy probabilities. |
| Brier score | Average squared difference between probabilities and binary outcomes. Lower is better in a comparable population; compare with a baseline. It reflects more than calibration alone. |
| Log loss | Probability error that penalizes confident wrong predictions strongly. Lower is better on the same evaluation problem. Not a percent or adoption rate. |
| Precision in top 50 | Fraction of the 50 highest-ranked evaluation cases that actually had the target outcome. For 36%, that is 18 of 50. Historical evaluation, not demonstrated outreach success. |
| Lift in top 50 | Top-50 outcome rate divided by the evaluation base rate. A lift of 5.57× describes concentration of the target outcome; it does not mean 5.57× more adoptions caused by the tool. |
| Subgroup calibration gap | Difference between predicted and observed event rate under the stated sign convention. Use percentage points: +0.083 means +8.3 percentage points if predicted minus observed. Include group sample sizes. |
| Feature importance | How much the model uses an input across the evaluated population under the actual importance method. It is not causation, direction of effect, or a personal explanation for one animal. If normalized only over displayed inputs, say so. |
| Cumulative adoption incidence | Share estimated to have been adopted by a given day while accounting for the stated competing outcomes/censoring method. Label archived study values by period; do not substitute them for current rates. |
| Hazard ratio | Relative instantaneous adoption event rate under the fitted model, among the relevant at-risk population. Not an adoption probability or proof an intervention works. Put technical interpretation in expanded study detail. |
| Estimated staff time | Sum of selected task-time assumptions. Useful for rough workload planning; distinguish coordination time from time to actually place an animal or complete care. |
| Scenario additional adoptions | Hypothetical result of explicit assumptions about benefit and eligible animals. Show formula and assumptions; never label it achieved impact or a validated forecast. |

Also explain data-quality labels: ambiguous pairing, unmatched outcome, possibly stale open record, missing intake age, and unavailable prediction. “Unknown” is not zero, and “possibly stale” is not proof that the animal left.

## 9. Austin connection and automatic updates

The current public site identifies these datasets, and current-feed metadata describes hourly refresh:

| Feed | ID | Role |
|---|---|---|
| Austin Animal Center Intakes | `pyqf-r2dc` | Current ShelterBuddy intake records, beginning May 5, 2025 |
| Austin Animal Center Outcomes | `gsvs-ypi7` | Current ShelterBuddy outgoing-status records, beginning May 5, 2025 |
| Austin Animal Center Intakes archive | `wter-evkm` | Historical schema through the May 2025 cutover |
| Austin Animal Center Outcomes archive | `9t4d-g238` | Historical schema through the May 2025 cutover |

Trace and document the actual path: Austin API → retrieval/cache → validation and episode pairing → aggregates → model scoring → page snapshot. Do not imply a push subscription exists because an API exists.

Freshness audit evidence: at inspection the application snapshot reported retrieval at `2026-09-15T15:33:48.038Z`, source timestamps near `2026-09-15T10:00:12.000` with no offset, and a six-hour delay warning. Austin metadata subsequently reported `rowsUpdatedAt` corresponding to approximately `2026-09-15T15:00:16Z`. This is a strong reason to investigate timestamp/source-field semantics; it is not proof of the precise server-code defect. Compare the same source snapshot and documented timezone before changing the warning threshold.

Required behavior:

- Verify full pagination, deterministic ordering, incremental/full reconciliation, schema validation, duplicate handling, and timeouts. Do not compute “all animals” from a silently truncated API response.
- Preserve separate source systems/ID namespaces. Pair current episodes with trustworthy event relationships; do not join archive and current IDs by resemblance. Explain excluded ambiguous and unmatched records.
- Inspect the actual server cache and revalidation schedule. If the site currently refreshes only at build, implement runtime refresh. Use bounded shared server caching suitable for hourly upstream feeds; document the chosen interval rather than pretending it was observed in this audit.
- Show last successful retrieval, publisher freshness when verified, snapshot timestamp, and source IDs in the data drawer. A new request time must not masquerade as a new data publication.
- Refresh on appropriate navigation/focus or a bounded client check if supported. When refreshed data changes rows, preserve filters/selections and offer “Updated data available” rather than moving a row while someone is acting on it.
- Keep loading, empty, partial, delayed, stale-cache, unavailable, and unscored states distinct. Retain last known good data with a visible age on failures; no zero metrics for failed requests. An unvalidated model may fall back to descriptive sorting with an explicit label.
- Recalculate dependent displays consistently from a shared snapshot. New data can be scored by the existing model, but the model's training date/version changes only after real retraining and evaluation.

Suggested public copy, adjusted to the implemented cadence:

> SecondChance connects to the City of Austin’s public intake and outcome records. Austin describes these feeds as updating hourly. SecondChance checks for updates automatically and recalculates the affected records and statistics when a refreshed snapshot is available. The data-status panel shows when information was last retrieved and whether the source appears delayed. Changes are not instantaneous, and an open intake record does not confirm that an animal is available for adoption.

Short model note:

> Updated records can receive estimates from the current model. The model itself is updated separately after retraining and testing.

Use a compact three-step source illustration with exact labels, not an animated claim that every change streams live. Do not say all data across the platform updates when some sections intentionally show frozen archive research or fixed model evaluations.

## 10. About page — approved draft and structure

Create `/about`, with the same brand, header, motion primitives, page spacing, buttons, and footer as the other pages. Avoid a wall of text or fabricated team biographies.

### About SecondChance

> SecondChance is a predictive analytics project built at UNC Charlotte to help animal shelter teams make better use of their data. We bring together public shelter records, clear visualizations, and predictive models to help staff understand adoption patterns, recognize animals that may need extra attention, and plan practical support.

### Why we chose this project

> We chose this project because shelter data represents animals, staff decisions, and opportunities to help. We wanted to apply what we are learning in data science and analytics to a real problem: making useful patterns easier to see and turning those insights into earlier, more focused support for animals waiting for a home.

### Built by our team

> Our team brings a shared background in data science and analytics through our work at UNC Charlotte. SecondChance brings together the areas we are studying: preparing data, building and evaluating predictive models, and communicating results in a way people can understand and use.

Display four equal-weight names in this exact order:

- Davis Higgins
- Bennett Shearin
- Seth Sumter
- Hunter Pace

Use the shared descriptor “UNC Charlotte project team.” Do not invent individual jobs, degrees, headshots, biographies, contributions, or external profile links. Use authentic assets only if present.

### Built with Austin data. Useful beyond Austin.

> Austin gives us a public dataset for exploring how shelter records can support better planning. The same approach can help shelters across the United States understand waiting times, identify patterns, focus outreach, and evaluate changes to their practices. Shelter owners, staff, volunteers, rescue partners, and people interested in adoption can use the site to better understand the information behind shelter outcomes.

> Each shelter serves a different community, so Austin’s results are a starting point rather than a prediction for every shelter. A shelter-specific version would connect that organization’s intake and outcome records, track its own trends, and train or check predictions against its local data. Staff would stay in control of decisions and use the results to guide additional support.

### How another shelter could use this approach

Present a concise sequence: connect its records; validate and pair shelter stays; review local patterns; evaluate a locally appropriate model; plan and measure outreach. State that a shelter-specific connection is a future adaptation unless already implemented. Do not add a fake “Connect your shelter” signup flow.

### What the project can and cannot do

> SecondChance supports human judgment. It does not confirm adoption availability, diagnose an animal, or decide what care an animal should receive. Predictions are estimates, and a higher long-stay estimate should prompt more attention and support. This is a student research prototype and is not affiliated with the Austin Animal Center.

End with “Explore the dashboard” and “Understand the data” links. Keep the existing Impact page focused on use and potential benefit; About owns project origin and team.

## 11. Implementation order and acceptance

Work in this order, adapting to actual dependencies:

1. **Baseline and facts:** source map, rendered-route inventory, local Animaster selection, data/score semantics audit. Fix identified correctness issues without inventing outputs.
2. **Shared foundation:** tokens, typography, reusable controls, accessibility, header/menu, footer, motion and route handling.
3. **Operational pages:** dashboard, queue, discovery/details, planner, shared metric explanations and source status.
4. **Story and methodology:** About, Impact, How it works, source/refresh explanation, national applicability, team credit.
5. **Verification and polish:** regression checks, mobile/dark/reduced-motion passes, performance, exports, content accuracy, final report.

Acceptance checklist:

- [ ] Every existing route works; About appears in navigation/footer; exact four names appear on About and in small footer text.
- [ ] Core text remains recognizable, with simpler explanations and documented factual corrections.
- [ ] Every displayed statistic has understandable meaning, units, window, cohort, and appropriate uncertainty/source context.
- [ ] Already-long stays are not described as if passing 60 days were still a future event; unavailable predictions remain visible and meaningful.
- [ ] Austin source cadence, application refresh, cache age, and model retraining are distinguished accurately; stale/failed data cannot appear as healthy live data.
- [ ] Planner distinguishes associations, assumptions, and measured effects; scenario units/formulas/horizons are correct.
- [ ] Site retains existing navy/teal branding with visibly improved header, menus, buttons, dividers, text reveals, transitions, and scrolling.
- [ ] Menu/drawers work with keyboard, Escape, focus restoration, and rapid open/close. No stranded scroll lock or invisible interactive overlay.
- [ ] Test 360, 390, 768, 1024, and 1440 px widths, 200% zoom, light/dark, reduced motion, slow loading, no-data, and source failure. No clipped names, overlapping controls, or unintended page-wide horizontal scroll.
- [ ] Navigate Dashboard → Queue → detail → back → Planner, plus every Learn page. Confirm filter/scroll persistence, theme, exports, duplicate selections, invalid IDs, and closed records.
- [ ] Run available build, typecheck, lint, and meaningful existing tests. Add targeted tests for changed calculations, timestamp semantics, horizon labels, routing/title parsing, planner math, and CSV export safety where applicable.
- [ ] Test outcome-horizon eligibility, episode pairing, missing scores, percentages versus percentage points, and cohort counts if those calculations change. Recompute model artifacts only through a documented training/evaluation process.
- [ ] Measure before/after performance on representative routes. Target no material regression; aim for LCP ≤2.5 s, CLS ≤0.1, and INP ≤200 ms where measurable, and label lab versus field results. Bound record rendering and route-load heavy charts. Do not claim an unmeasured score.
- [ ] Review desktop/mobile screenshots and actual motion. Check initial HTML, hydration, loading/error routes, and no-motion fallbacks. Run accessibility checks plus manual keyboard inspection.
- [ ] Deliver a concise change report: implemented items, actual Animaster/reference components used, tests/results, screenshots, and any real blockers or remaining tasks. Never call inaccessible components integrated or an unverified model validated.

Keep a short checklist in the repository during implementation. Do not stop after the visual pass while clarity, About, data freshness, or workflow requirements remain incomplete. Do not expand this assignment into authentication, payments, a shelter CRM, nationwide integrations, or a new chatbot.

## 12. Source register

Audit evidence is point-in-time, not a promise that live numbers remain unchanged.

- SecondChance deployed pages and public assets: https://secondc.vercel.app/ ; https://secondc.vercel.app/queue ; https://secondc.vercel.app/discover ; https://secondc.vercel.app/planner ; https://secondc.vercel.app/impact ; https://secondc.vercel.app/model
- Sample detail: https://secondc.vercel.app/discover/sb%3A18333%3A2025-11-20T12%3A43%3A00.000
- Requested repository, inaccessible to this audit's connection: https://github.com/DavisHiggins/SecondChance
- Current Austin intake metadata: https://data.austintexas.gov/api/views/pyqf-r2dc.json
- Current Austin outcome metadata: https://data.austintexas.gov/api/views/gsvs-ypi7.json
- Public dataset pages: https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Intakes/pyqf-r2dc ; https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Outcomes/gsvs-ypi7
- Design references: https://higginsbuildinggroup.com/ ; https://lakesidesportclub.com/ ; https://crowncode.higginsd.com/
- Lenis integration and scroll-loop guidance: https://github.com/darkroomengineering/lenis
- Accessible modal interaction: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Probability-calibration reference: https://scikit-learn.org/stable/modules/calibration.html

The user's local `/downloads/animmaster-pro1` collection must be inspected by Claude on the user's machine. Its contents were not available in this audit.
