# SmartPM — single-container image (Railway, Hugging Face Spaces, any Docker host)
#
# Node and Python live in one image because these platforms run one container per service.
# That suits this app: the two processes talk over localhost, so AI_SERVICE_URL keeps its
# default of http://localhost:5001 with nothing to configure, there is no second service
# that can be asleep while the first is awake, and the UI and API share an origin — which
# matters because auth is an httpOnly cookie and a split origin would force SameSite=None
# plus CORS credentials.
#
# Ollama is never installed here. Deployed builds run on Gemini; Ollama stays a
# local-development convenience.

FROM node:24-slim

# Node 24 specifically: `node:sqlite` is stable here. On Node 22 the same import needs
# --experimental-sqlite and the server would refuse to boot without the flag.

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip curl \
      # OpenCV's "headless" wheel drops the GUI bindings but still links against glib, and
      # a slim image does not ship it. Without this, `import cv2` fails at load with a
      # missing-shared-object error naming libglib rather than anything about OpenCV.
      libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Python packages go into system site-packages, installed as root before privileges drop.
# Installing them with --user instead puts them under one account's ~/.local, which is on
# sys.path only for that account — and hosts disagree on which user runs the container.
# A system-wide install is readable by whichever user it turns out to be.
COPY ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

# Run as the `node` account this image already provides, which is uid 1000 — the id Spaces
# require. Do NOT create a user here: `useradd -u 1000` fails with "UID 1000 is not unique"
# against this base, which aborts the whole build.
USER node
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH
WORKDIR $HOME/app

# Dependencies before sources: these layers stay cached and rebuild only when a manifest
# actually changes, so a code-only redeploy skips the slowest steps.
COPY --chown=node package.json package-lock.json ./
RUN npm ci
COPY --chown=node server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY --chown=node . .

# The database is copied from the committed demo file rather than seeded at boot, so startup
# never depends on the Gemini API answering, and a restart always restores a known-good
# demo state.
RUN npm run build \
 && mkdir -p server/data \
 && cp deploy/smartpm.demo.db server/data/smartpm.db

# Default for hosts that expect a fixed port (Spaces route to 7860). Railway injects its own
# PORT at runtime, which overrides this — the server reads process.env.PORT either way.
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860

CMD ["bash", "start.sh"]
