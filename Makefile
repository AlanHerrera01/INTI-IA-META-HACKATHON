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
	cd apps/frontend && npm test
lint:
	$(PYTHON) -m ruff check apps/backend
	$(PYTHON) -m ruff format --check apps/backend
	cd apps/backend && $(PYTHON) -m mypy
	cd apps/frontend && npm run lint && npm run typecheck
build:
	docker compose build
