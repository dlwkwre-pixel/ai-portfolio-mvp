# Kronos forecast service

FastAPI wrapper around [Kronos-mini](https://github.com/shiyu-coder/Kronos)
(MIT license), a foundation model for financial time-series forecasting.
Feeds BuyTune's Watchlist "AI price forecast" panel.

Deployed as a Docker web service on **Render's free tier**. Kronos-mini (not
the larger Kronos-small) was picked deliberately: measured locally at ~333MB
peak RSS end-to-end (torch + pandas + tokenizer + model + one inference
call), comfortably under Render's free-tier 512MB RAM cap — Kronos-small
measured ~422MB, too close to the limit to risk the process getting OOM-killed
in production. See `app.py`'s module docstring for the raw numbers.

## Deploy

1. Make sure this `kronos-service/` folder (part of the `ai-portfolio-mvp`
   repo) is pushed to GitHub — Render deploys by pulling from a connected
   GitHub repo, not a direct `git push` like some other platforms.
2. Go to https://dashboard.render.com/ → **New** → **Web Service**.
3. Connect the `ai-portfolio-mvp` GitHub repo.
4. Configure the service (these are monorepo-specific fields — Render only
   builds/deploys what's inside the Root Directory you set):
   - **Root Directory**: `kronos-service`
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `Dockerfile` (relative to the Root Directory above)
   - **Docker Build Context Directory**: `.` (relative to the Root Directory)
   - **Instance Type**: **Free**
5. Under **Environment Variables**, add:
   - `KRONOS_API_KEY` — any random string you generate (e.g.
     `openssl rand -hex 32`). This becomes the shared secret the Next.js app
     sends as the `X-Api-Key` header. If you skip this, the endpoint is open
     to anyone with the URL.
6. Click **Create Web Service**. The first build downloads + bakes in the
   model weights, so it takes several minutes — subsequent builds are faster
   via Docker layer caching. Watch the **Logs** tab for the service starting
   up cleanly (no crash/restart loop — that would mean it's running out of
   memory).
7. Note the service's URL, shown at the top of the service page — it's
   something like `https://<service-name>.onrender.com`. That's your
   `KRONOS_SERVICE_URL`.

## Verify it works before wiring up the app

```bash
curl https://<service-name>.onrender.com/health

curl -X POST https://<service-name>.onrender.com/forecast \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <the secret you set>" \
  -d '{
    "ticker": "AAPL",
    "pred_len": 5,
    "history": [
      {"timestamp":"2026-06-01T00:00:00Z","open":195,"high":197,"low":194,"close":196,"volume":50000000},
      ... at least 30 rows, ideally 200-400 daily candles ...
    ]
  }'
```

A healthy response is a `forecast` array of `pred_len` rows with plausible
(non-zero, non-NaN) OHLC values in the same ballpark as the input history.

**Free-tier notes:**
- The service spins down after **15 minutes** of inactivity. The first
  request after that can take about a minute while it spins back up — this
  is expected and is handled by the app's loading state. This is a shorter
  and more frequent cold-start window than a paid always-on instance, so
  expect it on most real uses, not just occasional ones.
- Render grants 750 free instance-hours/month per workspace; a spun-down
  service doesn't consume those hours, so this alone shouldn't run out for a
  single low-traffic service.
- The filesystem is ephemeral — fine here, since the model weights are baked
  into the image at build time, not downloaded/cached at runtime.
