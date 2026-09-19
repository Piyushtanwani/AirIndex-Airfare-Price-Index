"""Scheduled collection.

Runs the collector once a day at a configured time, then the pipeline, then logs the
result. Off by default: a scheduler that starts itself inside an API process is a
surprise, and in any real deployment the collector belongs in its own container or under
the system's own scheduler.

    python -m collector.scheduler          run the scheduler in the foreground
    SCHEDULER_ENABLED=true                 let the API process host it as well
"""

from __future__ import annotations

import datetime as dt
import logging
import signal
import sys

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.db.session import init_db, session_scope

logger = logging.getLogger("airindex.scheduler")


def run_cycle() -> dict[str, object]:
    """One collection followed by one pipeline run.

    Exceptions are caught and logged rather than raised. A scheduled job that dies takes
    the schedule with it, and a collector that stops silently is the failure this project
    is most exposed to.
    """
    from collector.runner import Collector
    from engine.pipeline import run_full_pipeline

    started = dt.datetime.now()
    outcome: dict[str, object] = {"started": started.isoformat()}

    try:
        with session_scope() as session:
            summaries = Collector(session).run()
        outcome["collection"] = [s.as_dict() for s in summaries]
        logger.info("Collection finished: %s", outcome["collection"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("Collection failed")
        outcome["collection_error"] = str(exc)

    try:
        with session_scope() as session:
            report = run_full_pipeline(session)
        outcome["pipeline"] = report.as_dict()
        logger.info("Pipeline finished: %s", report.as_dict())
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline failed")
        outcome["pipeline_error"] = str(exc)

    outcome["duration_seconds"] = (dt.datetime.now() - started).total_seconds()
    return outcome


def build_trigger() -> CronTrigger:
    settings = get_settings()
    return CronTrigger(
        hour=settings.scheduler_cron_hour,
        minute=settings.scheduler_cron_minute,
    )


def start_background() -> BackgroundScheduler | None:
    """Attach the schedule to a running process. Returns None when disabled."""
    settings = get_settings()
    if not settings.scheduler_enabled:
        logger.info("Scheduler disabled. Set SCHEDULER_ENABLED=true to enable it.")
        return None

    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        run_cycle,
        trigger=build_trigger(),
        id="daily_collection",
        max_instances=1,
        coalesce=True,       # a missed run does not queue up several
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info(
        "Scheduler started: daily at %02d:%02d Asia/Kolkata",
        settings.scheduler_cron_hour,
        settings.scheduler_cron_minute,
    )
    return scheduler


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
    )
    init_db()
    settings = get_settings()

    scheduler = BlockingScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        run_cycle,
        trigger=build_trigger(),
        id="daily_collection",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )

    def shutdown(_signum, _frame):  # type: ignore[no-untyped-def]
        logger.info("Shutting down")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info(
        "Collector scheduled daily at %02d:%02d Asia/Kolkata. Sources: %s",
        settings.scheduler_cron_hour,
        settings.scheduler_cron_minute,
        ", ".join(settings.enabled_source_list),
    )
    scheduler.start()


if __name__ == "__main__":
    main()
