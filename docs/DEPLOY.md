# Deploying the public demo (free, no card)

The public demo is the real website in **recorded-demo mode**, hosted free on Vercel. It ships a snapshot
of a real run of the HairGPT API and answers the site's own API calls from it, so there is no server to
pay for, sleep or wake. Reviewers who want the live system open it in GitHub Codespaces with one click.

| What | Where | Cost |
|---|---|---|
| Public demo: website + recorded API responses | Vercel Hobby | £0, no card |
| Full system on demand: API, models, website | GitHub Codespaces (the reviewer's free quota) | £0 to you |
| Tests, snapshot checks, Docker image build | GitHub Actions | £0, public repo |
| Optional always-on live API | Hugging Face Docker Space | needs HF PRO ($9/month) |

## What "recorded" means

`backend/scripts/record_snapshot.py` signs in to a running API as the demo user and saves every response
the website needs into `frontend/public/snapshot/`: the scans and their photos, results, timeline,
shedding log, treatments, history, doctor reports, all scan comparisons, product suggestions, and answers
to a set of evidence questions (including a guardrail and an off-topic refusal). Nothing is invented.

When the site is built with `NEXT_PUBLIC_DEMO_SNAPSHOT=true`:

- every API call is answered from the recording (`frontend/src/lib/snapshot.ts`), with zero network calls
  to an API;
- dates are shifted by the recording's age, so "last scan 3 days ago" stays true;
- a visitor's own edits (logging shedding, ticking a treatment, saving history) work for the visit and
  stay in the browser;
- live capture and new questions point to the full system, and a banner says it is a recording.

CI checks the replay logic against the recording (`npm run test:snapshot`) and builds the site in this
mode on every push.

## Set up the public demo (5 minutes)

1. Sign up at <https://vercel.com/signup> with GitHub (Hobby plan, no card).
2. **Add New → Project →** import this repository.
3. **Root Directory:** `frontend` (the framework is detected as Next.js).
4. **Environment Variables:** `NEXT_PUBLIC_DEMO_SNAPSHOT` = `true`.
5. **Deploy.** Every push to `master` redeploys. The site's address is your portfolio link.

## Re-record after changing the API

```bash
cd backend
python -m uvicorn app.main:app --port 8000
```

In a second terminal (the API must have finished starting):

```bash
cd backend
python -m scripts.record_snapshot --api http://127.0.0.1:8000 --out ../frontend/public/snapshot
```

Record against the full profile (cross-encoder on, the default) so the answers match the benchmarked
configuration. If `GEMINI_API_KEY` is set, the recorded answers are written by the model and still
verified; without it they are verbatim, cited quotes. Commit `frontend/public/snapshot/` and push.

## The full system in Codespaces

The repository has a dev container (`.devcontainer/`). **Code → Codespaces → Create codespace** (or the
banner's "Run the full system" link) installs the API, builds the evidence index, downloads both models,
seeds the demo record and starts the API and the website. The first start takes a few minutes; the
website opens on port 3000. Free GitHub accounts include monthly Codespaces hours.

## The API as a container (any host)

```bash
docker build -t hairgpt-api backend
```

```bash
docker run -p 7860:7860 -e SECRET_KEY=change-me-to-a-long-random-string-of-48-characters hairgpt-api
```

The image bakes in the evidence index and both models, re-seeds a fresh demo record on every start,
refuses to start in production without a real `SECRET_KEY`, and protects the shared demo account
(`DEMO_MODE=true`). It needs about 650 MB of RAM with the cross-encoder, about 320 MB without it
(`RAG_CROSS_ENCODER=false`, which costs about 8 points of top-1 retrieval accuracy). To serve a live site,
point the website at it with `NEXT_PUBLIC_API_BASE` and leave `NEXT_PUBLIC_DEMO_SNAPSHOT` unset.

## Optional: an always-on live API on Hugging Face

Hugging Face now requires PRO for Docker Spaces; on the free tier the deploy fails with
`402 Payment Required`. With PRO: add the repository variable `HF_SPACE` (`your-username/space-name`) and
the secret `HF_TOKEN` (a **Write** token), then run **Actions → Deploy API to Hugging Face Spaces (PRO)**.
The workflow checks the token, its permissions and the Space name first and reports problems in plain
words on the run's summary page.
