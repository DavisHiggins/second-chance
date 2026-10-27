# bin/ — example code

Runnable examples of how to use SecondChance. Each one runs from the repository
root on the small committed sample in [`data/sample/`](../data/sample) and
finishes in seconds. Every script also accepts `--intakes` and `--outcomes`, so
the same code runs on the full City of Austin archive once it is downloaded.

| Script | What it shows | Run it |
|---|---|---|
| [`quickstart.py`](quickstart.py) | **Start here.** The whole modelling pipeline on a small dataset: episodes → labels → features → cohort → temporal split → fit → calibrate → evaluate → ranked support queue | `python bin/quickstart.py` |
| [`quickstart_cli.sh`](quickstart_cli.sh) | The same pipeline through the `secondchance` command line tool: `audit`, `build`, `train`, `score` | `bash bin/quickstart_cli.sh` |
| [`survival_example.py`](survival_example.py) | Time to adoption with competing risks: Kaplan-Meier vs. Aalen-Johansen, and why the naive curve overstates adoption | `python bin/survival_example.py` |
| [`drift_example.py`](drift_example.py) | Population stability index and KS checks between the calibration year and a later year | `python bin/drift_example.py` |
| [`make_sample_data.py`](make_sample_data.py) | Regenerates the synthetic sample in `data/sample/` (seeded, byte-identical every run) | `python bin/make_sample_data.py` |

## Options

```bash
python bin/quickstart.py --target long_stay_60d          # adopted_within_7d | _14d | _30d | long_stay_60d
python bin/quickstart.py --model logistic                # prior | logistic | lightgbm | xgboost
python bin/quickstart.py --output-dir /tmp/sc            # where the model and queue are written
TARGET=long_stay_60d MODEL=logistic bash bin/quickstart_cli.sh
python bin/drift_example.py --reference-year 2019 --current-year 2020
python bin/make_sample_data.py --intakes 1500 --output-dir /tmp/sample
```

## About the sample data

`data/sample/aac_intakes_sample.csv` and `aac_outcomes_sample.csv` (about 3,200
intakes, 2016 to March 2022) are **synthetic**. They have exactly the columns,
value formats and timestamp format of the Austin Socrata export, so every loader
and model runs on them unchanged, and the generator plants a plausible signal
(age, intake condition, species and breed label affect the wait) so the models
have something real to learn. No row describes a real animal; use them to run
the code, never to quote findings. The paper's numbers come from the real
archive via `make all`.

Outputs go to `results/quickstart/` and `results/quickstart_cli/`, which are
gitignored.

## Expected output

`python bin/quickstart.py` (LightGBM, `adopted_within_30d`) prints, in about one second:

```
[1-3] 3,179 intakes + 3,140 outcomes -> 3,179 episodes (39 still open at the cutoff)
[4-5] 56 intake-time feature columns; cohort of 2,987 cat and dog episodes (192 excluded)
[6]   split: train 1,459, valid 438, test 994
[7-8] lightgbm on adopted_within_30d, held-out test block:
        n              994
        positive_rate  0.6046
        roc_auc        0.7254
        ...
```

Exact figures can differ slightly across library versions.
