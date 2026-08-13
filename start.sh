#!/usr/bin/env bash
# Container entrypoint: start the Python AI service, then the Node server.
#
# Both run in one container, so the AI service stays on localhost:5001 — the default
# AI_SERVICE_URL — and never needs to be exposed or configured.
set -euo pipefail

# The signing key must exist or the auth module throws on first use. A deployment where the
# operator did not set one should still boot, so generate a random key for this container's
# lifetime. The cost is that a restart invalidates existing sessions and everyone logs in
# again — acceptable for a demo, and far better than a service that refuses to start. Set
# JWT_SECRET in the host's secret store to make sessions survive restarts.
if [ -z "${JWT_SECRET:-}" ]; then
  export JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  echo "start: JWT_SECRET was not set — generated an ephemeral one for this container"
fi

# Deployed builds are Gemini-only. Defaulted here rather than required so a missing variable
# degrades to the intended provider instead of silently trying to reach an Ollama that was
# never installed in this image.
export AI_CHAT_PROVIDER="${AI_CHAT_PROVIDER:-gemini}"
export AI_EMBED_PROVIDER="${AI_EMBED_PROVIDER:-gemini}"
export GEMINI_CHAT_MODEL="${GEMINI_CHAT_MODEL:-gemini-3.5-flash}"
# Not text-embedding-004 — that id returns 404. This one is verified and returns 3072 dims,
# matching the vectors baked into the shipped demo database.
export GEMINI_EMBED_MODEL="${GEMINI_EMBED_MODEL:-gemini-embedding-001}"
export EMBED_MODEL_LABEL="${EMBED_MODEL_LABEL:-$GEMINI_EMBED_MODEL}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "start: WARNING - GEMINI_API_KEY is not set. The app will run, but every AI feature"
  echo "start:           will fall back to its deterministic template output."
fi

cd /app/ai-service
python3 -m uvicorn main:app --host 127.0.0.1 --port 5001 &
AI_PID=$!

# Wait for the AI service to actually answer rather than sleeping a fixed number of seconds.
# Importing OpenCV at module load makes startup time vary widely between cold and warm
# builds, and a fixed wait either wastes time or hands the server a service that is not up.
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:5001/health; then
    echo "start: AI service is up"
    break
  fi
  # If uvicorn died (bad import, missing dependency), stop waiting and surface it now
  # instead of burning the full minute on a process that no longer exists.
  if ! kill -0 "$AI_PID" 2>/dev/null; then
    echo "start: AI service exited during startup — continuing without it; AI features will"
    echo "start: use deterministic fallbacks. See the log above for the Python traceback."
    break
  fi
  sleep 1
done

cd /app/server
exec npm start
