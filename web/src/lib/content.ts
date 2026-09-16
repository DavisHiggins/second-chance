/**
 * Every string in the product.
 *
 * Components import from here rather than writing copy inline, so the house
 * style holds: plain words, short sentences, "the model" and never "the AI",
 * "waits longer" and never "unlikely to be adopted".
 *
 * A second rule sits alongside the first. Nothing here may describe inferred
 * data as confirmed, or an intake record as proof of adoptability. Austin
 * publishes intake and outcome events. It does not publish a list of animals
 * available for adoption, so this product cannot say one exists.
 *
 * A third rule arrived with the September 2026 refinement. A prediction is
 * answered at intake and is never described as a forecast from today; an
 * association in historical data is never called a measured effect; and a
 * planning assumption is always called one.
 */

export const USE_POLICY_SHORT =
  "Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.";

export const USE_POLICY_FULL: readonly string[] = [
  "SecondChance estimates how long an animal is likely to wait so that staff attention, foster recruitment, photography and outreach can go to the animals who need them most.",
  "A high predicted long-stay risk is a request for more help, not less. This score must never be used to justify euthanasia, to refuse an intake, to withhold medical or behavioural care, or to deprioritise any animal for any resource. Every prediction in this system exists to increase what an animal receives.",
  "If you are being asked to use this tool to reduce care for an animal, the tool is being misused. Say so.",
];

export interface NavItem {
  href: "/" | "/queue" | "/discover" | "/planner" | "/impact" | "/model" | "/about" | "/contact";
  label: string;
  /** One line for the mobile menu. */
  description: string;
  group: "work" | "learn" | "contact";
}

/** Eight destinations. The first four are the daily work; the next three are
 *  grouped under "Learn" where the header runs out of room; Contact stands
 *  on its own to the right of Learn. */
export const NAV: readonly NavItem[] = [
  { href: "/", label: "Dashboard", description: "Shelter overview", group: "work" },
  {
    href: "/queue",
    label: "Needs attention",
    description: "Animals that may need extra support",
    group: "work",
  },
  { href: "/discover", label: "Shelter records", description: "Explore shelter records", group: "work" },
  {
    href: "/planner",
    label: "Outreach planner",
    description: "Build this week's outreach plan",
    group: "work",
  },
  { href: "/impact", label: "Impact", description: "Turning shelter data into earlier support", group: "learn" },
  { href: "/model", label: "How it works", description: "Understand the data and predictions", group: "learn" },
  { href: "/about", label: "About", description: "About SecondChance", group: "learn" },
  { href: "/contact", label: "Contact", description: "Questions, feedback, or a conversation", group: "contact" },
];

export const SHELL = {
  wordmark: "SecondChance",
  skipLink: "Skip to main content",
  learnGroup: "Learn",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  menuTitle: "Navigation",
  modelChipPrefix: "Model",
  modelChipUnavailable: "Model updating",
  dataDetails: "Data details",
  dataDetailsClose: "Close",
  dataStatus: "Data status",
  densityComfortable: "Comfortable",
  densityCompact: "Compact",
  themeLight: "Light",
  themeDark: "Dark",
} as const;

export const FOOTER = {
  purpose:
    "SecondChance reads the City of Austin's public shelter records and estimates which animals may wait longest, so attention can go to them earlier.",
  navHeading: "Pages",
  sourceHeading: "Source",
  contactHeading: "Contact",
  sourceLink: "City of Austin open data portal",
  sourceLine: "Four Austin Animal Center datasets: two current feeds, refreshed hourly, and two frozen archives.",
  detailsAction: "Data details and definitions",
  researchNote:
    "A student research prototype from UNC Charlotte. Not affiliated with the Austin Animal Center. Predictions support human judgment and never reduce care.",
  policyLink: "Full responsible-use policy",
  credit: "Built by Davis Higgins, Bennett Shearin, Seth Sumter, and Hunter Pace.",
} as const;

