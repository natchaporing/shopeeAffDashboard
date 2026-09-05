"""Daily pull scheduler (APScheduler). Runs in-process with the API, or standalone.

Standalone:  python -m shopee_aff.scheduler
System cron alternative (set INGEST_ENABLED=0 and use):
    30 6 * * *  cd /path/to/repo && /path/to/python -m shopee_aff.ingest >> data/ingest.log 2>&1
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import Settings, get_settings
from .ingest import run_ingest

log = logging.getLogger(__name__)


def _job() -> None:
    try:
        log.info("scheduled ingest: %s", run_ingest())
    except Exception:  # noqa: BLE001
        log.exception("scheduled ingest failed")


def build_scheduler(settings: Settings | None = None, blocking: bool = False):
    settings = settings or get_settings()
    sched = BlockingScheduler() if blocking else BackgroundScheduler()
    sched.add_job(
        _job,
        CronTrigger(hour=settings.ingest_hour, minute=settings.ingest_minute),
        id="daily_ingest",
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
    )
    return sched


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = get_settings()
    log.info("standalone scheduler: daily at %02d:%02d, source=%s", s.ingest_hour, s.ingest_minute,
             "mock" if s.shopee_mock else s.endpoint)
    build_scheduler(s, blocking=True).start()
