/**
 * Every string in the product, verbatim from CONTENT.md. Components import from
 * here rather than writing copy inline, so the house style holds: plain words,
 * short sentences, "the model" and never "the AI", "waits longer" and never
 * "unlikely to be adopted".
 */

export const USE_POLICY_SHORT =
  "Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.";

export const USE_POLICY_FULL: readonly string[] = [
  "SecondChance predicts how long an animal is likely to wait for adoption so that staff attention, foster recruitment, photography and outreach can go to the animals who need them most.",
  "A low predicted adoption probability is a request for more help, not less. This score must never be used to justify euthanasia, to refuse an intake, to withhold medical or behavioural care, or to deprioritise any animal for any resource. Every prediction in this system exists to increase what an animal receives.",
  "If you are being asked to use this tool to reduce care for an animal, the tool is being misused. Say so.",
];

export const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/queue", label: "Queue" },
  { href: "/discover", label: "Discover" },
  { href: "/planner", label: "Planner" },
  { href: "/model", label: "Model" },
] as const;

export const SHELL = {
  wordmark: "SecondChance",
  skipLink: "Skip to main content",
  freshnessFallback: "Showing sample data",
  modelChipPrefix: "Model",
  densityComfortable: "Comfortable",
  densityCompact: "Compact",
  themeLight: "Light",
  themeDark: "Dark",
} as const;

export const FOOTER = {
  aboutHeading: "About this tool",
  aboutBody:
    "SecondChance forecasts time to adoption for animals at the Austin Animal Center. It was built as a semester project for DTSC 3601 at UNC Charlotte, on public shelter records covering October 2013 to March 2022. It is a research prototype, not a production system.",
  sourcesHeading: "Where the data comes from",
  sources: [
    {
      label: "Austin Animal Center Intakes, City of Austin Open Data Portal",
      href: "https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Intakes/wter-evkm",
    },
    {
      label: "Austin Animal Center Outcomes, City of Austin Open Data Portal",
      href: "https://data.austintexas.gov/Health-and-Community-Services/Austin-Animal-Center-Outcomes/9t4d-g238",
    },
    {
      label: "Daily weather observations, National Weather Service",
      href: "https://www.weather.gov/",
    },
    {
      label: "Current adoptable listings, RescueGroups.org",
      href: "https://rescuegroups.org/",
    },
  ],
  policyHeading: "How to use it",
  bandLine:
    "A low predicted adoption chance is a request for help, never a reason to withhold it.",
} as const;

export const DASHBOARD = {
  title: "Today at the shelter",
  heroLabel: "animals need attention this week",
  heroButton: "Open the queue",
  donutTitle: "Expected wait, whole population",
  donutBands: ["Under 7 days", "7 to 30 days", "30 to 60 days", "Over 60 days"],
  tiles: {
    census: "Animals in care",
    medianDays: "Median days to adoption",
    adoptionRate: "Adopted within 30 days",
    longStay: "Predicted long stay",
  },
  forecastTitle: "Population over the next 30 days",
  forecastSubtitleModel: "Central estimate with an 80 percent interval",
  forecastSubtitleNaive:
    "Seasonal baseline projection with an 80 percent interval. This is a seasonal average, not a trained forecasting model.",
  forecastCapacityLine: "Typical operating capacity",
  segmentsTitle: "Where the wait is longest",
  segmentsSubtitle: "Median predicted days to adoption by life stage",
  healthTitle: "Model health",
  healthRows: {
    discrimination: "Discrimination",
    calibration: "Calibration error",
    drift: "Input drift",
    retrained: "Last retrained",
  },
  deltaVs30: "vs 30 days ago",
  deltaVsYear: "vs this month last year",
} as const;

export const QUEUE = {
  title: "Needs attention",
  filterSpecies: ["All animals", "Dogs", "Cats"],
  filterSort: ["Sort by risk", "Sort by days waiting", "Sort by arrival date"],
  searchPlaceholder: "Search by name or ID",
  unnamed: "Unnamed",
  daysLabel: "days",
  probabilityLabel: "chance of adoption in 30 days",
  expand: "Why this animal",
  collapse: "Hide",
  markActioned: "Mark as handled",
  undoButton: "Undo",
  detailLink: "Full profile",
  emptyNoFilter:
    "No animals are currently above the risk threshold. That is good news.",
  emptyFiltered: "No animals match these filters.",
  clearFilters: "Clear filters",
  headingDrivers: "What is driving this",
  headingHelp: "What would help",
  headingWait: "Predicted wait",
} as const;