export const DASHBOARD = {
  pageTitle: "Shelter overview",
  eyebrow: "Live from the City of Austin open data portal",
  heroHeadline: "Earlier attention. Shorter waits. More animals home.",
  heroBody:
    "SecondChance helps shelter teams see which animals may need extra support, then turns that insight into a practical outreach plan.",
  heroPrimary: "Review animals needing support",
  heroSecondary: "How to use the data",
  openStaysLabel: "open shelter stays",
  openStaysNote:
    "Cat and dog stays inferred from the public intake and outcome feeds. This is not a roster of animals available for adoption.",
  contextWindow: "Rates below cover stays that began in the trailing twelve months",
  needsAttentionTitle: "Needs attention",
  needsAttentionSubtitle:
    "The five open stays with the highest intake-time long-stay estimates. Each row leads with how long the animal has actually waited.",
  needsAttentionUnavailable:
    "The top-five preview appears when a validated model is scoring the current feed.",
  needsAttentionQueue: "Open the full queue",
  needsAttentionPlanner: "Plan outreach",
  tiles: {
    census: "Open shelter stays",
    medianDays: "Median days to adoption",
    adoptionRate: "Adopted within 30 days",
    longStay: "Stays longer than 60 days",
  },
  whatThisMeans: "What this means",
  trendTitle: "Intakes and adoptions by month",
  trendSubtitle: "Cats and dogs, from the current ShelterBuddy feeds. Two event counts, not one cohort.",
  outcomesTitle: "How stays end",
  outcomesSubtitle: "Completed cat and dog stays that began in the last twelve months",
  segmentsTitle: "Where the wait is longest",
  segmentsSubtitle: "Observed median days to adoption by life stage at intake, last twelve months",
  healthTitle: "Model context",
  healthSummary:
    "A validated model scores every eligible open stay. Its evaluation is summarised here and set out in full on How it works.",
  dataDetailsCta: "What these numbers count",
  sections: {
    overview: "Overview",
    attention: "Attention",
    trends: "Trends",
    model: "Model context",
    workflow: "How to work with it",
  },
  workflowTitle: "Read the pattern, review the animal, plan support",
  workflowSteps: [
    {
      title: "Read the pattern",
      body: "The tiles and charts describe what has happened: waits, outcomes and pressure over the last year.",
      href: "/",
      cta: "You are here",
    },
    {
      title: "Review the animal",
      body: "The queue puts intake-time estimates next to actual waits, with the record behind each one.",
      href: "/queue",
      cta: "Open the queue",
    },
    {
      title: "Plan support",
      body: "The planner turns a shortlist into a week of outreach work with the assumptions written down.",
      href: "/planner",
      cta: "Open the planner",
    },
  ],
} as const;

export const QUEUE = {
  title: "Animals that may need extra support",
  subtitleScored:
    "Open shelter stays ordered by the model's intake-time estimate of a long stay, with actual waiting time beside each. Work from the top; the record and the reasoning are one click away.",
  subtitleDescriptive:
    "Open shelter stays ordered by how long each animal has been waiting. This is a descriptive ordering, not a model prediction.",
  searchLabel: "Search",
  searchPlaceholder: "Name, animal ID or breed",
  speciesLabel: "Species",
  lifeStageLabel: "Life stage",
  riskLabel: "Estimate band",
  waitLabel: "Minimum wait",
  sortLabel: "Sort",
  staleLabel: "Hide possibly stale",
  viewLabel: "View",
  viewTable: "Table",
  viewCards: "Cards",
  resetFilters: "Reset",
  activeFilters: "Active filters",
  unnamed: "Unnamed",
  daysLabel: "days",
  columns: {
    animal: "Animal",
    details: "Details",
    wait: "Days waiting",
    estimate: "Intake-time estimate",
    status: "Status",
    actions: "Actions",
  },
  expand: "Why this animal",
  collapse: "Hide",
  viewRecord: "View record",
  addToPlan: "Add to plan",
  inPlan: "In plan",
  removeFromPlan: "Remove from plan",
  emptyNoFilter: "No open stays are currently above the estimate threshold. That is good news.",
  emptyFiltered: "No animals match these filters.",
  clearFilters: "Clear filters",
  headingObserved: "What was observed",
  headingEstimated: "What was estimated, and when",
  headingWhy: "Why this outreach was suggested",
  headingDrivers: "What the model weighs, across all animals",
  headingCompleteness: "Record completeness",
  verifyReminder:
    "Verify with the animal's current record before acting. An open intake record is not confirmation that the animal is available.",
  predictionUnavailable: "Prediction unavailable",
  staleBadge: "Possibly stale record",
  staleExplain:
    "This stay has been open for more than a year. It may be a genuine long stay, or a record Austin has not closed.",
  scrollRestored: "Returned to where you were",
} as const;

