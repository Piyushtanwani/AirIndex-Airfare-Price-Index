# AirIndex. Run `make help` for the list.
.PHONY: help install demo serve web test lint clean docker

help:
	@echo "install   Install backend and frontend dependencies"
	@echo "demo      Wipe, generate 90 days of data, compute the index"
	@echo "serve     Run the API on port 8000"
	@echo "web       Run the dashboard on port 5173"
	@echo "test      Run the backend test suite"
	@echo "docker    Bring the whole stack up under Docker Compose"
	@echo "clean     Remove the database and caches"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

demo:
	cd backend && python cli.py demo --days 90

serve:
	cd backend && python cli.py serve

web:
	cd frontend && npm run dev

test:
	cd backend && python -m pytest

docker:
	docker compose up --build

clean:
	rm -f airindex.db airindex.db-wal airindex.db-shm
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf backend/.pytest_cache
