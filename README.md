# TrichoRAG

**An evidence-grounded hair & scalp assistant.** Not a chatbot over a model's memory — a retrieval system that answers only from a scraped, openly-licensed medical corpus, **checks every sentence against the source it cites**, and withholds anything it cannot verify.

**[▶ Live demo](https://tricho-rag.vercel.app/)** · built around one loop: **Analyze → Explain → Track → Recommend → Escalate**

> ### Read this first — what is real, and what is a placeholder
> The parts this project is *about* — retrieval, citation-checking, the safety guardrails and the evaluation harness — are **real and measured** (see [Results](#results)).
> The **image analysis is a deliberate placeholder**: the computer-vision "readings" are rule-based heuristics, not trained models. Every value is labelled `is_mock: true` in the API and `mock · not validated` in the UI. TrichoRAG is **not a medical device**, does **not diagnose**, and **never prescribes**. Nothing here has clinical accuracy; do not use it for health decisions.

---

## What it does, and why it's interesting

Most "AI health" demos are a language model asked to be careful. TrichoRAG is built the other way round: the model is never the source of truth, and the system is designed so it *structurally cannot* do the dangerous things.

- **Grounded, not remembered.** Answers come only from a corpus scraped from the NHS, MedlinePlus, NIAMS, DailyMed drug labels and open-access Europe PMC reviews — all under licences that permit reuse. Retrieval is hybrid (keyword + semantic, fused and re-ranked).
- **Verified, not trusted.** A deterministic citation auditor checks each sentence against the passage it cites: a fabricated citation, an invented number, a drug name that isn't in the source, or an uncited medical claim fails the audit, and a failed answer is **withheld** rather than shown.
- **Refuses rather than guesses.** When nothing in the corpus bears on the question, it abstains. The abstention threshold is calibrated on a labelled benchmark (AUROC 1.000 separating in-scope from out-of-scope questions).
- **Safety is a separate layer, not a prompt.** Dose requests, prompt injection, medical emergencies and self-harm language are caught by deterministic guardrails *before any model runs*. A pre-analysis symptom check can force a clinician referral and suppress every cosmetic suggestion.
- **It shows its work.** Every answer exposes its sources (with licence and quote), the auditor's checks, and the agent's pipeline trace. Every CV reading shows its confidence and an honest `mock · not validated` badge.

The retrieval pipeline, the agents, the guardrails and the whole evaluation harness are the substance. The CV layer is scaffolding with an honest label and a real validation gate waiting for a trained model — see [Honest limitations](#honest-limitations).

---

## Results

Measured, reproducible, and in the repo (`backend/evaluation/`). Re-run with `python -m scripts.eval_rag`.

**Retrieval** — document-level, 47 in-scope + 7 out-of-scope questions over a 56-document / 1,077-chunk corpus:

| Variant | Hit@1 | Hit@3 | MRR@10 | Recall@5 | Abstain AUROC | p50 latency |
|---|---|---|---|---|---|---|
| BM25 (keyword) | 0.809 | 0.936 | 0.865 | 0.936 | 1.000 | 81 ms |
| Dense (semantic) | 0.851 | 0.915 | 0.890 | 0.887 | 1.000 | 76 ms |
| Hybrid (RRF) | 0.830 | 0.915 | 0.884 | 0.911 | 1.000 | 83 ms |
| **Hybrid + cross-encoder** | **0.915** | **1.000** | **0.957** | **0.929** | **1.000** | 1.2 s |

The cross-encoder re-ranker is the clear winner on every precision metric, and especially on lay phrasing ("why am I going bald at 25") where keyword and dense retrieval both stumble (Hit@3 0.62 → 1.00).

**Safety** — a red-team suite (`backend/evaluation/redteam_prompts.jsonl`, 70 prompts across prompt-injection, dosing, diagnosis, treatment-direction, emergency, crisis, off-topic, fabrication-bait and benign near-misses) runs the full agent and grades the output with checks that are *independent of* the agent's own filters, logged to MLflow via `python -m scripts.eval_redteam`.

**Tests** — **149 backend tests** cover the clinical and retrieval invariants; the website type-checks and builds clean, and a replay test keeps the public demo honest to the live API.

---

## How it works

```
                      ┌─────────────── deterministic guardrails ───────────────┐
  question ──▶ guard ─┤ injection · emergency · crisis · dosing · diagnosis     ├─▶ retrieve ─▶ generate ─▶ audit ─▶ finalize
                      └─────────────────────────────────────────────────────────┘        │          │         │        │
                                                                                     hybrid search  LLM or   citation   withhold
                                                                                     + re-rank      extractive auditor   if unverified
```

- **Corpus builder** (`app/rag/scraper/`) — honours `robots.txt`, per-host rate limits and a disk cache; only ingests allowed licences (OGL v3, US public domain, CC BY/CC0); strips dosing sections and sanitises indirect prompt injection out of scraped text.
- **Retrieval** (`app/rag/`) — ChromaDB dense index (ONNX all-MiniLM-L6-v2, 384-d) + BM25 with British→American normalisation and lay→clinical query expansion, fused by Reciprocal Rank Fusion, re-ranked by a local int8 cross-encoder. Joint abstention: refuse only when cosine **and** cross-encoder both say the match is weak.
- **Agents** (`app/agents/`) — a LangGraph Q&A graph (`guard → retrieve → generate → audit → revise/extractive → finalize`) and an analysis graph with checkpointing and a human-in-the-loop interrupt when confidence is low. When no LLM key is set, the extractive path quotes sources verbatim and **cannot hallucinate**.
- **Provider-agnostic LLM** (`app/llm/chat.py`) — one interface over Gemini, OpenAI, Anthropic and Bedrock; `auto` picks the first with a key, else the deterministic extractive path.
- **Safety engine** (`app/safety/`) — runs *before* recommendations and the LLM, so suppressed content never reaches the model that writes the user-facing text.
- **MCP server** (`app/mcp_server.py`) — exposes `search_hair_evidence`, `ask_hair_question` and `list_sources` to any MCP client, through the same retrieval, guardrails and auditor.
- **Infra** — Celery + Redis for async jobs, corpus refresh, cache and rate limiting (all with in-process fallbacks when Redis is unset); n8n webhooks behind an HMAC-compared secret; MLflow for every evaluation run.

**Skills demonstrated** (and where): RAG & hybrid search, ChromaDB, cross-encoder re-ranking, NLP, async scraping · LangGraph multi-agent orchestration with HITL · evaluation & guardrails · multi-provider LLM integration · MCP · Celery + Redis · CNN/validation-gate machinery (PyTorch backend) · Next.js / React / TypeScript / Tailwind · Docker, pytest, GitHub Actions CI. *(Flask, MongoDB, Express and RL appear in other projects, not forced in here.)*

---

## Run it

**The live demo** ([tricho-rag.vercel.app](https://tricho-rag.vercel.app/)) is the real website replaying a recorded run of the API — it opens instantly and needs no setup. To run the **full system** (live retrieval, the agents, the models), use the one-click dev container or the local setup below.

### One click: GitHub Codespaces

**Code → Codespaces → Create codespace.** The dev container ([`.devcontainer/`](.devcontainer)) installs the API, builds the evidence index, downloads the models, seeds the demo record and starts both servers. First start takes a few minutes; the website opens on port 3000.

### Local

**Prerequisites:** Python 3.11+, Node 20+. Postgres, S3, Redis and any ML stack are **optional** — it runs without them.

```bash
cd backend && python -m venv .venv
```

Activate (`.venv\Scripts\activate` on Windows, `source .venv/bin/activate` otherwise), then:

```bash
pip install -r requirements-dev.txt
cp .env.example .env
python -m alembic upgrade head
python -m scripts.seed_demo        # demo record: 3 scans, treatments, 90 days of shedding
python -m uvicorn app.main:app --reload --port 8000
```

The first start builds the search index and downloads the embedding + re-ranker models (~100 MB, once). API docs at <http://localhost:8000/docs>.

```bash
cd frontend && npm install && npm run dev
```

Open <http://localhost:3000> and choose **Explore the demo record** (or sign in with `demo@example.com` / `demopassword123`).

> Install `numpy` and `Pillow` (they're in `requirements.txt`) — without them the CV heuristics fall back to a hash-based stub that analyses no real pixels.

**Turn on a real LLM (optional):** put a free key in `backend/.env` as `GEMINI_API_KEY=...` (from [aistudio.google.com](https://aistudio.google.com)) and restart. Without it, answers are verbatim cited quotes; with it, written summaries — still verified the same way.

### As a container

```bash
docker build -t trichorag-api backend
docker run -p 7860:7860 -e SECRET_KEY=a-long-random-string-of-48-characters trichorag-api
```

The image bakes in the evidence index and both models, re-seeds a fresh demo record on every start, refuses to start in production without a real `SECRET_KEY`, and protects the shared demo account. It needs ~650 MB RAM with the cross-encoder, ~320 MB without (`RAG_CROSS_ENCODER=false`, which costs ~8 points of Hit@1).

Deployment (the free recorded demo on Vercel, re-recording, Codespaces, the optional live API) is in **[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Configuration

Safe defaults let it run with no external services. Full list in [`.env.example`](backend/.env.example); the ones that matter most:

| Variable | Default | Purpose |
|---|---|---|
| `TRICHORAG_ENV` | `dev` | `dev` auto-creates tables; `prod` refuses the dev `SECRET_KEY` and does not auto-seed. |
| `SECRET_KEY` | dev value | Signs JWTs; **must** be a random 32+ char value in prod (enforced at startup). |
| `DATABASE_URL` | `sqlite:///./trichorag.db` | Prod: `postgresql+psycopg://…` |
| `LLM_PROVIDER` | `auto` | `auto` picks the first provider with a key, else the deterministic extractive path. |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Any one enables written answers; still verified. |
| `EMBEDDING_PROVIDER` | `onnx_minilm` | Real 384-d semantic embeddings via ONNX Runtime (no PyTorch). `hashing` is the test fallback. |
| `RAG_CROSS_ENCODER` | `true` | Local ONNX re-ranker — best on every benchmark metric. |
| `CV_BACKEND` | `mock` | `mock` \| `torch` (needs checkpoints — none ship). |
| `REDIS_URL` | — | Shared cache / rate-limit / Celery broker; unset → in-process fallback, tasks run inline. |
| `DEMO_MODE` | `false` | Protects the shared demo account from deletion (on in the image). |
| `SAFETY_STRICT` | `true` | Fail-safe to a more cautious verdict on internal errors. |
| `ENABLE_SKIN_DOMAIN` | `false` | The skin pipeline is built but off by design — see below. |

Frontend: `NEXT_PUBLIC_API_BASE` (the dev server proxies `/api/v1/*` to it); `NEXT_PUBLIC_DEMO_SNAPSHOT=true` builds the recorded demo.

---

## The CV validation gate

The repository ships **no trained checkpoints** and runs fine without any. The path to a real model is built and tested, with two guarantees:

- **Fallback is loud, never silent.** If torch is missing, a checkpoint is absent, or a manifest entry is malformed, the registry falls back to mock and logs the specific reason. It never passes a heuristic off as a trained model.
- **`is_mock` and `validated` are separate.** A real model that hasn't passed evaluation runs as `is_mock=false, validated=false` — confidence capped, UI badged *"unvalidated model"*, response disclaimered. Only a passing evaluation record produces `validated=true`, and `validated` is **re-derived from the recorded metrics every time the manifest loads**, so hand-editing `"passed": true` cannot promote a failing model (there's a test asserting exactly that).

A model must clear a **stratified fairness** bar, not just aggregate accuracy: worst-subgroup score ≥ 0.70, worst-to-best gap ≤ 0.15, calibration error (ECE) ≤ 0.10, smallest subgroup n ≥ 30, all six subgroup axes reported.

```bash
python -m scripts.evaluate_model --demo-biased   # see the gate refuse a 0.790-aggregate model that scores 0.621 on Fitzpatrick V–VI
```

---

## One domain, on purpose

The pipeline, CV interfaces, safety engine and corpus are all **domain-parameterised**, and a second domain (skin) is implemented end-to-end behind them — `FaceAnalyzer`, four skin red-flag rules, a 3-view protocol, the Skin Appearance Index, skin evidence in the corpus, all tested. It is deliberately **not exposed**: a shallow second product costs more credibility than it adds, and the argument here is depth — one domain taken from guided capture to clinician handoff. The cut is a flag (`ENABLE_SKIN_DOMAIN=true`), not a deletion, which is what shows the pipeline generalises rather than claiming it does.

---

## Honest limitations

The things a reviewer should know, stated plainly.

**The image analysis**
1. **All CV output is mock and non-validated.** The heuristics (variance-of-Laplacian sharpness, luminance clustering, texture proxies) have no measured accuracy on any population. The torch backend and validation gate are real and tested, but **no weights ship** — the gate is machinery waiting for a model, not evidence one exists.
2. **"Segmentation" is luminance thresholding**, not semantic segmentation; it will behave very differently across hair colours and skin tones. No fairness evaluation has been run.
3. **"Density" is a texture proxy** (labelled `apparent`), not follicular density; there is no pixel-to-millimetre calibration.
4. **Most red flags come from self-report, not vision.** Scarring, pustules, sudden patchy loss and facial swelling can't be detected by the current CV, so the app asks directly in a pre-analysis safety check (a single "yes" forces referral). This is honest and it works, but the safety net then depends on the user answering accurately.

**The system**
5. **The synchronous analyze path is bounded by an 8-second client timeout** — the LLM budget falls back to the deterministic explainer rather than keep the user waiting. Heavy analysis can be queued to Celery.
6. **Alignment is centroid + spread normalisation**, not feature-based registration; quality is honestly reported (~60% on demo data) and gates comparison confidence. The difference map is a raw luminance diff and responds to lighting and pose as much as to real change — its caption says so.
7. **The shedding log and clinical history are self-reported** and unverifiable; they widen the safety net but depend on accurate disclosure.
8. **The red-team headline is methodology, not a trophy.** The per-prompt results in the repo include a tuned set; a held-out set is included for an honest out-of-sample number.
9. **Tokens live in `localStorage`** (XSS-readable); production should move to httpOnly cookies with CSRF protection. Rate limiting falls back to per-process counters without Redis.

**Before any real users**, an app of this kind may be a regulated medical device: it would need a regulatory determination, a DPIA/HIPAA analysis, a clinical safety case, documented clinical review of the safety rules, and trained-and-validated models. **Do not deploy to real users on mock models.** The full [Future model-training plan](#future-model-training-plan) is below.

---

## Testing

```bash
cd backend && python -m pytest -q           # 149 tests
cd frontend && npm run typecheck && npm run test:snapshot && npm run build
```

The backend tests lock down the invariants that matter: red flags force `refer` and suppress all cosmetic advice; nothing is ever a prescription (a DB `CHECK` constraint makes `is_prescription=1` raise `IntegrityError`); social-media sources are rejected and every retrieved reference is traceable; the citation auditor withholds unverified answers; guardrails block dosing/injection/emergency before retrieval; the analysis graph pauses and resumes from its checkpoint without re-running CV; confidence never exceeds the weakest stage.

---

## Future model-training plan

**Phase 1 — data.** Consented, de-identified capture with per-subject metadata (Fitzpatrick I–VI, age, sex, device, lighting, geography); dermatologist-annotated ground truth; a published data card documenting coverage **and gaps**.
**Phase 2 — models.** Hair/scalp segmentation (U-Net / SegFormer / DeepLabv3+); a landmark model for alignment (never identity); calibrated per-attribute regressors; a quality gate trained on real retake decisions.
**Phase 3 — stratified evaluation (mandatory).** Per-subgroup FPR/FNR, IoU, landmark error, attribute MAE, calibration (ECE); the worst-group-vs-best-group gap is the release gate. Aggregate accuracy alone is not acceptable.
**Phase 4 — calibration & promotion.** Temperature scaling or conformal prediction; a capability sets `validated=True` only after stratified eval passes, a calibration curve ships, a model card is written, `model_version` is recorded on every output, and a rollback to mock is retained.
**Phase 5 — clinical validation.** Prospective comparison against clinician assessment, powered per subgroup, pre-registered — before any claim of clinical utility.

---

## Repository layout

```
docs/                     design docs (architecture → roadmap) + DEPLOY.md
backend/
  app/
    agents/               ★ LangGraph Q&A + analysis graphs, citation auditor, guardrails
    rag/                  ★ scraper (licensed, robots-aware), hybrid retrieval, cross-encoder, index
    llm/                  provider-agnostic chat (Gemini/OpenAI/Anthropic/Bedrock)
    safety/               ★ deterministic rules + engine (runs before the LLM)
    cv/                   model-agnostic CV: base ABCs, registry, mock/, torch/ + validation gate
    recommendations/      evidence-gated engine, prescription-free by construction
    core/                 config, security, audit, cache, rate limiting
    api/routers/          FastAPI endpoints          services/  storage (encrypted), orchestrator
    mcp_server.py         MCP tools over the same pipeline      worker.py  Celery tasks
  evaluation/             benchmarks, red-team suite, results/   scripts/  eval_rag, eval_redteam, …
  alembic/                migrations                 tests/     149 tests
frontend/                 Next.js App Router · the atlas-style UI · recorded-demo replay
flutter_app/              Flutter app (web + Android) — scaffolding, in progress
```

The two files that carry the clinical guarantees are [`backend/app/safety/engine.py`](backend/app/safety/engine.py) and [`backend/app/services/orchestrator.py`](backend/app/services/orchestrator.py); the two that carry the grounding guarantees are [`backend/app/agents/citations.py`](backend/app/agents/citations.py) and [`backend/app/rag/retriever.py`](backend/app/rag/retriever.py).
