#!/usr/bin/env bash
# The quickstart again, this time through the `secondchance` command line tool.
#
# Four commands, each a thin wrapper over the library (src/secondchance/cli.py):
#
#   audit   data-quality counts for the episode pairing
#   build   episodes + intake-time feature matrix  -> parquet
#   train   fit, calibrate and evaluate one target -> joblib bundle
#   score   score a cohort with that bundle        -> parquet of probabilities
#
# Runs on the committed sample data in under a minute. Every output goes to
# results/quickstart_cli/, which is gitignored along with the rest of results/.
#
# Usage:
#   bash bin/quickstart_cli.sh                      # adopted_within_30d with LightGBM
#   TARGET=long_stay_60d MODEL=logistic bash bin/quickstart_cli.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INTAKES="${INTAKES:-data/sample/aac_intakes_sample.csv}"
OUTCOMES="${OUTCOMES:-data/sample/aac_outcomes_sample.csv}"
TARGET="${TARGET:-adopted_within_30d}"
MODEL="${MODEL:-lightgbm}"
OUT="results/quickstart_cli"
mkdir -p "$OUT"

# Use the installed console script when `pip install -e .` has been run,
# otherwise run the same module straight from the source tree.
if command -v secondchance >/dev/null 2>&1; then
  SC=(secondchance)
else
  export PYTHONPATH="$ROOT/src${PYTHONPATH:+:$PYTHONPATH}"
  SC=(python3 -m secondchance.cli)
fi

echo "== 1/4 audit: how cleanly do the intake and outcome logs pair up?"
"${SC[@]}" audit --intakes "$INTAKES" --outcomes "$OUTCOMES"

echo
echo "== 2/4 build: episodes and the intake-time feature matrix"
"${SC[@]}" build --intakes "$INTAKES" --outcomes "$OUTCOMES" \
  --output "$OUT/features.parquet" --audit-output "$OUT/episode_audit.json"

echo
echo "== 3/4 train: $MODEL on $TARGET (train < 2019, calibrate 2019, test 2020-21)"
"${SC[@]}" train --features "$OUT/features.parquet" --target "$TARGET" --model "$MODEL" \
  --output "$OUT/${TARGET}_${MODEL}.joblib"

echo
echo "== 4/4 score: write a probability for every episode"
"${SC[@]}" score --model "$OUT/${TARGET}_${MODEL}.joblib" --features "$OUT/features.parquet" \
  --output "$OUT/${TARGET}_predictions.parquet"

echo
echo "Outputs in $OUT/:"
ls -1 "$OUT"
