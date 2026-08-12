# Kronos forecast service — see README.md for deploy instructions (Render).
FROM python:3.11-slim

# git is needed to vendor the Kronos `model/` package, which is distributed
# as source in the upstream repo (not published to PyPI).
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user — general container hygiene, not required by Render
# specifically (unlike Hugging Face Spaces, which mandates UID 1000).
RUN useradd -m appuser
USER appuser
ENV HOME=/home/appuser \
    PATH=/home/appuser/.local/bin:$PATH
WORKDIR $HOME/app

RUN pip install --no-cache-dir --upgrade pip

# CPU-only torch wheel — the default PyPI wheel bundles CUDA libraries that
# are unnecessary (and huge) for this CPU-only service.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY --chown=appuser requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Vendor the Kronos model/ package (Kronos, KronosTokenizer, KronosPredictor)
# — sourced from the upstream repo, MIT licensed.
RUN git clone --depth 1 https://github.com/shiyu-coder/Kronos.git $HOME/app/kronos-src
ENV PYTHONPATH="$HOME/app/kronos-src:${PYTHONPATH}"

COPY --chown=appuser app.py .

# Bake the model weights into the image at build time so a cold container
# start doesn't also need a Hugging Face Hub download on top of the container
# boot itself — startup only has to load cached weights from disk.
# Kronos-mini (not Kronos-small) — measured ~333MB peak RSS end-to-end vs.
# Render's free-tier 512MB cap; see app.py's module docstring for the numbers.
RUN python -c "\
from model import Kronos, KronosTokenizer; \
KronosTokenizer.from_pretrained('NeoQuasar/Kronos-Tokenizer-2k'); \
Kronos.from_pretrained('NeoQuasar/Kronos-mini')"

# Render injects a PORT env var (default 10000) that the app must bind to;
# the EXPOSE line below is informational only (Render ignores it in favor of
# PORT). Shell-form CMD so $PORT is expanded at container start.
EXPOSE 10000
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}
