#!/usr/bin/env bash
# Starts the API (port 8000) and the website (port 3000) in the background each
# time the Codespace starts. The website proxies /api/v1 to the API, so only
# port 3000 needs to be opened. Logs: /tmp/trichorag/*.log
cd "$(dirname "$0")/.."
mkdir -p /tmp/trichorag

(cd backend && setsid nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/trichorag/api.log 2>&1 &)
(cd frontend && setsid nohup npm run dev > /tmp/trichorag/web.log 2>&1 &)

echo "TrichoRAG is starting: website on port 3000, API on port 8000 (logs in /tmp/trichorag)."
echo "Sign in with 'Explore the demo record'. The API needs about 20 seconds before the first request."
