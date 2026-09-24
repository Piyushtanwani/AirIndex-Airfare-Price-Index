# AirIndex

**A real-time, high-frequency airfare price index for India, engineered to augment the Consumer Price Index (CPI).**

Smart India Hackathon 2026 · Problem Statement **SIH26056** · Ministry of Statistics and Programme Implementation (MoSPI) · Team VisionX (Team ID 48)

---

## Table of Contents

1. [Executive Summary & Problem Statement](#executive-summary--problem-statement)
2. [Quick Start (Local & Docker)](#quick-start)
3. [System Architecture & Data Flow](#system-architecture--data-flow)
4. [Docker Deployment Guide (Detailed)](#docker-deployment-guide-detailed)
   - [Container Architecture](#container-architecture)
   - [Step-by-Step Walkthrough](#step-by-step-walkthrough)
   - [CLI Operations inside Docker](#cli-operations-inside-docker)
   - [Troubleshooting & Volume Management](#troubleshooting--volume-management)
5. [Local Development (Without Docker)](#local-development-without-docker)
6. [Statistical Methodology & Mathematical Foundations](#statistical-methodology--mathematical-foundations)
   - [The Basket & 75 Priced Cells](#the-basket--75-priced-cells)
   - [The Elementary Aggregate Formula (Weighted Jevons)](#the-elementary-aggregate-formula-weighted-jevons)
   - [Base Period & Frozen Baseline](#base-period--frozen-baseline)
   - [Quality Filtering & Outlier Rejection](#quality-filtering--outlier-rejection)
   - [Imputation & Weight Provenance](#imputation--weight-provenance)
7. [Analytical Engine & Economic Diagnostics](#analytical-engine--economic-diagnostics)
   - [The 8 Bilateral Index Formulas](#the-8-bilateral-index-formulas)
   - [Data Trust & Integrity Scoring](#data-trust--integrity-scoring)
   - [14-Day Multi-Model Ensemble Forecasting](#14-day-multi-model-ensemble-forecasting)
   - [Policy Shock Simulator](#policy-shock-simulator)
   - [Grounded AI Analyst (Gemini & Claude)](#grounded-ai-analyst-gemini--claude)
8. [Complete REST API Reference (21 Endpoints)](#complete-rest-api-reference-21-endpoints)
9. [Analyst Dashboard (13 Pages)](#analyst-dashboard-13-pages)
10. [Compliance, Ethics & Data Governance](#compliance-ethics--data-governance)
11. [Configuration & Environment Variables](#configuration--environment-variables)
12. [Testing & Quality Assurance](#testing--quality-assurance)
13. [Deliberate Engineering Decisions & Known Limits](#deliberate-engineering-decisions--known-limits)

---

## Executive Summary & Problem Statement

### The Problem (SIH26056)
Modern airline pricing is governed by real-time algorithmic revenue management: fares fluctuate every few minutes based on booking lead times, remaining inventory, competitor moves, and calendar events. In contrast, conventional Consumer Price Index (CPI) transport baskets in India rely on infrequent, manual price collections that fail to capture the true distribution of prices paid by consumers.

### The Solution: AirIndex (APIx)
AirIndex bridges this gap by providing an automated, auditable, high-frequency **Airfare Price Index (APIx)** for Indian domestic aviation. It:
- Collects domestic fare quotes at high frequency across major origin-destination pairs.
- Normalises diverse fare structures into an elementary-aggregate schema.
- Filters invalid quotes, fuel surcharge mix-ups, zero-price layout glitches, and extreme outliers.
- Aggregates prices using the **Weighted Jevons formula** prescribed by the ILO/IMF *Consumer Price Index Manual* and used by international statistical agencies (e.g. UK ONS).
- Serves the resulting index, underlying microdata, and analytical diagnostics via an authenticated, documented REST API and an analyst dashboard.

> **Crucial Distinction:** AirIndex is a **statistical instrument**, not a commercial flight search engine or consumer booking aggregator. It answers: *"Did air travel become more or less expensive this month, by how much, and on which routes?"* It does not answer *"When should I buy my ticket?"*, and it declines to answer when prompted.

---

## Quick Start

### Option A: Complete Docker Compose Stack (Recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine 24+ with Compose v2).

```bash
# 1. Clone and enter repository
cd AirIndex

# 2. Build and start PostgreSQL, FastAPI, Collector Worker, and React/Nginx
docker compose up --build -d

# 3. Seed 90 days of observations and compute the index series (takes ~2 minutes)
docker compose exec api python cli.py demo --days 90
```

- **Analyst Dashboard**: <http://localhost:5173>
- **FastAPI Interactive Docs (Swagger)**: <http://localhost:8000/docs>
- **Machine-Readable Methodology**: <http://localhost:8000/v1/methodology>

---

### Option B: Local Setup (No Docker Required)

Requires **Python 3.12+** and **Node.js 20+**. Operates on an embedded SQLite database by default.

```bash
# Backend setup & 90-day demo computation
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python cli.py demo --days 90
python cli.py serve
```

In a second terminal:
```bash
# Frontend setup
cd frontend
npm install
npm run dev
```

---

## System Architecture & Data Flow

AirIndex is structured into decoupled components with clear boundaries:

```
 Sources                 Collector              Engine                 Serving
 ┌─────────────┐         ┌──────────────┐       ┌───────────────┐      ┌──────────┐
 │ Synthetic   │         │ Robots Gate  │       │ Normalise     │      │ FastAPI  │
 │ (Default)   │ ──────► │ Token Bucket │ ────► │ Quality Check │ ───► │ 21 routes│
 │ Licensed    │         │ Rate Limiter │       │ Outlier Rule  │      │ OpenAPI  │
 │ Feed        │         │ Request Audit│       │ 75 Cells      │      └────┬─────┘
 │ Portals ✗   │         └──────┬───────┘       │ Jevons Index  │           │
 └─────────────┘                │               │ Diagnostics   │      ┌────▼─────┐
                                ▼               └───────┬───────┘      │ React 19 │
                          raw_observations              │              │ Nginx    │
                                                        ▼              │ Dashboard│
                                                   index_values        └──────────┘
```

| Layer | Directory | Tech Stack | Responsibilities |
|---|---|---|---|
| **Collector** | `backend/collector/` | Python 3.12, APScheduler, HTTPX, Playwright | Rate-limited crawling, robots.txt gating, source adapters. |
| **Engine** | `backend/engine/` | Pandas, NumPy, Scikit-learn, SciPy | Normalisation, quality filters, cell aggregation, index computation, forecasting. |
| **API** | `backend/app/` | FastAPI, SQLAlchemy 2, Pydantic v2, Uvicorn | 21 REST endpoints, API authentication, rate limiting, OpenAPI schemas. |
| **Dashboard** | `frontend/` | React 19, TypeScript, Vite 6, Tailwind CSS, TanStack Query | 13 analytical views, interactive charts, light/dark themes, responsive UI. |
| **Storage** | Root / Docker | SQLite (local) / PostgreSQL 16 (Docker) | Relational persistence of raw quotes, cleaned fares, daily cells, and indices. |

---

## Docker Deployment Guide (Detailed)

### Container Architecture

The `docker-compose.yml` specification provisions four isolated services communicating over an internal bridge network (`airindex-network`):

```
                                  [Host Machine]
                                  │            │
                           Port 5173          Port 8000
                                  │            │
                                  ▼            ▼
                           ┌────────────┐ ┌────────────┐
                           │    web     │ │    api     │
                           │  (Nginx)   │ │ (FastAPI)  │
                           └─────┬──────┘ └─────┬──────┘
                                 │              │
                    ┌────────────┴──────────────┴────────────┐
                    │            airindex-network            │
                    └────────────┬──────────────┬────────────┘
                                 │              │
                                 ▼              ▼
                           ┌────────────┐ ┌────────────┐
                           │ collector  │ │     db     │
                           │(Scheduler) │ │(PostgreSQL)│
                           └────────────┘ └────────────┘
```

1. **`db` (PostgreSQL 16 Alpine)**:
   - Persists data to the Docker volume `airindex-db`.
   - Runs on port `5432:5432`.
   - Configured with a healthcheck (`pg_isready -U airindex -d airindex`) ensuring dependent containers do not boot prematurely.

2. **`api` (FastAPI Server)**:
   - Built from `./backend/Dockerfile` with Python 3.12-slim.
   - Runs as an unprivileged user (`airindex`, UID 10001).
   - Serves the REST API on port `8000:8000`.
   - Healthcheck: Probes `GET /v1/health` using `curl`.

3. **`collector` (Scheduled Background Worker)**:
   - Uses the same backend image as `api`, but runs `python -m collector.scheduler`.
   - Runs daily cron cycles independently of web traffic, eliminating noisy neighbor issues and server freezing.

4. **`web` (React 19 Dashboard on Nginx)**:
   - Multi-stage build (`node:20-alpine` builder, `nginx:1.27-alpine` runtime).
   - Compiles static assets using Vite, passing `VITE_API_BASE_URL=http://localhost:8000`.
   - Custom `nginx.conf` provides SPA routing (`try_files $uri $uri/ /index.html`), gzip compression, security headers, and asset caching.
   - Exposed on host port `5173` (mapped to container port `80`).

---

### Step-by-Step Walkthrough

#### 1. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional)* If you wish to enable AI-grounded explanations, add your Google Gemini or Anthropic API key to `.env`:
```ini
GEMINI_API_KEY=your_gemini_api_key_here
# or
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

#### 2. Launch the Stack
```bash
docker compose up --build -d
```

#### 3. Verify Container Health
```bash
docker compose ps
```
All four containers (`airindex-db`, `airindex-api`, `airindex-collector`, `airindex-web`) should show status `Up (healthy)`.

#### 4. Populate Demo Data
Generate 90 days of synthetic observations and compute the full index series:
```bash
docker compose exec api python cli.py demo --days 90
```

---

### CLI Operations inside Docker

All backend CLI tasks can be invoked through `docker compose exec api`:

| Task | Command |
|---|---|
| Check Database Counts | `docker compose exec api python cli.py status` |
| Run Single Collection Cycle | `docker compose exec api python cli.py collect` |
| Process Pending Raw Fares | `docker compose exec api python cli.py process` |
| Recompute Index & Aggregates | `docker compose exec api python cli.py recompute` |
| Run 30-Day Back-test | `docker compose exec api python cli.py backtest --days 30` |
| Execute Full Pytest Test Suite | `docker compose exec api pytest` |
| Database Reset (Danger) | `docker compose exec api python cli.py reset --yes` |

---

### Troubleshooting & Volume Management

- **Port Conflicts (`5432`, `8000`, or `5173` already in use)**:
  Edit `.env` or `docker-compose.yml` port mappings, e.g., `"5433:5432"`, `"8080:8000"`, `"3000:80"`.
- **Viewing Real-Time Container Logs**:
  ```bash
  # Follow all logs
  docker compose logs -f
  # Follow specific service
  docker compose logs -f api
  docker compose logs -f collector
  ```
- **Rebuilding Containers After Code Changes**:
  ```bash
  docker compose up --build -d
  ```
- **Stopping and Purging Persistent Data**:
  ```bash
  # Stop containers
  docker compose down
  # Stop and wipe PostgreSQL volume
  docker compose down -v
  ```

---

## Local Development (Without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or: .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Run full pipeline with 90-day history
python cli.py demo --days 90

# Start development server with reload
python cli.py serve
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend development server starts at <http://localhost:5173> with hot module replacement (HMR).

---

## Statistical Methodology & Mathematical Foundations

### The Basket & 75 Priced Cells

AirIndex prices a representative basket of **15 major domestic Indian routes** across **5 booking lead times**, yielding exactly **75 elementary cells**:

- **15 Routes**: DEL-BOM, BOM-DEL, DEL-BLR, BLR-DEL, BOM-BLR, BLR-BOM, DEL-CCU, CCU-DEL, DEL-HYD, HYD-DEL, BOM-GOI, GOI-BOM, DEL-MAA, MAA-DEL, BLR-HYD.
- **5 Booking Windows**:
  - `T+1` (Next-day departure, distress/last-minute business)
  - `T+7` (1 week out)
  - `T+15` (2 weeks out)
  - `T+30` (1 month out, standard advance purchase)
  - `T+45` (45 days out, early leisure planning)

### The Elementary Aggregate Formula (Weighted Jevons)

For each day $t$, the elementary cell price $P_{i,t}$ is the **minimum logical fare** across all valid carrier quotes observed for that route and lead time. The headline index is computed as a weighted geometric mean of price relatives:

$$APIx_t = 100 \times \exp\left( \frac{\sum_{i=1}^{75} w_i \cdot \ln\left(\frac{P_{i,t}}{P_{i,0}}\right)}{\sum_{i=1}^{75} w_i} \right)$$

Where:
- $P_{i,t}$ is the minimum valid fare for cell $i$ on day $t$.
- $P_{i,0}$ is the base period price for cell $i$.
- $w_i$ is the weight of cell $i$, derived from route capacity shares ($w_{\text{route}}$) and lead-time distribution ($w_{\text{window}}$).

#### Why Jevons?
- **Axiomatic Properties**: Satisfies the *Time Reversal Test* ($I_{0,t} \times I_{t,0} = 1$), *Transitivity*, and *Dimensional Invariance*.
- **Substitution Elasticity**: Implicitly assumes a unitary elasticity of substitution ($\eta = 1$), reflecting that travelers substitute across carriers when prices diverge.
- **Robustness**: Unlike the arithmetic Carli formula ($P_t / P_0$), the Jevons index is not subject to upward drift under price bounce.

---

### Base Period & Frozen Baseline

- **Base Window**: The average price over the first 3 consecutive calendar days meeting the minimum coverage threshold ($\ge 80\%$ valid priced cells).
- **Frozen History**: The base values $P_{i,0}$ are committed to the database once cleared. Recomputing future indices never alters historical base numbers.

---

### Quality Filtering & Outlier Rejection

Every raw fare observation must pass five strict validation checks before entering cell aggregation:
1. **Total Fare Positive**: Fare must be strictly greater than zero ($\text{fare} > 0$).
2. **Floor & Ceiling Bounds**: Must lie within ₹500 and ₹1,00,000.
3. **Airport Code Validation**: Origin and destination must match valid IATA 3-letter codes.
4. **Lead Time Feasibility**: Departure date must be strictly after the search timestamp.
5. **Dynamic Outlier Rule**: An observation is rejected if its log price relative deviates by more than $3 \times \text{IQR}$ from the 14-day rolling route median.

Rejected quotes remain in the `raw_observations` audit table with a descriptive rejection code (`ZERO_PRICE`, `OUTLIER_HIGH`, `INVALID_AIRPORT`). Nothing is silently dropped.

---

### Imputation & Weight Provenance

- **Forward Imputation**: When a cell has no valid observation on day $t$ (e.g. sold-out flights or temporary crawl failure), the price carries forward from $t-1$ for up to 3 days, accompanied by an `imputed: true` flag. Backward imputation is prohibited.
- **Weight Transparency**: Route weights load from `backend/config/weights.yaml`. Shipped weights represent published DGCA scheduled-seat capacity shares. Because they are seat proxies rather than ticketed passenger counts, every API payload explicitly declares:
  ```json
  "weights_are_official": false
  ```

---

## Analytical Engine & Economic Diagnostics

### The 8 Bilateral Index Formulas

To provide econometric transparency, `GET /v1/analytics/formulas` computes eight standard bilateral index formulas simultaneously over the same pricing window:

| Formula | Type | Weights Used | Economic Meaning |
|---|---|---|---|
| **Jevons** | Geometric | Base weights | Official AirIndex benchmark (unbiased elementary aggregate) |
| **Dutot** | Ratio of means | None | Unweighted arithmetic mean ratio |
| **Carli** | Mean of ratios | None | Upward-biased arithmetic relative (shown as cautionary benchmark) |
| **Laspeyres** | Arithmetic | Base period | Fixed basket at initial expenditure shares |
| **Paasche** | Harmonic | Current period | Current basket expenditure comparison |
| **Fisher** | Ideal | Geometric mean | $\sqrt{\text{Laspeyres} \times \text{Paasche}}$ (superlative index) |
| **Törnqvist** | Geometric | Average shares | Superlative index with flexible substitution |
| **Walsh** | Geometric | Geometric shares | Superlative volume-weighted standard |

The endpoint returns the **formula spread** ($\max - \min$), quantifying the exact degree of substitution bias.

---

### Data Trust & Integrity Scoring

The `GET /v1/analytics/trust` endpoint computes a transparent 0–100 Data Trust Score based on five auditable pillars:

1. **Freshness (20%)**: Age of newest observation (100 if $< 24$h, decaying linearly).
2. **Coverage (25%)**: Ratio of active cells to the 75 expected cells.
3. **Depth (20%)**: Number of distinct carrier observations per cell.
4. **Provenance (20%)**: Source authority (licensed feed: 100, synthetic: 30, unverified: 0).
5. **Consensus (15%)**: Cross-source price agreement where multiple sources report.

---

### 14-Day Multi-Model Ensemble Forecasting

The forecasting engine (`GET /v1/analytics/forecast`) projects the headline index 14 days forward using an ensemble of four distinct time-series models:
- **Prophet-Style Additive**: Decomposes level, day-of-week seasonality, and trend.
- **Holt-Winters Exponential Smoothing**: Captures multiplicative weekly cycles.
- **Autoregressive AR(p)**: Captures autocorrelation and momentum.
- **Rolling Linear Trend**: Baseline momentum benchmark.

Models are weighted by out-of-sample Root Mean Squared Error (RMSE) over a 14-day holdout test.

---

### Policy Shock Simulator

The `POST /v1/analytics/scenario` endpoint allows economists and ministry analysts to simulate macro shocks and view projected transmission into the airfare index and CPI transport component:
- **Aviation Turbine Fuel (ATF) Shock**: Models cost pass-through given fuel's ~40% airline cost share.
- **Demand Surge**: Simulates holiday/festival booking spikes.
- **Capacity Curtailment**: Simulates fleet groundings or airspace closures.

---

### Grounded AI Analyst (Gemini & Claude)

The `POST /v1/analytics/ask` endpoint enables natural language query resolution over the statistical series.
- **Strict Evidence Grounding**: The LLM is provided only with a structured evidence block extracted from the database (latest value, 7-day change, top movers, trust score).
- **Zero Hallucination Guarantee**: The model is forbidden from inventing numbers. If a query cannot be answered from the evidence, it declines.
- **Deterministic Fallback**: If no `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` is provided, a deterministic template engine answers the question directly from the evidence with zero external API calls.

---

## Complete REST API Reference (21 Endpoints)

All endpoints reside under `/v1` and return JSON. Interactive OpenAPI documentation is hosted at `/docs`.

### Core Statistical Endpoints (12)

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/v1/health` | - | Liveness and database connectivity health probe. |
| `GET` | `/v1/methodology` | - | Full active methodology configuration (formula, thresholds, weights). |
| `GET` | `/v1/routes` | - | Complete list of 15 monitored routes with distance, weights, and cities. |
| `GET` | `/v1/index` | `scope`, `window`, `start_date`, `end_date` | Historical index series (scope: `national`, `route`, `airline`). |
| `GET` | `/v1/index/latest` | - | Most recent headline index, 24h delta, 7d delta, and top route movers. |
| `GET` | `/v1/index/heatmap` | `route` | Route pricing matrix across all 5 lead-time windows day-by-day. |
| `GET` | `/v1/index/contributions`| `date` | Mathematical decomposition of which routes/cells moved the index. |
| `GET` | `/v1/fares` | `route`, `lead_time`, `limit`, `offset` | Paginated raw/validated fare observations with quality flags. |
| `GET` | `/v1/quality/summary` | `days` | Ingestion metrics, validation pass rates, outlier rejections, source health. |
| `GET` | `/v1/backtest` | `days`, `mode` | Stability replays and leave-one-out route sensitivity diagnostics. |
| `GET` | `/v1/export.csv` | `scope`, `series_id` | Export any index or cell price time series directly as CSV. |
| `POST`| `/v1/admin/recompute` | - | Trigger pipeline reprocessing and recomputation (Requires `X-Admin-Key`). |

### Analytical & Modeling Endpoints (9)

| Method | Endpoint | Payload / Query | Description |
|---|---|---|---|
| `GET` | `/v1/analytics/formulas` | `route`, `window` | Side-by-side comparison of 8 bilateral price index formulas. |
| `GET` | `/v1/analytics/trust` | - | Composite Data Trust Score (0–100) and breakdown across 5 pillars. |
| `GET` | `/v1/analytics/forecast` | `horizon_days` | 14-day multi-model ensemble forecast with confidence intervals. |
| `GET` | `/v1/analytics/anomalies`| `threshold_z` | Identified statistical price spikes and inter-day jumps. |
| `POST`| `/v1/analytics/scenario` | `{atf_shock, demand_shock}` | Policy shock simulation with sector transmission estimates. |
| `POST`| `/v1/analytics/ask` | `{question: "..."}` | Grounded question answering (Gemini, Claude, or deterministic). |

---

## Analyst Dashboard (13 Pages)

The frontend is a dedicated statistical release portal built with React 19, TypeScript, and Tailwind CSS:

| View | Path | Primary Capabilities |
|---|---|---|
| **Overview** | `/` | Headline APIx index card, 90-day interactive series, coverage badge, largest movers, exact contribution waterfall. |
| **Routes Basket** | `/routes` | Monitored route table with passenger capacity weights, latest price index, 30-day observation counts, and sorting. |
| **Route Detail** | `/routes/:code` | Per-route historical chart, lead-time heatmap, and airline price distribution. |
| **Lead Times** | `/lead-times` | Small-multiple curves comparing fare trajectories across T+1, T+7, T+15, T+30, T+45. |
| **Data Quality** | `/quality` | Daily validation pass vs. reject counts, rejection reason breakdown, outlier log. |
| **Methodology** | `/methodology` | Live rendered methodology served straight from `/v1/methodology` (zero documentation drift). |
| **API Explorer** | `/api` | Interactive in-browser API testing console with live parameter builder and syntax-highlighted JSON response. |
| **Formula Compare**| `/formulas` | Dynamic comparison of Jevons, Laspeyres, Paasche, Fisher, Törnqvist, Walsh, Dutot, and Carli. |
| **Forecast** | `/forecast` | 14-day projection curve with 80% and 95% confidence bands, model weights, and out-of-sample error cards. |
| **Trust Scorecard**| `/trust` | Transparent breakdown of data freshness, cell coverage, quote depth, source provenance, and consensus. |
| **Scenario Sim** | `/scenario` | Interactive slider console for jet fuel (ATF), demand, and capacity shocks. |
| **Analyst AI** | `/ask` | Natural language interface displaying answers, citations, and the exact grounding evidence block. |
| **Diagnostics** | `/diagnostics` | Leave-one-out sensitivity analysis and statistical anomaly log. |

### UI Design Principles
- **Semantic Palette**: Price increases (adverse to consumers) use warm shades; price drops (favorable) use cool shades.
- **Indian Number System**: Numeric amounts formatted according to Indian numbering standards (e.g. `₹12,450`, `1,20,000` observations) via `Intl.NumberFormat('en-IN')`.
- **Accessible & Responsive**: Fully keyboard-navigable capsule navigation, high-contrast dark/light mode toggle, responsive layout scaling down to 375px mobile viewports.

---

## Compliance, Ethics & Data Governance

### Why Portal Scraping Is Disabled by Default
Major Indian airlines (IndiGo, Air India) and Online Travel Agencies (MakeMyTrip, EaseMyTrip) prohibit automated data extraction in their Terms of Service. In compliance with MoSPI guidelines:
- **Live portal adapters are disabled by default** (`COLLECTOR_LIVE_ADAPTERS_ENABLED=false`).
- **Fail-Closed Robots Gate**: The collector inspects `robots.txt` before issuing HTTP requests. If `robots.txt` is unparseable or disallows indexing, the crawl aborts immediately.
- **Ethical Crawl Parameters**: Requests are rate-limited via a token bucket (max 20 requests/minute, honest `User-Agent` disclosing project contact information).

### Synthetic Data Generator
The shipped system operates on a mathematically grounded **Synthetic Observation Generator**:
- Generates realistic fares calibrated on actual Indian route distances, booking curve exponential decay, carrier tier positioning, and day-of-week seasonality.
- Injects synthetic anomalies (zero prices, currency errors, sold-out flights, promotional outliers) so all validation rules can be rigorously tested without scraping third-party servers.

---

## Configuration & Environment Variables

Copy `.env.example` to `.env` to configure settings:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///airindex.db` | Database connection string (PostgreSQL in Docker, SQLite locally). |
| `ENVIRONMENT` | `development` | Environment mode (`development` or `production`). |
| `API_HOST` / `API_PORT` | `0.0.0.0` / `8000` | Binding host and port for FastAPI. |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed frontend origins. |
| `API_KEY_REQUIRED` | `false` | When `true`, enforces `X-API-Key` on all GET endpoints. |
| `ADMIN_API_KEY` | `dev-admin-key-change-me` | Secret key required for admin mutations (`/v1/admin/recompute`). |
| `RATE_LIMIT_ENABLED` | `true` | Enables in-memory token bucket rate limiting on the API. |
| `RATE_LIMIT_PER_MINUTE` | `120` | Maximum requests allowed per IP per minute. |
| `COLLECTOR_ENABLED_SOURCES`| `synthetic` | Active data sources (`synthetic`, `feed`). |
| `COLLECTOR_RESPECT_ROBOTS` | `true` | Enforces robots.txt verification. |
| `COLLECTOR_LIVE_ADAPTERS_ENABLED` | `false` | Enables live portal crawlers (requires compliance sign-off). |
| `SYNTHETIC_SEED` | `26056` | Deterministic seed for repeatable synthetic data generation. |
| `SCHEDULER_ENABLED` | `false` (API) / `true` (worker)| Enables background daily APScheduler cron. |
| `GEMINI_API_KEY` | `unset` | Google Gemini API key for natural language analyst phrasing. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model ID (with automatic fallback to `gemini-1.5-flash`). |
| `ANTHROPIC_API_KEY` | `unset` | Anthropic Claude API key for natural language analyst phrasing. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Claude model ID. |
| `ANALYST_PROVIDER` | `auto` | Model selection strategy (`auto`, `gemini`, or `anthropic`). |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend backend URL. |

---

## Testing & Quality Assurance

The backend repository includes an automated test suite comprising **123 unit and integration tests**:

```bash
cd backend
python -m pytest
```

### Coverage Highlights
- **Golden Formula Test**: Verifies the Jevons computation against an exact, hand-calculated mathematical baseline.
- **Axiomatic Tests**: Asserts Time Reversal, Transitivity, and Bounded Influence properties.
- **Quality Filter Tests**: Asserts rejection of zero prices, negative values, and extreme outliers.
- **Fail-Closed Robots Gate Test**: Asserts that unreachable or disallowing `robots.txt` halts ingestion.
- **Key Refusal Test**: Verifies that development keys (`dev-admin-key-change-me`) fail closed when `ENVIRONMENT=production`.

---

## Deliberate Engineering Decisions & Known Limits

1. **Pure Dataframe Functions**: The core index modules (`engine/index.py`, `engine/cells.py`, `engine/quality.py`) are pure functions taking and returning Pandas DataFrames without database dependencies or system clock reads. This ensures mathematical testability.
2. **PostgreSQL in Docker, SQLite Locally**: SQLite requires zero system installation, enabling immediate evaluation on any laptop. Docker provisions production-grade PostgreSQL 16.
3. **Multi-Stage Nginx Frontend**: The frontend container builds an optimized Vite bundle and serves it via Nginx Alpine with gzip compression and client-side SPA routing, rather than running a Node development server in production.
4. **Transparent Disclaimer on Synthetic Series**: When running on synthetic data, all API responses report the synthetic flag, capping the Data Trust Score to prevent misrepresenting simulated numbers as official statistics.

---

**AirIndex (APIx)** · Developed for Smart India Hackathon 2026 · Ministry of Statistics and Programme Implementation
