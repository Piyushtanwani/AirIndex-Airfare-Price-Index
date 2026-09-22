# AirIndex backend.
#
# Playwright and the live portal adapters are deliberately not installed here. They are
# heavy, they are off by default, and a container that ships a browser implies the
# project scrapes portals as its normal mode of operation, which it does not. To build an
# image that can run them, add the scraper requirements and `playwright install`.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium \
    && chmod -R 777 /ms-playwright

COPY . .

# Run as an unprivileged user. The collector reaches out to the network, so it should
# not be root while doing it.
RUN useradd --create-home --uid 10001 airindex \
    && chown -R airindex:airindex /app

USER airindex

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
