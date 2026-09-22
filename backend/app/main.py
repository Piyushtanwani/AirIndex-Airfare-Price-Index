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

# Direct aliases for prompt endpoint spec /api/flight-status & /api/airports
from app.api.endpoints import get_flight_status, get_airports, get_corridor_intelligence, FLIGHT_STATUS_DB, AIRPORTS_DB

@app.get("/api/flight-status", tags=["aviation"])
def api_flight_status(
    flight: str = "SG8194",
    date: str = "today",
):
    return get_flight_status(flight=flight, date=date)

@app.get("/api/airports", tags=["aviation"])
def api_airports():
    return get_airports()

@app.get("/api/corridor/{origin}/{destination}", tags=["aviation"])
def api_corridor(origin: str, destination: str):
    return get_corridor_intelligence(origin=origin, destination=destination)

# WebSocket for live aircraft updates every 5 sec
from fastapi import WebSocket, WebSocketDisconnect
import asyncio

@app.websocket("/ws/flights")
async def websocket_flights(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected to /ws/flights")
    try:
        step = 0
        while True:
            # Interpolate plane coordinates slightly to simulate smooth flight movement
            step += 1
            delta = (step % 10) * 0.05
            
            aircraft_positions = [
                {
                    "id": "fl-1",
                    "flightNo": "6E218",
                    "flightNumber": "6E 218",
                    "callsign": "IGO218",
                    "airline": "IndiGo",
                    "aircraft": "Airbus A320neo",
                    "registration": "VT-IFK",
                    "origin": "DEL",
                    "destination": "BOM",
                    "latitude": 23.4 - delta * 0.4,
                    "longitude": 75.8 - delta * 0.3,
                    "heading": 215,
                    "speed": "842 km/h",
                    "altitude": "36,000 ft",
                    "progress": min(95, 63 + step % 30),
                    "status": "enroute",
                    "apix": 109.4,
                    "cheapestFare": 4280,
                    "volatility": 18.4,
                },
                {
                    "id": "fl-2",
                    "flightNo": "AI864",
                    "flightNumber": "AI 864",
                    "callsign": "AIC864",
                    "airline": "Air India",
                    "aircraft": "Airbus A321neo",
                    "registration": "VT-EXQ",
                    "origin": "DEL",
                    "destination": "CCU",
                    "latitude": 25.1 + delta * 0.1,
                    "longitude": 83.2 + delta * 0.5,
                    "heading": 115,
                    "speed": "865 km/h",
                    "altitude": "38,000 ft",
                    "progress": min(95, 20 + step % 40),
                    "status": "delayed",
                    "delayMinutes": 45,
                    "apix": 118.2,
                    "cheapestFare": 5120,
                    "volatility": 22.1,
                },
                {
                    "id": "fl-4",
                    "flightNo": "SG8194",
                    "flightNumber": "SG 8194",
                    "callsign": "SEJ8194",
                    "airline": "SpiceJet",
                    "aircraft": "Boeing 737-800",
                    "registration": "VT-SGB",
                    "origin": "AMD",
                    "destination": "DEL",
                    "latitude": 25.4,
                    "longitude": 74.8,
                    "heading": 25,
                    "speed": "0 km/h",
                    "altitude": "0 ft",
                    "progress": 0,
                    "status": "cancelled",
                    "apix": 98.4,
                    "cheapestFare": 2980,
                    "volatility": 8.4,
                },
            ]
            
            await websocket.send_json({
                "type": "aircraft_update",
                "timestamp": time.time(),
                "flights": aircraft_positions,
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected from /ws/flights")
    except Exception as err:
        logger.warning("WebSocket loop ended: %s", err)

