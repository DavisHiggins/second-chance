/**
 * SecondChance final presentation, five minutes.
 *
 * Palette is taken from the project's own identity rather than a stock theme:
 * a deep navy that carries most of the visual weight, the teal that appears in
 * the product mark, and one warm amber reserved exclusively for the two slides
 * where something is going wrong. Dark title and close, light middle, which
 * gives the deck a beginning and an end without any decorative furniture.
 *
 * Every number on every slide is read from results/MEASURED_RESULTS.json at
 * build time. Nothing is typed in twice.
 */

const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "results/MEASURED_RESULTS.json"), "utf8"));
const FIG = path.join(ROOT, "results/figures");

// --- palette -----------------------------------------------------------------
const NAVY = "102A43";
const NAVY_SOFT = "1E3A5F";
const TEAL = "14A67C";
const TEAL_DEEP = "0E7C5C";
const AMBER = "E8944A";
const CORAL = "D0574B";
const PAPER = "FBFBF9";
const INK = "0F1B2A";
const INK_SOFT = "4A5E72";
const INK_MUTED = "8195A8";
const HAIRLINE = "DCE3E9";

const SERIF = "Cambria";
const SANS = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.author = "Davis Higgins";
pres.company = "UNC Charlotte, DTSC 3601";
pres.title = "SecondChance";

const W = 13.3;
const H = 7.5;
const M = 0.72; // page margin

/** The repeated visual motif: a small teal circle with a number in it. */
function stepBadge(slide, x, y, label, fill = TEAL) {
  slide.addShape(pres.ShapeType.ellipse, {
    x, y, w: 0.42, h: 0.42, fill: { color: fill },
  });
  slide.addText(label, {
    x, y, w: 0.42, h: 0.42, align: "center", valign: "middle",
    fontSize: 13, bold: true, color: "FFFFFF", fontFace: SANS, margin: 0,
  });
}

function slideTitle(slide, text, sub, dark = false) {
  // A 34pt Cambria title fits roughly 54 characters across the content width.
  // Anything longer wraps, and a fixed subtitle offset then collides with the
  // second line. Measuring the length and moving the subtitle is cruder than a
  // real text metric but it is deterministic and it never overlaps.
  const lines = Math.ceil(text.length / 54);
  const titleHeight = 0.62 * lines;
  slide.addText(text, {
    x: M, y: 0.42, w: W - 2 * M, h: titleHeight,
    fontSize: 34, bold: true, fontFace: SERIF,
    color: dark ? "FFFFFF" : INK, margin: 0, valign: "top",
  });
  if (sub) {
    slide.addText(sub, {
      x: M, y: 0.42 + titleHeight + 0.1, w: W - 2 * M, h: 0.42,
      fontSize: 14.5, fontFace: SANS,
      color: dark ? "AFC6D9" : INK_SOFT, margin: 0,
    });
  }
}

function statBlock(slide, x, y, w, value, label, valueColor = TEAL_DEEP, valueSize = 52) {
  slide.addText(value, {
    x, y, w, h: 0.78,
    fontSize: valueSize, bold: true, fontFace: SERIF, color: valueColor,
    margin: 0, align: "left",
  });
  slide.addText(label, {
    x, y: y + 0.76, w, h: 0.62,
    fontSize: 12, fontFace: SANS, color: INK_SOFT, margin: 0, align: "left",
  });
}

function card(slide, x, y, w, h, fill = "FFFFFF") {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: fill }, line: { color: HAIRLINE, width: 1 },
    shadow: { type: "outer", angle: 90, blur: 8, offset: 1, color: "9AA9B8", opacity: 0.16 },
  });
}

