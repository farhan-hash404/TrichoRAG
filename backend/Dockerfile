# HairGPT API, packaged for Hugging Face Spaces (Docker SDK, free CPU tier) or
# any container host. The evidence database, search index and both ONNX models
# are baked in at build time; on start the container only seeds the demo
# account and serves.
#
#   docker build -t hairgpt-api backend
#   docker run -p 7860:7860 -e SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))") hairgpt-api
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Spaces run containers as uid 1000. Building as that user means every file the
# app writes at runtime (database, uploads, model caches) is already its own.
RUN useradd --create-home --uid 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --user -r requirements.txt

COPY --chown=user . .

ENV HAIRGPT_ENV=prod \
    DEMO_MODE=true \
    DATABASE_URL=sqlite:////home/user/app/data/hairgpt.db \
    STORAGE_LOCAL_DIR=/home/user/app/storage \
    CORPUS_FILE=/home/user/app/data/corpus/documents.jsonl \
    CHROMA_DIR=/home/user/app/data/chroma \
    CHECKPOINT_DB=/home/user/app/data/checkpoints.sqlite \
    LLM_PROVIDER=auto \
    PORT=7860

RUN python -m scripts.bake_image

EXPOSE 7860
CMD ["sh", "scripts/start.sh"]
