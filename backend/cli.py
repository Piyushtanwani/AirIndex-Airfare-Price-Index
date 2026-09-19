"""AirIndex command line.

    python cli.py init-db                     create the schema
    python cli.py collect                     one collection cycle for today
    python cli.py backfill --days 90          generate history, then run the pipeline
    python cli.py process                     raw observations -> fares
    python cli.py recompute                   fares -> cells -> index
    python cli.py demo --days 90              wipe, backfill, compute, summarise
    python cli.py status                      what is in the database
    python cli.py backtest --days 30          stability diagnostics
    python cli.py serve                       run the API

`demo` is the one to run first. It produces a complete, populated system from an empty
directory in a couple of minutes.
"""

from __future__ import annotations

import datetime as dt
import logging

import typer
from rich.console import Console
from rich.table import Table

from app.core.config import get_methodology_config, get_settings
from app.db.session import drop_db, init_db, session_scope

app = typer.Typer(add_completion=False, help="AirIndex operations")
console = Console()

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)s %(name)s: %(message)s",
)


@app.command("init-db")
def init_db_command() -> None:
    """Create every table."""
    init_db()
    console.print("[green]Schema created.[/green]")


@app.command("reset")
def reset(
    confirm: bool = typer.Option(False, "--yes", help="Required. Drops every table."),
) -> None:
    """Drop and recreate the schema. Destroys all collected data."""
    if not confirm:
        console.print("[red]Refusing to drop the database without --yes.[/red]")
        raise typer.Exit(code=1)
    drop_db()
    init_db()
    console.print("[yellow]Database reset.[/yellow]")


@app.command("collect")
def collect(
    date: str = typer.Option(None, help="Observation date, defaults to today"),
    sources: str = typer.Option(None, help="Comma-separated source codes"),
) -> None:
    """Run one collection cycle."""
    from collector.runner import Collector

    when = (
        dt.datetime.fromisoformat(date)
        if date
        else dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    )
    codes = [c.strip() for c in sources.split(",")] if sources else None

    with session_scope() as session:
        summaries = Collector(session).run(captured_at=when, source_codes=codes)

    table = Table(title=f"Collection on {when.date().isoformat()}")
    for column in ("Source", "Status", "Requests", "Observations", "Duplicates", "Failures"):
        table.add_column(column)
    for summary in summaries:
        table.add_row(
            summary.source_code,
            summary.status,
            str(summary.requests),
            str(summary.observations),
            str(summary.duplicates),
            str(summary.failures),
        )
    console.print(table)
    for summary in summaries:
        for note in summary.notes[:5]:
            console.print(f"  [dim]{summary.source_code}: {note}[/dim]")


@app.command("backfill")
def backfill(
    days: int = typer.Option(90, help="How many days of history to generate"),
    sources: str = typer.Option("synthetic", help="Comma-separated source codes"),
) -> None:
    """Generate history by running the collector once per past day.

    Only meaningful for the synthetic source: a real portal cannot be asked what it
    showed last month. This is how a demonstration gets a series long enough to have a
    base period, a month-on-month change and a back-test.
    """
    from collector.runner import Collector

    codes = [c.strip() for c in sources.split(",")]
    if any(code not in {"synthetic", "feed"} for code in codes):
        console.print(
            "[yellow]Backfill is only meaningful for generated or licensed historical "
            "sources. A live portal cannot be asked about the past.[/yellow]"
        )

    today = dt.date.today()
    total = 0
    with typer.progressbar(range(days, 0, -1), label="Backfilling") as progress:
        for offset in progress:
            when = dt.datetime.combine(
                today - dt.timedelta(days=offset - 1), dt.time(2, 30)
            )
            with session_scope() as session:
                summaries = Collector(session).run(
                    captured_at=when, source_codes=codes, pace=False
                )
                total += sum(s.observations for s in summaries)

    console.print(f"[green]Backfill complete: {total} observations written.[/green]")


@app.command("process")
def process() -> None:
    """Normalise and validate raw observations into fares."""
    from engine.pipeline import process_observations

    with session_scope() as session:
        report = process_observations(session)
    _print_report(report)


@app.command("recompute")
def recompute(
    since_days: int = typer.Option(None, help="Only rebuild cells from the last N days"),
    rebuild_fares: bool = typer.Option(
        False, "--rebuild-fares", help="Rebuild the fare layer from raw observations first"
    ),
) -> None:
    """Run the full pipeline: process, rebuild cells, recompute the index."""
    from engine.pipeline import run_full_pipeline

    since = dt.date.today() - dt.timedelta(days=since_days) if since_days else None
    with session_scope() as session:
        report = run_full_pipeline(session, since=since, rebuild=rebuild_fares)
    _print_report(report)


@app.command("demo")
def demo(
    days: int = typer.Option(90, help="Days of history to generate"),
    keep: bool = typer.Option(False, "--keep", help="Do not wipe existing data first"),
) -> None:
    """Build a complete populated system from scratch."""
    from engine.pipeline import run_full_pipeline

    if not keep:
        drop_db()
    init_db()
    console.print(f"[bold]Generating {days} days of synthetic observations[/bold]")
    backfill(days=days, sources="synthetic")
    console.print("[bold]Running the pipeline[/bold]")
    with session_scope() as session:
        report = run_full_pipeline(session)
    _print_report(report)
    status()