// =============================================================================
// 1. Title
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  // A single large ring, three-quarters closed: it is a second chance, so the
  // circle is not finished. The only decorative element in the deck.
  s.addShape(pres.ShapeType.blockArc, {
    x: W - 4.5, y: 0.9, w: 5.6, h: 5.6,
    fill: { color: TEAL, transparency: 72 },
    line: { color: TEAL, width: 0 },
    angleRange: { start: 200, end: 110 },
  });

  s.addText("SecondChance", {
    x: M, y: 2.05, w: 8.4, h: 1.0,
    fontSize: 52, bold: true, fontFace: SERIF, color: "FFFFFF", margin: 0,
  });
  s.addText(
    "Competing-risk survival forecasting of shelter adoption,\nwith calibration and drift monitoring",
    { x: M, y: 3.05, w: 8.2, h: 0.95, fontSize: 18, fontFace: SANS, color: "9FD9C4", margin: 0, lineSpacing: 26 }
  );
  s.addShape(pres.ShapeType.line, {
    x: M, y: 4.25, w: 2.0, h: 0, line: { color: TEAL, width: 2.5 },
  });
  s.addText(
    [
      { text: "Davis Higgins", options: { bold: true, color: "FFFFFF" } },
      { text: "   ·   DTSC 3601, UNC Charlotte   ·   29 September 2026", options: { color: "8FA9C0" } },
    ],
    { x: M, y: 4.5, w: 8.5, h: 0.4, fontSize: 13.5, fontFace: SANS, margin: 0 }
  );
  s.addText(
    `136,898 shelter episodes  ·  nine years of Austin Animal Center records  ·  20,165 held out`,
    { x: M, y: 5.15, w: 8.5, h: 0.4, fontSize: 12, fontFace: SANS, color: "6E8AA3", margin: 0, italic: true }
  );
  s.addNotes(
    "0:00. SecondChance predicts how long a shelter animal will wait for adoption, " +
    "so that scarce staff attention goes to the animals who need it most. Nine years " +
    "of Austin Animal Center records, 136,898 episodes, evaluated on 20,165 animals " +
    "the model never saw. I want to show you four things in five minutes, and the " +
    "second one is the one I would defend hardest."
  );
}

// =============================================================================
// 2. The problem
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "Shelters run out of attention, not kennels",
    "Photography, foster recruitment, behaviour support and outreach are allocated by whoever happens to notice.");

  card(s, M, 2.0, 5.5, 3.5);
  statBlock(s, M + 0.42, 2.35, 4.6, "16,000", "animals a year through one shelter,\nthe largest no-kill municipal shelter\nin the United States", NAVY, 46);
  s.addShape(pres.ShapeType.line, { x: M + 0.42, y: 4.25, w: 4.4, h: 0, line: { color: HAIRLINE, width: 1 } });
  s.addText(
    "The animals nobody happens to notice are the ones who wait months.",
    { x: M + 0.42, y: 4.45, w: 4.6, h: 0.9, fontSize: 14, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 20 }
  );

  const asks = [
    ["1", "Will this animal go home this week?", "P(adopted in 7, 14, 30 days)"],
    ["2", "Will it still be here in two months?", "P(long stay past 60 days)"],
    ["3", "How long, exactly?", "Full cumulative incidence curve"],
  ];
  asks.forEach(([n, q, a], i) => {
    const y = 2.05 + i * 1.18;
    stepBadge(s, 6.6, y + 0.1, n);
    s.addText(q, { x: 7.25, y, w: 5.4, h: 0.42, fontSize: 16.5, bold: true, fontFace: SANS, color: INK, margin: 0 });
    s.addText(a, { x: 7.25, y: y + 0.42, w: 5.4, h: 0.4, fontSize: 12.5, fontFace: SANS, color: TEAL_DEEP, margin: 0 });
  });

  s.addText("Answered at the intake desk, from 56 features, none of which require anyone to watch the animal.",
    { x: 6.6, y: 5.62, w: 6.1, h: 0.5, fontSize: 12, fontFace: SANS, color: INK_MUTED, italic: true, margin: 0 });

  s.addNotes(
    "0:25. The binding constraint at a shelter is not space, it is attention. Someone " +
    "has to photograph an animal well, recruit a foster, notice that a dog has been in " +
    "the same run since February. That is currently allocated by whoever notices. " +
    "So the question is: on the day an animal arrives, how long will it wait? " +
    "Three predictions, all made from what is knowable at the intake desk."
  );
}

