.PHONY: install migrate probe ingest ingest-mock backfill-mock recompute serve schedule test

PY ?= python

install:
	$(PY) -m pip install -r requirements.txt

migrate:
	$(PY) -m shopee_aff.db

probe:            ## step 1: prove a live signed pull works
	$(PY) scripts/probe_api.py --pages 1

ingest:           ## pull today's snapshot from the live API
	$(PY) -m shopee_aff.ingest

ingest-mock:
	$(PY) -m shopee_aff.ingest --mock

backfill-mock:    ## 10 days of synthetic history for the dashboard
	$(PY) -m shopee_aff.ingest --backfill-mock 10

recompute:        ## recompute metrics/signals for today after tuning thresholds
	$(PY) -m shopee_aff.ingest --recompute

serve:
	$(PY) -m uvicorn shopee_aff.api:app --host 127.0.0.1 --port 8000 --reload

schedule:         ## standalone scheduler (if not running inside the API)
	$(PY) -m shopee_aff.scheduler

test:
	$(PY) -m pytest -q
