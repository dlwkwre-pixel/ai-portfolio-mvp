"""
Kronos forecast service — FastAPI wrapper around the Kronos-mini foundation
model (https://github.com/shiyu-coder/Kronos, MIT) for BuyTune's Watchlist
"AI price forecast" panel.

Deployed as a Docker web service on Render's free tier (512MB RAM / 0.1 CPU
cap) — Kronos-mini (4.1M params) was measured at ~333MB peak RSS end-to-end
(torch + pandas + tokenizer + model + one inference call), leaving real
headroom under that cap; Kronos-small (24.7M params) measured ~422MB, too
close to the limit to risk an OOM kill in production. See
docs/roadmap/kronos-forecast-into-ai-recommendations.md for the tradeoff.

The tokenizer + model are loaded once at import time (container startup), so
only the first request after the free-tier service wakes from a 15-minute
idle sleep pays the container boot cost — not per-request model loading.
"""

import os
from typing import Optional

import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from model import Kronos, KronosPredictor, KronosTokenizer

MODEL_ID = os.environ.get("KRONOS_MODEL_ID", "NeoQuasar/Kronos-mini")
TOKENIZER_ID = os.environ.get("KRONOS_TOKENIZER_ID", "NeoQuasar/Kronos-Tokenizer-2k")
MAX_CONTEXT = int(os.environ.get("KRONOS_MAX_CONTEXT", "2048"))
# Shared secret checked against the `X-Api-Key` header. Set this as a Render
# environment variable. If left unset the endpoint is open to anyone with the
# URL — fine for a first smoke test, not recommended once wired into the live app.
API_KEY = os.environ.get("KRONOS_API_KEY")

PRICE_COLS = ["open", "high", "low", "close"]

print(f"Loading {TOKENIZER_ID} ...")
_tokenizer = KronosTokenizer.from_pretrained(TOKENIZER_ID)
print(f"Loading {MODEL_ID} ...")
_model = Kronos.from_pretrained(MODEL_ID)
_predictor = KronosPredictor(_model, _tokenizer, device="cpu", max_context=MAX_CONTEXT)
print("Kronos predictor ready.")

app = FastAPI(title="Kronos Forecast Service")


class Candle(BaseModel):
    timestamp: str  # ISO 8601
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None


class ForecastRequest(BaseModel):
    ticker: str
    history: list[Candle] = Field(min_length=30)
    pred_len: int = Field(default=10, ge=1, le=60)


class ForecastPoint(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class ForecastResponse(BaseModel):
    ticker: str
    forecast: list[ForecastPoint]


def _check_api_key(x_api_key: Optional[str]) -> None:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


@app.get("/")
def root():
    return {"service": "kronos-forecast", "model": MODEL_ID, "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest, x_api_key: Optional[str] = Header(default=None)):
    _check_api_key(x_api_key)

    if len(req.history) < 30:
        raise HTTPException(status_code=400, detail="Need at least 30 candles of history.")

    df = pd.DataFrame([c.model_dump() for c in req.history])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
    df = df.sort_values("timestamp").reset_index(drop=True)

    if df[PRICE_COLS].isnull().values.any():
        raise HTTPException(status_code=400, detail="History contains missing OHLC values.")
    df["volume"] = df["volume"].fillna(0.0)

    x_timestamp = df["timestamp"]
    # Kronos needs real future timestamps to condition on (day-of-week /
    # month embeddings) — we don't know the exact future trading calendar
    # (holidays), so business-day frequency is a reasonable approximation for
    # a short forecast horizon.
    y_timestamp = pd.Series(pd.bdate_range(start=x_timestamp.iloc[-1], periods=req.pred_len + 1, freq="B")[1:])

    try:
        pred_df = _predictor.predict(
            df=df[PRICE_COLS + ["volume"]],
            x_timestamp=x_timestamp,
            y_timestamp=y_timestamp,
            pred_len=req.pred_len,
            T=1.0,
            top_p=0.9,
            sample_count=1,
            verbose=False,
        )
    except Exception as exc:
        # Surfaced as 502 so the Next.js client treats it as "service
        # unavailable" rather than a hard client-side error.
        raise HTTPException(status_code=502, detail=f"Forecast failed: {exc}") from exc

    points = [
        ForecastPoint(
            timestamp=ts.isoformat(),
            open=float(row.open),
            high=float(row.high),
            low=float(row.low),
            close=float(row.close),
            volume=max(0.0, float(row.volume)),
        )
        for ts, row in zip(y_timestamp, pred_df.itertuples(index=False))
    ]

    return ForecastResponse(ticker=req.ticker.upper(), forecast=points)
