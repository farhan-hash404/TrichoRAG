#!/bin/sh
# Container entrypoint. The image already holds the schema, the evidence index
# and the models (scripts/bake_image.py), so a cold start is quick.
set -e

# No-op on the baked schema; applies any migration newer than the image.
python -m alembic upgrade head

# Fresh demo record on every boot: its scans, shedding and adherence are dated
# relative to today. Idempotent, so a restart with a persisted disk is safe.
python -m scripts.seed_demo

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}" --proxy-headers --forwarded-allow-ips="*"
