PYTHON ?= python
.PHONY: setup dev test lint build
setup:
	$(PYTHON) -m pip install -e "apps/backend[dev]"
	$(PYTHON) -m playwright install chromium
	cd apps/frontend && npm ci
dev:
	docker compose up --build
test:
	$(PYTHON) -m pytest apps/backend/tests -m "not e2e" --cov=inti.domain --cov=inti.application --cov-fail-under=80
	$(PYTHON) scripts/benchmark_planning.py --output artifacts/policy-benchmark.json
	cd apps/frontend && npm test
lint:
	$(PYTHON) -m ruff check apps/backend scripts
	$(PYTHON) -m ruff format --check apps/backend scripts
	cd apps/backend && $(PYTHON) -m mypy
	cd apps/frontend && npm run lint && npm run typecheck
build:
	docker compose build
