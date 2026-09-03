# SecondChance: Data Repair, Live Austin Integration, Impact Page, and Premium UI Upgrade

Verified against the production deployment and the City of Austin data feeds on September 1, 2026.

## Claude Code startup directive

Read this entire file before editing anything. Work from the SecondChance repository root. Begin by auditing the existing implementation and writing a short plan that maps every requirement below to the actual files in this repository. Then implement the work completely.

Do not preserve incorrect behavior for compatibility. Do preserve the useful model documentation, safety language, exports, print behavior, accessibility, and core product workflow.

The production site currently has a blocking data-integrity problem. Fix data truth before polishing the visuals. Do not replace one hardcoded snapshot with another. Do not fabricate model scores, current animals, current adoption status, timestamps, metrics, photos, or model metadata. If a live source or valid current score is unavailable, show a clear unavailable or delayed state.

Audit access note: the selected GitHub connection did not expose the private DavisHiggins/SecondChance repository to this audit session, so exact source filenames could not be verified remotely. The deployed HTML, route payloads, public JavaScript bundles, cache headers, and official Austin API records were verified directly. Claude has the local repository and must resolve every finding to the exact source file before editing.

The local premium component library is expected at:

    /downloads/animmaster-pro1

Inspect that directory before selecting components. Also check the local machine’s normal Downloads location if the exact path is not mounted. Copy only the components and dependencies actually used into the repository; never make the deployed app depend on an absolute local path. Preserve license and attribution requirements. If the library is genuinely unavailable, continue the data repair and base redesign, document the missing path, and do not invent Animaster component names.

Before implementation, run searches equivalent to:

    rg -n "usingFallback|fixture|sample data|Showing sample data|2022-03-04|sc-adopt30-2022-03-04-a1|A843491|A843492|615|wter-evkm|9t4d-g238|Socrata|RescueGroups|fallback" .

    rg -n "fetch\(|axios|unstable_cache|revalidate|force-static|force-dynamic|generateStaticParams|process\.env|NEXT_PUBLIC" app src lib pages components

    rg --files | rg "fixture|sample|mock|data|model|artifact|parquet|csv|json|joblib|pickle|onnx"

Adapt these searches to the repository structure. Report the exact source files that create the fixture, decide usingFallback, build episodes, fetch data, load model outputs, and render the header status.

## Executive finding

The production header is telling the truth: the site is using a fallback fixture, not the current Austin API.

Production embeds all of the following in its rendered payload:

- usingFallback: true
- dataAsOf: 2022-03-04T11:25:00-06:00
- modelVersion: sc-adopt30-2022-03-04-a1
- “Showing sample data”
- “Fixture stamped 4 Mar 2022, 11:25”
- 615 “animals in care”
- 250 records in Discover/Queue

The deployment is statically prerendered and serves fixture records inside the Next.js response. The route bundles do not expose a live Austin data request. This is not a cosmetic label problem.

The fixture is not purely invented. Its animal IDs and intake details come from the old Austin Animal Center public datasets. However, its “currently in care” reconstruction is severely wrong:

- The Discover route contains 250 episode rows but only 241 unique animal IDs.
- A chronological verification against the official outcomes dataset found 218 of the 250 displayed episodes had an official outcome after the displayed intake and on or before the fixture date. That is 87.2 percent of the displayed episodes.
- Daisy, A843460, is shown as waiting 154 days, but the official outcome feed records an adoption on October 11, 2021.
- Bonnie, A843491, is shown as waiting 153 days, but the official feed records adoption on February 4, 2022.
- Clyde, A843492, is shown as waiting 153 days, but the official feed records adoption on February 4, 2022.
- The planner renders duplicate active rows for some animals, including A813191.
- The model page says the data is from March 2022 but says the model was trained on September 12, 2026. At the audit date, September 1, 2026, that training date was in the future.
- The page says the population projection is a seasonal baseline, not a trained forecast. Do not present that chart as model output.

The current UI therefore combines real historical source rows, incorrectly reconstructed active stays, static or precomputed prediction values, and inconsistent hardcoded metadata.

## The Austin data source changed