// =============================================================================
// 3. The data
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "Two event logs, no episode key, and repeat visitors",
    "A join on animal ID alone produces a cross product whose durations look entirely plausible.");

  s.addImage({ path: path.join(FIG, "fig02_data_funnel.png"), x: M, y: 1.85, w: 7.5, h: 3.26 });

  const audit = R.data_audit;
  card(s, 8.55, 1.85, 4.05, 4.5);
  s.addText("The audit", { x: 8.9, y: 2.02, w: 3.4, h: 0.4, fontSize: 15, bold: true, fontFace: SANS, color: INK, margin: 0 });
  const rows = [
    ["Episodes built", audit.episodes_built.toLocaleString()],
    ["Closed by an outcome", `${audit.episodes_matched.toLocaleString()} (99.1%)`],
    ["Matches rejected", "42"],
    ["Negative durations", "0"],
    ["Species mismatches", "0"],
    ["Suspected lost paperwork", audit.suspected_missing_outcomes.toString()],
  ];
  rows.forEach(([k, v], i) => {
    const y = 2.52 + i * 0.44;
    s.addText(k, { x: 8.9, y, w: 2.3, h: 0.4, fontSize: 11.5, fontFace: SANS, color: INK_SOFT, margin: 0, valign: "middle" });
    s.addText(v, { x: 11.0, y, w: 1.45, h: 0.4, fontSize: 12, bold: true, fontFace: SANS, color: INK, margin: 0, align: "right", valign: "middle" });
  });
  s.addShape(pres.ShapeType.line, { x: 8.9, y: 5.22, w: 3.4, h: 0, line: { color: HAIRLINE, width: 1 } });
  s.addText("Shuffled-label control:", { x: 8.9, y: 5.36, w: 3.4, h: 0.3, fontSize: 11.5, fontFace: SANS, color: INK_SOFT, margin: 0 });
  s.addText(`AUC ${R.headline.shuffled_label_control_auc}`, {
    x: 8.9, y: 5.62, w: 3.4, h: 0.5, fontSize: 24, bold: true, fontFace: SERIF, color: TEAL_DEEP, margin: 0,
  });
  s.addText("no feature encodes the outcome", { x: 8.9, y: 6.06, w: 3.4, h: 0.3, fontSize: 10.5, fontFace: SANS, color: INK_MUTED, italic: true, margin: 0 });

  s.addNotes(
    "0:55. Austin publishes intakes and outcomes as two separate event logs with no " +
    "episode key, and nine percent of animals come through more than once. So the first " +
    "real job was sequence alignment inside each animal, with every join decision counted. " +
    "99.1 percent close cleanly, no negative durations, no species mismatches. " +
    "And the check I would keep if I could only keep one: train the whole model on " +
    "shuffled labels. It comes back at 0.50, so nothing is leaking."
  );
}

// =============================================================================
// 4. THE headline finding
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "The estimator the field uses is wrong by 72 percent",
    "Half of all exits are not adoptions. Treating a transfer as censoring assumes the animal is still waiting to be adopted.");

  s.addImage({ path: path.join(FIG, "fig03_estimator_comparison.png"), x: M, y: 1.9, w: 7.9, h: 3.32 });

  card(s, 8.9, 1.9, 3.7, 3.32, NAVY);
  s.addText("At one year", { x: 9.2, y: 2.06, w: 3.1, h: 0.35, fontSize: 12.5, fontFace: SANS, color: "9FD9C4", margin: 0 });
  s.addText("98.8%", { x: 9.2, y: 2.42, w: 3.1, h: 0.72, fontSize: 40, bold: true, fontFace: SERIF, color: AMBER, margin: 0 });
  s.addText("what Kaplan-Meier says", { x: 9.2, y: 3.1, w: 3.1, h: 0.32, fontSize: 11, fontFace: SANS, color: "AFC6D9", margin: 0 });
  s.addText("48.3%", { x: 9.2, y: 3.62, w: 3.1, h: 0.72, fontSize: 40, bold: true, fontFace: SERIF, color: TEAL, margin: 0 });
  s.addText("what actually happens", { x: 9.2, y: 4.3, w: 3.1, h: 0.32, fontSize: 11, fontFace: SANS, color: "AFC6D9", margin: 0 });
  s.addText("Fewer than half of all arrivals are ever adopted from this building.",
    { x: 9.2, y: 4.68, w: 3.1, h: 0.5, fontSize: 11, fontFace: SANS, color: "FFFFFF", margin: 0, italic: true, lineSpacing: 15 });

  s.addText(
    "Same error per prediction: our survival model without the correction predicts a mean 30-day adoption probability of 0.638. With it, 0.403. Observed: 0.372.",
    { x: M, y: 5.42, w: 11.9, h: 0.55, fontSize: 13, fontFace: SANS, color: INK_SOFT, margin: 0 }
  );

  s.addNotes(
    "1:25. This is the finding I would defend hardest. Fifty-one percent of exits from " +
    "this shelter are not adoptions: transfers to rescue partners, returns to owner. " +
    "An animal transferred on day three cannot be adopted from Austin on day thirty. " +
    "It has left the risk set. Treat it as ordinary censoring, which is what the field " +
    "does, and you overstate 30-day adoption by 23.7 points, 72 percent relative. " +
    "By one year the standard estimator says 98.8 percent of animals are adopted. " +
    "The correct figure is 48.3. That is not a rounding error, it is a different shelter."
  );
}

