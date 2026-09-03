/**
 * Every string in the product.
 *
 * Components import from here rather than writing copy inline, so the house
 * style holds: plain words, short sentences, "the model" and never "the AI",
 * "waits longer" and never "unlikely to be adopted".
 *
 * A second rule now sits alongside the first, and it is the reason much of
 * this file was rewritten. Nothing here may describe inferred data as
 * confirmed, or an intake record as proof of adoptability. Austin publishes
 * intake and outcome events. It does not publish a list of animals available
 * for adoption, so this product cannot say one exists.
 */

export const USE_POLICY_SHORT =
  "Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.";

export const USE_POLICY_FULL: readonly string[] = [
  "SecondChance estimates how long an animal is likely to wait so that staff attention, foster recruitment, photography and outreach can go to the animals who need them most.",
  "A high predicted long-stay risk is a request for more help, not less. This score must never be used to justify euthanasia, to refuse an intake, to withhold medical or behavioural care, or to deprioritise any animal for any resource. Every prediction in this system exists to increase what an animal receives.",
  "If you are being asked to use this tool to reduce care for an animal, the tool is being misused. Say so.",
];

export const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/queue", label: "Queue" },
  { href: "/discover", label: "Discover" },
  { href: "/impact", label: "Impact" },
  { href: "/planner", label: "Planner" },
  { href: "/model", label: "Model" },
] as const;

export const SHELL = {
  wordmark: "SecondChance",
  skipLink: "Skip to main content",
  modelChipPrefix: "Model",
  modelChipUnavailable: "Model updating",
  dataDetails: "Data details",
  dataDetailsClose: "Close",
  densityComfortable: "Comfortable",
  densityCompact: "Compact",
  themeLight: "Light",
  themeDark: "Dark",
} as const;

/** The four City of Austin datasets, labelled by role. The two archives stop
 *  at the May 2025 ShelterBuddy cutover; the two current feeds start there. */
export const FOOTER = {
  aboutHeading: "About this tool",
  aboutBody:
    "SecondChance reads the City of Austin's public shelter records and estimates how long animals may wait, so teams can direct attention earlier. It began as a predictive analytics project at UNC Charlotte. It is a research prototype, not a production system, and it is not affiliated with the Austin Animal Center.",
  sourcesHeading: "Where the data comes from",
  sourcesNote:
    "Austin moved to the ShelterBuddy system on 5 May 2025. The two current feeds refresh hourly. The two archives are frozen at the cutover and use a different schema and a different animal ID format, so they cannot be joined to the current feeds.",
  policyHeading: "How to use it",
  bandLine:
    "A high predicted long-stay risk is a request for help, never a reason to withhold it.",
} as const;

export const DASHBOARD = {
  title: "Austin shelter activity",
  eyebrow: "Live from the City of Austin open data portal",
  heroHeadline: "Earlier attention. Shorter waits. More animals home.",
  heroBody:
    "SecondChance helps shelter teams see which animals may need extra support, then turns that insight into a practical outreach plan.",
  heroPrimary: "Open the queue",
  heroSecondary: "See how it helps",
  openStaysLabel: "open shelter stays",
  openStaysNote:
    "Cat and dog stays inferred from the public intake and outcome feeds. This is not a roster of animals available for adoption.",
  needsAttentionTitle: "Needs attention now",
  needsAttentionSubtitle: "The current validated model estimates these may be at greater risk of a long stay.",
  needsAttentionUnavailable:
    "The top-five preview appears when a validated model is scoring the current feed.",
  tiles: {
    census: "Open shelter stays",
    medianDays: "Median days to adoption",
    adoptionRate: "Adopted within 30 days",
    longStay: "Stays longer than 60 days",
  },
  trendTitle: "Intakes and adoptions by month",
  trendSubtitle: "Cats and dogs, from the current ShelterBuddy feeds",
  outcomesTitle: "How stays end",
  outcomesSubtitle: "Completed cat and dog stays in the last twelve months",
  segmentsTitle: "Where the wait is longest",
  segmentsSubtitle: "Observed median days to adoption by life stage",
  healthTitle: "Model health",
  dataDetailsCta: "What these numbers count",
} as const;

