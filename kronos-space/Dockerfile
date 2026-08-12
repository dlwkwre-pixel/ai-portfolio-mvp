# Kronos forecast service — see README.md for deploy instructions.
FROM python:3.11-slim

# git is needed to vendor the Kronos `model/` package, which is distributed
# as source in the upstream repo (not published to PyPI). Must run as root,
# before switching to the unprivileged user below.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces run Docker containers as UID 1000 — create and switch
# to that user before any COPY/pip install to avoid permission errors.
# https://huggingface.co/docs/hub/spaces-sdks-docker#permissions
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

RUN pip install --no-cache-dir --upgrade pip

# CPU-only torch wheel — the default PyPI wheel bundles CUDA libraries that
# are unnecessary (and huge) for this CPU-only Space.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Vendor the Kronos model/ package (Kronos, KronosTokenizer, KronosPredictor)
# — sourced from the upstream repo, MIT licensed.
RUN git clone --depth 1 https://github.com/shiyu-coder/Kronos.git $HOME/app/kronos-src
ENV PYTHONPATH="$HOME/app/kronos-src:${PYTHONPATH}"

COPY --chown=user app.py .

# Bake the model weights into the image at build time so a cold container
# start doesn't also need a Hugging Face Hub download on top of the container
# boot itself — startup only has to load cached weights from disk.
RUN python -c "\
from model import Kronos, KronosTokenizer; \
KronosTokenizer.from_pretrained('NeoQuasar/Kronos-Tokenizer-base'); \
Kronos.from_pretrained('NeoQuasar/Kronos-small')"

# Docker Spaces expect the app to listen on port 7860 (also set as
# `app_port: 7860` in README.md's Space metadata).
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