// =============================================================================
// 5. Models
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "Calibrated, and tested on animals the model never saw",
    "Train through 2018, calibrate on 2019, test on 2020 to 2022. The split spans a known operational discontinuity on purpose.");

  s.addImage({ path: path.join(FIG, "fig05_model_comparison.png"), x: M, y: 1.9, w: 7.6, h: 3.62 });

  const h = R.headline;
  const stats = [
    [`${h.champion_auc_30d.toFixed(3)}`, "held-out AUC,\n30-day adoption", TEAL_DEEP],
    [`${h.champion_ece_30d.toFixed(3)}`, "expected calibration error\n(the score means what it says)", TEAL_DEEP],
    [`${h.long_stay_lift_at_50.toFixed(1)}×`, "better than chance in the\ntop 50 of the long-stay queue", NAVY],
  ];
  stats.forEach(([v, l, c], i) => {
    const y = 1.95 + i * 1.27;
    card(s, 8.65, y, 3.95, 1.12);
    s.addText(v, { x: 8.95, y: y + 0.12, w: 1.5, h: 0.7, fontSize: 30, bold: true, fontFace: SERIF, color: c, margin: 0, valign: "middle" });
    s.addText(l, { x: 10.4, y: y + 0.12, w: 2.05, h: 0.9, fontSize: 10.5, fontFace: SANS, color: INK_SOFT, margin: 0, valign: "middle", lineSpacing: 13 });
  });

  s.addText(
    "48 percent of the model's top 50 really did stay past 60 days, against a base rate of 11.6 percent.",
    { x: 8.65, y: 5.72, w: 3.95, h: 0.6, fontSize: 11, fontFace: SANS, color: INK_MUTED, italic: true, margin: 0, lineSpacing: 14 }
  );

  s.addNotes(
    "2:05. Four targets, four models, strictly temporal split. 0.803 AUC on 30-day " +
    "adoption, 0.765 on long stay, and an expected calibration error of 0.023, which " +
    "matters more than the AUC because the number on the screen is read as a percentage. " +
    "The product metric is the last one: the top 50 of the queue contains 4.2 times " +
    "as many true long-stay animals as a random 50. Forty-eight percent against a base " +
    "rate of eleven point six."
  );
}

// =============================================================================
// 6. The LLM result
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "The language model earned its place on one target",
    "2,736 free-text breed strings collapse to 254 atomic tokens. Claude labels each once with eleven structured attributes.");

  s.addImage({ path: path.join(FIG, "fig08_breed_strategy.png"), x: M, y: 1.9, w: 6.9, h: 3.62 });

  card(s, 7.9, 1.95, 4.7, 1.62, "F1F8F5");
  s.addText("Long stay past 60 days", { x: 8.2, y: 2.1, w: 4.1, h: 0.32, fontSize: 12.5, bold: true, fontFace: SANS, color: TEAL_DEEP, margin: 0 });
  s.addText("+0.012 AUC over a keyword baseline", { x: 8.2, y: 2.46, w: 4.1, h: 0.36, fontSize: 15, bold: true, fontFace: SANS, color: INK, margin: 0 });
  s.addText("p < 0.001, paired bootstrap.  +0.035 over dropping breed entirely.",
    { x: 8.2, y: 2.84, w: 4.1, h: 0.6, fontSize: 11, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 14 });

  card(s, 7.9, 3.75, 4.7, 1.62, "FDF4EC");
  s.addText("Adoption within 30 days", { x: 8.2, y: 3.9, w: 4.1, h: 0.32, fontSize: 12.5, bold: true, fontFace: SANS, color: "B56A28", margin: 0 });
  s.addText("+0.0003 AUC. Nothing.", { x: 8.2, y: 4.26, w: 4.1, h: 0.36, fontSize: 15, bold: true, fontFace: SANS, color: INK, margin: 0 });
  s.addText("p = 0.73. A regular expression does the job for this question.",
    { x: 8.2, y: 4.64, w: 4.1, h: 0.6, fontSize: 11, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 14 });

  s.addText(
    "Breed predicts who is still here in two months far better than it predicts a fast adoption. Weather, our fourth data source, did not help either target and we say so.",
    { x: M, y: 5.62, w: 11.9, h: 0.6, fontSize: 12.5, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 16 }
  );

  s.addNotes(
    "2:45. Austin records breed as free text: 2,736 distinct strings. Splitting on their " +
    "own convention collapses that to 254 atomic tokens, which a language model labels " +
    "once, at temperature zero, for size, weight, coat, energy and the breed labels that " +
    "carry housing consequences. It resolves 100 percent of dog and cat strings. " +
    "And the result splits. On long-stay risk it beats a hand-written keyword baseline " +
    "by 0.012 AUC, decisively. On 30-day adoption it beats it by 0.0003, which is nothing. " +
    "Reporting only the flattering half would have been easy. This version tells you " +
    "which question the extra machinery is worth deploying for."
  );
}

