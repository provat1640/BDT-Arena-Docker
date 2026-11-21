# bdt-arena-docker

A Dockerized Bangladesh gaming and simulated-trading starter. It uses BDT (`৳`), Asia/Dhaka time, English/Bengali labels, sandbox bKash/Nagad rails, and simulated FX/gold markets.

## Sandbox guarantee

The default Compose and cloud modes are `PAYMENT_MODE=sandbox` and `MARKET_MODE=simulated`. No real merchant credentials are included. Real adapters must fail closed until credentials and compliance controls are explicitly reviewed.

## Start in GitHub Codespaces

The devcontainer forwards public ports `3000` and `4000` and private port `5432`. It creates `.env` from `.env.example` on first setup.

```bash
make up
```

Or run the equivalent command:

```bash
docker compose up --build
```

Open:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/health`
- PostgreSQL: `localhost:5432`

Useful commands:

```bash
make logs
make migrate
make seed
make test
make down
make reset
```

Demo credentials are seed-only: `demo@bdtarena.local` / `Demo123!Sandbox` and `admin@bdtarena.local` / `Admin123!Sandbox`. Change or remove demo credentials before a public deployment.

## Modules

- JWT access/refresh auth, protected API routes, and bcrypt passwords
- PostgreSQL wallets and locked ledger settlement states
- bKash/Nagad sandbox deposit checkout and withdrawal approval/rejection
- Ludo, Chess, Crash, Dice, Spin, FX, and XAU WebSocket/REST starter engines
- Responsive EN/বাংলা dashboard with wallet, activity drawer, and mobile download portal
- Persistent PostgreSQL volume `pgdata`

## Structure

```text
.devcontainer/       Codespaces and port forwarding
backend/             Express API, PostgreSQL, Socket.IO, migrations, adapters
frontend/            React/Vite/Tailwind dashboard
android-app/         Capacitor Android wrapper
public/downloads/    Served APK placeholder and download route
render.yaml          Render web services
koyeb.yaml           Koyeb service sketch
docs/                Cloud deployment notes
```

## Database

Migrations create `users`, `wallets`, `ledger_transactions`, `payment_requests`, `game_matches`, and `trade_positions`. The backend migrations and seed run during container startup.

## Android

The wrapper is configured through `ANDROID_BACKEND_URL`. Replace `frontend/public/downloads/bdt-arena.apk` with a signed APK and set the real store URL before public distribution. Instructions are in `android-app/README.md`.

## Cloud deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Render, Koyeb, and Google Cloud Run setup. Azure is intentionally not included.
