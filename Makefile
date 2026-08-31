# SecondChance
#
# The whole project, in the order it runs. `make all` reproduces every number in
# the paper from the two raw CSVs, in about 35 minutes on two cores.
#
# Targets are ordered by dependency, and each analysis step writes a JSON or
# parquet artefact that the next one reads. That means a failed step can be fixed
# and rerun on its own rather than starting over, which matters when step 05 takes
# eight minutes.

PYTHON  ?= python3
PIP     ?= $(PYTHON) -m pip
SEED    := 20260820

RAW      := data/raw
INTERIM  := data/interim
RESULTS  := results
TABLES   := $(RESULTS)/tables
FIGURES  := $(RESULTS)/figures

INTAKES  := $(RAW)/aac_intakes_20220304.csv
OUTCOMES := $(RAW)/aac_outcomes_20220304.csv
WEATHER  := $(RAW)/austin_weather_USW00013958.csv

.DEFAULT_GOAL := help
.PHONY: help setup data episodes features train ablations survival interpret drift \
        timefeatures figures export analysis all test lint format typecheck verify check \
        docs deck demo baseline dictionary package clean clean-results

# -----------------------------------------------------------------------------

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup:  ## Install the package and every development dependency
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[analysis,dev,docs]"
	@echo
	@echo "Installed. Run 'make data' next if data/raw is empty, then 'make all'."