export const QUEUE = {
  title: "Needs attention",
  subtitleScored:
    "Open shelter stays ranked by the current validated model's estimate of long-stay risk. Work from the top.",
  subtitleDescriptive:
    "Open shelter stays ordered by how long each animal has been waiting. This is a descriptive ordering, not a model prediction.",
  filterSpecies: ["All animals", "Dogs", "Cats"],
  filterSort: ["Sort by risk", "Sort by days waiting", "Sort by arrival date"],
  filterLifeStage: ["All ages", "Juvenile", "Adult", "Senior"],
  filterRisk: ["Any risk", "Warning and above", "Serious and above", "Critical only"],
  filterQuality: ["All records", "Hide possibly stale"],
  searchPlaceholder: "Search by name or animal ID",
  viewTable: "Table",
  viewCards: "Cards",
  unnamed: "Unnamed",
  daysLabel: "days",
  probabilityLabel: "estimated chance of a stay past 60 days",
  expand: "Why this animal",
  collapse: "Hide",
  markActioned: "Mark as handled",
  undoButton: "Undo",
  detailLink: "Full profile",
  emptyNoFilter: "No open stays are currently above the risk threshold. That is good news.",
  emptyFiltered: "No animals match these filters.",
  clearFilters: "Clear filters",
  headingDrivers: "What is driving this",
  headingHelp: "What would help",
  headingWait: "Estimated risk",
  predictionUnavailable: "Prediction unavailable",
  staleBadge: "Possibly stale record",
  staleExplain:
    "This stay has been open for more than a year. It may be a genuine long stay, or a record Austin has not closed.",
} as const;

export const DETAIL = {
  backLink: "Back to the queue",
  predictionTitle: "Estimated risk",
  intervalNote: "Estimates are calibrated on a held-out validation block",
  lowConfidenceCaveat:
    "This animal is unlike most of what the model was trained on, so treat this number as a rough guide and lean on staff judgement.",
  driversTitle: "What the model weighs most",
  driversNote:
    "These are the features the model relies on across the whole population, not a per-animal attribution.",
  interventionsTitle: "What would help",
  evidenceMeasured: "Measured in this dataset",
  evidenceAssumed: "Assumption, not measured here",
  timelineTitle: "This stay",
  factsTitle: "Record",
  noPredictionTitle: "No prediction for this animal",
} as const;

export const DISCOVER = {
  title: "Current shelter records",
  subtitle: "Explore current records and learn where additional attention may help.",
  accuracyNote:
    "These are animals with an open intake record in Austin's public feed, longest wait first. A public intake record is not the same as an adoption listing: it does not confirm that an animal is available, and some records may not have been closed. Contact the Austin Animal Center to ask about a specific animal.",
  sortDefaultLabel: "Longest waiting first",
  photoNote: "Austin's public feeds carry no photographs, so each record shows a branded placeholder.",
  empty: "No records match what you are looking for right now. Try widening the filters.",
  waitingFor: "Waiting",
  noName: "Waiting for a name",
} as const;

export const PLANNER = {
  title: "This week's outreach plan",
  subtitle: "Turn the queue into a list of jobs your team can actually finish.",
  capacityLabel: "How many animals can your team feature this week?",
  channelHeading: "Which channels are available?",
  generateButton: "Build the plan",
  expectedHeading: "What this buys you",
  workloadHeading: "Workload",
  assumptionLine:
    "The effect of an intervention is an assumption, not a measurement. Channels are labelled where their effect was measured in the Austin data and where it was not.",
  descriptiveNotice:
    "No validated model is scoring right now, so this plan is built from the longest current waits rather than predicted risk.",
  exportCsv: "Download as CSV",
  print: "Printable version",
  measuredLabel: "Measured",
  assumedLabel: "Assumed",
} as const;

export const MODEL = {
  title: "How this model works, and where it does not",
  toggleSimple: "Simple explanation",
  toggleTechnical: "Technical details",

  simpleWhatHeading: "What it predicts",
  simpleWhatBody:
    "For every cat and dog currently in the shelter, the model estimates two things: the chance the animal is still there after 60 days, and the chance it is adopted within 30. Nothing else. It does not decide anything, and it does not rank animals by how much they deserve care.",
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

  subgroupHeading: "Who it works for",
  subgroupBody:
    "A model that works well on average can still work badly for a particular group of animals, and that is exactly the failure that matters here. Performance is reported by species, life stage, intake condition, breed structure and coat colour rather than summarised away.",

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
  animalNotFound: "We do not have a current record for that animal.",
  animalNotFoundBody:
    "The animal may have left the shelter since this page was linked, or the record may have been closed.",
  fieldRequired: "This field is required",
} as const;

export const A11Y = {
  tableToggle: "View as table",
  chartToggle: "View as chart",
  skipLink: "Skip to main content",
} as const;
