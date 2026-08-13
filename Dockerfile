# SmartPM — single-container image (Hugging Face Spaces / any Docker host)
#
# Node and Python live in one image because a Space runs one container. That suits this app:
# the two processes talk over localhost, so AI_SERVICE_URL keeps its default of
# http://localhost:5001 with nothing to configure, there is no second service that can be
# asleep while the first is awake, and the UI and API share an origin — which matters
# because auth is an httpOnly cookie and a split origin would force SameSite=None + CORS.
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
      # missing-shared-object error that names libglib rather than anything about OpenCV.
      libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Spaces run the container as uid 1000, not root. Building as that same user means every
# file is already owned by the account that will run the process — the alternative is a
# recursive chown at the end, which rewrites metadata for every file and duplicates them
# into a new layer, bloating the image for no benefit.
# Python packages go in system site-packages, installed as root before dropping privileges.
# Installing them with --user instead puts them under one account's ~/.local, which is on
# sys.path only for that account — and hosts differ on which user actually runs the
# container (Spaces use uid 1000, others use root). A system-wide install is readable by
# whichever one it turns out to be, so `python3 -m uvicorn` resolves either way.
COPY ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# Dependencies before sources: these layers stay cached and only rebuild when a manifest
# actually changes, so a code-only redeploy skips the slowest steps entirely.
COPY --chown=user package.json package-lock.json ./
RUN npm ci
COPY --chown=user server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY --chown=user . .

# The database is copied out of the committed demo file rather than seeded at boot, so
# startup never depends on the Gemini API answering, and a restart always restores the same
# known-good demo state.
RUN npm run build \
 && mkdir -p server/data \
 && cp deploy/smartpm.demo.db server/data/smartpm.db

# Spaces route external traffic to 7860.
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860

CMD ["bash", "start.sh"]
