.PHONY: up down logs seed migrate reset test build

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend npm run migrate

seed:
	docker compose exec backend npm run seed

reset:
	docker compose down -v
	docker compose up --build

test:
	docker compose exec backend npm test

build:
	docker compose build
