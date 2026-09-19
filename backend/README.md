# AirIndex backend

The collector, the statistical engine and the API behind [AirIndex](../README.md), a
real-time airfare price index for India built for Smart India Hackathon problem statement
SIH26056.

Three concerns, kept apart on purpose:

| Package | Owns | Knows about the database |
|---|---|---|
| `collector/` | Getting fares from a source, politely and defensibly | Only through the runner |
| `engine/` | Turning fares into a published index | Only through `pipeline.py` |
| `app/` | Serving it over HTTP | Yes, that is its job |

The statistical modules are pure functions over dataframes. They take data and return
data, touch no database and read no clock, which is why the index formula can be tested
exactly against a hand-computed value.

---

## Running it

Python 3.12. No database server needed; the default is SQLite in the repository root.

```bash
pip install -r requirements.txt
python cli.py demo --days 90
python cli.py serve
```

`demo` wipes the database, generates ninety days of observations, runs the whole pipeline
and prints the resulting index. It takes about two minutes and produces roughly 100,000
observations across 6,750 priced cells. The API is then at <http://localhost:8000> with
interactive documentation at `/docs`.

### Commands

| Command | Does |
|---|---|
| `python cli.py demo --days 90` | Wipe, generate history, compute, summarise |
| `python cli.py init-db` | Create the schema and stop |
| `python cli.py collect` | One collection cycle for today |
| `python cli.py backfill --days 30` | Generate history without wiping |
| `python cli.py process` | Raw observations into validated fares |
| `python cli.py recompute` | Process, rebuild cells, recompute the index |
| `python cli.py status` | What is currently in the database |
| `python cli.py backtest --days 30` | Stability or leave-one-out diagnostics |
| `python cli.py serve` | Run the API |
| `python cli.py reset --yes` | Drop everything. Requires the flag |
| `python -m collector.scheduler` | Run the daily collector in the foreground |

### Tests

```bash
python -m pytest
```

123 tests against a throwaway SQLite database in a temporary directory. The environment is
set in `tests/conftest.py` before any application module is imported, so a test can never
quietly run against a real database.

---

## Layout

```
app/
  main.py               FastAPI application, middleware, exception handling
  api/
    endpoints.py          The twelve core endpoints
    analytics.py          The nine analytical endpoints
    schemas.py            Pydantic response models. The published contract
  core/
    config.py             Environment settings and the cached YAML configuration
    security.py           API keys, hashed and compared in constant time
    ratelimit.py          Fixed-window limiter
  db/
    models.py             The whole schema, one file
    session.py            Engine, session factory, SQLite pragmas
collector/
  base.py                 The adapter contract every source implements
  robots.py               The robots.txt gate. Fails closed
  throttle.py             Token bucket, request budget, backoff with jitter
  runner.py               One collection cycle. Where the gate is enforced
  scheduler.py            Daily cron. Off by default
  adapters/
    synthetic.py            The default source. Generates its own fares
    feed.py                 Generic licensed-feed adapter
    live_portal.py          Portal adapters. Structure only, disabled
engine/
  normalise.py            Source payloads into one comparable schema
  quality.py              Validation rules and the outlier rule
  cells.py                Fares reduced to one price per cell per day
  index.py                The index formula. The core of the project
  pipeline.py             The only module that knows both the engine and the database
  backtest.py             Stability, revision and sensitivity diagnostics
  formulas.py             Eight bilateral index formulas for comparison
  trust.py                Data trust scoring
  forecast.py             Four models and an ensemble
  scenario.py             Policy simulation and anomaly detection
  analyst.py              Grounded question answering
config/
  routes.yaml             The basket
  weights.yaml            Route and lead-time weights, with provenance
  methodology.yaml        Formula, base period, thresholds, revisions policy
  policy.yaml             Scenario coefficients, every one a stated prior
tests/
  unit/                   Pure functions, no database
  integration/            Real collector, real pipeline, real API
```

---

## The pipeline

```
sources ──► raw_observations ──► fares ──► cell_daily ──► index_values
            (as collected)      (validated) (one price   (published)
                                             per cell)
```

Three stages, each runnable alone through the CLI and each idempotent.

**`process_observations`** normalises and validates every raw observation that has no fare
row yet. The set of unprocessed observations is derived from what is missing downstream, so
running it twice does nothing the second time.

**`rebuild_cells`** collapses fares to one minimum logical fare per route, lead time and
day. Rebuilt rather than patched: a derived view that is updated incrementally eventually
disagrees with what it was derived from.

**`recompute_index`** computes five families of series: national, national per lead time,
per route, per route per lead time, and per airline.

### The formula

```
APIx_t = 100 × exp( Σ_i w_i · ln(P_i,t / P_i,0) / Σ_i w_i )
```