data:  ## Download the raw inputs (only needed once)
	@mkdir -p $(RAW) $(INTERIM) $(TABLES) $(FIGURES)
	@test -f $(INTAKES)  || curl -fsSL -o $(INTAKES) \
	  https://raw.githubusercontent.com/bensmith07/aac-classification-project/main/aac_intakes.csv
	@test -f $(OUTCOMES) || curl -fsSL -o $(OUTCOMES) \
	  https://raw.githubusercontent.com/bensmith07/aac-classification-project/main/aac_outcomes.csv
	@test -f $(WEATHER)  || curl -fsSL -o $(WEATHER) \
	  https://media.githubusercontent.com/media/radames/dataset-historical-daily-temperature-210-US/main/USW00013958.csv
	@wc -l $(RAW)/*.csv

# --- the analysis pipeline, in order -----------------------------------------
# Every step below is a plain script with no arguments. They read from data/ and
# write to results/, so the dependency chain is the file system rather than
# anything clever.

episodes: $(INTERIM)/episodes.parquet  ## Reconstruct shelter episodes from the two event logs
$(INTERIM)/episodes.parquet: analysis/01_build_episodes.py $(INTAKES) $(OUTCOMES)
	$(PYTHON) analysis/01_build_episodes.py

features: $(INTERIM)/features.parquet  ## Build the 58-column feature matrix
$(INTERIM)/features.parquet: analysis/02_build_features.py $(INTERIM)/episodes.parquet
	$(PYTHON) analysis/02_build_features.py

train: $(TABLES)/main_results.json  ## Four targets, four models, temporal split
$(TABLES)/main_results.json: analysis/03_train_eval.py $(INTERIM)/features.parquet
	$(PYTHON) analysis/03_train_eval.py

ablations: $(TABLES)/ablations.json  ## Feature blocks, breed strategy, weather, shuffled-label control
$(TABLES)/ablations.json: analysis/04_ablations.py $(TABLES)/main_results.json
	$(PYTHON) analysis/04_ablations.py

survival: $(TABLES)/survival_results.json  ## Kaplan-Meier, Aalen-Johansen, Cox, discrete hazard
$(TABLES)/survival_results.json: analysis/05_survival.py $(INTERIM)/features.parquet
	$(PYTHON) analysis/05_survival.py

interpret: $(TABLES)/interpretability.json  ## SHAP, permutation importance, partial dependence
$(TABLES)/interpretability.json: analysis/06_interpret.py $(TABLES)/main_results.json
	$(PYTHON) analysis/06_interpret.py

drift: $(TABLES)/drift_results.json  ## Drift detection, monitoring simulation, retraining experiment
$(TABLES)/drift_results.json: analysis/07_drift.py $(TABLES)/main_results.json
	$(PYTHON) analysis/07_drift.py

timefeatures: $(TABLES)/time_feature_check.json  ## The monotone calendar-time feature experiment
$(TABLES)/time_feature_check.json: analysis/09_time_features.py $(INTERIM)/features.parquet
	$(PYTHON) analysis/09_time_features.py

figures: $(FIGURES)/fig02_data_funnel.png  ## Every figure in the paper and the deck
$(FIGURES)/fig02_data_funnel.png: analysis/08_figures.py $(TABLES)/survival_results.json $(TABLES)/drift_results.json
	$(PYTHON) analysis/08_figures.py

export: $(RESULTS)/MEASURED_RESULTS.json  ## Assemble MEASURED_RESULTS.json and the website fixtures
$(RESULTS)/MEASURED_RESULTS.json: analysis/10_export.py $(TABLES)/interpretability.json \
                                  $(TABLES)/ablations.json $(TABLES)/time_feature_check.json
	$(PYTHON) analysis/10_export.py

analysis: export  ## Run the whole analysis pipeline
	@echo "Analysis complete. Every number is in $(RESULTS)/MEASURED_RESULTS.json"

# --- deliverables -------------------------------------------------------------

docs: $(RESULTS)/MEASURED_RESULTS.json  ## Build the six PDF deliverables
	$(PYTHON) deliverables/build_docs.py

deck: $(RESULTS)/MEASURED_RESULTS.json  ## Build the presentation
	cd presentation && node build_deck.js

demo: $(RESULTS)/MEASURED_RESULTS.json  ## Build the standalone website demo
	$(PYTHON) website_build_package/build_demo.py

baseline: $(RESULTS)/MEASURED_RESULTS.json  ## Write the monitoring baseline locally, without uploading
	$(PYTHON) scripts/publish_baseline.py --dry-run

dictionary: $(INTERIM)/features.parquet  ## Regenerate docs/04_DATA_DICTIONARY.md from the feature matrix
	$(PYTHON) scripts/build_data_dictionary.py

# --- quality ------------------------------------------------------------------

test:  ## Run the test suite with coverage
	$(PYTHON) -m pytest tests/ --cov=src/secondchance --cov-report=term-missing

lint:  ## Check formatting and style (PEP 8 and PEP 257)
	$(PYTHON) -m ruff check src tests analysis scripts

format:  ## Apply the safe automatic fixes
	$(PYTHON) -m ruff check src tests analysis scripts --fix

typecheck:  ## Static type check
	$(PYTHON) -m mypy src/secondchance

verify:  ## Check every number quoted in the deliverables against the pipeline
	$(PYTHON) scripts/verify_numbers.py --strict
	$(PYTHON) scripts/build_data_dictionary.py --check

check: lint typecheck test verify  ## Everything CI runs

# --- housekeeping -------------------------------------------------------------

package:  ## Zip the whole project for submission
	@zip -qr SecondChance_project.zip . \
	  -x '*.pyc' '*__pycache__*' '.git/*' '.pytest_cache/*' '.ruff_cache/*' \
	     '.coverage' 'node_modules/*' 'SecondChance_project.zip'
	@ls -lh SecondChance_project.zip

clean:  ## Remove caches and build artefacts, keeping results
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache .coverage htmlcov build dist *.egg-info

clean-results:  ## Also remove every derived result. The raw data survives.
	rm -rf $(INTERIM) $(TABLES) $(FIGURES) $(RESULTS)/MEASURED_RESULTS.json
	@echo "Derived results removed. 'make all' rebuilds them from $(RAW)."

all: analysis docs deck demo  ## Reproduce the entire project end to end
	@echo
	@echo "Done. Paper, deck and demo are built from the measured results."