export const DETAIL = {
  backToRecords: "Shelter records",
  backToQueue: "Needs attention",
  backToPlanner: "Outreach planner",
  predictionTitle: "Model estimates, for staff",
  predictionIntro:
    "Answered at intake from what was known then. They are estimates that support judgment; a higher long-stay estimate should prompt more attention, not less.",
  intervalNote: "Calibrated on a later validation block; evaluation on How it works.",
  driversTitle: "What the model weighs most",
  driversNote:
    "These are the features the model relies on across the whole population, not a per-animal attribution.",
  interventionsTitle: "Suggested support",
  evidenceHistorical: "Historical evidence",
  evidenceAssumed: "Assumption, not measured here",
  timelineTitle: "This stay",
  factsTitle: "Recorded facts",
  qualityTitle: "Data-quality notes",
  noPredictionTitle: "No prediction for this animal",
  contactHeading: "Check current availability",
  contactBody:
    "This site reads public intake and outcome records. It cannot confirm that an animal is available for adoption. Ask the Austin Animal Center directly.",
  contactLink: "Austin Animal Center adoption information",
  contactHref: "https://www.austintexas.gov/department/aac",
  notRecorded: "Not recorded",
  addToPlan: "Add to outreach plan",
  inPlan: "In this week's plan",
  ageNow: "Age now",
  ageAtIntake: "Age at intake",
  alteredAtIntake: "Spayed or neutered at intake",
  alteredNote: "As recorded on arrival; it may have changed since.",
} as const;

export const DISCOVER = {
  title: "Explore shelter records",
  subtitle: "Browse the cats and dogs with an open intake record in Austin's public feed.",
  accuracyNote:
    "A public intake record is not the same as an adoption listing: it does not confirm that an animal is available, and some records may not have been closed. Contact the Austin Animal Center to ask about a specific animal.",
  searchLabel: "Search by name or animal ID",
  speciesLabel: "Species",
  ageLabel: "Age",
  waitLabel: "Waiting",
  sortDefaultLabel: "Longest waiting first",
  photoNote: "Austin's public feeds carry no photographs, so each record shows a branded placeholder.",
  empty: "No records match what you are looking for right now. Try widening the filters.",
  waitingFor: "Waiting",
  noName: "Waiting for a name",
  recordStatusOpen: "Open intake record",
  recordStatusStale: "Open over a year",
  viewRecord: "View record",
  showMore: "Show more records",
} as const;

