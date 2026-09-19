"""Forecasting the index.

Four models and a combination of them, all implemented directly on numpy so the project
carries no extra dependency and every step is inspectable:

  seasonal_naive   Last week's value for the same weekday. The benchmark any forecast of
                   a weekly-seasonal series must beat to be worth running.
  drift            Last value plus the average per-day change. Catches trend, ignores
                   seasonality.
  ets              Holt-Winters additive: level, trend and weekly seasonality, smoothed.
  autoregressive   An AR(p) fitted by least squares on differences.
  ensemble         Inverse-error weighted combination of the above, weights fitted on a
                   holdout, which is the part that makes the combination honest.

Two things this module does that a forecast demonstration usually skips.

First, every model is scored on a holdout the model never saw, and the scores are
returned with the forecast. A forecast without an out-of-sample error is a line on a
chart, not a statistic.

Second, the prediction interval is derived from the holdout residuals, widening with the
square root of the horizon, rather than from a formula that assumes the model is correct.
It is still an approximation and it is labelled as one.

An honest limit, stated here rather than discovered by a reader: a fourteen-day airfare
forecast from a ninety-day history is a short-memory extrapolation. It cannot see fuel
price moves, capacity changes, holidays it has not observed before, or policy. It should
be read as a projection of the recent pattern, and it says so in its output.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np

SEASON_LENGTH = 7


@dataclass
class ModelScore:
    name: str
    mae: float
    rmse: float
    mape: float
    weight: float = 0.0


@dataclass
class ForecastPoint:
    date: dt.date
    value: float
    lower: float
    upper: float


@dataclass
class ForecastResult:
    horizon_days: int
    confidence: float
    points: list[ForecastPoint] = field(default_factory=list)
    scores: list[ModelScore] = field(default_factory=list)
    per_model: dict[str, list[float]] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    holdout_days: int = 0

    def as_dict(self) -> dict[str, object]:
        return {
            "horizon_days": self.horizon_days,
            "confidence": self.confidence,
            "holdout_days": self.holdout_days,
            "points": [
                {
                    "date": p.date.isoformat(),
                    "value": round(p.value, 4),
                    "lower": round(p.lower, 4),
                    "upper": round(p.upper, 4),
                }
                for p in self.points
            ],
            "scores": [
                {
                    "model": s.name,
                    "mae": round(s.mae, 4),
                    "rmse": round(s.rmse, 4),
                    "mape": round(s.mape, 4),
                    "ensemble_weight": round(s.weight, 4),
                }
                for s in self.scores
            ],
            "per_model": {
                k: [round(v, 4) for v in values] for k, values in self.per_model.items()
            },
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Individual models. Each takes a history and returns `horizon` values.
# ---------------------------------------------------------------------------

def seasonal_naive(history: np.ndarray, horizon: int) -> np.ndarray:
    if history.size == 0:
        return np.zeros(horizon)
    if history.size < SEASON_LENGTH:
        return np.repeat(history[-1], horizon)
    season = history[-SEASON_LENGTH:]
    return np.array([season[i % SEASON_LENGTH] for i in range(horizon)])


def drift(history: np.ndarray, horizon: int) -> np.ndarray:
    if history.size < 2:
        return np.repeat(history[-1] if history.size else 0.0, horizon)
    slope = (history[-1] - history[0]) / (history.size - 1)
    return history[-1] + slope * np.arange(1, horizon + 1)


def holt_winters(
    history: np.ndarray,
    horizon: int,
    alpha: float = 0.3,
    beta: float = 0.08,
    gamma: float = 0.25,
) -> np.ndarray:
    """Additive Holt-Winters, written out rather than imported.

    Additive rather than multiplicative seasonality: the index is already a ratio, so its
    seasonal swing does not scale with its level.
    """
    n = history.size
    if n < 2 * SEASON_LENGTH:
        return drift(history, horizon)

    seasons = n // SEASON_LENGTH
    season_means = np.array([
        history[i * SEASON_LENGTH : (i + 1) * SEASON_LENGTH].mean() for i in range(seasons)
    ])
    seasonal = np.zeros(SEASON_LENGTH)
    for i in range(SEASON_LENGTH):
        seasonal[i] = np.mean([
            history[j * SEASON_LENGTH + i] - season_means[j] for j in range(seasons)
        ])

    level = history[:SEASON_LENGTH].mean()
    trend = (history[SEASON_LENGTH : 2 * SEASON_LENGTH].mean() - level) / SEASON_LENGTH

    for t in range(n):
        index = t % SEASON_LENGTH
        value = history[t]
        previous_level = level
        level = alpha * (value - seasonal[index]) + (1 - alpha) * (level + trend)
        trend = beta * (level - previous_level) + (1 - beta) * trend
        seasonal[index] = gamma * (value - level) + (1 - gamma) * seasonal[index]

    return np.array([
        level + (h + 1) * trend + seasonal[(n + h) % SEASON_LENGTH] for h in range(horizon)
    ])


def autoregressive(history: np.ndarray, horizon: int, order: int = 7) -> np.ndarray:
    """AR(p) on first differences, fitted by least squares.

    Differencing first because an index level is close to a random walk, and fitting an
    autoregression to a non-stationary level produces a forecast that reverts to a mean
    the series does not have.
    """
    if history.size < order + 3:
        return drift(history, horizon)

    diffs = np.diff(history)
    if diffs.size < order + 1:
        return drift(history, horizon)

    rows = diffs.size - order
    design = np.column_stack([diffs[i : i + rows] for i in range(order)])
    target = diffs[order:]
    design = np.column_stack([design, np.ones(rows)])

    try:
        coefficients, *_ = np.linalg.lstsq(design, target, rcond=None)
    except np.linalg.LinAlgError:
        return drift(history, horizon)

    window = list(diffs[-order:])
    level = history[-1]
    output = []
    for _ in range(horizon):
        features = np.array(window[-order:] + [1.0])
        step = float(features @ coefficients)
        level += step
        window.append(step)
        output.append(level)
    return np.array(output)


MODELS = {
    "seasonal_naive": seasonal_naive,
    "drift": drift,
    "ets": holt_winters,
    "autoregressive": autoregressive,
}


# ---------------------------------------------------------------------------
# Scoring and combination
# ---------------------------------------------------------------------------

def _score(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, float, float]:
    errors = actual - predicted
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors**2)))
    with np.errstate(divide="ignore", invalid="ignore"):
        mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)
    return mae, rmse, (0.0 if np.isnan(mape) else mape)


def forecast(
    dates: list[dt.date],
    values: list[float],
    *,
    horizon: int = 14,
    confidence: float = 0.95,
    holdout: int = 14,
) -> ForecastResult:
    """Fit, score on a holdout, combine, and project forward."""
    history = np.asarray(values, dtype=float)
    result = ForecastResult(horizon_days=horizon, confidence=confidence)

    if history.size < 2 * SEASON_LENGTH + 2:
        result.notes.append(
            f"Only {history.size} observations. At least {2 * SEASON_LENGTH + 2} are "
            "needed before a seasonal model can be fitted, so no forecast is produced."
        )
        return result

    holdout = int(min(holdout, max(3, history.size // 4)))
    train, test = history[:-holdout], history[-holdout:]
    result.holdout_days = holdout

    scores: list[ModelScore] = []
    for name, model in MODELS.items():
        try:
            predicted = model(train, holdout)
        except Exception as exc:  # noqa: BLE001 - a failed model is excluded, not fatal
            result.notes.append(f"{name} failed to fit and was excluded: {exc}")
            continue
        mae, rmse, mape = _score(test, np.asarray(predicted, dtype=float))
        scores.append(ModelScore(name=name, mae=mae, rmse=rmse, mape=mape))

    if not scores:
        result.notes.append("No model could be fitted.")
        return result

    # Inverse-error weights, so a model that did badly out of sample contributes little.
    inverse = np.array([1.0 / max(s.rmse, 1e-6) for s in scores])
    weights = inverse / inverse.sum()
    for score, weight in zip(scores, weights, strict=True):
        score.weight = float(weight)
    result.scores = sorted(scores, key=lambda s: s.rmse)

    projections: dict[str, np.ndarray] = {}
    for score in scores:
        projections[score.name] = np.asarray(
            MODELS[score.name](history, horizon), dtype=float
        )
    combined = sum(
        projections[s.name] * s.weight for s in scores
    )

    # Interval from the holdout residuals of the combination itself, not from any single
    # model's assumptions.
    holdout_predictions = sum(
        np.asarray(MODELS[s.name](train, holdout), dtype=float) * s.weight for s in scores
    )
    residual_sd = float(np.std(test - holdout_predictions, ddof=1)) if holdout > 2 else 0.0
    z = 1.959964 if confidence >= 0.95 else 1.644854

    last_date = dates[-1]
    points = []
    for step in range(horizon):
        # The interval widens with the square root of the horizon, which is the random
        # walk assumption. It is an approximation and the note below says so.
        spread = z * residual_sd * np.sqrt(step + 1)
        value = float(combined[step])
        points.append(
            ForecastPoint(
                date=last_date + dt.timedelta(days=step + 1),
                value=value,
                lower=value - spread,
                upper=value + spread,
            )
        )

    result.points = points
    result.per_model = {name: list(map(float, values)) for name, values in projections.items()}
    best = result.scores[0]
    result.notes.extend([
        f"Models were scored on a {holdout} day holdout they did not see. The best "
        f"single model was {best.name.replace('_', ' ')} with a root mean squared error "
        f"of {best.rmse:.2f} index points.",
        "The ensemble weights each model by the inverse of that error.",
        f"The {confidence:.0%} interval comes from the ensemble's own holdout residuals "
        "and widens with the square root of the horizon. It is an approximation, and it "
        "does not cover shocks the history contains no example of.",
        "This is an extrapolation of a recent pattern. It cannot see fuel prices, "
        "capacity changes, holidays absent from the history, or policy.",
    ])
    if best.name == "seasonal_naive":
        result.notes.append(
            "The naive benchmark won. That means the fitted models added nothing on this "
            "history, and the forecast should be treated as little more than a "
            "persistence rule."
        )
    return result
