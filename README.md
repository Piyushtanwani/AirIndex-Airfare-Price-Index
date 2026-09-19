# AirIndex

**A real-time airfare price index for India, built to augment the Consumer Price Index.**

Smart India Hackathon 2026 · Problem statement **SIH26056** · Ministry of Statistics and
Programme Implementation · Team VisionX (Team ID 48)

---

AirIndex collects domestic airfare observations at high frequency, normalises them into one
comparable schema, computes a route-level and national **Airfare Price Index (APIx)** using
the elementary-aggregate method national statistical offices already accept, and publishes
it through a documented REST API and an analyst dashboard.

It is a statistical instrument, not a fare-comparison product. It answers "did air travel
get more expensive this month, and by how much". It does not answer "when should I book",
and it declines to when asked.

| | |
|---|---|
| Backend | [`backend/README.md`](backend/README.md) — collector, engine, API |
| Frontend | [`frontend/README.md`](frontend/README.md) — the dashboard |
| Method | [`docs/methodology.md`](docs/methodology.md) — how the number is made |
| Compliance | [`docs/compliance.md`](docs/compliance.md) — how the data is obtained |

---

## Quick start

Python 3.12 and Node 20. No database server required.

```bash
cd backend && pip install -r requirements.txt && python cli.py demo --days 90
```

```bash
cd backend && python cli.py serve
```

```bash
cd frontend && npm install && npm run dev
```

- Dashboard: <http://localhost:5173>
- API documentation: <http://localhost:8000/docs>
- Methodology: <http://localhost:8000/v1/methodology>

`demo` wipes the database, generates ninety days of observations, runs the full pipeline and
prints the resulting index. It takes about two minutes and produces roughly 100,000
observations across 6,750 priced cells.

### With Docker instead

```bash
docker compose up --build
```

```bash
docker compose exec api python cli.py demo --days 90
```

That brings up PostgreSQL, the API, a scheduled collector and the dashboard.

---

## What is running

```
 Sources                 Collector              Engine                 Serving
 ┌─────────────┐         ┌──────────────┐       ┌───────────────┐      ┌──────────┐
 │ synthetic   │         │ robots gate  │       │ normalise     │      │ FastAPI  │
 │ licensed    │ ──────► │ rate limiter │ ────► │ validate      │ ───► │ 21 routes│
 │ feed        │         │ budget       │       │ outlier rule  │      │ OpenAPI  │
 │ portals ✗   │         │ retry+audit  │       │ cells         │      └────┬─────┘
 └─────────────┘         └──────┬───────┘       │ Jevons index  │           │
                                │               │ back-test     │      ┌────▼─────┐
                                ▼               └───────┬───────┘      │ React    │
                          raw_observations               │             │ dashboard│
                                                    index_values       └──────────┘
```

| Component | Stack |
|---|---|
| Collector | Python 3.12, APScheduler, httpx, Playwright (optional) |
| Engine | pandas, NumPy |
| API | FastAPI, SQLAlchemy 2, Pydantic v2 |
| Dashboard | React 19, Vite, TypeScript, Tailwind, TanStack Query, Recharts |
| Storage | SQLite by default, PostgreSQL 16 in Docker |

---

## The index

```
APIx_t = 100 × exp( Σ_i w_i · ln(P_i,t / P_i,0) / Σ_i w_i )
```

A weighted **Jevons index**: a geometric mean of price relatives over 75 priced cells, being
15 city pairs at 5 booking lead times (T+1, T+7, T+15, T+30, T+45). Each cell's price is the
cheapest valid total fare observed that day. The base period is the mean of the first three
consecutive days that clear the coverage threshold.

This is the formula the ILO/IMF *Consumer Price Index Manual* prescribes for elementary
aggregates and the one the UK Office for National Statistics uses for web-scraped prices. It
is deliberately not bespoke: a statistical office cannot adopt a method it has to take on
faith.

Full details in [docs/methodology.md](docs/methodology.md).

---

## Three things this project says out loud

Most of the engineering here is ordinary. The parts worth reading are where the system
refuses to overstate itself.

**The scraper is not the innovation, and it is switched off.** IndiGo, Air India and
MakeMyTrip prohibit automated fare extraction in their terms and block it in practice. The
adapters exist as structure, behind a feature flag, behind a robots.txt gate that fails
closed, with selectors deliberately undefined pending a terms-of-service review. The default
source is a synthetic generator, which requires nobody's permission and which injects
sold-out cells, promotional fares, currency mix-ups and zero-price glitches so that every
quality rule fires on real inputs. See [docs/compliance.md](docs/compliance.md).

**Nothing is weighted by a number somebody made up.** Route weights load from one versioned
file with a cited source and an as-of date. The shipped values are a declared
scheduled-seat proxy, not official DGCA passenger volumes, and every API response that
depends on them reports `weights_are_official: false`. Where no weights are configured the
engine falls back to equal weighting and logs a warning rather than inventing shares.

**There is no external back-test, because there is nothing to back-test against.** India
publishes no public high-frequency airfare index. Reporting a correlation against a
reference that does not exist would be fabrication, so `/v1/backtest` reports stability,
revision size, publication rate, coverage and leave-one-out route sensitivity instead, and
says in every response that these are internal diagnostics.

---

## API

21 endpoints. Read `GET /v1/methodology` first; the dashboard renders that response rather
than restating it, so the two cannot drift apart.