export const PLANNER = {
  title: "Build this week's outreach plan",
  subtitle: "Turn the queue into a list of jobs your team can actually finish.",
  step1: "Capacity",
  step1Body: "How many animals can your team feature this week?",
  step2: "Available actions",
  step2Body: "Which outreach channels does your team have this week?",
  step3: "Review the plan",
  step3Body: "Automatic picks fill the capacity. Add, remove or reassign any row.",
  capacityLabel: "Animals this week",
  channelHeading: "Channels",
  pickedHeading: "Chosen from the queue",
  pickedNote: "Animals you added from the queue or a record page. They are placed first.",
  pickedEmpty: "Nothing chosen yet. Use “Add to plan” on the queue or a record page.",
  autoLabel: "Automatic",
  manualLabel: "Chosen by you",
  reassign: "Channel",
  remove: "Remove",
  restoreAuto: "Restore automatic picks",
  estimateHeading: "Planning estimate",
  liftNote:
    "In the held-out test block, the 50 highest-ranked stays contained long stays at {lift} the block's base rate. That is retrospective test performance. It does not mean today's queue will show the same figure, and it does not mean outreach creates that lift.",
  liftUnavailable: "Queue lift is not published in the current model artifact, so nothing is claimed for it here.",
  assumptionLine:
    "The benefit of an action is an assumption, not a measurement. Set it below; it is labelled as an assumption wherever it appears.",
  upliftLabel: "Assumed increase in each animal's chance of adoption within 30 days",
  upliftUnit: "percentage points",
  scenarioFormula:
    "Formula: for each animal, min(assumed increase, 100% − baseline). Baseline is the intake-time 30-day estimate while that window is still open, and zero once it has passed, because an intake-time estimate is not a next-month baseline for an animal that has waited months.",
  scenarioLine:
    "Under that assumption, this plan would add about {n} adoptions within the stated horizons. This is a hypothetical planning figure, not a validated forecast or achieved impact.",
  scenarioHypothetical:
    "{k} of {total} animals in the plan are already past their 30-day window, so their contribution is purely hypothetical.",
  workloadHeading: "Workload",
  descriptiveNotice:
    "No validated model is scoring right now, so this plan is built from the longest current waits rather than predicted risk.",
  exportCsv: "Download CSV",
  print: "Print",
  historicalLabel: "Historical evidence",
  assumedLabel: "Assumption",
  timeLabel: "Assumed time",
  checklistHeading: "Progress",
  checklistNote: "Saved on this device only. Nothing is shared or sent anywhere.",
  checklistReset: "Reset progress",
  checklistExport: "Export progress",
  statuses: ["Planned", "In progress", "Done"],
  suggestionNote:
    "Channel matching is an outreach suggestion based on the recorded facts. It is a written rule, not a model output, and staff can change it.",
} as const;