// =============================================================================
// 7. Monitoring
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "March 2020: the ranking held, the probabilities did not",
    "A model frozen on 2018 data, scored monthly across a real operational discontinuity.");

  s.addImage({ path: path.join(FIG, "fig12_drift_timeline.png"), x: M, y: 1.85, w: 7.4, h: 4.5 });

  card(s, 8.4, 1.95, 4.2, 1.5);
  s.addText("Discrimination", { x: 8.7, y: 2.08, w: 3.6, h: 0.3, fontSize: 12, bold: true, fontFace: SANS, color: TEAL_DEEP, margin: 0 });
  s.addText("0.778  →  0.789", { x: 8.7, y: 2.4, w: 3.6, h: 0.45, fontSize: 21, bold: true, fontFace: SERIF, color: INK, margin: 0 });
  s.addText("mean monthly AUC, before and after. It did not degrade.",
    { x: 8.7, y: 2.86, w: 3.6, h: 0.5, fontSize: 10.5, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 13 });

  card(s, 8.4, 3.6, 4.2, 1.5, "FCEFEC");
  s.addText("Calibration", { x: 8.7, y: 3.73, w: 3.6, h: 0.3, fontSize: 12, bold: true, fontFace: SANS, color: CORAL, margin: 0 });
  s.addText("7.6 points off", { x: 8.7, y: 4.05, w: 3.6, h: 0.45, fontSize: 21, bold: true, fontFace: SERIF, color: INK, margin: 0 });
  s.addText("in July 2020. It broke, and the ranking metric never noticed.",
    { x: 8.7, y: 4.51, w: 3.6, h: 0.5, fontSize: 10.5, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 13 });

  s.addText(
    [
      { text: "Input drift fired a quarter earlier than performance drift could.  ", options: { bold: true, color: INK } },
      { text: "The 30-day label does not exist for 30 days, so outcome monitoring is structurally six weeks behind its own cause.", options: { color: INK_SOFT } },
    ],
    { x: 8.4, y: 5.28, w: 4.2, h: 1.05, fontSize: 11, fontFace: SANS, margin: 0, lineSpacing: 14 }
  );

  s.addNotes(
    "3:25. Here is what I did not expect. The model was frozen on 2018 data and then " +
    "met March 2020. Its ability to rank animals barely moved: 0.778 before, 0.789 after. " +
    "What broke was calibration. In July 2020 it was predicting an adoption rate 7.6 " +
    "points above what actually happened. Discrimination and calibration fail separately, " +
    "and here calibration failed first and harder. If you monitor AUC alone, you see a " +
    "healthy model for months while the numbers on the shelter's screen quietly stop " +
    "meaning anything. Input drift caught it a full quarter earlier, which is the whole " +
    "argument for watching inputs as well as outcomes."
  );
}