export const DETAIL = {
  backLink: "Back to the queue",
  predictionTitle: "Predicted wait",
  intervalNote: "Range shows the 95 percent interval",
  lowConfidenceCaveat:
    "This animal is unlike most of what the model was trained on, so treat this number as a rough guide and lean on staff judgement.",
  curveTitle: "Chance of going home, over time",
  curveNote:
    "The remaining share leave by another route, such as transfer to a rescue partner or return to an owner.",
  driversTitle: "Why this prediction",
  interventionsTitle: "What would help",
  evidenceMeasured: "Measured in this dataset",
  evidenceAssumed: "Assumption, not measured here",
  timelineTitle: "History",
  similarTitle: "Animals like this one, and what happened",
} as const;

export const DISCOVER = {
  title: "Meet the ones who have been waiting",
  subtitle:
    "These animals have been at the shelter longest. Every one of them is ready to go home today.",
  sortDefaultLabel: "Longest waiting first",
  empty:
    "No animals match what you are looking for right now. Try widening the filters.",
} as const;

export const PLANNER = {
  title: "This week's outreach plan",
  subtitle:
    "Turn the queue into a list of jobs your team can actually finish.",
  capacityLabel: "How many animals can your team feature this week?",
  channelHeading: "Which channels are available?",
  generateButton: "Build the plan",
  expectedHeading: "What this buys you",
  assumptionLine:
    "The effect of the intervention itself is an assumption, not a measurement. Adjust it below to see how the plan changes.",
  exportCsv: "Download as CSV",
  print: "Printable version",
} as const;

export const MODEL = {
  title: "How this model works, and where it does not",
  section1Heading: "What it does",
  section1Body:
    "SecondChance estimates four things for every animal at intake: the chance of being adopted within 7, 14 and 30 days, and the chance of still being in the shelter after 60 days. It also produces a full curve of adoption chance over time, and an expected number of days in care.",
  section2Heading: "How well it works",
  section2Body:
    "The numbers below come from a held-out test block: animals who arrived between January 2020 and January 2022, none of whom the model saw during training. The model was trained on arrivals through December 2018 and calibrated on 2019. Testing across that gap is deliberate. A model evaluated only on data from its own era tells you nothing about what happens when the world moves.",
  section3Heading: "Who it works for",
  section3Body: [
    "A model that works well on average can still work badly for a particular group of animals, and that is exactly the failure that matters here. The table below breaks performance down by species, life stage, intake condition, and by two breed labels that carry real consequences in the housing market.",
    "Two results are worth naming directly. The model is less accurate for bully-type breeds than for other dogs, and it slightly under-predicts their adoption chances, which means the queue puts them higher than their actual outcomes justify. Since the queue routes help toward animals, erring in that direction is the safer of the two errors, but it is still an error and it is reported rather than hidden.",
    "The second result is a negative one. Black coat colour is widely believed in shelter work to slow adoption. In this dataset it does not. Animals with black in their coat were adopted at a very slightly higher rate than animals without it, and the model's accuracy is essentially the same for both. We report this because a tool that quietly encoded the folk belief would have made it true.",
  ],
  section4Heading: "What it keys on",
  section4Body:
    "Age at intake is by far the strongest signal, and its shape is not a straight line. Intake condition and intake type come next. Breed structure matters much more for predicting a long stay than for predicting a fast adoption, which is an intuitive result once you see it: breed does not stop an animal being adopted quickly, but it does predict who is still there in two months.",
  section5Heading: "When it stops working",
  section5Body: [
    "In March 2020 the Austin shelter changed how it operated. Intake volume fell, the population in care fell, and foster placement rose sharply. The model, which had been trained on 2018 data, kept ranking animals about as well as before: its ability to tell a fast adoption from a slow one barely moved. What broke was calibration. In July 2020 the model was predicting a 30-day adoption rate 12 percentage points above what actually happened.",
    "That is the failure mode worth understanding. A model can keep its ranking and lose its meaning, and a dashboard that shows probabilities will keep showing confident, wrong numbers the whole time. Monitoring only the ranking metric would have missed it.",
  ],
  section6Heading: "What it must not be used for",
} as const;

export const ERRORS = {
  networkFailure:
    "We could not reach the prediction service. Showing sample data instead.",
  retry: "Try again",
  animalNotFound: "We do not have a record for that animal.",
  queueUnavailable:
    "The queue is being rebuilt. Showing the last version we have.",
  fieldRequired: "This field is required",
  ageOutOfRange: "Enter an age between 0 and 12,000 days",
} as const;

export const A11Y = {
  tableToggle: "View as table",
  chartToggle: "View as chart",
  skipLink: "Skip to main content",
} as const;