export const MODEL = {
  title: "Understand the data and predictions",
  intro: [
    "SecondChance reads the City of Austin's public intake and outcome records for the Austin Animal Center. It pairs each arrival with the outcome that closed it, counts the stays still open, and calculates waiting times and adoption statistics from what actually happened.",
    "For each open cat or dog stay with a recorded date of birth, a model estimates two things from what was known at intake: the chance the stay runs past 60 days, and the chance of adoption by day 30. Nothing about the estimate updates as the stay continues.",
    "Staff should read an estimate as a reason to look earlier and do more, then check the animal's current record before acting. Nothing here decides anything.",
  ],
  tocLabel: "On this page",
  sections: {
    data: "Data and refresh",
    metrics: "Metric guide",
    predictions: "What the model predicts",
    testing: "How it was tested",
    subgroups: "Who it works for",
    limitations: "Limitations",
    lineage: "Technical lineage",
  },

  simpleWhatHeading: "What it predicts",
  simpleWhatBody:
    "For every cat and dog currently in the shelter, the model estimates two things from what was known on arrival: the chance the animal is still there after 60 days, and the chance it is adopted within 30 days of intake. Nothing else. It does not decide anything, and it does not rank animals by how much they deserve care.",
  simpleDataHeading: "What it learned from",
  simpleDataBody:
    "Completed shelter stays from Austin's current public feeds, which begin in May 2025 when the city moved to the ShelterBuddy system. It uses only what is known when an animal arrives: species, breed, colour, age, sex, why it came in, its health at intake, and how full the shelter was that day.",
  simpleTestHeading: "How it was tested",
  simpleTestBody:
    "On stays the model never saw, from a later period than the ones it learned from. Testing on a later window is deliberate. A model checked only against its own era tells you nothing about how it behaves once the shelter changes.",
  simpleTrustHeading: "Where it should not be trusted",
  simpleTrustBody:
    "It knows nothing about behaviour, temperament, photographs or listing quality, which are among the strongest reasons an animal waits. It was trained on one shelter in one city. It should not be pointed at another shelter without retraining and rechecking there.",

  lineageHeading: "Model lineage",
  lineageNote:
    "Every value in this panel is read from the published model artifact. Nothing on this page is typed in by hand.",

  performanceHeading: "How well it works",
  performanceNote:
    "Measured on the held-out test block after calibration. Discrimination is the ability to rank a long stay above a short one. Calibration error is how far a stated percentage is from what actually happened.",

  calibrationHeading: "Calibration: how the percentages were fitted",
  calibrationBody:
    "The raw model ranks well but its probabilities are not trustworthy on their own. An isotonic mapping is fitted on the validation block and applied to everything shown on this site. The validation figures below are the mapping's fit on the data it was fitted to, so a near-zero calibration error there is expected and is not evidence. The test figures above are the honest ones.",
  calibrationNoCurve:
    "A reliability curve is not drawn because the artifact does not carry per-bin counts, and a curve interpolated from summary statistics would be a drawing rather than a measurement.",

  subgroupHeading: "Who it works for",
  subgroupBody:
    "A model that works well on average can still work badly for a particular group of animals, and that is exactly the failure that matters here. Performance is reported by species, life stage, intake condition, breed structure and coat colour rather than summarised away. Uncertainty is not estimated for small groups, so a small gap is not proof of fairness and a large one in a group of 32 is not proof of a problem.",
  subgroupPopulationNote:
    "The evaluation set includes stays recorded with an intake condition of “Dead”, animals that arrived deceased. They are not candidates for adoption support, and their presence in training and evaluation is a known limitation of this model version. Removing them requires a documented retrain and re-evaluation; the metrics above are reported as published rather than adjusted after the fact.",

  refreshHeading: "Austin connection and refresh",
  refreshBody: [
    "SecondChance connects to the City of Austin's public intake and outcome records. Austin describes these feeds as updating hourly. SecondChance checks for updates automatically and recalculates the affected records and statistics when a refreshed snapshot is available. The data-status panel shows when information was last retrieved and whether the source appears delayed. Changes are not instantaneous, and an open intake record does not confirm that an animal is available for adoption.",
    "Updated records can receive estimates from the current model. The model itself is updated separately after retraining and testing.",
  ],
  refreshSteps: [
    { label: "Austin publishes", body: "Intake and outcome rows, hourly, on the open data portal." },
    { label: "SecondChance reads", body: "Every row, validated and paired into stays, reused for thirty minutes." },
    { label: "Pages recalculate", body: "Counts, rates and estimates from the same snapshot." },
  ],

  archiveHeading: "The earlier archive study",
  archiveBody:
    "An earlier version of this project studied the full Austin archive from October 2013 to March 2022, under the previous shelter system. Those results are kept because the methodology and its findings still stand, but that model is not the one scoring this site: the source system, schema and operating period all changed in May 2025, and applying it to the current feed would be unsound.",

  limitsHeading: "When it stops working",
  limitsBody: [
    "A model can keep its ranking and lose its meaning. In the archive study the shelter's operations changed sharply in March 2020: the model kept telling fast adoptions from slow ones about as well as before, but its probabilities drifted until it was predicting a 30-day adoption rate twelve points above what actually happened.",
    "That is the failure mode worth understanding, because a dashboard showing probabilities will keep showing confident, wrong numbers the whole time. Monitoring only the ranking metric would have missed it entirely, which is why calibration error is reported next to discrimination here rather than buried.",
  ],
  mustNotHeading: "What it must not be used for",
} as const;

/* -------------------------------------------------------------------------- */
/* Impact                                                                      */
/* -------------------------------------------------------------------------- */

