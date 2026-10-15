#!/usr/bin/env bash
# One-time setup of the full system in a Codespace or dev container: the API with
# its evidence index and both models, the demo record, and the website.
set -euo pipefail
cd "$(dirname "$0")/.."

python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
[ -f backend/.env ] || cp backend/.env.example backend/.env

# Schema, then the demo record. Seeding builds the evidence index and downloads
# both ONNX models on first run (a few minutes).
(cd backend && python -m alembic upgrade head && python -m scripts.seed_demo)

(cd frontend && npm ci)
echo "Setup complete. The API and website start automatically (see .devcontainer/start.sh)."
