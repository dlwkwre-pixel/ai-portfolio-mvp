---
title: BuyTune Kronos Forecast
emoji: 📈
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
---

# Kronos forecast service

FastAPI wrapper around [Kronos-small](https://github.com/shiyu-coder/Kronos)
(MIT license), a foundation model for financial time-series forecasting.
Feeds BuyTune's Watchlist "AI price forecast" panel.

## Deploy

1. Create a new Space at https://huggingface.co/new-space:
   - SDK: **Docker**
   - Hardware: **CPU basic** (free tier)
   - Visibility: your choice (Private is fine — the app calls it server-side)
2. Push this folder's contents (`app.py`, `Dockerfile`, `requirements.txt`,
   this `README.md`) to the Space's git repo:
   ```bash
   cd kronos-space
   git init
   git remote add space https://huggingface.co/spaces/<your-username>/<space-name>
   git add .
   git commit -m "Kronos forecast service"
   git push space main
   ```
   (Use your Hugging Face username/write token when prompted — Settings →
   Access Tokens on huggingface.co.)
3. In the Space's **Settings → Variables and secrets**, add a secret:
   - `KRONOS_API_KEY` — any random string you generate (e.g.
     `openssl rand -hex 32`). This becomes the shared secret the Next.js app
     sends as the `X-Api-Key` header. If you skip this, the endpoint is open
     to anyone with the URL.
4. Wait for the build to finish (first build downloads + bakes in the model
   weights, so it takes several minutes — subsequent builds are faster via
   Docker layer caching). Check the **Logs** tab for `Kronos predictor
   ready.`
5. Note the Space's URL — it's `https://<your-username>-<space-name>.hf.space`
   (shown under "Embed this Space" in the Space's header). That's your
   `KRONOS_SERVICE_URL`.

## Verify it works before wiring up the app

```bash
curl https://<your-username>-<space-name>.hf.space/health

curl -X POST https://<your-username>-<space-name>.hf.space/forecast \
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

**Free-tier note:** the Space sleeps after a period of inactivity. The first
request after it wakes can take 30-60s+ while the container restarts (model
weights are baked into the image, so no re-download is needed — just the
container boot). This is expected and is handled by the app's loading state.