### Core

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Liveness and database probe |
| `GET /v1/methodology` | The published method, served from configuration |
| `GET /v1/routes` | The basket, with weights and their provenance |
| `GET /v1/index` | The series. `scope` national, route or airline; `window` a lead time |
| `GET /v1/index/latest` | Latest value plus the largest route movers |
| `GET /v1/index/heatmap` | One route across every booking window, day by day |
| `GET /v1/index/contributions` | Which cells moved the index, decomposed exactly |
| `GET /v1/fares` | Underlying observations, paginated, with quality flags |
| `GET /v1/quality/summary` | Pass rates, rejections, outliers, source health |
| `GET /v1/backtest` | Stability replay or leave-one-out sensitivity |
| `GET /v1/export.csv` | Any series as CSV |
| `POST /v1/admin/recompute` | Rerun the pipeline. Requires an admin key |

### Analytics

Derived from the published index, and never feeding back into it.

| Endpoint | Purpose |
|---|---|
| `GET /v1/analytics/formulas` | The same movement under Jevons, Laspeyres, Paasche, Fisher, Törnqvist, Walsh, Dutot and Carli, with the spread between them |
| `GET /v1/analytics/trust` | Freshness, coverage, depth, provenance and cross-source consensus, scored |
| `GET /v1/analytics/forecast` | Fourteen-day ensemble projection with out-of-sample model scores |
| `GET /v1/analytics/anomalies` | Unusual day-on-day movements in the series |
| `POST /v1/analytics/scenario` | Airfare, fuel, demand and capacity shocks, with a sensitivity table |
| `POST /v1/analytics/ask` | Questions answered from the stored data |

Two notes on that table. The quantity-dependent formulas need quantities nobody publishes
for Indian routes, so the endpoint makes the assumption explicit and offers a `fixed` mode
that demonstrates five of them collapsing into one identical number. The analyst composes
its answer from an evidence block returned with every reply; without a `GEMINI_API_KEY` or
`ANTHROPIC_API_KEY` no language model is involved at all, and with one, the model phrases
the same evidence under the same grounding rules and is never the source of a number.

Response shapes: [docs/api-contract.md](docs/api-contract.md) and
[docs/api-contract-analytics.md](docs/api-contract-analytics.md).

---

## Dashboard

Thirteen pages behind a capsule navigation bar, in light and dark, responsive to 375px.

| Page | Content |
|---|---|
| Overview | Headline index, 90-day chart, coverage, top movers, contribution decomposition |
| Routes | Sortable basket with weights, index and 30-day observation counts |
| Route detail | Per-route series and a lead-time heatmap |
| Lead times | The booking curve as small multiples |
| Quality | Pass rates, flag counts, daily valid against invalid, source health |
| Methodology | Rendered from the API so it cannot disagree with the method |
| API explorer | A live request builder against the documented endpoints |
| Formulas | Eight methods side by side with the spread |
| Forecast | Projection with interval and a model scorecard |
| Trust | Component scores, with unmeasured components shown as unmeasured |
| Simulator | Shock sliders, transmission channels, sensitivity |
| Analyst | Questions, answers, and the evidence behind each one |
| Diagnostics | Back-test and series anomalies |

---

## Tests

```bash
cd backend && python -m pytest
```

123 tests. The unit suite covers the index formula, including a hand-computed golden value,
base invariance, and the bounded-influence property that justifies a geometric mean; the
validation and outlier rules; and the analytics modules. The integration suite runs the real
collector, the real pipeline and the real API against a throwaway database, and asserts that
the quality rules actually reject something, that the robots gate fails closed, that live
adapters stay disabled, and that the shipped development key is refused outside development.

---

## Configuration

Copy `.env.example` to `.env`. Four files under `backend/config/` drive the substance:

| File | Contents |
|---|---|
| `routes.yaml` | The basket, and the synthetic generator's shape parameters |
| `weights.yaml` | Route and lead-time weights, with their source and as-of date |
| `methodology.yaml` | Formula, base period, thresholds, revisions policy |
| `policy.yaml` | Scenario coefficients, every one a stated prior |

Changing anything in `methodology.yaml` is a methodology change: bump
`methodology_version`, because every stored index value records the version it was computed
under and that field is never rewritten.

---

## Repository

```
backend/      Collector, engine, API, tests          → backend/README.md
frontend/     Dashboard                              → frontend/README.md
docs/         Methodology, compliance, API contracts, implementation plan
docker-compose.yml, Makefile, .env.example
```

---

## Deliberate deviations from the plan

- **No Alembic.** The schema is created from the SQLAlchemy models. There is no production
  history to migrate and one creation path is one less thing to break during a
  demonstration. The models are already the single source of truth, so adding migrations
  later is mechanical.
- **SQLite by default.** The plan specified PostgreSQL, which Docker Compose provides. The
  default is SQLite so that a clean clone runs with no external service.
- **Scrapy is not used.** Playwright covers the JavaScript-rendered pages and Scrapy would
  have added a second crawling framework for no benefit at this scale.
- **Live portal adapters are structure, not working scrapers.** Explained above and in the
  compliance document.

## Known limits

- The default source is synthetic. Any index computed from it demonstrates the method and
  measures nothing. This is reported everywhere and caps the data trust score by design.
- The CPI airfare weight used by the scenario simulator is a placeholder, so the simulator
  reports an illustrative transmission and refuses to call it a CPI impact.
- The back-test reports zero revisions because the shipped history is generated in one
  batch with no late-arriving data. The response explains this.
- The rate limiter lives in process memory and does not survive horizontal scaling.
