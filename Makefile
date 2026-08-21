# Cricket Analytics - build and development tasks.
#
# The pipeline uses only the Python standard library, so there is nothing to
# install. `make serve` needs nothing beyond Python either.

PYTHON ?= python3
PORT   ?= 8000
FORMATS ?= test odi t20i

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: serve
serve: ## Serve the site at http://localhost:8000
	@echo "Serving web/ on http://localhost:$(PORT)  (Ctrl-C to stop)"
	@cd web && $(PYTHON) -m http.server $(PORT)

.PHONY: seed
seed: ## Build the simulated demo dataset (no network needed)
	$(PYTHON) -m pipeline seed

.PHONY: fetch
fetch: ## Download the Cricsheet ball-by-ball archives
	$(PYTHON) -m pipeline fetch --formats $(FORMATS)

.PHONY: build
build: ## Aggregate, analyse and export the real dataset
	$(PYTHON) -m pipeline build --formats $(FORMATS)

.PHONY: data
data: fetch build ## Fetch then build the real dataset

.PHONY: enrich
enrich: ## Resolve bowling styles from ESPNcricinfo profiles (opt-in, robots-gated)
	$(PYTHON) -m pipeline enrich --formats $(FORMATS) --source espncricinfo

.PHONY: rankings
rankings: ## Fetch ICC player rankings (opt-in)
	$(PYTHON) -m pipeline rankings

.PHONY: test
test: test-py test-js ## Run every test

.PHONY: test-py
test-py: ## Run the Python pipeline tests
	$(PYTHON) -m unittest discover -s tests -p "test_*.py" -v

.PHONY: test-js
test-js: ## Run the JavaScript analysis tests
	node --test tests/js/*.test.mjs

.PHONY: check
check: ## Verify the dataset the site will load
	@$(PYTHON) scripts/check_dataset.py

.PHONY: clean
clean: ## Remove the generated dataset
	rm -rf web/data/players web/data/*.json

.PHONY: clean-cache
clean-cache: ## Remove downloaded archives and cached pages
	rm -rf .cache