export const IMPACT = {
  pageTitle: "Turning shelter data into earlier support",
  eyebrow: "Why SecondChance exists",
  headline: "Help the animals most likely to be overlooked—before they have to wait longer.",
  body: "Animal shelters make difficult decisions every day with limited time, staff, foster homes, and outreach capacity. SecondChance uses shelter data to help teams notice which animals may need extra attention early, then turn that insight into practical action.",
  primaryAction: "See how it helps",
  secondaryAction: "View the data",

  problemHeading: "Long shelter stays are easier to prevent than to undo.",
  problemBody: [
    "Some animals are adopted quickly. Others wait because of age, breed perceptions, health or behavior needs, weak photos, limited profile information, seasonal crowding, or simply not reaching the right audience. Staff usually know these patterns, but it is difficult to review every case at the right time while also running the shelter.",
    "SecondChance is designed to support that judgment. It does not replace shelter professionals. It gives them another way to see where earlier attention may make the biggest difference.",
  ],

  threeUsesHeading: "Three concrete uses",
  threeUses: [
    {
      title: "Earlier individual support",
      body: "An intake-time estimate beside an actual wait, so a specific animal gets a closer look sooner.",
    },
    {
      title: "Shelter-level planning",
      body: "Intake, outcome and wait trends to anticipate busy periods and spread outreach across the team.",
    },
    {
      title: "Evaluating outreach results",
      body: "A written plan with its assumptions, so what happened afterwards can be compared against what was expected.",
    },
  ],

  dataHeading: "From individual stays to the shelter's bigger picture.",
  dataIntro:
    "The Austin Animal Center publishes intake and outcome records. Once those events are cleaned and paired correctly, they can show:",
  dataItems: [
    "How many high-confidence shelter stays appear to be open at a selected time.",
    "How long animals have been waiting.",
    "Which groups tend to experience longer stays.",
    "How adoption, transfer, and return-to-owner outcomes change over time.",
    "When crowding and seasonal intake patterns create more pressure.",
    "Which animals a validated model estimates may be at higher risk of a long stay.",
    "Whether predictions remain accurate, calibrated, and fair enough to use.",
  ],
  dataAccuracyNote:
    "A public intake record is not automatically proof that an animal is currently available for adoption. SecondChance separates intake history, inferred current stays, verified adoption listings, and model predictions so users can understand exactly what each number means.",

  useHeading: "Turn data into earlier, more focused help.",
  useItems: [
    {
      title: "Photography and profiles",
      body: "Find animals who may benefit from better photos, a clearer biography, or updated information before their listing becomes stale.",
    },
    {
      title: "Foster recruitment",
      body: "Give foster coordinators a focused list of animals whose stress, age, medical needs, or long wait may make a foster placement especially valuable.",
    },
    {
      title: "Targeted outreach",
      body: "Match animals with the channels most likely to help—social media, breed-specific communities, senior-pet audiences, local partners, or adoption events.",
    },
    {
      title: "Daily queue management",
      body: "Help teams decide which cases deserve a closer look first without reducing the care given to anyone else.",
    },
    {
      title: "Medical and behavior support",
      body: "Surface animals whose barriers may require a clinical, enrichment, training, or behavior-plan review.",
    },
    {
      title: "Capacity planning",
      body: "Use intake and outcome trends to anticipate busy periods, prepare kennel space, recruit volunteers, schedule events, and coordinate transfer partners.",
    },
    {
      title: "Program measurement",
      body: "Compare what happened after new photos, foster placement, profile rewrites, fee promotions, or events. This helps shelters learn which interventions work, for which animals, and at what cost.",
    },
    {
      title: "Equity and model monitoring",
      body: "Check whether the system performs differently across species, ages, conditions, and breed groups. Pause or change the model when it is not reliable enough for a group.",
    },
  ],

  potentialHeading: "Potential benefits, not measured results",
  potentialBody:
    "The uses above describe what the workflow makes possible. SecondChance has not measured animals saved, adoption improvements, or outreach effects, and it does not have users or partners to report. Those claims belong to a shelter that runs the workflow and evaluates it.",

  nationalHeading: "The workflow can travel. The model cannot be copied blindly.",
  nationalBody: [
    "Shelters across the country can use the same basic approach: combine clean intake and outcome history, define each shelter stay correctly, identify practical intervention points, and measure results. But every shelter has different communities, policies, resources, housing conditions, and data systems.",
    "A model trained on Austin records should not be treated as automatically accurate somewhere else. Each shelter should train or recalibrate with its own data, test the model on a recent time period, review performance by important groups, and keep staff in control of every decision.",
  ],

  missionHeading: "More support, sooner.",
  missionBody:
    "Our mission is to help shelters use data to direct more attention, creativity, and community support toward animals who may otherwise be overlooked. A high-risk score is never a reason to reduce care. It is a signal to ask what more can be done.",

  guardrailHeading: "The guardrail is simple: predictions can increase help, never take it away.",
  guardrailItems: [
    "Never use a score to justify euthanasia.",
    "Never use a score to refuse intake.",
    "Never use a score to withhold medical or behavioral care.",
    "Never use a score to lower an animal's priority for food, housing, enrichment, or safety.",
    "Never present an uncertain prediction as a fact.",
    "Never hide stale, incomplete, or fallback data behind a “live” label.",
  ],

  contextHeading: "Built to explore how responsible prediction can support animal welfare.",
  contextBody:
    "SecondChance began as a UNC Charlotte predictive analytics project using public Austin Animal Center records. The project combines data engineering, predictive modeling, model evaluation, and product design to show how analysis can become a practical, responsible shelter workflow.",
  contextDataNote:
    "Data source: City of Austin Open Data. Current and historical feeds use different schemas because Austin moved to ShelterBuddy in May 2025. SecondChance documents that change and reports the source and freshness of every view.",
  aboutLink: "About the project and team",
} as const;

