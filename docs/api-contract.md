# AirIndex API contract (v1)

Base URL in development: `http://localhost:8000`
All responses are JSON unless stated otherwise. All money values are Indian Rupees.
Every payload carries `methodology_version` and `as_of` where meaningful.

Authentication: header `X-API-Key`. When `API_KEY_REQUIRED=false` (the development default)
read endpoints are open. Admin endpoints always require a key with the `admin` scope.

---

## GET /v1/health

```json
{ "status": "ok", "version": "0.1.0", "methodology_version": "apix-1.0.0", "database": "ok" }
```

## GET /v1/methodology

```json
{
  "methodology_version": "apix-1.0.0",
  "index_type": "Weighted Jevons (geometric mean of price relatives)",
  "formula": "APIx_t = 100 * exp( SUM_i w_i * ln(P_i_t / P_i_0) / SUM_i w_i )",
  "price_basis": "total_fare",
  "base_period": { "start": "2026-06-21", "end": "2026-06-23", "value": 100.0 },
  "lead_times": [1, 7, 15, 30, 45],
  "lead_time_weights": { "1": 0.1, "7": 0.2, "15": 0.3, "30": 0.25, "45": 0.15 },
  "min_obs_per_cell": 3,
  "mad_threshold": 3.5,
  "coverage_threshold": 0.6,
  "weights_source": "DGCA monthly city-pair domestic passenger traffic (proxy)",
  "weights_asof": "2026-07-01",
  "revisions_policy": "Intraday values are provisional. ...",
  "routes_in_basket": 15,
  "cells_in_basket": 75,
  "notes": ["..."]
}
```

## GET /v1/routes

```json
{
  "as_of": "2026-09-19",
  "methodology_version": "apix-1.0.0",
  "count": 15,
  "items": [
    {
      "id": 1, "code": "DEL-BOM",
      "origin": "DEL", "destination": "BOM",
      "origin_city": "Delhi", "dest_city": "Mumbai",
      "active": true,
      "weight": 0.1242, "weight_source": "DGCA city-pair traffic (proxy)", "weight_asof": "2026-07-01",
      "latest_apix": 104.7, "wow_pct": 2.1, "mom_pct": -1.3,
      "obs_30d": 312, "coverage": 1.0
    }
  ]
}
```

## GET /v1/index

Query: `scope` = `national` | `route` | `airline` (default `national`), `route` = route code
(required when scope is route), `airline` = airline code (required when scope is airline),
`from` / `to` = ISO dates, `window` = one of `T+1,T+7,T+15,T+30,T+45` or `all` (default `all`).

```json
{
  "scope": "national", "scope_id": null, "window": "all",
  "methodology_version": "apix-1.0.0", "as_of": "2026-09-19", "count": 90,
  "items": [
    {
      "date": "2026-09-19", "apix": 104.7, "wow_pct": 2.1, "mom_pct": -1.3,
      "coverage": 0.96, "obs_count": 312, "imputed_cells": 2,
      "published_at": "2026-09-19T03:05:00Z", "provisional": false
    }
  ]
}
```

## GET /v1/index/latest

Query: `scope`, `route`, `window` as above.

```json
{
  "as_of": "2026-09-19", "methodology_version": "apix-1.0.0",
  "item": { "date": "2026-09-19", "apix": 104.7, "wow_pct": 2.1, "mom_pct": -1.3,
            "coverage": 0.96, "obs_count": 312, "imputed_cells": 2,
            "published_at": "2026-09-19T03:05:00Z", "provisional": false },
  "top_movers": [ { "code": "BLR-DEL", "apix": 112.4, "wow_pct": 6.8 } ]
}
```

## GET /v1/index/heatmap

Query: `route` (required), `days` (default 30).
Lead-time heatmap for one route.

```json
{
  "route": "DEL-BOM", "as_of": "2026-09-19",
  "lead_times": [1, 7, 15, 30, 45],
  "dates": ["2026-08-21", "..."],
  "cells": [ { "date": "2026-09-19", "lead_time_days": 15, "apix": 103.2,
               "min_logical_fare": 5120.0, "obs_count": 6, "imputed": false } ]
}
```

## GET /v1/fares

Query: `route`, `date` (departure date), `airline`, `window`, `page` (1-based), `page_size`
(default 50, max 500).

```json
{
  "page": 1, "page_size": 50, "total": 1284,
  "items": [
    {
      "id": 9001, "route": "DEL-BOM", "departure_date": "2026-10-04",
      "captured_at": "2026-09-19T02:10:00Z", "lead_time_days": 15,
      "airline_code": "6E", "airline_name": "IndiGo",
      "base_fare": 4100.0, "taxes": 780.0, "udf": 150.0, "convenience_fee": 90.0,
      "total_fare": 5120.0, "currency": "INR",
      "is_valid": true, "quality_flags": [], "source": "synthetic"
    }
  ]
}
```

## GET /v1/quality/summary

```json
{
  "as_of": "2026-09-19", "window_days": 30,
  "totals": {
    "raw_observations": 41250, "valid_fares": 40810, "invalid_fares": 440,
    "validation_pass_rate": 0.9893, "duplicates_rejected": 118,
    "outliers_excluded": 212, "imputed_cells": 37, "coverage_latest": 0.96
  },
  "flags": [ { "flag": "outlier_mad", "count": 212 } ],
  "sources": [
    { "code": "synthetic", "name": "Synthetic calibrated generator", "kind": "synthetic",
      "enabled": true, "robots_ok": true, "last_run_at": "2026-09-19T02:00:00Z",
      "last_status": "success", "requests": 375, "failures": 0 }
  ],
  "daily": [
    { "date": "2026-09-19", "obs_count": 1375, "valid": 1361, "invalid": 14,
      "outliers": 7, "imputed": 2, "coverage": 0.96 }
  ]
}
```

## GET /v1/export.csv

Same filters as `/v1/index`. Returns `text/csv` with header row
`date,scope,scope_id,window,apix,wow_pct,mom_pct,coverage,obs_count,methodology_version`.

## POST /v1/admin/recompute

Requires an admin key. Body `{ "days": 90 }`.

```json
{ "status": "ok", "days": 90, "index_values_written": 1440 }
```

---

## Errors

```json
{ "detail": "Route 'XXX-YYY' not found" }
```

Status codes: 400 invalid query, 401 missing or invalid key, 403 insufficient scope,
404 unknown entity, 429 rate limited, 503 database unavailable.