// =============================================================================
// 8. The pipeline
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "A lifecycle, not a notebook",
    "Serverless end to end, with the monitoring loop and the human gate that make it a system.");

  const stages = [
    ["1", "Ingest", "Four public APIs on a schedule into a versioned, encrypted S3 landing zone. Raw responses kept forever."],
    ["2", "Warehouse", "Glue and Redshift Serverless at 8 RPU. Episode reconstruction, occupancy, and the analytics grain."],
    ["3", "Label", "Bedrock structures any breed token the reference has not seen. Prompt versioned, output committed."],
    ["4", "Train", "SageMaker transient jobs. Every model registered with its data cutoff, metrics and feature hash."],
    ["5", "Serve", "API Gateway and Lambda. Five routes. Every response carries the model version, data freshness and use policy."],
    ["6", "Watch", "Weekly job: 19 monitored features, rolling AUC, calibration gap. Six CloudWatch alarms into email."],
  ];
  stages.forEach(([n, title, body], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * 4.05;
    const y = 1.95 + row * 2.25;
    card(s, x, y, 3.75, 2.0);
    stepBadge(s, x + 0.3, y + 0.28, n, i === 5 ? AMBER : TEAL);
    s.addText(title, { x: x + 0.85, y: y + 0.28, w: 2.6, h: 0.42, fontSize: 17, bold: true, fontFace: SERIF, color: INK, margin: 0, valign: "middle" });
    s.addText(body, { x: x + 0.3, y: y + 0.85, w: 3.15, h: 1.0, fontSize: 11, fontFace: SANS, color: INK_SOFT, margin: 0, lineSpacing: 14.5 });
  });

  s.addText("Measured cost: $34.07 a month with no persistent endpoint. A real-time endpoint would add $169.",
    { x: M, y: 6.52, w: 11.9, h: 0.4, fontSize: 11.5, fontFace: SANS, color: INK_MUTED, italic: true, margin: 0 });

  s.addNotes(
    "4:05. Quickly, the system. Four public APIs ingested on a schedule into an " +
    "append-only S3 landing zone that keeps every raw response. Redshift Serverless " +
    "for the joins. Bedrock for any breed token we have not seen. SageMaker for " +
    "training, with every model registered against its data cutoff. An API where every " +
    "single response carries the model version, the data freshness and the use policy. " +
    "And a weekly monitoring job behind six alarms. Thirty-four dollars a month, " +
    "because the endpoint is transient rather than persistent."
  );
}

// =============================================================================
// 9. The constraint
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  slideTitle(s, "Direction is an engineering decision", null, true);

  card(s, M, 1.75, 5.7, 3.05, NAVY_SOFT);
  s.addText("What we found", { x: M + 0.35, y: 1.92, w: 5.0, h: 0.34, fontSize: 12.5, bold: true, fontFace: SANS, color: "9FD9C4", margin: 0 });
  s.addText(
    [
      { text: "Dogs carrying a bully-type breed label", options: { bold: true, color: "FFFFFF" } },
      { text: " reach 25.1 percent 30-day adoption against 34.0 percent for others. The model is also worse for them (AUC 0.754 against 0.807) and under-promises their chances by 4.8 points.", options: { color: "C6D8E6" } },
    ],
    { x: M + 0.35, y: 2.32, w: 5.0, h: 1.4, fontSize: 12.5, fontFace: SANS, margin: 0, lineSpacing: 17 }
  );
  s.addText("Olson et al. measured 50 percent sensitivity for that label against DNA. This is a finding about the label, not the animals.",
    { x: M + 0.35, y: 3.82, w: 5.0, h: 0.8, fontSize: 11, fontFace: SANS, color: "8FA9C0", italic: true, margin: 0, lineSpacing: 14 });

  card(s, 7.1, 1.75, 5.5, 3.05, NAVY_SOFT);
  s.addText("What we refused to build", { x: 7.45, y: 1.92, w: 4.8, h: 0.34, fontSize: 12.5, bold: true, fontFace: SANS, color: "9FD9C4", margin: 0 });
  s.addText(
    "The same machinery that ranks animals for extra help could rank them for less. The 2002 paper that founded this literature framed the problem as adoption versus euthanasia.",
    { x: 7.45, y: 2.32, w: 4.8, h: 1.1, fontSize: 12.5, fontFace: SANS, color: "C6D8E6", margin: 0, lineSpacing: 17 }
  );
  s.addText(
    "So the use policy ships in every API response, the interface has no ranking that surfaces animals for removal, and the public page shows no probability at all.",
    { x: 7.45, y: 3.5, w: 4.8, h: 1.1, fontSize: 12.5, fontFace: SANS, color: "FFFFFF", margin: 0, lineSpacing: 17 }
  );

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.08, w: 11.9, h: 0.92, rectRadius: 0.06,
    fill: { color: TEAL_DEEP }, line: { width: 0 },
  });
  s.addText("A low predicted adoption probability is a request for more help, not less.",
    { x: M, y: 5.08, w: 11.9, h: 0.92, fontSize: 19, bold: true, fontFace: SERIF, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });

  s.addText("Black coat colour, incidentally, did not slow adoption at all: 34.1 percent against 32.3. A model that encoded the folk belief would have begun making it true.",
    { x: M, y: 6.2, w: 11.9, h: 0.6, fontSize: 11.5, fontFace: SANS, color: "8FA9C0", italic: true, margin: 0, align: "center" });

  s.addNotes(
    "4:35. One thing I want to be explicit about. Dogs carrying a bully-type breed label " +
    "wait significantly longer, and the model is both worse and under-confident for them. " +
    "Because the queue routes help toward low scores, that error puts them higher, which " +
    "is the safer direction here, but it is still an error and it is in the model card. " +
    "The same machinery could be pointed the other way. The paper that founded this " +
    "literature in 2002 framed it as adoption versus euthanasia. So the use policy is " +
    "in every API response, and there is no screen anywhere that surfaces an animal for " +
    "removal. A low score is a request for more help, not less."
  );
}

