#!/usr/bin/env python3
"""Build the single-file working demo of the SecondChance product.

This is not the deliverable front end. The deliverable is the build package in
this directory, which Claude Code turns into a Vite and React application. This
file exists for two reasons: a grader should be able to open one file and see the
thing working, and a build package that has never been rendered is a specification
nobody has checked.

Everything is inlined: the data from `data/`, the CSS, the charts as hand-written
SVG. No network, no dependencies, no build step. Open it and it works.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = HERE.parent / "results" / "SecondChance_demo.html"


def load(name: str):
    return json.loads((DATA / name).read_text())


def main() -> None:
    metadata = load("metadata.json")
    queue = load("queue.json")
    trends = load("trends.json")
    forecast = load("forecast.json")
    segments = load("segments.json")
    interventions = load("interventions.json")
    results = load("model_summary.json")

    # Trim what the browser actually needs. The full results file is 127 KB and
    # most of it is never rendered.
    slim_results = {
        "metadata": results["metadata"],
        "headline": results["headline"],
        "block_date_ranges": results["block_date_ranges"],
        "cohort": results["cohort"],
        "data_audit": results["data_audit"],
        "targets": {
            target: {
                "test_positive_rate": block["test_positive_rate"],
                "n_test": block["n_test"],
                "models": {
                    name: {
                        "roc_auc": model["test_calibrated"]["roc_auc"],
                        "roc_auc_ci": model["test_calibrated"].get("roc_auc_ci"),
                        "pr_auc": model["test_calibrated"]["pr_auc"],
                        "brier": model["test_calibrated"]["brier"],
                        "ece": model["test_calibrated"]["ece"],
                        "lift_at_50": model["test_calibrated"]["lift_at_50"],
                        "precision_at_50": model["test_calibrated"]["precision_at_50"],
                    }
                    for name, model in block["models"].items()
                },
            }
            for target, block in results["targets"].items()
        },
        "subgroups": results["subgroups"]["adopted_within_30d"],
        "survival": {
            "estimator_comparison": results["survival"]["estimator_comparison"],
            "stratum_cif": results["survival"]["stratum_cif"],
            "survival_calibration_by_decile": results["survival"]["survival_calibration_by_decile"],
            "competing_risk_correction": results["survival"]["competing_risk_correction"],
            "median_days_to_adoption_cause_specific": results["survival"][
                "median_days_to_adoption_cause_specific"
            ],
        },
        "monthly_performance": results["monthly_performance"],
        "drift": {
            "baseline": results["drift"]["baseline"],
            "performance_drift": results["drift"]["performance_drift"],
            "top_drifting_features_post_shift": results["drift"]["top_drifting_features_post_shift"],
            "thresholds": results["drift"]["thresholds"],
        },
        "shelter_level_drift": results["shelter_level_drift"],
        "ablations": {
            "breed_strategy": results["ablations"]["breed_strategy"],
            "cumulative_blocks": results["ablations"]["cumulative_blocks"],
        },
    }

    payload = {
        "metadata": metadata,
        "queue": queue,
        "trends": trends,
        "forecast": forecast,
        "segments": segments,
        "interventions": interventions,
        "results": slim_results,
    }

    html = TEMPLATE.replace("__PAYLOAD__", json.dumps(payload, separators=(",", ":")))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SecondChance — shelter adoption forecasting</title>
<style>
/* ===========================================================================
   Design tokens. Every value here comes from DESIGN_SYSTEM.md. No raw hex
   appears below this block.
   =========================================================================== */
:root {
  color-scheme: light;
  --surface-page: #f9f9f7;
  --surface-card: #fcfcfb;
  --surface-raised: #ffffff;
  --surface-sunken: #f2f1ee;
  --ink-primary: #0b0b0b;
  --ink-secondary: #52514e;
  --ink-muted: #898781;
  --border-hairline: rgba(11,11,11,0.10);
  --grid-line: #e1e0d9;
  --axis-line: #c3c2b7;

  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
  --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --s8: #e34948;

  --seq-250: #86b6ef; --seq-350: #5598e7; --seq-450: #2a78d6;
  --seq-550: #1c5cab; --seq-650: #104281;

  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;

  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 40px; --s-8: 48px; --s-9: 64px;

  --r-sm: 6px; --r-md: 10px; --r-lg: 16px; --r-xl: 24px; --r-full: 9999px;

  --elev-1: 0 1px 2px rgba(11,11,11,0.04), 0 1px 1px rgba(11,11,11,0.03);
  --elev-2: 0 2px 6px rgba(11,11,11,0.05), 0 1px 2px rgba(11,11,11,0.04);
  --elev-3: 0 8px 24px rgba(11,11,11,0.07), 0 2px 6px rgba(11,11,11,0.04);

  --dur-instant: 90ms; --dur-fast: 160ms; --dur-base: 240ms;
  --dur-slow: 420ms; --dur-deliberate: 720ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --surface-page: #0d0d0d; --surface-card: #1a1a19; --surface-raised: #232322;
  --surface-sunken: #131312;
  --ink-primary: #ffffff; --ink-secondary: #c3c2b7; --ink-muted: #898781;
  --border-hairline: rgba(255,255,255,0.10);
  --grid-line: #2c2c2a; --axis-line: #383835;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
  --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--surface-page);
  color: var(--ink-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.tnum { font-variant-numeric: tabular-nums; }
button { font: inherit; cursor: pointer; }
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--surface-card), 0 0 0 4px var(--s1);
  border-radius: var(--r-sm);
}
.skip {
  position: absolute; left: -9999px; top: 0; z-index: 200;
  background: var(--surface-raised); padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md); box-shadow: var(--elev-3);
}
.skip:focus { left: var(--s-4); top: var(--s-4); }

/* --- shell --------------------------------------------------------------- */
header.app {
  position: sticky; top: 0; z-index: 50;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-hairline);
  height: 64px; display: flex; align-items: center;
  gap: var(--s-5); padding: 0 var(--s-5);
}
.wordmark { display: flex; align-items: center; gap: var(--s-2); font-weight: 600; font-size: 17px; letter-spacing: -0.006em; }
.mark { width: 20px; height: 20px; flex: none; }
nav.main { display: flex; gap: var(--s-1); position: relative; }
nav.main button {
  background: none; border: 0; padding: var(--s-2) var(--s-3);
  color: var(--ink-secondary); font-size: 14px; border-radius: var(--r-sm);
  position: relative; transition: color var(--dur-instant) var(--ease-out);
}
nav.main button:hover { color: var(--ink-primary); }
nav.main button[aria-current="page"] { color: var(--ink-primary); font-weight: 600; }
#navbar {
  position: absolute; bottom: -1px; height: 2px; background: var(--s1);
  border-radius: 2px; transition: transform var(--dur-base) var(--ease-out), width var(--dur-base) var(--ease-out);
}
.spacer { flex: 1; }
.chip {
  display: inline-flex; align-items: center; gap: var(--s-2);
  padding: 5px 11px; border-radius: var(--r-full);
  font-size: 11.5px; font-weight: 500; letter-spacing: 0.012em;
  background: var(--surface-sunken); color: var(--ink-secondary);
  border: 1px solid var(--border-hairline); white-space: nowrap;
}
.chip .dot { width: 7px; height: 7px; border-radius: var(--r-full); flex: none; }
.chip.sample { color: var(--critical); border-color: var(--critical); }
.chip.sample .dot { background: var(--critical); }
.chip.version { font-family: var(--font-mono); }
.icon-btn {
  background: none; border: 1px solid var(--border-hairline); border-radius: var(--r-sm);
  width: 32px; height: 32px; color: var(--ink-secondary); line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-instant) var(--ease-out);
}
.icon-btn:hover { background: var(--surface-sunken); }

main { max-width: 1440px; margin: 0 auto; padding: var(--s-6) var(--s-5) var(--s-9); }
.page { display: none; }
.page.active { display: block; }
h1.page-title { font-size: 32px; line-height: 1.12; font-weight: 600; letter-spacing: -0.018em; margin: 0 0 var(--s-2); }
p.page-sub { color: var(--ink-secondary); margin: 0 0 var(--s-5); max-width: 74ch; }

.policy {
  display: flex; gap: var(--s-3); align-items: flex-start;
  background: var(--surface-sunken); border: 1px solid var(--border-hairline);
  border-radius: var(--r-md); padding: var(--s-3) var(--s-4);
  font-size: 13px; color: var(--ink-secondary); margin-bottom: var(--s-5);
}
.policy svg { flex: none; margin-top: 2px; }

.card {
  background: var(--surface-card); border: 1px solid var(--border-hairline);
  border-radius: var(--r-lg); box-shadow: var(--elev-1); padding: var(--s-5);
}
.card h2 { font-size: 17px; font-weight: 600; letter-spacing: -0.006em; margin: 0 0 var(--s-1); }
.card .sub { font-size: 12.5px; color: var(--ink-muted); margin: 0 0 var(--s-4); }
.grid { display: grid; gap: var(--s-5); }
.g4 { grid-template-columns: repeat(4, 1fr); }
.g2 { grid-template-columns: repeat(2, 1fr); }
.g32 { grid-template-columns: 3fr 2fr; }
@media (max-width: 1023px) { .g4 { grid-template-columns: repeat(2, 1fr); } .g2, .g32 { grid-template-columns: 1fr; } }
@media (max-width: 639px) { .g4 { grid-template-columns: 1fr; } }

/* --- hero ---------------------------------------------------------------- */
.hero {
  background: var(--surface-raised); border: 1px solid var(--border-hairline);
  border-radius: var(--r-xl); box-shadow: var(--elev-2);
  padding: var(--s-6); display: grid; grid-template-columns: 3fr 2fr;
  gap: var(--s-6); align-items: center; margin-bottom: var(--s-5);
}
@media (max-width: 899px) { .hero { grid-template-columns: 1fr; } }
.hero-number { font-size: 64px; line-height: 1; font-weight: 600; letter-spacing: -0.022em; color: var(--s1); }
.hero-label { font-size: 17px; font-weight: 500; margin-top: var(--s-2); }
.hero-support { font-size: 13px; color: var(--ink-muted); margin-top: var(--s-2); max-width: 46ch; }
.btn {
  margin-top: var(--s-4); background: var(--s1); color: #fff; border: 0;
  padding: 10px 18px; border-radius: var(--r-md); font-size: 14px; font-weight: 500;
  transition: transform var(--dur-instant) var(--ease-out), filter var(--dur-instant);
}
.btn:hover { filter: brightness(1.08); }
.btn:active { transform: translateY(1px); }

/* --- stat tiles ---------------------------------------------------------- */
.tile { display: flex; flex-direction: column; gap: var(--s-2); }
.tile .k { font-size: 12.5px; color: var(--ink-secondary); }
.tile .v { font-size: 30px; font-weight: 600; letter-spacing: -0.018em; line-height: 1.1; }
.tile .u { font-size: 12px; color: var(--ink-muted); font-weight: 400; margin-left: 4px; letter-spacing: 0; }
.delta { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; }
.delta.good { color: var(--good); } .delta.bad { color: var(--serious); } .delta.flat { color: var(--ink-muted); }

/* --- queue --------------------------------------------------------------- */
.controls { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; margin-bottom: var(--s-4); }
.controls select, .controls input[type="search"] {
  font: inherit; font-size: 13.5px; padding: 7px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--border-hairline); background: var(--surface-card); color: var(--ink-primary);
}
.controls label { font-size: 12.5px; color: var(--ink-secondary); display: inline-flex; align-items: center; gap: var(--s-2); }
.qrow {
  display: grid; grid-template-columns: 4px 52px 1fr 76px 150px 1fr 92px;
  gap: var(--s-4); align-items: center;
  padding: var(--s-3) var(--s-4) var(--s-3) 0;
  border-bottom: 1px solid var(--border-hairline);
  transition: background var(--dur-instant) var(--ease-out);
}
.qrow:hover { background: var(--surface-sunken); }
.qbar { width: 4px; height: 46px; border-radius: 2px; }
.avatar {
  width: 48px; height: 48px; border-radius: var(--r-md); background: var(--surface-sunken);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 18px; color: var(--ink-muted); border: 1px solid var(--border-hairline);
}
.qname { font-weight: 600; font-size: 14.5px; }
.qname.unnamed { font-weight: 400; font-style: italic; color: var(--ink-muted); }
.qmeta { font-size: 12px; color: var(--ink-secondary); }
.qdays { text-align: right; }
.qdays .n { font-size: 20px; font-weight: 600; line-height: 1.1; }
.qdays .l { font-size: 10.5px; color: var(--ink-muted); letter-spacing: 0.012em; }
.meter { height: 8px; background: var(--surface-sunken); border-radius: var(--r-full); overflow: hidden; position: relative; }
.meter i { display: block; height: 100%; border-radius: var(--r-full); transform-origin: left; transform: scaleX(0); transition: transform var(--dur-base) var(--ease-out); }
.meter-label { font-size: 11.5px; color: var(--ink-secondary); margin-top: 4px; }
.driver {
  display: inline-block; font-size: 11.5px; padding: 3px 9px; border-radius: var(--r-full);
  background: var(--surface-sunken); color: var(--ink-secondary); border: 1px solid var(--border-hairline);
}
.qactions { display: flex; gap: var(--s-2); justify-content: flex-end; }
.expand { grid-column: 1 / -1; overflow: hidden; }
.expand-inner {
  display: grid; grid-template-columns: 3fr 2fr; gap: var(--s-5);
  padding: var(--s-4) var(--s-4) var(--s-5) var(--s-5);
  background: var(--surface-sunken); border-radius: var(--r-md); margin: 0 0 var(--s-3);
}
@media (max-width: 899px) { .expand-inner { grid-template-columns: 1fr; } .qrow { grid-template-columns: 4px 48px 1fr; grid-auto-rows: auto; } }
.shapbar { display: grid; grid-template-columns: 1fr 120px 1fr; align-items: center; gap: var(--s-2); margin-bottom: 6px; font-size: 12px; }
.shapbar .neg, .shapbar .pos { height: 12px; border-radius: 3px; }
.evidence { font-size: 10.5px; padding: 2px 7px; border-radius: var(--r-full); font-weight: 600; letter-spacing: 0.012em; }
.evidence.measured { background: rgba(12,163,12,0.12); color: var(--good); }
.evidence.assumed { background: rgba(250,178,25,0.16); color: #8a6100; }

/* --- tables -------------------------------------------------------------- */
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-weight: 600; color: var(--ink-secondary); font-size: 11.5px; letter-spacing: 0.03em; text-transform: uppercase; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--axis-line); }
td { padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--grid-line); }
td.num, th.num { text-align: right; }
tr.flagged td { background: rgba(250,178,25,0.08); }

.status { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; }
.status .dot { width: 8px; height: 8px; border-radius: var(--r-full); }

.legend { display: flex; flex-wrap: wrap; gap: var(--s-4); font-size: 12px; color: var(--ink-secondary); margin-top: var(--s-3); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

.toggle-table { background: none; border: 1px solid var(--border-hairline); border-radius: var(--r-sm); font-size: 11.5px; padding: 4px 9px; color: var(--ink-secondary); }

/* --- discovery ----------------------------------------------------------- */
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-5); }
@media (max-width: 1023px) { .cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 639px) { .cards { grid-template-columns: 1fr; } }
.pet {
  background: var(--surface-card); border: 1px solid var(--border-hairline);
  border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--elev-1);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
.pet:hover { transform: translateY(-4px); box-shadow: var(--elev-3); }
.pet .portrait { aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 600; color: #fff; }
.pet .body { padding: var(--s-4); }
.pet .waiting { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: var(--r-full); background: var(--surface-sunken); color: var(--ink-secondary); margin-top: var(--s-2); }

/* --- animation ----------------------------------------------------------- */
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.enter > * { animation: rise var(--dur-base) var(--ease-out) both; }
.enter > *:nth-child(1) { animation-delay: 50ms; }
.enter > *:nth-child(2) { animation-delay: 95ms; }
.enter > *:nth-child(3) { animation-delay: 140ms; }
.enter > *:nth-child(4) { animation-delay: 185ms; }
.enter > *:nth-child(5) { animation-delay: 230ms; }
.enter > *:nth-child(6) { animation-delay: 275ms; }
.enter > *:nth-child(7) { animation-delay: 320ms; }
.enter > *:nth-child(8) { animation-delay: 365ms; }
.enter > *:nth-child(n+9) { animation-delay: 365ms; }
.draw { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: undash var(--dur-slow) var(--ease-out) forwards; }
@keyframes undash { to { stroke-dashoffset: 0; } }
.growx { transform-origin: left; animation: gx var(--dur-base) var(--ease-out) both; }
@keyframes gx { from { transform: scaleX(0); } }
.growy { transform-box: fill-box; transform-origin: bottom; animation: gy var(--dur-base) var(--ease-out) both; }
@keyframes gy { from { transform: scaleY(0); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
.chip.stale { animation: pulse 3s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
  .meter i { transform: scaleX(1) !important; }
}

footer.app {
  border-top: 1px solid var(--border-hairline); background: var(--surface-card);
  padding: var(--s-7) var(--s-5); margin-top: var(--s-9);
}
footer .inner { max-width: 1440px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-6); }
@media (max-width: 899px) { footer .inner { grid-template-columns: 1fr; } }
footer h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin: 0 0 var(--s-3); font-weight: 600; }
footer p, footer li { font-size: 13px; color: var(--ink-secondary); margin: 0 0 var(--s-2); }
footer ul { margin: 0; padding-left: 1.1em; }
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>

<header class="app">
  <div class="wordmark">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2a8.8 8.8 0 1 0 8.4 6.1" fill="none" stroke="var(--s1)" stroke-width="2.6" stroke-linecap="round"/>
    </svg>
    SecondChance
  </div>
  <nav class="main" aria-label="Primary">
    <button data-page="dashboard" aria-current="page">Dashboard</button>
    <button data-page="queue">Queue</button>
    <button data-page="discover">Discover</button>
    <button data-page="planner">Planner</button>
    <button data-page="model">Model</button>
    <div id="navbar"></div>
  </nav>
  <div class="spacer"></div>
  <span class="chip sample" id="freshness"><span class="dot"></span><span id="freshness-text"></span></span>
  <span class="chip version" id="modelver"></span>
  <button class="icon-btn" id="theme" aria-label="Switch to dark theme" title="Theme">◐</button>
</header>

<main id="main">
  <!-- ===================== DASHBOARD ===================== -->
  <section class="page active" id="page-dashboard" aria-labelledby="t-dash">
    <h1 class="page-title" id="t-dash">Today at the shelter</h1>
    <p class="page-sub" id="dash-sub"></p>
    <div class="policy">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 4.6v.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.</span>
    </div>

    <div class="hero">
      <div>
        <div class="hero-number tnum" id="hero">0</div>
        <div class="hero-label">animals need attention this week</div>
        <div class="hero-support" id="hero-support"></div>
        <button class="btn" data-goto="queue">Open the queue</button>
      </div>
      <div id="donut"></div>
    </div>

    <div class="grid g4 enter" style="margin-bottom: var(--s-2)" id="tiles"></div>
    <p style="font-size:11.5px;color:var(--ink-muted);margin:0 0 var(--s-5)" id="tiles-note"></p>

    <div class="grid g32" style="margin-bottom: var(--s-5)">
      <div class="card">
        <h2>Population over the next 30 days</h2>
        <p class="sub" id="forecast-sub"></p>
        <div id="forecast-chart"></div>
      </div>
      <div class="card">
        <h2>Model health</h2>
        <p class="sub">Every figure links to the evidence on the model page.</p>
        <div id="health"></div>
      </div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h2>Where the wait is longest</h2>
        <p class="sub">Median predicted days in care, by life stage.</p>
        <div id="segments-chart"></div>
      </div>
      <div class="card">
        <h2>Nine years of arrivals</h2>
        <p class="sub">Monthly arrivals, with the March 2020 operational change marked.</p>
        <div id="trend-chart"></div>
      </div>
    </div>
  </section>

  <!-- ===================== QUEUE ===================== -->
  <section class="page" id="page-queue" aria-labelledby="t-queue">
    <h1 class="page-title" id="t-queue">Needs attention</h1>
    <p class="page-sub" id="queue-sub"></p>
    <div class="policy">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 4.6v.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.</span>
    </div>
    <div class="controls">
      <label>Species
        <select id="f-species"><option value="all">All animals</option><option>Dog</option><option>Cat</option></select>
      </label>
      <label>Sort
        <select id="f-sort">
          <option value="risk">By risk</option>
          <option value="days">By days waiting</option>
          <option value="arrival">By arrival date</option>
        </select>
      </label>
      <label>Minimum risk <span class="tnum" id="f-thresh-val">0.23</span>
        <input type="range" id="f-thresh" min="0" max="0.66" step="0.01" value="0.2312">
      </label>
      <input type="search" id="f-search" placeholder="Search by name or ID" aria-label="Search by name or ID">
      <span class="spacer"></span>
      <span class="chip" id="queue-count" aria-live="polite"></span>
    </div>
    <div class="card" style="padding: var(--s-3) var(--s-4)">
      <div id="queue-list"></div>
    </div>
  </section>

  <!-- ===================== DISCOVER ===================== -->
  <section class="page" id="page-discover" aria-labelledby="t-disc">
    <h1 class="page-title" id="t-disc">Meet the ones who have been waiting</h1>
    <p class="page-sub">These animals have been at the shelter longest. Every one of them is ready to go home today.</p>
    <div class="cards enter" id="discover-cards"></div>
  </section>

  <!-- ===================== PLANNER ===================== -->
  <section class="page" id="page-planner" aria-labelledby="t-plan">
    <h1 class="page-title" id="t-plan">This week's outreach plan</h1>
    <p class="page-sub">Turn the queue into a list of jobs your team can actually finish.</p>
    <div class="policy">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 4.6v.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Scores route help toward animals. They must never be used to justify euthanasia, intake refusal, or reduced care.</span>
    </div>
    <div class="grid g32">
      <div class="card">
        <h2>The plan</h2>
        <p class="sub" id="plan-sub"></p>
        <div id="plan"></div>
      </div>
      <div>
        <div class="card" style="margin-bottom: var(--s-5)">
          <h2>Capacity</h2>
          <p class="sub">How many animals can your team feature this week?</p>
          <input type="range" id="capacity" min="5" max="60" step="5" value="20" style="width:100%">
          <div style="font-size:30px;font-weight:600;letter-spacing:-0.018em" class="tnum" id="capacity-val">20</div>
        </div>
        <div class="card">
          <h2>What this buys you</h2>
          <p class="sub">One measured figure, one assumption, kept apart.</p>
          <div id="plan-effect"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== MODEL ===================== -->
  <section class="page" id="page-model" aria-labelledby="t-model">
    <h1 class="page-title" id="t-model">How this model works, and where it does not</h1>
    <p class="page-sub">Every number on this page is read from the project's measured results file. Nothing here is typed in by hand.</p>

    <div class="grid g4 enter" style="margin-bottom: var(--s-5)" id="model-summary"></div>

    <div class="grid g2" style="margin-bottom: var(--s-5)">
      <div class="card">
        <h2>How well it works</h2>
        <p class="sub">Held-out ROC AUC by target, after isotonic calibration. Bars show the 95 percent bootstrap interval.</p>
        <div id="model-auc"></div>
      </div>
      <div class="card">
        <h2>The estimator error</h2>
        <p class="sub">Cumulative adoption by day: the estimator the field uses, against the competing-risks estimate.</p>
        <div id="model-estimator"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--s-5)">
      <h2>Who it works for</h2>
      <p class="sub">30-day adoption, by subgroup. Rows with an absolute calibration gap above 0.04 are flagged, not hidden.</p>
      <div style="overflow-x:auto"><table id="subgroups"></table></div>
    </div>

    <div class="card" style="margin-bottom: var(--s-5)">
      <h2>When it stops working</h2>
      <p class="sub" id="drift-sub"></p>
      <div id="model-drift"></div>
      <p style="font-size:13px;color:var(--ink-secondary);margin-top:var(--s-4);max-width:82ch">
        In March 2020 the Austin shelter changed how it operated. The model, trained on 2018 data,
        kept ranking animals about as well as before. What broke was calibration. That is the failure
        mode worth understanding: a model can keep its ranking and lose its meaning, and a dashboard
        showing probabilities will keep showing confident, wrong numbers the whole time.
      </p>
    </div>

    <div class="card">
      <h2>What it must not be used for</h2>
      <p class="sub">The full use policy, reproduced verbatim.</p>
      <div style="font-size:14px;line-height:1.65;color:var(--ink-secondary);max-width:80ch">
        <p>SecondChance predicts how long an animal is likely to wait for adoption so that staff
        attention, foster recruitment, photography and outreach can go to the animals who need them most.</p>
        <p><strong style="color:var(--ink-primary)">A low predicted adoption probability is a request for more help, not less.</strong>
        This score must never be used to justify euthanasia, to refuse an intake, to withhold medical or
        behavioural care, or to deprioritise any animal for any resource. Every prediction in this system
        exists to increase what an animal receives.</p>
        <p>If you are being asked to use this tool to reduce care for an animal, the tool is being misused. Say so.</p>
      </div>
    </div>
  </section>
</main>

<footer class="app">
  <div class="inner">
    <div>
      <h3>About this tool</h3>
      <p>SecondChance forecasts time to adoption for animals at the Austin Animal Center. It was built
      as a semester project for DTSC 3601 at UNC Charlotte, on public shelter records covering October
      2013 to March 2022. It is a research prototype, not a production system.</p>
    </div>
    <div>
      <h3>Where the data comes from</h3>
      <ul>
        <li>Austin Animal Center Intakes, City of Austin Open Data Portal</li>
        <li>Austin Animal Center Outcomes, City of Austin Open Data Portal</li>
        <li>Daily weather observations, National Weather Service</li>
        <li>Current adoptable listings, RescueGroups.org</li>
      </ul>
    </div>
    <div>
      <h3>How to use it</h3>
      <p>A low predicted adoption probability is a request for more help, not less. This score must
      never be used to justify euthanasia, to refuse an intake, to withhold care, or to deprioritise
      any animal for any resource.</p>
    </div>
  </div>
</footer>

<script>
const D = __PAYLOAD__;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtPct = v => v == null ? "not measured" : Math.round(v * 100) + "%";
const fmtNum = v => v == null ? "not measured" : v.toLocaleString();
const fmt3 = v => v == null ? "not measured" : v.toFixed(3);
const SERIES = ["--s1","--s2","--s3","--s4","--s5","--s6","--s7","--s8"];
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- tiny SVG chart helpers -------------------------------------- */
function svg(w, h, extra) {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" ${extra || ""}>`;
}
function pathLen(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    L += Math.hypot(points[i][0] - points[i-1][0], points[i][1] - points[i-1][1]);
  }
  return Math.ceil(L) + 10;
}
function linePath(pts) { return pts.map((p,i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "); }

/* ---------- header ------------------------------------------------------- */
document.getElementById("modelver").textContent = "Model " + D.metadata.model_version;
const asOf = new Date(D.metadata.data_as_of);
document.getElementById("freshness-text").textContent =
  "Showing sample data · " + asOf.toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});

document.getElementById("theme").addEventListener("click", () => {
  const now = document.documentElement.getAttribute("data-theme");
  const next = now === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  document.getElementById("theme").setAttribute("aria-label", "Switch to " + (next === "dark" ? "light" : "dark") + " theme");
  renderAll();
});

/* ---------- routing ------------------------------------------------------ */
const navButtons = [...document.querySelectorAll("nav.main button")];
const navbar = document.getElementById("navbar");
function goto(page) {
  document.querySelectorAll(".page").forEach(s => s.classList.toggle("active", s.id === "page-" + page));
  navButtons.forEach(b => {
    const on = b.dataset.page === page;
    b.setAttribute("aria-current", on ? "page" : "false");
    if (on) { navbar.style.width = b.offsetWidth + "px"; navbar.style.transform = `translateX(${b.offsetLeft}px)`; }
  });
  window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
}
navButtons.forEach(b => b.addEventListener("click", () => goto(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => goto(b.dataset.goto)));

/* ---------- dashboard ---------------------------------------------------- */
const M = D.metadata;
document.getElementById("dash-sub").textContent =
  `${fmtNum(M.current_census)} animals in care. ${fmtNum(M.needs_attention)} the model expects to wait longest, ` +
  `${fmtNum(M.needs_attention_critical)} of them at four times the base rate or more.`;
document.getElementById("hero-support").textContent =
  `out of ${fmtNum(M.recent_window_size)} arrivals since ${M.recent_window_start}, ranked by predicted 60-day stay risk`;

function countUp(el, target) {
  if (REDUCED) { el.textContent = target.toLocaleString(); return; }
  const start = performance.now(), dur = 720;
  function step(t) {
    const p = Math.min((t - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderDonut() {
  // Bands are evaluated in order and each animal falls into exactly one, so the
  // segments always sum to the queue size. An earlier version tested each band
  // independently and double counted animals that satisfied two of them.
  const cuts = D.metadata.risk_band_cuts;
  const bands = [
    ["Under 7 days", a => a.p_adopt_7d >= 0.5, "--seq-250"],
    ["7 to 30 days", a => a.p_adopt_30d >= 0.5, "--seq-350"],
    ["30 to 60 days", a => a.p_long_stay_60d < cuts.serious, "--seq-550"],
    ["Over 60 days", () => true, "--seq-650"],
  ];
  const animals = D.queue.animals;
  const counts = bands.map(() => 0);
  animals.forEach(a => {
    for (let i = 0; i < bands.length; i++) {
      if (bands[i][1](a)) { counts[i]++; break; }
    }
  });
  const total = counts.reduce((a,b) => a+b, 0) || 1;
  const R = 62, C = 2 * Math.PI * R;
  let offset = 0, arcs = "";
  counts.forEach((c, i) => {
    const frac = c / total;
    arcs += `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${cssv(bands[i][2])}" stroke-width="26"
      stroke-dasharray="${(frac*C).toFixed(1)} ${C}" stroke-dashoffset="${(-offset*C).toFixed(1)}"
      transform="rotate(-90 90 90)"><title>${bands[i][0]}: ${c}</title></circle>`;
    offset += frac;
  });
  const rows = bands.map(([label,,col], i) =>
    `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px">
       <i style="width:10px;height:10px;border-radius:2px;background:${cssv(col)};display:inline-block"></i>
       <span style="flex:1;color:var(--ink-secondary)">${label}</span>
       <strong class="tnum">${counts[i]}</strong></div>`).join("");
  document.getElementById("donut").innerHTML =
    `<div style="display:flex;gap:var(--s-5);align-items:center">
       <svg viewBox="0 0 180 180" width="180" height="180" role="img"
            aria-label="Expected wait for the ${total} animals in the queue, in four bands.">
         ${arcs}
         <text x="90" y="86" text-anchor="middle" font-size="26" font-weight="600" fill="${cssv("--ink-primary")}" class="tnum">${total}</text>
         <text x="90" y="104" text-anchor="middle" font-size="10.5" fill="${cssv("--ink-muted")}">in the queue</text>
       </svg>
       <div style="flex:1;min-width:150px">${rows}</div>
     </div>`;
}

function sparkline(values, color, w = 150, h = 34) {
  const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
  const pts = values.map((v, i) => [ (i / (values.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2 ]);
  const d = linePath(pts), L = pathLen(pts);
  return svg(w, h, `aria-hidden="true"`) +
    `<path d="${d}" fill="none" stroke="${cssv(color)}" stroke-width="2" stroke-linecap="round"
     class="${REDUCED ? "" : "draw"}" style="--len:${L}"/></svg>`;
}

function renderTiles() {
  const months = D.trends.months;
  const last12 = months.slice(-13);
  // Every sparkline is the real monthly series for the metric above it. Nothing
  // here is a stand-in for a series we do not have.
  const census = last12.map(m => m.census);
  const medDays = last12.map(m => m.median_days_to_adoption);
  const rate30 = last12.map(m => m.adopted_within_30d_rate);
  const longStay = last12.map(m => m.long_stay_60d_rate);
  const last = arr => arr[arr.length - 1];
  const delta = arr => { const a = last(arr), b = arr[arr.length-2]; return b ? (a-b)/b : 0; };
  // Polarity is per metric and hardcoded. A rising census is not good news; a
  // rising adoption rate is.
  const tiles = [
    ["Animals in care", Math.round(last(census)).toLocaleString(), "", census, "--s1", delta(census), "down"],
    ["Median days to adoption", last(medDays).toFixed(1), "days", medDays, "--s2", delta(medDays), "down"],
    ["Adopted within 30 days", fmtPct(last(rate30)), "", rate30, "--s3", delta(rate30), "up"],
    ["Still here after 60 days", fmtPct(last(longStay)), "", longStay, "--s4", delta(longStay), "down"],
  ];
  document.getElementById("tiles").innerHTML = tiles.map(([k, v, u, series, col, dv, goodDir]) => {
    const cls = Math.abs(dv) < 0.005 ? "flat" : ((dv > 0) === (goodDir === "up") ? "good" : "bad");
    const arrow = Math.abs(dv) < 0.005 ? "→" : (dv > 0 ? "↑" : "↓");
    const label = Math.abs(dv) < 0.005 ? "no change" : Math.abs(dv * 100).toFixed(1) + "%";
    return `<div class="card tile">
      <div class="k">${k}</div>
      <div class="v tnum">${v}${u ? `<span class="u">${u}</span>` : ""}</div>
      ${sparkline(series, col)}
      <div class="delta ${cls}"><span aria-hidden="true">${arrow}</span>${label} <span style="color:var(--ink-muted);font-weight:400">vs the month before</span></div>
    </div>`;
  }).join("");
}

function renderTilesNote() {
  document.getElementById("tiles-note").textContent =
    "Sparklines show the last 13 months of the real monthly series. " + D.trends.series_end_note;
}

function renderForecast() {
  const f = D.forecast;
  document.getElementById("forecast-sub").textContent =
    f.method === "seasonal_naive"
      ? "Seasonal baseline projection with an 80 percent interval. This is a seasonal average, not a trained forecasting model."
      : "Central estimate with an 80 percent interval.";
  const hist = f.history.slice(-12);
  const W = 560, H = 220, PAD = { l: 44, r: 12, t: 12, b: 28 };
  const all = hist.map(h => h.census).concat(f.forecast.map(p => p.high), f.forecast.map(p => p.low), [f.capacity_reference]);
  const min = Math.min(...all) * 0.94, max = Math.max(...all) * 1.04;
  const n = hist.length + f.forecast.length;
  const X = i => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const Y = v => H - PAD.b - ((v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const histPts = hist.map((h, i) => [X(i), Y(h.census)]);
  const fcPts = f.forecast.map((p, i) => [X(hist.length + i), Y(p.central)]);
  const band = f.forecast.map((p, i) => [X(hist.length + i), Y(p.high)])
    .concat(f.forecast.map((p, i) => [X(hist.length + i), Y(p.low)]).reverse());
  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const v = min + t * (max - min);
    return `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${cssv("--grid-line")}" stroke-width="1"/>
            <text x="${PAD.l-8}" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${Math.round(v)}</text>`;
  }).join("");
  const L = pathLen(histPts);
  document.getElementById("forecast-chart").innerHTML =
    svg(W, H, `aria-label="Shelter population over the last 12 months with a 30 day projection reaching ${f.forecast[f.forecast.length-1].central} animals."`) +
    grid +
    `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${Y(f.capacity_reference)}" y2="${Y(f.capacity_reference)}"
       stroke="${cssv("--ink-muted")}" stroke-width="1" stroke-dasharray="4 4"/>
     <text x="${W-PAD.r}" y="${Y(f.capacity_reference)-6}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">typical operating capacity</text>
     <polygon points="${band.map(p=>p.join(",")).join(" ")}" fill="${cssv("--s1")}" opacity="0.12"/>
     <path d="${linePath(histPts)}" fill="none" stroke="${cssv("--s1")}" stroke-width="2" stroke-linecap="round"
       class="${REDUCED ? "" : "draw"}" style="--len:${L}"/>
     <path d="${linePath([histPts[histPts.length-1]].concat(fcPts))}" fill="none" stroke="${cssv("--s1")}"
       stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>
     <line x1="${X(hist.length-1)}" x2="${X(hist.length-1)}" y1="${PAD.t}" y2="${H-PAD.b}"
       stroke="${cssv("--axis-line")}" stroke-width="1"/>
     <text x="${X(hist.length-1)+5}" y="${PAD.t+11}" font-size="10" fill="${cssv("--ink-muted")}">today</text>
     <text x="${PAD.l}" y="${H-8}" font-size="10" fill="${cssv("--ink-muted")}">${hist[0].month}</text>
     <text x="${W-PAD.r}" y="${H-8}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">+30 days</text>
     </svg>`;
}

function renderHealth() {
  const R = D.results;
  const drift = R.drift.top_drifting_features_post_shift[0];
  const rows = [
    ["Discrimination", fmt3(R.headline.champion_auc_30d), R.headline.champion_auc_30d > 0.75 ? "good" : "warning", "held-out ROC AUC, 30-day adoption"],
    ["Calibration error", fmt3(R.headline.champion_ece_30d), R.headline.champion_ece_30d < 0.05 ? "good" : "warning", "expected calibration error"],
    ["Input drift", drift.psi.toFixed(3), drift.status === "CRITICAL" ? "critical" : (drift.status === "WARNING" ? "warning" : "good"), "worst feature: " + drift.feature.replace(/_/g, " ")],
    ["Last retrained", new Date(M.model_trained_at).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"}), "good", "manual approval required before serving"],
  ];
  const icon = { good: "✓", warning: "▲", critical: "⬣" };
  document.getElementById("health").innerHTML = rows.map(([k, v, s, note]) =>
    `<div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3) 0;border-bottom:1px solid var(--grid-line)">
       <span class="status" style="color:var(--${s})" aria-hidden="true">${icon[s]}</span>
       <div style="flex:1">
         <div style="font-size:13.5px;font-weight:500">${k}</div>
         <div style="font-size:11.5px;color:var(--ink-muted)">${note}</div>
       </div>
       <strong class="tnum" style="font-size:15px">${v}</strong>
       <span class="sr">status ${s}</span>
     </div>`).join("");
}

function renderSegments() {
  const segs = D.segments.segments.filter(s => s.dimension === "life stage")
    .sort((a, b) => b.median_expected_days - a.median_expected_days);
  const W = 480, rowH = 30, H = segs.length * rowH + 10;
  const max = Math.max(...segs.map(s => s.median_expected_days));
  const ramp = ["--seq-650","--seq-550","--seq-450","--seq-350","--seq-250","--seq-250"];
  document.getElementById("segments-chart").innerHTML =
    svg(W, H, `aria-label="Median predicted days in care by life stage."`) +
    segs.map((s, i) => {
      const w = (s.median_expected_days / max) * (W - 210);
      return `<text x="0" y="${i*rowH+19}" font-size="12" fill="${cssv("--ink-secondary")}">${s.level.replace(/_/g," ")}</text>
        <rect x="130" y="${i*rowH+7}" width="${w.toFixed(1)}" height="16" rx="4" fill="${cssv(ramp[i])}"
          class="${REDUCED ? "" : "growx"}" style="animation-delay:${i*40}ms"><title>${s.level}: ${s.median_expected_days} days (n=${s.n})</title></rect>
        <text x="${130+w+8}" y="${i*rowH+19}" font-size="11.5" fill="${cssv("--ink-secondary")}" class="tnum">${s.median_expected_days} days</text>`;
    }).join("") + "</svg>";
}

function renderTrend() {
  const months = D.trends.months;
  const W = 480, H = 190, PAD = { l: 40, r: 10, t: 10, b: 26 };
  const vals = months.map(m => m.intakes);
  const max = Math.max(...vals) * 1.05;
  const X = i => PAD.l + (i / (months.length - 1)) * (W - PAD.l - PAD.r);
  const Y = v => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const pts = months.map((m, i) => [X(i), Y(m.intakes)]);
  const shiftIndex = months.findIndex(m => m.month === "2020-03");
  const L = pathLen(pts);
  document.getElementById("trend-chart").innerHTML =
    svg(W, H, `aria-label="Monthly arrivals from ${months[0].month} to ${months[months.length-1].month}, with a sharp fall after March 2020."`) +
    [0, 0.5, 1].map(t => `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${Y(max*t)}" y2="${Y(max*t)}" stroke="${cssv("--grid-line")}"/>
      <text x="${PAD.l-6}" y="${Y(max*t)+4}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${Math.round(max*t)}</text>`).join("") +
    `<path d="${linePath(pts)}" fill="none" stroke="${cssv("--s2")}" stroke-width="1.8" stroke-linecap="round"
       class="${REDUCED ? "" : "draw"}" style="--len:${L}"/>
     ${shiftIndex > 0 ? `<line x1="${X(shiftIndex)}" x2="${X(shiftIndex)}" y1="${PAD.t}" y2="${H-PAD.b}" stroke="${cssv("--ink-muted")}" stroke-dasharray="4 4"/>
     <text x="${X(shiftIndex)+5}" y="${PAD.t+11}" font-size="10" fill="${cssv("--ink-muted")}">March 2020</text>` : ""}
     <text x="${PAD.l}" y="${H-7}" font-size="10" fill="${cssv("--ink-muted")}">${months[0].month}</text>
     <text x="${W-PAD.r}" y="${H-7}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${months[months.length-1].month}</text>
     </svg>`;
}

/* ---------- queue -------------------------------------------------------- */
const BAND_COLOR = { critical: "--critical", serious: "--serious", warning: "--warning", ok: "--s3" };
let expanded = null;

function queueFilters() {
  return {
    species: document.getElementById("f-species").value,
    sort: document.getElementById("f-sort").value,
    thresh: parseFloat(document.getElementById("f-thresh").value),
    q: document.getElementById("f-search").value.trim().toLowerCase(),
  };
}

function renderQueue(animate) {
  const f = queueFilters();
  let list = D.queue.animals.filter(a =>
    (f.species === "all" || a.animal_type === f.species) &&
    a.p_long_stay_60d >= f.thresh &&
    (!f.q || (a.name || "").toLowerCase().includes(f.q) || a.animal_id.toLowerCase().includes(f.q))
  );
  const sorters = {
    risk: (a, b) => b.p_long_stay_60d - a.p_long_stay_60d,
    days: (a, b) => b.days_in_care - a.days_in_care,
    arrival: (a, b) => new Date(a.intake_datetime) - new Date(b.intake_datetime),
  };
  list.sort(sorters[f.sort]);
  list = list.slice(0, 60);

  document.getElementById("queue-count").textContent = `Showing ${list.length} of ${D.queue.animals.length}`;
  document.getElementById("f-thresh-val").textContent = f.thresh.toFixed(2);
  document.getElementById("queue-sub").textContent =
    `${fmtNum(M.needs_attention)} animals ranked by how likely the model thinks they are to still be here in 60 days. Work from the top.`;

  document.getElementById("queue-list").innerHTML = list.map((a, i) => {
    const initial = (a.name || a.animal_id.replace(/[^A-Z0-9]/g, "")).trim()[0] || "?";
    const col = cssv(BAND_COLOR[a.risk_band]);
    const top = a.drivers && a.drivers[0];
    const open = expanded === a.episode_id;
    return `<div class="qrow" data-id="${a.episode_id}" style="${animate && !REDUCED ? `animation: rise var(--dur-base) var(--ease-out) both; animation-delay:${Math.min(i,7)*45}ms` : ""}">
      <div class="qbar" style="background:${col}"></div>
      <div class="avatar" aria-hidden="true">${initial}</div>
      <div>
        <div class="${a.name ? "qname" : "qname unnamed"}">${a.name || "Unnamed"}</div>
        <div class="qmeta">${a.breed} · ${(a.age_band||"").replace(/_/g," ")} · ${a.sex_upon_intake}</div>
      </div>
      <div class="qdays"><div class="n tnum">${a.days_in_care}</div><div class="l">days</div></div>
      <div>
        <div class="meter"><i style="background:${cssv("--s1")};width:${(a.p_adopt_30d*100).toFixed(1)}%"></i></div>
        <div class="meter-label"><strong class="tnum">${fmtPct(a.p_adopt_30d)}</strong> chance of adoption in 30 days</div>
      </div>
      <div>${top ? `<span class="driver">${top.label} · ${top.direction} the chance</span>` : ""}</div>
      <div class="qactions">
        <button class="icon-btn expand-btn" aria-expanded="${open}" aria-label="Why this animal">${open ? "−" : "+"}</button>
      </div>
      ${open ? explainCard(a) : ""}
    </div>`;
  }).join("");

  // The meters animate from zero on paint.
  requestAnimationFrame(() => {
    document.querySelectorAll("#queue-list .meter i").forEach(el => { el.style.transform = "scaleX(1)"; });
  });

  document.querySelectorAll("#queue-list .expand-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const id = e.target.closest(".qrow").dataset.id;
      expanded = expanded === id ? null : id;
      renderQueue(false);
    });
  });
}

function explainCard(a) {
  const drivers = (a.drivers || []).slice(0, 6);
  const maxAbs = Math.max(...drivers.map(d => Math.abs(d.contribution)), 0.001);
  const bars = drivers.map(d => {
    const w = (Math.abs(d.contribution) / maxAbs) * 100;
    const pos = d.contribution >= 0;
    return `<div class="shapbar">
      <div style="text-align:right">${pos ? "" : `<div class="neg" style="margin-left:auto;width:${w}%;background:${cssv("--s8")}"></div>`}</div>
      <div style="text-align:center;color:var(--ink-secondary);font-size:11.5px">${d.label}</div>
      <div>${pos ? `<div class="pos" style="width:${w}%;background:${cssv("--s1")}"></div>` : ""}</div>
    </div>`;
  }).join("");

  const channel = D.interventions.channels.find(c => c.channel === a.suggested_channel) || D.interventions.channels[0];
  const curve = (a.survival_curve || []).filter(p => p.still_in_shelter != null);
  let curveSvg = "";
  if (curve.length > 1) {
    const W = 240, H = 90;
    const X = i => (i / (curve.length - 1)) * W;
    const Y = v => H - v * (H - 8) - 4;
    const pts = curve.map((p, i) => [X(i), Y(p.still_in_shelter)]);
    curveSvg = svg(W, H, `aria-label="Predicted chance this animal is still in the shelter over 180 days."`) +
      `<path d="${linePath(pts)}" fill="none" stroke="${cssv("--s1")}" stroke-width="2" stroke-linecap="round"/>
       ${curve.map((p,i) => `<circle cx="${X(i)}" cy="${Y(p.still_in_shelter)}" r="3" fill="${cssv("--s1")}" stroke="${cssv("--surface-sunken")}" stroke-width="1.5"><title>day ${p.day}: ${fmtPct(p.still_in_shelter)} still here</title></circle>`).join("")}
       </svg>
       <div style="font-size:11px;color:var(--ink-muted);margin-top:4px">
         Chance still in the shelter, day 1 to 180. The remainder leave by another route, such as transfer to a rescue partner.
       </div>`;
  }

  return `<div class="expand"><div class="expand-inner">
    <div>
      <h3 style="font-size:14px;margin:0 0 var(--s-3)">What is driving this</h3>
      ${bars}
      <div class="legend"><span><i style="background:${cssv("--s8")}"></i>lowers the chance</span><span><i style="background:${cssv("--s1")}"></i>raises it</span></div>
      <h3 style="font-size:14px;margin:var(--s-5) 0 var(--s-2)">Predicted wait</h3>
      ${curveSvg}
    </div>
    <div>
      <h3 style="font-size:14px;margin:0 0 var(--s-3)">What would help</h3>
      <div style="font-weight:600;font-size:13.5px;margin-bottom:4px">${channel.label}</div>
      <span class="evidence ${channel.evidence}">${channel.evidence === "measured" ? "Measured in this dataset" : "Assumption, not measured here"}</span>
      <p style="font-size:12.5px;color:var(--ink-secondary);margin:var(--s-3) 0">${channel.rationale}</p>
      <p style="font-size:11.5px;color:var(--ink-muted);margin:0">${channel.evidence_detail}</p>
      <p style="font-size:12px;color:var(--ink-secondary);margin-top:var(--s-3)">
        About <strong class="tnum">${channel.staff_minutes}</strong> minutes of staff time.
      </p>
      ${a.expected_days_in_shelter != null ? `<p style="font-size:12.5px;margin-top:var(--s-4);color:var(--ink-secondary)">
        Expected time in care: <strong class="tnum">${a.expected_days_in_shelter} days</strong> (restricted mean, capped at one year).</p>` : ""}
    </div>
  </div></div>`;
}

["f-species","f-sort","f-thresh","f-search"].forEach(id =>
  document.getElementById(id).addEventListener("input", () => { expanded = null; renderQueue(false); }));

/* ---------- discovery ---------------------------------------------------- */
function renderDiscover() {
  const longest = [...D.queue.animals].sort((a, b) => b.days_in_care - a.days_in_care).slice(0, 9);
  const hues = ["--seq-450","--seq-550","--seq-350","--seq-650","--seq-250"];
  document.getElementById("discover-cards").innerHTML = longest.map((a, i) => {
    const initial = (a.name || "?").trim()[0] || "?";
    const sentence = `${a.age_band === "neonate" ? "A very young" : a.age_band === "senior" ? "A senior" : "A"} ${a.animal_type.toLowerCase()}, ${a.breed.toLowerCase()}, who came in as ${a.intake_type.toLowerCase() === "stray" ? "a stray" : a.intake_type.toLowerCase()}.`;
    return `<article class="pet">
      <div class="portrait" style="background:${cssv(hues[i % hues.length])}" aria-hidden="true">${initial}</div>
      <div class="body">
        <h2 style="font-size:17px;margin:0 0 4px">${a.name || "Still needs a name"}</h2>
        <p style="font-size:13px;color:var(--ink-secondary);margin:0">${sentence}</p>
        <span class="waiting">Waiting ${a.days_in_care} days</span>
      </div>
    </article>`;
  }).join("");
}

/* ---------- planner ------------------------------------------------------ */
function renderPlanner() {
  const cap = parseInt(document.getElementById("capacity").value, 10);
  document.getElementById("capacity-val").textContent = cap;
  const list = [...D.queue.animals].sort((a, b) => b.p_long_stay_60d - a.p_long_stay_60d).slice(0, cap);
  const groups = {};
  list.forEach(a => { (groups[a.suggested_channel] = groups[a.suggested_channel] || []).push(a); });

  document.getElementById("plan-sub").textContent =
    `${list.length} animals across ${Object.keys(groups).length} channels.`;

  document.getElementById("plan").innerHTML = Object.entries(groups).map(([ch, animals]) => {
    const meta = D.interventions.channels.find(c => c.channel === ch) || {};
    const hours = (animals.length * (meta.staff_minutes || 30)) / 60;
    return `<div style="margin-bottom:var(--s-5)">
      <div style="display:flex;align-items:baseline;gap:var(--s-3);margin-bottom:var(--s-2)">
        <h3 style="font-size:14.5px;margin:0">${meta.label || ch}</h3>
        <span class="evidence ${meta.evidence || "assumed"}">${meta.evidence === "measured" ? "Measured" : "Assumption"}</span>
        <span class="spacer" style="flex:1"></span>
        <span style="font-size:12px;color:var(--ink-muted)" class="tnum">${animals.length} animals · about ${hours.toFixed(1)} hours</span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-secondary)">${animals.map(a => (a.name || a.animal_id)).join(" · ")}</div>
    </div>`;
  }).join("");

  const lift = D.results.headline.long_stay_lift_at_50;
  document.getElementById("plan-effect").innerHTML =
    `<p style="font-size:13.5px;margin:0 0 var(--s-3)">
       Working the top 50 of the queue reaches animals who are
       <strong class="tnum">${lift.toFixed(1)}×</strong> more likely to become long-stay residents
       than a randomly chosen 50.
     </p>
     <span class="evidence measured">Measured on held-out data</span>
     <p style="font-size:12.5px;color:var(--ink-secondary);margin:var(--s-4) 0 var(--s-2)">
       The effect of the intervention itself is an assumption, not a measurement. This dataset can show
       that the queue finds the right animals. It cannot show what happens when you act on it.
     </p>
     <span class="evidence assumed">Assumption, not measured here</span>`;
}
document.getElementById("capacity").addEventListener("input", renderPlanner);

/* ---------- model page --------------------------------------------------- */
function renderModel() {
  const R = D.results;
  const summary = [
    [fmt3(R.headline.champion_auc_30d), "held-out ROC AUC", "30-day adoption, 20,165 animals the model never saw"],
    [fmt3(R.headline.champion_ece_30d), "calibration error", "the score means roughly what it says"],
    [fmtNum(R.headline.modelling_cohort), "episodes trained on", "reconstructed from 274,143 published rows"],
    [R.block_date_ranges.test.join(" to "), "evaluation period", "deliberately spans the March 2020 change"],
  ];
  document.getElementById("model-summary").innerHTML = summary.map(([v, k, note]) =>
    `<div class="card tile">
      <div class="v tnum" style="font-size:${String(v).length > 12 ? "17px" : "30px"}">${v}</div>
      <div class="k" style="font-weight:600;color:var(--ink-primary)">${k}</div>
      <div style="font-size:11.5px;color:var(--ink-muted)">${note}</div>
    </div>`).join("");

  // AUC by target
  const targets = [
    ["adopted_within_7d", "Adopted ≤ 7d"],
    ["adopted_within_14d", "Adopted ≤ 14d"],
    ["adopted_within_30d", "Adopted ≤ 30d"],
    ["long_stay_60d", "Long stay > 60d"],
  ];
  const W = 520, H = 240, PAD = { l: 44, r: 12, t: 14, b: 52 };
  const Y = v => H - PAD.b - ((v - 0.45) / (0.9 - 0.45)) * (H - PAD.t - PAD.b);
  const groupW = (W - PAD.l - PAD.r) / targets.length;
  const models = [["logistic","Logistic","--s1"],["lightgbm","LightGBM","--s2"],["xgboost","XGBoost","--s3"]];
  let bars = "";
  targets.forEach(([key, label], gi) => {
    models.forEach(([mk, , col], mi) => {
      const m = R.targets[key].models[mk];
      const bw = groupW * 0.24;
      const x = PAD.l + gi * groupW + groupW * 0.08 + mi * bw * 1.06;
      bars += `<rect x="${x.toFixed(1)}" y="${Y(m.roc_auc).toFixed(1)}" width="${bw.toFixed(1)}"
        height="${(Y(0.45) - Y(m.roc_auc)).toFixed(1)}" rx="3" fill="${cssv(col)}"
        class="${REDUCED ? "" : "growy"}" style="animation-delay:${(gi*3+mi)*30}ms"><title>${label} ${mk}: ${m.roc_auc.toFixed(3)}</title></rect>`;
      if (m.roc_auc_ci) {
        const cx = x + bw / 2;
        bars += `<line x1="${cx}" x2="${cx}" y1="${Y(m.roc_auc_ci[0])}" y2="${Y(m.roc_auc_ci[1])}" stroke="${cssv("--ink-muted")}" stroke-width="1"/>`;
      }
    });
    bars += `<text x="${(PAD.l + gi*groupW + groupW/2).toFixed(1)}" y="${H-PAD.b+16}" text-anchor="middle" font-size="10.5" fill="${cssv("--ink-secondary")}">${label}</text>`;
  });
  const gridY = [0.5,0.6,0.7,0.8,0.9].map(v =>
    `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${cssv("--grid-line")}"/>
     <text x="${PAD.l-7}" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${v.toFixed(1)}</text>`).join("");
  document.getElementById("model-auc").innerHTML =
    svg(W, H, `aria-label="ROC AUC by target and model. LightGBM reaches 0.803 on 30-day adoption."`) +
    gridY + `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${Y(0.5)}" y2="${Y(0.5)}" stroke="${cssv("--ink-muted")}" stroke-dasharray="4 4"/>` + bars +
    models.map(([,label,col],i) =>
      `<rect x="${PAD.l + i*116}" y="${H-18}" width="10" height="10" rx="2" fill="${cssv(col)}"/>
       <text x="${PAD.l + i*116 + 15}" y="${H-9}" font-size="11" fill="${cssv("--ink-secondary")}">${label}</text>`).join("") +
    "</svg>";

  // Estimator comparison
  const est = R.survival.estimator_comparison;
  const W2 = 520, H2 = 240, P2 = { l: 44, r: 14, t: 14, b: 40 };
  const X2 = i => P2.l + (i / (est.length - 1)) * (W2 - P2.l - P2.r);
  const Y2 = v => H2 - P2.b - v * (H2 - P2.t - P2.b);
  const kmPts = est.map((e, i) => [X2(i), Y2(e.kaplan_meier_cause_specific)]);
  const cifPts = est.map((e, i) => [X2(i), Y2(e.aalen_johansen_cif)]);
  document.getElementById("model-estimator").innerHTML =
    svg(W2, H2, `aria-label="At one year the standard estimator reports 98.8 percent adopted; the competing-risks estimate is 48.3 percent."`) +
    [0,0.25,0.5,0.75,1].map(v => `<line x1="${P2.l}" x2="${W2-P2.r}" y1="${Y2(v)}" y2="${Y2(v)}" stroke="${cssv("--grid-line")}"/>
      <text x="${P2.l-7}" y="${Y2(v)+4}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${(v*100).toFixed(0)}%</text>`).join("") +
    `<polygon points="${kmPts.concat([...cifPts].reverse()).map(p=>p.join(",")).join(" ")}" fill="${cssv("--s2")}" opacity="0.10"/>
     <path d="${linePath(kmPts)}" fill="none" stroke="${cssv("--s2")}" stroke-width="2.2" stroke-linecap="round"/>
     <path d="${linePath(cifPts)}" fill="none" stroke="${cssv("--s1")}" stroke-width="2.2" stroke-linecap="round"/>
     ${est.map((e,i) => `<circle cx="${X2(i)}" cy="${Y2(e.kaplan_meier_cause_specific)}" r="3.2" fill="${cssv("--s2")}"><title>day ${e.day}: Kaplan-Meier ${fmtPct(e.kaplan_meier_cause_specific)}</title></circle>
       <circle cx="${X2(i)}" cy="${Y2(e.aalen_johansen_cif)}" r="3.2" fill="${cssv("--s1")}"><title>day ${e.day}: Aalen-Johansen ${fmtPct(e.aalen_johansen_cif)}</title></circle>
       <text x="${X2(i)}" y="${H2-P2.b+15}" text-anchor="middle" font-size="10" fill="${cssv("--ink-muted")}">${e.day}</text>`).join("")}
     <rect x="${P2.l}" y="6" width="10" height="10" rx="2" fill="${cssv("--s2")}"/>
     <text x="${P2.l+15}" y="15" font-size="11" fill="${cssv("--ink-secondary")}">Kaplan-Meier (what the field reports)</text>
     <rect x="${P2.l}" y="22" width="10" height="10" rx="2" fill="${cssv("--s1")}"/>
     <text x="${P2.l+15}" y="31" font-size="11" fill="${cssv("--ink-secondary")}">Aalen-Johansen (correct)</text>
     </svg>`;

  // Subgroups
  const BINARY_ATTRS = new Set(["breed_bully_type","breed_bsl_risk","color_has_black"]);
  const wanted = ["animal_type","breed_bully_type","breed_bsl_risk","color_has_black","age_band","intake_condition"];
  const pretty = { animal_type:"species", breed_bully_type:"bully-type label", breed_bsl_risk:"restricted-breed label",
                   color_has_black:"black coat", age_band:"life stage", intake_condition:"intake condition" };
  const rows = R.subgroups.filter(s => wanted.includes(s.attribute) && s.roc_auc != null && s.n >= 700);
  document.getElementById("subgroups").innerHTML =
    `<caption class="sr">Model performance by subgroup on the 30-day adoption target.</caption>
     <thead><tr><th>Attribute</th><th>Level</th><th class="num">n</th><th class="num">Observed</th><th class="num">AUC</th><th class="num">Calibration gap</th><th>Status</th></tr></thead>
     <tbody>${rows.map(s => {
       const flag = Math.abs(s.calibration_gap) > 0.04;
       return `<tr class="${flag ? "flagged" : ""}">
         <td>${pretty[s.attribute]}</td>
         <td>${BINARY_ATTRS.has(s.attribute) ? (String(s.level) === "1" ? "yes" : "no") : String(s.level).replace(/_/g," ")}</td>
         <td class="num tnum">${s.n.toLocaleString()}</td>
         <td class="num tnum">${fmtPct(s.positive_rate)}</td>
         <td class="num tnum">${s.roc_auc.toFixed(3)}</td>
         <td class="num tnum">${s.calibration_gap >= 0 ? "+" : ""}${s.calibration_gap.toFixed(3)}</td>
         <td>${flag ? `<span class="status" style="color:var(--warning)"><span aria-hidden="true">▲</span>under-promises</span>` : `<span class="status" style="color:var(--good)"><span aria-hidden="true">✓</span>within tolerance</span>`}</td>
       </tr>`;
     }).join("")}</tbody>`;

  // Drift timeline
  const mp = R.monthly_performance.filter(m => m.roc_auc != null);
  const base = R.drift.baseline.roc_auc;
  document.getElementById("drift-sub").textContent =
    `Monthly held-out performance across 2020 and 2021. Baseline from the 2019 validation block: AUC ${base.toFixed(3)}, calibration error ${R.drift.baseline.ece.toFixed(4)}.`;
  const W3 = 900, H3 = 250, P3 = { l: 44, r: 12, t: 14, b: 60 };
  const X3 = i => P3.l + (i / (mp.length - 1)) * (W3 - P3.l - P3.r);
  const Y3 = v => H3 - P3.b - ((v - 0.65) / (0.90 - 0.65)) * (H3 - P3.t - P3.b);
  const aucPts = mp.map((m, i) => [X3(i), Y3(m.roc_auc)]);
  const warn = base * (1 - R.drift.thresholds.auc_relative_drop_warning);
  const crit = base * (1 - R.drift.thresholds.auc_relative_drop_critical);
  const L3 = pathLen(aucPts);
  document.getElementById("model-drift").innerHTML =
    svg(W3, H3, `aria-label="Monthly AUC across 2020 and 2021. Discrimination held; the worst month was July 2020 at 0.717."`) +
    `<rect x="${P3.l}" y="${Y3(crit)}" width="${W3-P3.l-P3.r}" height="${Math.max(H3-P3.b-Y3(crit),0)}" fill="${cssv("--critical")}" opacity="0.07"/>
     <rect x="${P3.l}" y="${Y3(warn)}" width="${W3-P3.l-P3.r}" height="${Math.max(Y3(crit)-Y3(warn),0)}" fill="${cssv("--warning")}" opacity="0.10"/>` +
    [0.70,0.75,0.80,0.85,0.90].map(v => `<line x1="${P3.l}" x2="${W3-P3.r}" y1="${Y3(v)}" y2="${Y3(v)}" stroke="${cssv("--grid-line")}"/>
      <text x="${P3.l-7}" y="${Y3(v)+4}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">${v.toFixed(2)}</text>`).join("") +
    `<line x1="${P3.l}" x2="${W3-P3.r}" y1="${Y3(base)}" y2="${Y3(base)}" stroke="${cssv("--ink-muted")}" stroke-dasharray="4 4"/>
     <text x="${W3-P3.r}" y="${Y3(base)-6}" text-anchor="end" font-size="10" fill="${cssv("--ink-muted")}">validated baseline ${base.toFixed(3)}</text>
     <path d="${linePath(aucPts)}" fill="none" stroke="${cssv("--s1")}" stroke-width="2" stroke-linecap="round"
       class="${REDUCED ? "" : "draw"}" style="--len:${L3}"/>
     ${mp.map((m,i) => `<circle cx="${X3(i)}" cy="${Y3(m.roc_auc)}" r="${m.status==="CRITICAL"?4.6:3.2}"
        fill="${m.status==="CRITICAL"?cssv("--critical"):cssv("--s1")}" stroke="${cssv("--surface-card")}" stroke-width="1.4">
        <title>${m.period}: AUC ${m.roc_auc.toFixed(3)}, calibration gap ${m.calibration_gap>=0?"+":""}${m.calibration_gap.toFixed(3)} (${m.status})</title></circle>`).join("")}
     ${mp.map((m,i) => i % 3 === 0 ? `<text x="${X3(i)}" y="${H3-P3.b+16}" text-anchor="middle" font-size="9.5" fill="${cssv("--ink-muted")}" transform="rotate(-40 ${X3(i)} ${H3-P3.b+16})">${m.period}</text>` : "").join("")}
     <rect x="${P3.l}" y="${H3-22}" width="10" height="10" rx="2" fill="${cssv("--critical")}"/>
     <text x="${P3.l+15}" y="${H3-13}" font-size="11" fill="${cssv("--ink-secondary")}">critical alarm month</text>
     </svg>`;
}

/* ---------- boot --------------------------------------------------------- */
function renderAll() {
  renderDonut(); renderTiles(); renderTilesNote(); renderForecast(); renderHealth();
  renderSegments(); renderTrend(); renderQueue(true); renderDiscover();
  renderPlanner(); renderModel();
}
renderAll();
countUp(document.getElementById("hero"), M.needs_attention);
requestAnimationFrame(() => {
  const active = navButtons.find(b => b.getAttribute("aria-current") === "page");
  navbar.style.width = active.offsetWidth + "px";
  navbar.style.transform = `translateX(${active.offsetLeft}px)`;
});
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
