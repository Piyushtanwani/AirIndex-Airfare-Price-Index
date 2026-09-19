# AirIndex methodology

Version `apix-1.0.0` · Problem statement SIH26056 · Ministry of Statistics and Programme
Implementation

This document is the published method. It is written so that somebody who has never seen
the code can reproduce the index from the stored observations, and so that somebody who
disagrees with a choice can see exactly which choice they disagree with.

Machine-readable form: `GET /v1/methodology`, served from `backend/config/methodology.yaml`.
The dashboard renders that response rather than restating it, so the two cannot drift.

---

## 1. What is being measured

The Airfare Price Index (APIx) measures the change over time in the price of domestic
economy air travel in India, across a fixed basket of city pairs and booking lead times.

It is a price index, not a fare finder. It answers "did air travel get more expensive this
month, and by how much". It does not answer "what should I pay for this flight" and it is
not capable of doing so.

### The basket

| Dimension | Content |
|---|---|
| Routes | 15 domestic city pairs, listed in `backend/config/routes.yaml` |
| Lead times | T+1, T+7, T+15, T+30, T+45 days before departure |
| Cells | 15 × 5 = 75 priced cells |
| Cabin | Economy only |
| Trip type | One way only |

A cell is one route at one lead time. The basket is fixed: routes are not added or removed
between recomputations, because a basket that changes while the index runs mixes price
change with composition change.

### The price

Each cell has one price per day: the **minimum logical fare**, the cheapest valid total
fare observed in that cell that day, across every airline and departure time.

**Total fare** means base fare plus taxes plus statutory fees plus any convenience charge.
That is what the household actually pays. Components are stored separately, so a
base-fare-only index can be produced later without recollecting anything.

Why the minimum rather than a mean:

- It is a price a traveller could actually have transacted at. A mean of displayed fares is
  not, because nobody buys the average of a results page.
- It does not move when a portal reorders its results or adds a carrier to the page.
- It is what a household comparing options anchors on.

The cost of this choice is that a minimum is sensitive to one mispriced observation. That
is why the outlier rule runs before the minimum is taken, not after.

---

## 2. The formula

The elementary aggregate is a **weighted Jevons index**, a geometric mean of price
relatives:

```
APIx_t = 100 × exp( Σ_i w_i · ln(P_i,t / P_i,0) / Σ_i w_i )
```

where `i` indexes cells, `P_i,t` is the minimum logical fare in cell `i` on day `t`,
`P_i,0` is that cell's base-period price, and `w_i` is its weight.

This is the formula the ILO/IMF *Consumer Price Index Manual* (2020) prescribes for
elementary aggregates without within-aggregate expenditure weights, and the one the UK
Office for National Statistics applies to its web-scraped price indices. It is deliberately
not a bespoke formula: a national statistical office cannot adopt a method it has to take
on faith.

Two properties of the geometric mean matter here and are asserted in the test suite:

- **Base invariance.** Rebasing the reference prices changes the level of the index and not
  the measured movement between any two days.
- **Bounded influence.** One expensive cell cannot dominate. Indian domestic fares span an
  order of magnitude across routes, so this is not an academic concern. An arithmetic mean
  of relatives, the Carli index, has a known upward bias; `/v1/analytics/formulas` computes
  it alongside the others so the size of that bias is visible rather than argued about.

---

## 3. Weights

Weights enter the index in exactly one place, `backend/config/weights.yaml`, and the engine
accepts them from nowhere else.

```
w_i = route_weight(route of i) × lead_time_weight(lead time of i)
```

normalised to sum to one over the active basket.

**Route weights.** The problem statement asks for weighting by route passenger volume. The
authoritative source is the DGCA monthly domestic city-pair traffic release. The values
currently shipped are **not** that series. They are a declared proxy based on published
scheduled-seat capacity, and every response that depends on them reports
`weights_are_official: false`.

