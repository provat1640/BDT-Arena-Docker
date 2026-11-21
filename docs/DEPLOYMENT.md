# Deployment

The platform supports free-tier Docker hosting without Azure. Production-like deployment must use an externally managed PostgreSQL instance and HTTPS domains.

## Render

1. Create a PostgreSQL database and copy its external connection URL.
2. Apply `render.yaml`, then set `DATABASE_URL`, `CORS_ORIGIN`, and `PUBLIC_BACKEND_URL` in the service dashboard.
3. Set `VITE_PUBLIC_BACKEND_URL` to the backend's HTTPS URL before building the web service.
4. Render free-tier services sleep after inactivity. The first request can take roughly 30-60 seconds; use a health pinger or keep-alive only within the provider's free-tier limits.

## Koyeb

1. Deploy PostgreSQL separately or use a Koyeb managed database.
2. Deploy `backend/Dockerfile` and `frontend/Dockerfile` as separate services.
3. Set the same required secrets and public URLs shown in `.env.example`.
4. Configure CORS for the frontend's exact HTTPS origin.

## Google Cloud Run

```bash
PROJECT_ID=replace-me
REGION=asia-south1

gcloud run deploy bdt-arena-backend \
  --source backend --region "$REGION" --allow-unauthenticated \
  --set-env-vars PAYMENT_MODE=sandbox,MARKET_MODE=simulated,TZ=Asia/Dhaka \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,
JWT_ACCESS_SECRET=JWT_ACCESS_SECRET:latest,
JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest

gcloud run deploy bdt-arena-web --source frontend --region "$REGION" --allow-unauthenticated
```

Cloud SQL or a private PostgreSQL endpoint is preferred. Build Cloud Run with a memory setting sufficient for Node.js and use the backend health endpoint for readiness.

## Cold starts

- WebSocket connections may need to reconnect after an instance sleeps.
- Keep clients retrying with Socket.IO's built-in reconnection.
- Do not expose database ports publicly.
- Use HTTPS and provider-secret managers for JWT and database credentials.
- Payment and market modes must remain `sandbox` and `simulated` until a separate compliance/security release is reviewed.