The application currently links the former datasets:

| Purpose | Dataset ID | Coverage observed during audit | Status |
| --- | --- | --- | --- |
| Archived intakes | wter-evkm | October 1, 2013 through May 4, 2025; 173,812 rows | Historical archive |
| Archived outcomes | 9t4d-g238 | October 1, 2013 through May 5, 2025; 173,775 rows | Historical archive |

Austin launched its ShelterBuddy system on May 5, 2025. The active hourly feeds now use different dataset IDs and a different schema:

| Purpose | Dataset ID | Coverage observed during audit | Status |
| --- | --- | --- | --- |
| Current intakes | pyqf-r2dc | May 4, 2025 through September 1, 2026; 16,927 rows | Active, refreshed hourly |
| Current outcomes | gsvs-ypi7 | May 5, 2025 through September 1, 2026; 16,744 rows | Active, refreshed hourly |

Official pages:

- https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Intakes/pyqf-r2dc
- https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Outcomes/gsvs-ypi7
- https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Intakes/wter-evkm
- https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Outcomes/9t4d-g238

Do not “fix” the site by continuing to call only wter-evkm and 9t4d-g238. Those feeds stop in May 2025.

## Non-negotiable data rules

1. The current operational experience must use pyqf-r2dc and gsvs-ypi7.
2. Full historical analysis or retraining must use all four datasets and normalize the schema break.
3. A current intake is not automatically a currently sheltered or adoptable animal.
4. “In care” may be used only after a valid intake/outcome episode join has been built and tested.
5. “Available for adoption” or “ready to go home” may be used only when a genuine current adoptable-listing source confirms that status. The intake/outcome event feeds alone do not prove adoptability.
6. Current animals must be keyed by a stay or episode identifier, not animal_id alone. Animals can return multiple times.
7. A fallback fixture must never be silently presented in production. API failure must produce a truthful delayed/unavailable state.
8. Model values must come from a real, versioned artifact or scoring service. Do not fabricate p_adopt_7d, p_adopt_14d, p_adopt_30d, p_long_stay_60d, expected_days_in_shelter, driver contributions, confidence intervals, or survival curves.
9. Data and model timestamps must come from their sources. No hardcoded future training dates.
10. Do not expose exact found-location addresses in the public UI. They are unnecessary for this product and can create privacy and safety problems.

## Canonical schema

Create one internal canonical episode model and source-specific adapters. Use the repository’s established naming conventions, but the model must express at least:

| Canonical field | Archived source | ShelterBuddy source |
| --- | --- | --- |
| source_system | legacy_archive | shelterbuddy |
| source_event_id | Stable composite from source row/system ID | id |
| animal_id | animal_id | animal_id |
| intake_at | datetime | source_date |
| species | animal_type | Normalize type; Dog and Puppy become Dog, Cat and Kitten become Cat |
| raw_type | animal_type | type |
| name | name | name_at_intake |
| sex | Parse sex_upon_intake | sex |
| altered_at_intake | Parse sex_upon_intake | ispreviouslyspayedneutered |
| breed | breed | primary_breed |
| color | color | primary_color plus secondary_color |
| intake_reason | intake_type | source_name |
| condition | intake_condition | intake_health_condition |
| date_of_birth | Prefer matching outcome date_of_birth when valid | date_of_birth |
| age_at_intake_days | Parse carefully from age_upon_intake or derive | source_date minus date_of_birth |
| outcome_at | outcome datetime | outcome_date |
| outcome_type | outcome_type | outcome_status |
| closed_days_in_care | Derived from matched events | Validate against days_in_shelter |
| source_updated_at | Not reliably available at row level | timestamp |
| join_status | matched, open, ambiguous, orphaned_intake, or orphaned_outcome | Same |
| data_quality_flags | Array of explicit anomalies | Array of explicit anomalies |

Use Zod or the repository’s existing runtime validation approach at every external boundary. Keep raw types separate from normalized values so mappings remain auditable.

## Correct episode construction

### Legacy archive

For each animal_id:

1. Sort all intake events and outcome events chronologically.
2. Walk the events in order.
3. Match each intake to the earliest unused outcome occurring at or after that intake.
4. Do not allow the same outcome to close two intakes.
5. If another intake appears before a candidate outcome, flag the sequence as ambiguous and apply a documented deterministic rule. Do not silently mark every intake open.
6. Assign a stable episode_id using source system, animal ID, intake timestamp, and intake ordinal or source row identity.
7. At a historical snapshot, an episode is active only when intake_at is on or before the snapshot and no matched outcome_at is on or before the snapshot.
8. Keep ambiguous episodes out of current operational counts until explicitly resolved.

### ShelterBuddy feed

Use animal_id plus intake_date/source_date as the primary stay join. Timestamps should be normalized consistently without changing the represented local time.

1. Attempt an exact join on animal_id and normalized intake timestamp.
2. If exact matching fails, attempt a nearest earlier unused intake only within a narrow, documented tolerance.
3. Mark every tolerance-based match as lower confidence.
4. Never classify an intake as open merely because an outcome failed an exact string comparison.
5. Keep orphan outcomes and orphan intakes in data-quality metrics.
6. Build current operational counts only from high-confidence open episodes.

Add regression tests with A843460, A843491, A843492, A813191, and multiple-return animals.

## Live data architecture

Use server-side data access. Do not make every browser download tens of thousands of source rows.

Recommended modules, adapted to the repository structure:

    src/lib/austin/datasets.ts
    src/lib/austin/client.server.ts
    src/lib/austin/schemas.ts
    src/lib/austin/normalize-legacy.ts
    src/lib/austin/normalize-shelterbuddy.ts
    src/lib/austin/build-episodes.ts
    src/lib/austin/current-inventory.ts
    src/lib/austin/metrics.ts
    src/lib/austin/status.ts
    src/lib/model/score-current.ts

Recommended dataset configuration:

    AUSTIN_CURRENT_INTAKES_ID=pyqf-r2dc
    AUSTIN_CURRENT_OUTCOMES_ID=gsvs-ypi7
    AUSTIN_ARCHIVE_INTAKES_ID=wter-evkm
    AUSTIN_ARCHIVE_OUTCOMES_ID=9t4d-g238
    SOCRATA_APP_TOKEN=<server-only token>
    ALLOW_FIXTURE_FALLBACK=false

Dataset IDs may have safe code defaults, but the app token must remain server-only. Never prefix it with NEXT_PUBLIC.

### Runtime current data

- Fetch the current feeds on the server.
- Select only required columns.
- Use stable ordering.
- Cache/revalidate for one hour because Austin says the current feeds refresh hourly.
- Deduplicate concurrent requests.
- Add bounded retries for 429 and temporary 5xx responses.
- Preserve the last successful source timestamp separately for each feed.
- Build aggregate summaries and paginated view models on the server.
- Do not serialize the full raw datasets into Next.js page payloads.

The active feeds were below the SODA 2.0 limit of 50,000 rows during the audit, but implement pagination correctly so growth does not silently truncate results. Stable order is required.

### Historical data

Do not fetch more than 347,000 archived rows on every page request or every serverless invocation.

Use one of these approaches, in this order:

1. Reuse a valid historical pipeline already in the repository.
2. Run a versioned offline ETL that downloads all four sources, normalizes them, validates counts, builds episodes, and writes compact aggregates/model-ready artifacts.
3. If the project already has a database, use a scheduled idempotent ingestion job and indexed canonical tables.

Historical raw found addresses must not be shipped to the client. Store provenance, source dataset ID, source row key, retrieval time, schema version, and transformation version with generated artifacts.

### Data status contract

Create one status object used by the header and data-details UI:

    mode: live | delayed | unavailable | historical_demo
    intakesUpdatedAt
    outcomesUpdatedAt
    lastSuccessfulSyncAt
    sourceDatasetIds
    currentEpisodeCount
    ambiguousEpisodeCount
    orphanedIntakeCount
    orphanedOutcomeCount
    modelVersion
    modelTrainedAt
    scoringStatus

Header behavior:

