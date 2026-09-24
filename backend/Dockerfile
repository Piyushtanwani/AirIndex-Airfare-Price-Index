# ==============================================================================
# AirIndex Backend - Production Dockerfile
# ==============================================================================
# Serves both the FastAPI application (`api`) and the background scheduler
# (`collector`). The entry command determines whether this container serves
# HTTP requests or runs scheduled ingestion tasks.
#
# Playwright and headless Chromium are optional. By default (INSTALL_PLAYWRIGHT=false),
# the image builds fast and lightweight for synthetic data and licensed feeds.
# To enable live browser adapters (pending compliance review), build with:
#   docker build --build-arg INSTALL_PLAYWRIGHT=true -t airindex-backend ./backend
# ==============================================================================

FROM python:3.12-slim

# Prevent Python from buffering stdout/stderr and writing bytecode
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install minimal OS dependencies required for healthchecks and network probes
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for optimal Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Optional: Install Playwright and Chromium browser binaries if requested at build time
ARG INSTALL_PLAYWRIGHT=false
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then \
        echo "Installing Playwright Chromium dependencies..." \
        && playwright install --with-deps chromium \
        && mkdir -p /ms-playwright \
        && chmod -R 777 /ms-playwright ; \
    else \
        mkdir -p /ms-playwright ; \
    fi

# Copy the rest of the application codebase
COPY . .

# Security: Run as unprivileged user 'airindex' (UID 10001)
RUN useradd --create-home --uid 10001 airindex \
    && chown -R airindex:airindex /app /ms-playwright

USER airindex

# Expose API port
EXPOSE 8000

# Docker healthcheck targeting the FastAPI liveness & DB probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/v1/health || exit 1

# Default command: FastAPI web server.
# Overridden in docker-compose.yml for the background collector service.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
