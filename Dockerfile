# SmartPM — single-container image (Hugging Face Spaces / any Docker host)
#
# Node and Python live in one image because this platform runs one container per Space.
# That is convenient rather than limiting: the two processes talk over localhost, so
# AI_SERVICE_URL keeps its default of http://localhost:5001 with nothing to configure,
# there is no second service to wake, and the UI and API share an origin — which matters
# because auth is an httpOnly cookie and a split origin would force SameSite=None + CORS.
#
# Ollama is never installed here. Deployed builds run on Gemini; Ollama stays a
# local-development convenience.

FROM node:24-slim

# Node 24 specifically: `node:sqlite` is stable in 24, whereas on 22 the same import needs
# --experimental-sqlite and the server would refuse to boot without the flag.

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, sources second: these layers are cached and only rebuild when a
# manifest actually changes, which turns a code-only redeploy from minutes into seconds.
COPY package.json package-lock.json ./
RUN npm ci
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY ai-service/requirements.txt ./ai-service/
# Debian marks its system Python externally-managed (PEP 668). In a container there is no
# host environment to protect, so installing directly is correct and avoids a venv whose
# activation every later command would have to remember.
RUN pip install --no-cache-dir --break-system-packages -r ai-service/requirements.txt

COPY . .

RUN npm run build \
 && mkdir -p server/data \
 && cp deploy/smartpm.demo.db server/data/smartpm.db

# Hugging Face routes external traffic to 7860.
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860

# HF mounts the repo read-only in places and runs as a non-root user; the database must be
# writable, so it lives under /app/server/data which we own.
RUN chmod -R a+rwX /app/server/data

CMD ["bash", "start.sh"]