The proxy has a known bias, stated rather than buried: seats offered is not seats sold, so
routes with below-average load factors are overweighted. Replacing the proxy with the real
DGCA series is a data task and not a code change: overwrite `route_shares`, set `source`
and `asof`, set `official: true`, and rerun `python cli.py recompute`.

**Lead-time weights.** The share of bookings made at each booking window, bucketed to the
five windows in the basket from the published Indian booking-curve literature. Also a
proxy, also labelled as one.

The rule the code enforces: **never invent a weight.** A route with no sourced share is left
out of the basket rather than guessed at. Where no weights at all are configured, the engine
falls back to equal weighting and logs a warning rather than fabricating shares that would
look authoritative.

---

## 4. The base period

The index is 100 over the **mean of the first three consecutive days that each clear the
coverage threshold**.

A single-day base is fragile. One promotional fare inside it deflates that cell's base
price and inflates every relative computed against it for the rest of the series. Averaging
over three qualifying days costs nothing and removes that failure mode.

Base prices are computed once and **stored** in the `base_periods` table rather than
recomputed on each run. The base is the one thing in an index that must not move when the
data behind it is reprocessed.

A cell with no observation inside the base window gets no base price and is excluded from
the index until the base is next established. That is the honest outcome: there is nothing
to measure it against.

---

## 5. Data quality

### Validation, per observation

| Rule | Outcome |
|---|---|
| Currency is not INR | Rejected |
| Fare is zero, negative or unparseable | Rejected |
| Fare below ₹500 or above ₹100,000 | Rejected as implausible |
| Lead time not in the basket | Rejected |
| Cabin is not economy | Rejected |
| A negative fare component | Rejected |
| Components do not sum to the total | Flagged, not rejected. The index prices the total |
| Components were apportioned rather than itemised | Flagged, not rejected |

Nothing is deleted. A rejected fare stays in the database with the reason recorded, because
a statistical office will ask what was discarded and why. `/v1/quality/summary` reports the
counts.

### Outliers

Within each cell each day, a **median absolute deviation** rule on the **logarithm** of the
fare. A fare whose modified z-score exceeds 3.5 is excluded from that day's cell and
flagged.

Logarithms first, because fare distributions are right-skewed: the cheap tail is bounded at
zero and the expensive tail is not. Without the transform the rule treats an ordinary
expensive fare as an outlier and misses an implausibly cheap one.

Cells with fewer than four observations are left alone. With three observations the median
absolute deviation is not a meaningful dispersion estimate, and applying it anyway would
strip real prices from exactly the thin cells that can least afford to lose them.

### Missing data

A cell with fewer than three valid observations on a day does not have its relative
recomputed. It carries forward its last published relative and is marked **imputed**.

Carry-forward only. A gap before a cell's first ever observation stays a gap. Filling it
backwards would not be imputation, it would be inventing a price that precedes any
measurement.

### Coverage and the publication threshold

```
coverage = (weight of cells with fresh, non-imputed data) / (total weight)
```

An index value is published only when coverage reaches **60 per cent**. Below that the
value is computed, stored and marked unpublished, so a gap in the series is visible and
explainable rather than silently absent.

Every published value carries its coverage and its imputed-cell count. A reader who wants
to discount a thin day has the numbers to do it.

---

## 6. Revisions

Values computed before a day's collection completes are marked provisional and may be
revised once. A published value is revised only when a data-quality defect is found in its
inputs, and every revision keeps a pointer to the value it replaced.

Each stored value records the methodology version it was computed under, and that field is
never rewritten. A methodology change is expressed by bumping the version, not by quietly
recomputing history under a new method.

---

## 7. What the back-test can and cannot show

The proposal promised a thirty-day back-test. A back-test in the usual sense compares a
computed series against an independent reference and reports how closely it tracks.

**India publishes no public high-frequency airfare index.** There is no reference series to
compare against. Reporting a correlation, a mean absolute error and a directional accuracy
against a reference that does not exist would be fabrication, so this project does not do
it. `compare_against_reference` exists in the code and refuses to produce metrics when
handed nothing.

What is reported instead, at `/v1/backtest`, is what a statistical office actually
interrogates before adopting a series:

| Diagnostic | Question it answers |
|---|---|
| Stability replay | How much does a published value move when recomputed on later data |
| Revision size and bias | Are revisions large, and do they lean one way |
| Publication rate | How often does the series clear its own threshold |
| Coverage | How much of the basket is actually observed |
| Leave-one-out | How much can any single route move the headline |

On the shipped synthetic history the replay reports zero revisions. That is correct and
uninteresting: the history is generated in one batch with no late-arriving data, so there is
nothing to revise. Against a live source the number becomes meaningful.

---

## 8. Derived analytics, and their standing

Everything in `/v1/analytics/*` sits on top of the published index and never feeds back into
it. A reader who trusts only the measurement can ignore the whole module.

| Endpoint | Standing |
|---|---|
| `formulas` | Real computations. The quantity-dependent formulas rest on a stated assumption; see below |
| `trust` | Measured properties of the data, weighted into one score |
| `forecast` | An extrapolation, scored out of sample, with its limits stated in the response |
| `scenario` | Arithmetic over stated priors. Not an econometric model |
| `anomalies` | A statistical flag on the published series |
| `ask` | Composed from stored data. No number originates in a language model |

### The quantity problem

Laspeyres, Paasche, Fisher, Törnqvist and Walsh are functions of prices **and quantities**
in two periods. Airfare collection observes prices. Nobody publishes seats sold by route and
booking window in India.

So the quantities have to come from somewhere, and the module makes that visible rather than
hiding it behind a menu of formula names:

- `fixed` holds quantities constant. Laspeyres and Paasche then coincide **by construction**,
  and Fisher, Walsh and Törnqvist collapse onto them. Presenting five identical numbers as
  five methods is statistical theatre, and this mode exists so that is visible. The test
  suite asserts the collapse.
- `observed_availability` uses the count of fares observed per cell. Genuinely observed and
  genuinely period-varying, but it measures supply on a page, not purchases.
- `elasticity_model`, the default, implies quantities from a cited own-price elasticity.
  A model, not a measurement, and labelled as one in every response.

### The scenario simulator

Every coefficient lives in `backend/config/policy.yaml` and is returned with every result.
None is estimated from AirIndex data; estimating them would need fuel prices, capacity data
and a published CPI airfare series that this project does not have.

The CPI airfare weight currently shipped is a **placeholder**. Until the official MoSPI
weighting diagram value replaces it, the simulator reports an illustrative transmission and
refuses to describe its output as a CPI impact. The sensitivity table shows how much of any
answer each assumption is responsible for, so a result driven by a prior rather than by the
shock is obvious at a glance.

---

## 9. Known limitations

Stated here and served at `/v1/methodology` so they travel with the data.

1. Weights are a declared scheduled-seat proxy, not official DGCA passenger volumes.
2. The basket covers fifteen city pairs. It is not a census of domestic routes.
3. Economy, one-way only. Return and premium cabins are out of scope.
4. Ancillary charges chosen at booking, such as seats and baggage, are not included.
5. The default source is a synthetic generator. Any index computed from it demonstrates the
   method and measures nothing. This is reported everywhere, and it caps the trust score.
6. No external reference series exists, so the back-test is internal.
7. The rate limiter is in process memory and does not survive horizontal scaling.
8. The schema is created from the models rather than by migration, which suits a prototype
   with no production history and would not suit a deployment with one.

---

## 10. Sources

- International Labour Organization and International Monetary Fund, *Consumer Price Index
  Manual: Concepts and Methods* (2020), on elementary aggregate formulas.
- UK Office for National Statistics, published research on the use of web-scraped prices in
  consumer price statistics.
- Directorate General of Civil Aviation, monthly domestic traffic statistics, the intended
  source for route weights.
- Indian Institute of Management Ahmedabad, published studies of domestic airfare movement
  and booking-window behaviour.
- Ministry of Statistics and Programme Implementation, CPI concepts and the weighting
  diagram, the intended source for the airfare CPI weight.