/* -------------------------------------------------------------------------- */
/* About                                                                       */
/* -------------------------------------------------------------------------- */

export const ABOUT = {
  pageTitle: "About SecondChance",
  eyebrow: "About",
  headline: "About SecondChance",
  intro:
    "SecondChance is a predictive analytics project built at UNC Charlotte to help animal shelter teams make better use of their data. We bring together public shelter records, clear visualizations, and predictive models to help staff understand adoption patterns, recognize animals that may need extra attention, and plan practical support.",

  whyHeading: "Why we chose this project",
  whyBody:
    "We chose this project because shelter data represents animals, staff decisions, and opportunities to help. We wanted to apply what we are learning in data science and analytics to a real problem: making useful patterns easier to see and turning those insights into earlier, more focused support for animals waiting for a home.",

  teamHeading: "Built by our team",
  teamBody:
    "Our team brings a shared background in data science and analytics through our work at UNC Charlotte. SecondChance brings together the areas we are studying: preparing data, building and evaluating predictive models, and communicating results in a way people can understand and use.",
  teamDescriptor: "UNC Charlotte project team",
  team: ["Davis Higgins", "Bennett Shearin", "Seth Sumter", "Hunter Pace"],

  austinHeading: "Built with Austin data. Useful beyond Austin.",
  austinBody: [
    "Austin gives us a public dataset for exploring how shelter records can support better planning. The same approach can help shelters across the United States understand waiting times, identify patterns, focus outreach, and evaluate changes to their practices. Shelter owners, staff, volunteers, rescue partners, and people interested in adoption can use the site to better understand the information behind shelter outcomes.",
    "Each shelter serves a different community, so Austin's results are a starting point rather than a prediction for every shelter. A shelter-specific version would connect that organization's intake and outcome records, track its own trends, and train or check predictions against its local data. Staff would stay in control of decisions and use the results to guide additional support.",
  ],

  approachHeading: "How another shelter could use this approach",
  approachNote:
    "A shelter-specific connection is a future adaptation. Today the site reads Austin's public feeds only; there is no sign-up and nothing to connect.",
  approachSteps: [
    { title: "Connect its records", body: "Intake and outcome events from the shelter's own system." },
    { title: "Validate and pair stays", body: "One stay per arrival, closed by the outcome that names it; ambiguous pairs set aside." },
    { title: "Review local patterns", body: "Waits, outcomes and pressure over time, with definitions attached." },
    { title: "Evaluate a local model", body: "Train or recalibrate on local data; test on a later period; check by group." },
    { title: "Plan and measure outreach", body: "Write the plan and its assumptions down, then compare what happened." },
  ],

  canHeading: "What the project can and cannot do",
  canBody:
    "SecondChance supports human judgment. It does not confirm adoption availability, diagnose an animal, or decide what care an animal should receive. Predictions are estimates, and a higher long-stay estimate should prompt more attention and support. This is a student research prototype and is not affiliated with the Austin Animal Center.",

  licenseNote:
    "The source code is published under the MIT License. Austin's datasets are public domain. The Animaster motion components adapted for this site are licensed separately and are not redistributed; see the repository's ATTRIBUTION file.",
  ctaDashboard: "Explore the dashboard",
  ctaModel: "Understand the data",
} as const;