- Live: “Live Austin feed · updated [time]”
- Delayed: “Austin feed delayed · last update [time]”
- Unavailable: “Live data unavailable”
- Historical demo: “Historical demonstration · data from [date]”

Never show “Live” when a fixture or historical artifact is active.

## Metrics must have explicit definitions

Create a data dictionary visible from a Data details drawer or section.

- Animals in care: count of high-confidence open episodes at the selected as-of time. If the value is inferred rather than an official roster, label it “inferred open stays.”
- Median days to adoption: median intake-to-adoption duration for a clearly named intake cohort and time window. Do not mix transfers, returns to owner, or euthanasia into adoption duration.
- Adopted within 30 days: share of eligible intake episodes with an adoption outcome within 30 days. Exclude recent episodes that have not had a full 30-day observation window or handle censoring explicitly.
- Long stay: define the threshold, target population, and outcome. Keep observed long stays separate from predicted risk.
- Forecast: if it remains a seasonal average, call it a seasonal baseline. Call it a forecast model only when a trained, validated forecasting artifact produces it.
- Current queue: high-confidence current episodes with valid current scores. If scoring is unavailable, offer a descriptive longest-current-stay view and label it correctly.

## Model repair and guardrails

The current site should not simply apply a 2018-era or March 2022 fixture model to ShelterBuddy rows without validation. The source system, field names, category values, operations, and time period changed.

Claude must:

1. Locate the real model-training code and serialized artifacts.
2. Locate the code that produced the deployed probabilities and feature drivers.
3. Confirm whether web inference exists or whether all scores are static fixture values.
4. Verify model version, training data end date, evaluation block, calibration artifact, threshold configuration, feature order, and preprocessing versions.
5. Remove the future training date.
6. Create a versioned scoring contract.
7. Reject rows that cannot be transformed safely; never fill them with invented predictions.
8. Add out-of-distribution and missing-feature reporting for ShelterBuddy data.
9. Rebuild or retrain the model when necessary, using a temporal holdout that includes the post-May-2025 source system.
10. Recalibrate on recent data before calling probabilities calibrated.
11. Re-run subgroup performance and fairness checks.
12. Keep the safety rule visible: a high long-stay risk routes more help toward an animal and must never reduce care.

If a validated live scoring path cannot be completed in this pass, ship the live descriptive dashboard first and keep prediction-specific UI in an honest “model update in progress” state. Correct live descriptive data is better than false precision.

## Required pages and information architecture

Use this navigation:

    Dashboard
    Queue
    Discover
    Impact
    Planner
    Model

Add /impact as a complete plain-English page. Keep /model for technical validation and methodology.

### Dashboard

- Create a high-impact hero with one clear mission statement, live data status, source timestamp, and two useful actions.
- Recommended headline: “Earlier attention. Shorter waits. More animals home.”
- Recommended supporting line: “SecondChance helps shelter teams see which animals may need extra support, then turns that insight into a practical outreach plan.”
- Replace the flat top area with layered brand depth: navy-to-teal gradient, restrained data-line motion, subtle animal-focused visual language, and excellent contrast.
- Animate live KPI values with restrained count-up behavior.
- Animate chart lines and confidence regions when they enter view.
- Add a top-five “Needs attention now” preview only when current validated scores exist.
- Place source definitions in an accessible data-details drawer.
- Keep uncertainty and labels visible; visual polish must not disguise data limitations.

### Queue

- Add a sticky command/filter bar with species, life stage, intake type, days in care, risk band, and data-quality state.
- Add search by name or animal ID.
- Support a dense table and a more visual card view.
- Use staggered row entry, animated sort changes, and a refined hover preview.
- Keep keyboard navigation, focus states, screen-reader labels, and reduced-motion support.
- Do not show ambiguous or already-closed episodes in the active queue.
- Do not render fake survival curves or driver explanations.

### Discover

- Treat this as the human-facing animal view.
- Do not say “ready to go home today” unless a current adoptable-listing source confirms it.
- If only intake/outcome data is available, label the page “Current shelter records” and explain that public intake status is not the same as adoption availability.
- Use real current photos only when the project has a licensed, current listing source and a reliable animal match.
- Otherwise use a polished branded placeholder; never attach an unrelated stock animal photo to a record.
- Add tasteful card elevation, image reveal, species filter transitions, and an informative detail route.

