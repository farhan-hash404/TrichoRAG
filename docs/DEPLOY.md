# Deploying the public demo (free, no card)

| Part | Host | Cost |
|---|---|---|
| API (FastAPI, evidence index, models) | Hugging Face Spaces, Docker, free CPU | £0, no card |
| Website (Next.js) | Vercel Hobby | £0, no card |
| Tests, image build, deploys | GitHub Actions | £0 for a public repo |

The website proxies `/api/v1/*` to the API from its own server, so the browser only ever talks to one
origin: no CORS setup, and the API host can change without touching client code.

## What happens automatically

- **CI** (`.github/workflows/ci.yml`) on every push: the backend test suite, the website type-check and
  production build, and a Docker build of the API that is started and smoke-tested (health, demo
  sign-in, seeded scans, the demo account's delete protection).
- **Deploy** (`.github/workflows/deploy-api.yml`) after CI passes on `master`: publishes `backend/` as a
  Docker Space, creating the Space on first run and setting a fresh `SECRET_KEY` on each deploy.
- **The image** bakes in the schema, the evidence database, the search index and both ONNX models
  (`scripts/bake_image.py`). On start it only seeds the demo record, dated relative to that day, and
  serves (`scripts/start.sh`). It refuses to start in production without a real `SECRET_KEY`.

## One-time setup (about 10 minutes)

### 1. Hugging Face: the API

1. Create a free account at <https://huggingface.co/join>.
2. **Settings → Access Tokens → Create new token**, type **Write**. Copy it.
3. In the GitHub repository: **Settings → Secrets and variables → Actions**
   - **Secrets** tab → `HF_TOKEN` = the token from step 2.
   - **Variables** tab → `HF_SPACE` = `<your-hf-username>/hairgpt-api`.
   - Optional **secret** `GEMINI_API_KEY` (free from <https://aistudio.google.com>). Without it the
     assistant still answers, with verbatim, cited quotes instead of written summaries.
4. **Actions → Deploy API to Hugging Face Spaces → Run workflow.** (After this it runs by itself
   whenever CI passes on `master`.)
5. The first image build takes about ten minutes. Then open
   `https://<your-hf-username>-hairgpt-api.hf.space/health`: it should say `"status": "ok"` and
   `"demo_mode": true`.

### 2. Vercel: the website

1. Sign up at <https://vercel.com/signup> with GitHub (Hobby plan).
2. **Add New → Project →** import `HairGpt`.
3. **Root Directory:** `frontend` (the framework is detected as Next.js).
4. **Environment Variables:** `NEXT_PUBLIC_API_BASE` = `https://<your-hf-username>-hairgpt-api.hf.space`
   (no trailing slash).
5. **Deploy.** Vercel redeploys on every push to `master`.

Open the Vercel URL and choose **Explore the demo record**.

## Behaviour worth knowing

- **Sleeping.** A free Space sleeps after a couple of days without visitors; the next visit wakes it in
  under a minute. The sign-in page says so ("Waking the demo server…") rather than timing out.
- **Resets.** The Space's disk is not persistent: accounts and photos created by visitors disappear on
  each restart or deploy, and the demo record is re-seeded fresh.
- **The shared demo account** cannot be deleted (`DEMO_MODE=true` in the image); visitors can still
  create and delete their own accounts.
- **`NEXT_PUBLIC_API_BASE`** is read when the website is built: after changing it, redeploy on Vercel.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Deploy workflow skipped | `HF_SPACE` variable not set (it must be a **variable**, not a secret). |
| Space log: `SECRET_KEY must be set` | The Space has no secret yet: run the deploy workflow once. |
| Space build fails | Open the Space → **Logs → Build**; the same build runs in CI's `api-image` job. |
| Website shows "The demo server isn't responding" | Check the Space page; a failed build or a paused Space shows there. |
| Sign-in works locally but not on Vercel | `NEXT_PUBLIC_API_BASE` missing or wrong; redeploy after fixing it. |