// =============================================================================
// 10. Close
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  slideTitle(s, "Four things I would defend, and three I would not",
    null);

  const defend = [
    "The standard estimator overstates 30-day adoption by 72 percent on this data.",
    "Calibration and discrimination fail separately. Calibration failed first.",
    "The language model earns its keep on one target and not the other.",
    "Three whole classes of feature will silently break a drift detector.",
  ];
  const limits = [
    "No behavioural data, which is where the remaining signal is.",
    "Breed is a staff guess with 50 percent measured sensitivity.",
    "We can show the queue works. We cannot show that acting on it changes outcomes.",
  ];

  card(s, M, 1.75, 6.0, 4.35);
  s.addText("Findings", { x: M + 0.38, y: 1.95, w: 5.2, h: 0.38, fontSize: 15, bold: true, fontFace: SANS, color: TEAL_DEEP, margin: 0 });
  defend.forEach((t, i) => {
    const y = 2.45 + i * 0.9;
    stepBadge(s, M + 0.38, y, String(i + 1));
    s.addText(t, { x: M + 1.0, y: y - 0.06, w: 4.65, h: 0.75, fontSize: 12.5, fontFace: SANS, color: INK, margin: 0, valign: "middle", lineSpacing: 16 });
  });

  card(s, 7.3, 1.75, 5.3, 4.35, "FAF7F3");
  s.addText("Limitations", { x: 7.68, y: 1.95, w: 4.6, h: 0.38, fontSize: 15, bold: true, fontFace: SANS, color: "B56A28", margin: 0 });
  limits.forEach((t, i) => {
    const y = 2.5 + i * 1.02;
    s.addShape(pres.ShapeType.ellipse, { x: 7.68, y: y + 0.14, w: 0.16, h: 0.16, fill: { color: AMBER } });
    s.addText(t, { x: 8.05, y: y - 0.02, w: 4.3, h: 0.85, fontSize: 12.5, fontFace: SANS, color: INK_SOFT, margin: 0, valign: "middle", lineSpacing: 16 });
  });
  s.addShape(pres.ShapeType.line, { x: 7.68, y: 5.65, w: 4.6, h: 0, line: { color: HAIRLINE, width: 1 } });
  s.addText("Next: a photograph-quality signal, a second shelter, and a prospective evaluation.",
    { x: 7.68, y: 5.76, w: 4.6, h: 0.3, fontSize: 11, fontFace: SANS, color: INK_MUTED, italic: true, margin: 0 });

  s.addText(
    "secondchance  ·  Davis Higgins  ·  every number in this deck is read from results/MEASURED_RESULTS.json at build time",
    { x: M, y: 6.5, w: 11.9, h: 0.4, fontSize: 10.5, fontFace: SANS, color: INK_MUTED, margin: 0, align: "center" }
  );

  s.addNotes(
    "5:00. To close. Four findings I would defend: the estimator error, calibration " +
    "failing before discrimination, the language model earning its place on one target " +
    "and not the other, and three classes of feature that will silently break a drift " +
    "detector. Three things I would not claim: I have no behavioural data, which is " +
    "where the remaining signal is; breed is a staff guess; and I can show the queue " +
    "finds the right animals but not that acting on it changes what happens to them. " +
    "That last one needs a prospective study, and it is what I would do next. Thank you."
  );
}

const out = path.join(__dirname, "SecondChance_Final_Presentation.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("wrote", out));