### Planner

- Keep the capacity and channel planning concept.
- Build assignments only from valid current queue records.
- Add an animated workload summary and a clear explanation of which values are measured versus assumed.
- Keep CSV download and print.
- If intervention lift is an assumption, label it as an assumption in every relevant view.

### Model

- Add a “Simple explanation” and “Technical details” switch.
- Lead with what the model predicts, what data it learned from, how it was tested, and where it should not be trusted.
- Every metric must be loaded from a real evaluation artifact.
- Add a model lineage panel: version, trained at, training window, validation window, test window, feature schema version, current scoring status, and source-system compatibility.
- Present subgroup performance and known limits prominently.

### Impact

Use the approved copy later in this file. The page must be visually memorable but extremely easy to understand.

## Premium design direction

Keep the existing navy and teal identity, but build a more dimensional and distinctive system.

Core palette:

- Deep navy foundation: #041D38 and #05274C
- Teal action color: #0A9E84
- Bright mint highlight: #4FD8BC
- Warm adoption accent: a restrained amber/coral used only for urgency and human moments
- Soft off-white page surface with layered translucent cards

Design characteristics:

- Editorial data product, not a generic SaaS template
- Larger, more confident typography
- More breathing room and clearer page rhythm
- Rich section transitions instead of a stack of identical cards
- Subtle topographic/data contours, paw/kennel geometry, and signal paths
- Glass effects only where contrast remains strong
- Real depth through lighting, borders, and motion rather than excessive blur
- Light and dark themes must both look intentionally designed
- Mobile must feel native and complete, not compressed desktop

Suggested typography:

- Use the existing strong local typography if present.
- Otherwise use a refined sans such as Manrope or Plus Jakarta Sans and a restrained mono such as IBM Plex Mono for model IDs and timestamps.
- Load fonts through the existing Next.js approach and avoid layout shift.

## Animaster integration

Inspect /downloads/animmaster-pro1 and select a small, coherent set of compatible components by behavior, not by guessed name.

Prioritize:

1. A premium page or route transition.
2. A masked or split-text hero reveal.
3. A refined hover or magnetic interaction for primary calls to action.
4. A scroll-linked background or section transition.
5. A card/list reveal suitable for Queue and Discover.
6. An optional number or metric transition.

Integration rules:

- Copy source into a clearly named local directory.
- Record the source component path and dependencies in a short ATTRIBUTION or implementation note.
- Install only required dependencies.
- Reuse the existing motion library when possible.
- If GSAP is required, register plugins only in client code and clean up every animation context on unmount.
- Keep server components for data access; place client boundaries only around interactive animation.
- Dynamically import heavy visual components.
- Respect prefers-reduced-motion and provide a meaningful motion-free state.
- Avoid constant cursor hijacking, scroll traps, inaccessible marquees, or motion that delays data access.
- Target smooth 60 fps behavior on modern mobile devices.
- Do not apply a unique animation style to every section. The experience should feel authored, not noisy.

## Approved Impact page copy

The final design can break this copy into sections, cards, callouts, and interactive steps. Preserve the meaning and plain-English clarity.

### Hero

Eyebrow:

    Why SecondChance exists

Headline:

    Help the animals most likely to be overlooked—before they have to wait longer.

Body:

    Animal shelters make difficult decisions every day with limited time, staff, foster homes, and outreach capacity. SecondChance uses shelter data to help teams notice which animals may need extra attention early, then turn that insight into practical action.

Primary action:

    See how it helps

Secondary action:

    View the data

### The problem

Heading:

    Long shelter stays are easier to prevent than to undo.

Body:

    Some animals are adopted quickly. Others wait because of age, breed perceptions, health or behavior needs, weak photos, limited profile information, seasonal crowding, or simply not reaching the right audience. Staff usually know these patterns, but it is difficult to review every case at the right time while also running the shelter.

    SecondChance is designed to support that judgment. It does not replace shelter professionals. It gives them another way to see where earlier attention may make the biggest difference.