/* -------------------------------------------------------------------------- */

export const CONTACT = {
  pageTitle: "Contact",
  eyebrow: "Contact",
  headline: "Questions? Reach out.",
  intro:
    "If you have a question about SecondChance, the data behind it, or how the approach could work for another shelter, send a note. Email is the most direct route; LinkedIn and Instagram are open too.",

  reachHeading: "Ways to reach us",
  email: "davishiggins@icloud.com",
  emailLabel: "Email",
  emailNote: "Opens your mail app with a new message.",
  socialLabel: "Social",
  socialNote: "Profiles open in a new tab.",
  linkedin: { label: "LinkedIn", href: "https://www.linkedin.com/in/davishiggins" },
  instagram: { label: "Instagram", href: "https://www.instagram.com/daviscoded" },

  formHeading: "Send a message",
  formNote:
    "Nothing is stored here. Send opens your mail app with the subject and message written exactly as you drafted them, ready to send.",
  subjectLabel: "Subject",
  subjectPlaceholder: "What is this about?",
  messageLabel: "Message",
  messagePlaceholder: "Write your message here.",
  send: "Send",
  sent: "Opened in your mail app",
  validation: "Add a subject and a message before sending.",
} as const;

/* -------------------------------------------------------------------------- */

export const STATUS = {
  liveLabel: "Live Austin feed",
  delayedLabel: "Austin feed delayed",
  unavailableLabel: "Live data unavailable",
  historicalLabel: "Historical demonstration",
  scoringLive: "Scoring live",
  scoringInProgress: "Model update in progress",
  scoringUnavailable: "Model unavailable",
  scoringInProgressBody:
    "No validated model is scoring the current feed, so predictions are not shown. Everything on this page that describes what has already happened is live and correct.",
} as const;

export const ERRORS = {
  dataUnavailableTitle: "Current shelter records are unavailable",
  dataUnavailableBody:
    "The City of Austin open data feed did not respond. Rather than show stored numbers as if they were current, this page is showing nothing. Try again shortly.",
  retry: "Try again",
  animalNotFound: "We do not have an open record for that animal.",
  animalNotFoundBody:
    "The stay may have ended since this page was linked, or the ID may be wrong. Disappearing from the feed does not tell us the animal was adopted.",
  animalClosedTitle: "This stay has ended.",
  animalClosedBody:
    "Austin recorded an outcome for this stay, so it no longer appears among open records.",
  animalInvalidTitle: "That does not look like a record ID.",
  animalInvalidBody:
    "Record links use an animal ID such as 18333, or a full stay ID from the queue or records pages.",
  fieldRequired: "This field is required",
} as const;

export const A11Y = {
  tableToggle: "View as table",
  chartToggle: "View as chart",
  skipLink: "Skip to main content",
} as const;
