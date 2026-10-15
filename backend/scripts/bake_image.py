"""Build-time preparation for the deployable image (run by the Dockerfile).

Does the heavy work once, while the image is built, so a cold start does none:

  1. creates the schema in the image's SQLite database (Alembic);
  2. loads the licensed corpus into it and builds the dense search index;
  3. downloads both ONNX models (MiniLM embeddings, cross-encoder reranker)
     into the image's caches.

The evidence database and the index are baked TOGETHER because chunk ids are
random UUIDs: an index only matches the database it was built from.

The demo account is deliberately not seeded here. scripts/start.sh seeds it on
every boot, so its scans and logs are always dated relative to the visit.

    python -m scripts.bake_image
"""

from __future__ import annotations

import subprocess
import sys


def main() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)

    from app.db.session import SessionLocal
    from app.rag.ingest import ensure_evidence
    from app.rag.rerank import get_cross_encoder

    db = SessionLocal()
    try:
        info = ensure_evidence(db)
    finally:
        db.close()
    print(f"evidence: {info.get('documents')} documents, {info.get('chunks')} chunks ({info.get('embedding')})")
    if not info.get("chunks"):
        sys.exit("evidence index is empty; refusing to build an image that cannot cite anything")

    if get_cross_encoder() is None:
        sys.exit("cross-encoder unavailable; the image would rank evidence worse than benchmarked")
    print("cross-encoder cached")


if __name__ == "__main__":
    main()