### What the data shows

Heading:

    From individual stays to the shelter’s bigger picture.

Intro:

    The Austin Animal Center publishes intake and outcome records. Once those events are cleaned and paired correctly, they can show:

Items:

- How many high-confidence shelter stays appear to be open at a selected time.
- How long animals have been waiting.
- Which groups tend to experience longer stays.
- How adoption, transfer, and return-to-owner outcomes change over time.
- When crowding and seasonal intake patterns create more pressure.
- Which animals a validated model estimates may be at higher risk of a long stay.
- Whether predictions remain accurate, calibrated, and fair enough to use.

Accuracy note:

    A public intake record is not automatically proof that an animal is currently available for adoption. SecondChance separates intake history, inferred current stays, verified adoption listings, and model predictions so users can understand exactly what each number means.

### How a shelter can use it

Heading:

    Turn data into earlier, more focused help.

Photography and profiles:

    Find animals who may benefit from better photos, a clearer biography, or updated information before their listing becomes stale.

Foster recruitment:

    Give foster coordinators a focused list of animals whose stress, age, medical needs, or long wait may make a foster placement especially valuable.

Targeted outreach:

    Match animals with the channels most likely to help—social media, breed-specific communities, senior-pet audiences, local partners, or adoption events.

Daily queue management:

    Help teams decide which cases deserve a closer look first without reducing the care given to anyone else.

Medical and behavior support:

    Surface animals whose barriers may require a clinical, enrichment, training, or behavior-plan review.

Capacity planning:

    Use intake and outcome trends to anticipate busy periods, prepare kennel space, recruit volunteers, schedule events, and coordinate transfer partners.

Program measurement:

    Compare what happened after new photos, foster placement, profile rewrites, fee promotions, or events. This helps shelters learn which interventions work, for which animals, and at what cost.

Equity and model monitoring:

    Check whether the system performs differently across species, ages, conditions, and breed groups. Pause or change the model when it is not reliable enough for a group.

### How this can help shelters across the United States

Heading:

    The workflow can travel. The model cannot be copied blindly.

Body:

    Shelters across the country can use the same basic approach: combine clean intake and outcome history, define each shelter stay correctly, identify practical intervention points, and measure results. But every shelter has different communities, policies, resources, housing conditions, and data systems.

    A model trained on Austin records should not be treated as automatically accurate somewhere else. Each shelter should train or recalibrate with its own data, test the model on a recent time period, review performance by important groups, and keep staff in control of every decision.

### Our mission

Heading:

    More support, sooner.

Body:

    Our mission is to help shelters use data to direct more attention, creativity, and community support toward animals who may otherwise be overlooked. A high-risk score is never a reason to reduce care. It is a signal to ask what more can be done.

### What SecondChance will never be used for

Heading:

    The guardrail is simple: predictions can increase help, never take it away.

Items:

- Never use a score to justify euthanasia.
- Never use a score to refuse intake.
- Never use a score to withhold medical or behavioral care.
- Never use a score to lower an animal’s priority for food, housing, enrichment, or safety.
- Never present an uncertain prediction as a fact.
- Never hide stale, incomplete, or fallback data behind a “live” label.

### Project context

Heading:

    Built to explore how responsible prediction can support animal welfare.

Body:

    SecondChance began as a UNC Charlotte predictive analytics project using public Austin Animal Center records. The project combines data engineering, predictive modeling, model evaluation, and product design to show how analysis can become a practical, responsible shelter workflow.

Data note:

    Data source: City of Austin Open Data. Current and historical feeds use different schemas because Austin moved to ShelterBuddy in May 2025. SecondChance documents that change and reports the source and freshness of every view.

## Wording corrections outside Impact

Replace:

    Today at the shelter

With, when the current episode inference is validated:

    Austin shelter activity

Replace:

    250 animals are looking for a home right now.

With one of:

    [count] high-confidence open shelter stays are represented in the current public feeds.

Or, only with a verified adoptable source:

    [count] animals are currently listed as available for adoption.