A weighted Jevons index over 75 cells, being 15 routes at 5 booking lead times. The full
method, including the outlier rule, the imputation policy and the coverage threshold, is in
[docs/methodology.md](../docs/methodology.md), and it is served live at `/v1/methodology`
from `config/methodology.yaml`.

---

## Rules this code enforces

These are asserted in tests, not merely documented.

**The robots gate fails closed.** An unreachable, unparseable or error-returning
`robots.txt` blocks collection. The gate runs in the runner, before any adapter is called,
so no adapter can route around a check it never sees.

**Live portal adapters stay off.** They are excluded from `resolve_adapters` unless
`COLLECTOR_LIVE_ADAPTERS_ENABLED` is set, and their selectors are deliberately undefined
pending the terms-of-service review in [docs/compliance.md](../docs/compliance.md).

**Nothing is silently discarded.** A rejected fare keeps its row and records why. A cell
whose entire content was rejected still appears with a zero observation count. Every
collection run writes a `crawl_runs` row, including the ones that failed or were blocked.

**Weights are never invented.** They load from `config/weights.yaml` alone. Where none are
configured the engine falls back to equal weighting and logs a warning rather than
fabricating shares that would look authoritative.

**Imputation is forward only.** A gap carries the last known price forward and is flagged.
A gap before a cell's first ever observation stays a gap, because filling it backwards
would be inventing a price that precedes any measurement.

**The base period is stored, not recomputed.** It is the one thing in an index that must
not move when the data behind it is reprocessed.

**The shipped development keys are refused outside development.** A deployment that forgets
to change them fails closed rather than running wide open.

---

## Configuration

Copy `../.env.example` to `../.env`. Everything has a working default, so the project runs
without it.

The four YAML files in `config/` carry the substance. Changing anything in
`methodology.yaml` is a methodology change: bump `methodology_version`, because every
stored index value records the version it was computed under and that field is never
rewritten.

| Variable | Default | Note |
|---|---|---|
| `DATABASE_URL` | SQLite in the repository root | Point at PostgreSQL for anything beyond a laptop |
| `COLLECTOR_ENABLED_SOURCES` | `synthetic` | Comma-separated |
| `COLLECTOR_RESPECT_ROBOTS` | `true` | Leave it true |
| `COLLECTOR_LIVE_ADAPTERS_ENABLED` | `false` | Requires a recorded terms review first |
| `API_KEY_REQUIRED` | `false` | Read endpoints open in development. Admin always needs a key |
| `ADMIN_API_KEY` | a refused placeholder | Change before deploying |
| `SCHEDULER_ENABLED` | `false` | The collector belongs in its own process |
| `ANTHROPIC_API_KEY` | unset | Optional. Only affects how the analyst phrases answers |

---

## Sources

Every source implements one interface in `collector/base.py`. The runner knows nothing else
about them, which is what makes the compliance gate enforceable.

**Synthetic** is the default. It generates fares from a route base price, a booking-curve
decay, a day-of-week factor, seasonal drift, carrier positioning and lognormal noise, all
deterministic from a seed so a back-test is reproducible. It deliberately injects sold-out
cells, promotional fares, currency mix-ups, zero-price layout glitches and fares an order
of magnitude out, so the validation and outlier rules fire on real inputs. Its output is
labelled synthetic everywhere and caps the data trust score by design.

**Licensed feed** is the production path. Point `FEED_URL_TEMPLATE` at any JSON endpoint
and describe the field mapping in the environment; adding a provider is configuration, not
code.

**Live portals** are structure pending review. See the compliance document before touching
them.

---

## Adding a source

1. Subclass `SourceAdapter` in `collector/adapters/`, implementing `fetch` and keeping
   `parse` free of network access so it can be tested against a recorded fixture.
2. Register the code in `resolve_adapters` in `collector/runner.py`.
3. Add it to `COLLECTOR_ENABLED_SOURCES`.
4. If it reads a public page, record the terms-of-service review in
   `docs/compliance.md` first. The gate will refuse it until `robots.txt` allows.

A contract test against a recorded fixture is what catches a portal layout change: the
fixture stops producing records and the test fails loudly, instead of the index quietly
losing a source.

---

## Deliberate deviations

- **No Alembic.** The schema is created from the SQLAlchemy models. There is no production
  history to migrate and one creation path is one less thing to break during a
  demonstration.
- **No Scrapy.** Playwright covers JavaScript-rendered pages; a second crawling framework
  would add nothing at this scale.
- **The rate limiter is in process memory.** Correct for a single-process prototype, wrong
  for horizontal scaling, where it belongs in Redis.
- **Playwright is not in the Docker image.** It is heavy, it is off by default, and a
  container shipping a browser would imply the project scrapes portals as its normal mode
  of operation, which it does not.
