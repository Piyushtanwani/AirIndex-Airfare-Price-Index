"""Application entry point."""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.analytics import router as analytics_router
from app.api.endpoints import router as v1_router
from app.core.config import get_methodology_config, get_settings
from app.db.session import init_db

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("airindex.api")

settings = get_settings()

DESCRIPTION = """
A real-time airfare price index for India, built for Smart India Hackathon problem
statement SIH26056 (Ministry of Statistics and Programme Implementation).

This is a statistical instrument for augmenting the Consumer Price Index, not a fare
comparison service. Every index value carries the methodology version it was computed
under, its coverage, and the number of cells that were imputed rather than observed.

Read `/v1/methodology` before using any number from this API.
"""

app = FastAPI(
    title="AirIndex API",
    description=DESCRIPTION,
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["X-API-Key", "Content-Type"],
)


@app.middleware("http")
async def add_standard_headers(request: Request, call_next):
    """Timing, methodology version and rate-limit headers on every response."""
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
    response.headers["X-Methodology-Version"] = str(
        get_methodology_config().get("methodology_version", "apix-0")
    )
    remaining = getattr(request.state, "rate_limit_remaining", None)
    if remaining is not None:
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Limit"] = str(settings.rate_limit_per_minute)
    return response


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    logger.info("AirIndex API %s started in %s mode", __version__, settings.environment)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak a stack trace to a caller, but never lose one from the log either."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal error. The incident has been logged."},
    )


@app.get("/", tags=["system"])
def root() -> dict[str, object]:
    return {
        "name": "AirIndex",
        "description": "Real-time airfare price index for India (SIH26056)",
        "version": __version__,
        "docs": "/docs",
        "api": "/v1",
        "methodology": "/v1/methodology",
        "disclaimer": (
            "A research prototype. Index values computed from the synthetic source are "
            "a demonstration of the method, not a measurement of Indian airfares."
        ),
    }


app.include_router(v1_router)
app.include_router(analytics_router)