@app.command("status")
def status() -> None:
    """What is currently in the database."""
    from sqlalchemy import func, select

    from app.db.models import (
        CellDaily,
        CrawlRun,
        Fare,
        IndexValue,
        RawObservation,
        Route,
        Source,
    )

    with session_scope() as session:
        counts = {
            "sources": session.scalar(select(func.count()).select_from(Source)),
            "routes": session.scalar(select(func.count()).select_from(Route)),
            "crawl runs": session.scalar(select(func.count()).select_from(CrawlRun)),
            "raw observations": session.scalar(select(func.count()).select_from(RawObservation)),
            "fares": session.scalar(select(func.count()).select_from(Fare)),
            "valid fares": session.scalar(
                select(func.count()).select_from(Fare).where(Fare.is_valid.is_(True))
            ),
            "cells": session.scalar(select(func.count()).select_from(CellDaily)),
            "index values": session.scalar(select(func.count()).select_from(IndexValue)),
        }
        latest = session.scalars(
            select(IndexValue)
            .where(IndexValue.scope == "national", IndexValue.window == 0)
            .order_by(IndexValue.date.desc())
            .limit(1)
        ).first()

    table = Table(title="AirIndex status")
    table.add_column("Item")
    table.add_column("Count", justify="right")
    for key, value in counts.items():
        table.add_row(key, f"{value:,}")
    console.print(table)

    if latest:
        console.print(
            f"\n[bold]APIx {latest.apix:.1f}[/bold] on {latest.date.isoformat()}  "
            f"week on week {latest.wow_pct:+.1f}%" if latest.wow_pct is not None
            else f"\n[bold]APIx {latest.apix:.1f}[/bold] on {latest.date.isoformat()}"
        )
        console.print(
            f"coverage {latest.coverage:.0%}, {latest.obs_count:,} observations, "
            f"{latest.imputed_cells} imputed cells, method {latest.methodology_version}"
        )
        console.print(
            "[dim]Computed from the synthetic source. A demonstration of the method, "
            "not a measurement of Indian airfares.[/dim]"
        )
    else:
        console.print("\n[yellow]No index values yet. Run: python cli.py demo[/yellow]")


@app.command("backtest")
def backtest_command(
    days: int = typer.Option(30, help="Days to replay"),
    kind: str = typer.Option("stability", help="stability or leave_one_out"),
) -> None:
    """Stability and sensitivity diagnostics on the published series."""
    from sqlalchemy import select

    from app.db.models import BasePeriod
    from engine import backtest as backtest_mod
    from engine import pipeline as pipeline_mod
    from engine.index import BaseWindow, normalise_weights

    with session_scope() as session:
        prices, _ = pipeline_mod._load_cell_prices(session)  # noqa: SLF001
        base_rows = session.scalars(select(BasePeriod)).all()
        if prices.empty or not base_rows:
            console.print("[red]No data. Run: python cli.py demo[/red]")
            raise typer.Exit(code=1)
        window = BaseWindow(
            start=base_rows[0].start_date,
            end=base_rows[0].end_date,
            days=base_rows[0].days_used,
        )
        route_weights = pipeline_mod._route_weights(session)  # noqa: SLF001
        lead_weights = pipeline_mod._lead_time_weights()  # noqa: SLF001

    weights = normalise_weights({
        f"{code}|{lead}": route_weights.get(code, 0.0) * lead_weights.get(lead, 0.0)
        for code in route_weights
        for lead in lead_weights
    })
    min_coverage = float(get_methodology_config().get("coverage_threshold", 0.6))
    frame = prices[["date", "cell", "price", "obs_count"]]

    if kind == "leave_one_out":
        report = backtest_mod.leave_one_out(
            frame, weights, base_window=window, min_coverage=min_coverage
        )
    else:
        report = backtest_mod.replay(
            frame, weights, base_window=window, min_coverage=min_coverage, days=days
        )

    table = Table(title=f"Back-test: {report.kind}")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for key, value in report.metrics.items():
        table.add_row(key.replace("_", " "), str(value))
    console.print(table)
    console.print(
        "[dim]Internal stability and sensitivity diagnostics. Not a comparison against "
        "an external reference series: none is published for Indian airfares.[/dim]"
    )
    for note in report.notes:
        console.print(f"[dim]{note}[/dim]")


@app.command("serve")
def serve(
    host: str = typer.Option(None),
    port: int = typer.Option(None),
    reload: bool = typer.Option(True),
) -> None:
    """Run the API."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=host or settings.api_host,
        port=port or settings.api_port,
        reload=reload,
    )


def _print_report(report) -> None:  # type: ignore[no-untyped-def]
    table = Table(title="Pipeline")
    table.add_column("Stage")
    table.add_column("Count", justify="right")
    data = report.as_dict()
    for key in (
        "observations_read", "fares_written", "fares_rejected", "outliers",
        "cells_written", "index_values_written",
    ):
        table.add_row(key.replace("_", " "), f"{data[key]:,}")
    console.print(table)
    if data.get("base_window"):
        console.print(f"Base period: {data['base_window'][0]} to {data['base_window'][1]} = 100")
    for note in data.get("notes", []):
        console.print(f"[dim]{note}[/dim]")


if __name__ == "__main__":
    app()