Replace:

    Every one of them is ready to go home today.

With:

    Explore current records and learn where additional attention may help.

Replace:

    The model expects to wait longest.

With:

    The current validated model estimates may be at greater risk of a long stay.

Only render that sentence when current validated scores exist.

Replace the footer’s old-only source links with all four City of Austin datasets. Clearly label the two old feeds as archives and the two new feeds as current hourly ShelterBuddy feeds.

## Validation and acceptance tests

### Data

- Production no longer renders usingFallback: true during normal operation.
- Production no longer embeds the March 4, 2022 fixture as current data.
- API failure cannot silently load the fixture.
- Current source IDs are pyqf-r2dc and gsvs-ypi7.
- Historical pipelines include wter-evkm and 9t4d-g238.
- No open episode has a matched outcome on or before the selected as-of time.
- A843460, A843491, and A843492 are not active in a March 4, 2022 snapshot.
- Repeated animal IDs produce separate, non-duplicated episode IDs.
- Ambiguous joins are counted and excluded from confident operational metrics.
- Source row counts, maximum timestamps, and retrieval time are logged.
- Pagination cannot truncate a source at 1,000 or 50,000 rows.
- No exact found address reaches the browser.
- Public pages never claim “adoptable” based only on an intake record.

### Model

- Every displayed score has a real model version and scoring timestamp.
- modelTrainedAt is not in the future.
- Model metrics load from evaluation artifacts, not UI constants.
- Current source schema compatibility is tested.
- Missing or incompatible rows show “prediction unavailable.”
- The long-stay safety guardrail remains visible.

### UI and motion

- /impact exists and is in desktop and mobile navigation.
- The approved plain-English content is complete.
- Dashboard, Queue, Discover, Planner, Model, and Impact have intentional responsive layouts.
- Key animation components come from the inspected Animaster library when available.
- prefers-reduced-motion removes nonessential motion.
- Keyboard users can complete all actions.
- Charts include table alternatives or useful accessible descriptions.
- No animation causes layout shift or blocks navigation.
- Empty, loading, delayed, unavailable, and partial-data states are designed.
- Light and dark themes are complete.

### Engineering

- Typecheck passes.
- Lint passes.
- Unit and integration tests pass.
- Production build passes.
- Existing CSV and print workflows still work.
- No secrets are exposed to the client bundle.
- No unnecessary full dataset is embedded into generated HTML.
- Main routes should target Lighthouse scores of at least 90 for performance and accessibility on a realistic mobile profile.

## User-only setup, if Claude confirms it is needed

The Austin datasets are public, so development can begin without credentials. For a reliable deployed application, create a Socrata application token and keep it server-side. Socrata says an application token gives the app its own throttling pool; use the X-App-Token header.

1. Sign in to the City of Austin Open Data portal.
2. Open the Socrata developer or application-token settings in the account profile.
3. Create a token named SecondChance.
4. In Vercel, open the SecondChance project.
5. Open Settings, then Environment Variables.
6. Add SOCRATA_APP_TOKEN.
7. Enable it for Production and Preview. Add it locally through the repository’s ignored environment file.
8. Confirm no client-side code can read it.
9. Redeploy from the repaired commit.

Official token guidance:

    https://dev.socrata.com/docs/app-tokens.html

If a verified current adoptable listing integration is implemented, add its credential separately as a server-only variable. Do not create or request that credential until Claude confirms the provider, terms, matching strategy, and exact need.

## Required implementation handoff from Claude

When finished, Claude must provide:

1. The root cause found in the source code.
2. The exact files changed.
3. The final data flow from Austin source to UI.
4. The current versus archive schema mapping.
5. Episode-join logic and data-quality counts.
6. Whether model scoring is live, historical-only, or intentionally unavailable.
7. The Animaster components selected and their original local paths.
8. Environment variables required.
9. Commands run and test/build results.
10. Remaining risks or decisions that require Davis.
11. The final production verification checklist.

Do not stop after planning. Implement, test, and verify the complete repair and redesign unless blocked by a missing credential or missing local Animaster source. A missing optional token does not block the public Austin API integration.
