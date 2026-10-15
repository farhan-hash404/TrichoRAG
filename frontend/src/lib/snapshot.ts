/**
 * Recorded-demo mode.
 *
 * The public demo is a static site with no server to sleep or pay for. It ships
 * a snapshot of a real run of the HairGPT API (backend/scripts/record_snapshot.py)
 * and answers the site's own API calls from it. Nothing is invented: every
 * response was produced by the real pipeline. Dates are shifted so the record
 * always looks current, and a visitor's edits (shedding logs, treatments,
 * history) live in memory for the visit; nothing leaves the browser.
 */

export const SNAPSHOT_MODE = process.env.NEXT_PUBLIC_DEMO_SNAPSHOT === "true";
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/farhan-hash404/TrichoRAG";
export const FULL_SYSTEM_URL =
  process.env.NEXT_PUBLIC_FULL_SYSTEM_URL || "https://codespaces.new/farhan-hash404/TrichoRAG?quickstart=1";
export const DEMO_EMAIL = "demo@example.com";

type Snapshot = {
  recorded_at: string;
  responses: Record<string, any>;
  comparisons: Record<string, any>;
  products: Record<string, any>;
  questions: string[];
  answers: Record<string, any>;
};

/** Thrown for calls the recording can't answer; api.ts turns it into an ApiError. */
export class SnapshotError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Not part of the recorded demo");
    this.status = status;
    this.detail = detail;
  }
}

/** Must match question_key() in backend/scripts/record_snapshot.py. */
export function questionKey(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function snapshotImageUrl(sessionId: string, view: string): string {
  return `/snapshot/images/${sessionId}/${view}.jpg`;
}

const DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Move every ISO date and datetime forward by whole days. */
export function shiftDates(value: any, days: number): any {
  if (typeof value === "string") {
    const m = ISO.exec(value);
    if (!m) return value;
    if (!m[4]) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * DAY).toISOString().slice(0, 10);
    }
    // The API writes naive UTC datetimes; keep at most milliseconds for Date.parse.
    const iso = `${m[1]}-${m[2]}-${m[3]}${m[4].replace(/(\.\d{3})\d+/, "$1")}${m[5] ?? "Z"}`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? value : new Date(t + days * DAY).toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = shiftDates(v, days);
    return out;
  }
  return value;
}

let loaded: Promise<Snapshot> | null = null;

function load(): Promise<Snapshot> {
  loaded ??= fetch("/snapshot/data.json")
    .then((res) => {
      if (!res.ok) throw new SnapshotError(503, "The recorded demo could not be loaded.");
      return res.json();
    })
    .then((raw: Snapshot) => {
      const days = Math.max(0, Math.floor((Date.now() - Date.parse(raw.recorded_at)) / DAY));
      return shiftDates(raw, days) as Snapshot;
    });
  return loaded;
}

export async function recordedQuestions(): Promise<string[]> {
  return (await load()).questions;
}

const today = () => new Date().toISOString().slice(0, 10);
const takenToday = new Set<string>();
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random()}`;

/** Answer one API call from the recording. Paths are relative to /api/v1. */
export async function snapshotRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const snap = await load();
  const r = snap.responses;
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
  const route = path.split("?")[0];
  const recorded = (key: string) => r[`${method} ${path}`] ?? r[key];
  const reply = (value: unknown) => structuredClone(value) as T;
  const notInDemo = (message: string, status = 403): never => {
    throw new SnapshotError(status, message);
  };

  const me = r["GET /auth/me"];
  const treatments: any[] = r["GET /treatments"];
  const summary: any[] = r["GET /treatments/adherence/summary"];
  const timeline = r["GET /timeline"];

  switch (`${method} ${route}`) {
    case "POST /auth/login":
      if (String(body.email).toLowerCase() !== DEMO_EMAIL) {
        notInDemo("This is a recorded demo, so only the demo record can sign in. Accounts work in the full system.");
      }
      return reply({ access_token: "recorded-demo", refresh_token: "recorded-demo", token_type: "bearer" });
    case "POST /auth/register":
      return notInDemo("New accounts work in the full system; this recorded demo has only the demo record.");
    case "GET /auth/me":
      return reply(me);
    case "PATCH /auth/me":
      Object.assign(me.user, body);
      return reply(me.user);
    case "POST /auth/consents": {
      const consent = { purpose: body.purpose, granted: Boolean(body.granted), granted_at: today() };
      me.consents = [...me.consents.filter((c: any) => c.purpose !== body.purpose), consent];
      return reply(consent);
    }
    case "GET /scans":
      return reply(r["GET /scans"]);
    case "GET /scans/reference":
      return reply(r["GET /scans/reference?domain=hair"]);
    case "POST /scans":
      return notInDemo("Live capture runs in the full system.", 409);
    case "GET /timeline":
      return reply(timeline);
    case "GET /treatments":
      return reply(treatments);
    case "POST /treatments": {
      const t = { id: newId(), ...body, created_at: new Date().toISOString() };
      treatments.push(t);
      summary.push({ treatment_id: t.id, name: t.name, adherence_pct: 0, logged_days: 0, window_days: 30 });
      timeline?.treatments?.push(t);
      return reply(t);
    }
    case "GET /treatments/adherence/summary":
      return reply(summary);
    case "GET /history":
      return reply(r["GET /history"]);
    case "PUT /history":
      Object.assign(r["GET /history"], body);
      return reply(r["GET /history"]);
    case "GET /shedding":
      return reply(recorded("GET /shedding?days=90"));
    case "POST /shedding": {
      const entry = { id: newId(), date: today(), note: null, count: null, bucket: null, ...body };
      r["GET /shedding?days=90"].push(entry);
      return reply(entry);
    }
    case "GET /shedding/trend":
      return reply(recorded("GET /shedding/trend?window_days=60"));
    case "POST /comparisons":
      return reply(
        snap.comparisons[`${body.session_before}|${body.session_after}`] ??
          notInDemo("That pair of scans wasn't part of the recording.", 404)
      );
    case "POST /products/recommend":
      return reply(snap.products[[...(body.goals ?? [])].sort().join("+")] ?? snap.products[""]);
    case "GET /products":
      return reply([]);
    case "POST /qa/ask":
      return reply(
        snap.answers[questionKey(String(body.question ?? ""))] ??
          notInDemo("That question wasn't part of the recording. Pick one of the recorded questions, or ask anything in the full system.", 404)
      );
    case "GET /qa/sources":
      return reply(r["GET /qa/sources"]);
    case "GET /qa/model":
      return reply(r["GET /qa/model"]);
  }

  // Parameterised routes
  let m: RegExpMatchArray | null;
  if (method === "GET" && (m = route.match(/^\/scans\/([^/]+)\/(result|doctor-report)$/))) {
    return reply(r[`GET /scans/${m[1]}/${m[2]}`] ?? notInDemo("Scan not found in the recording.", 404));
  }
  if (route.startsWith("/scans/")) return notInDemo("Live capture and analysis run in the full system.", 409);
  if (method === "DELETE" && (m = route.match(/^\/treatments\/([^/]+)$/))) {
    const id = m[1];
    for (const list of [treatments, timeline?.treatments ?? []]) {
      const i = list.findIndex((t: any) => t.id === id);
      if (i >= 0) list.splice(i, 1);
    }
    const s = summary.findIndex((x) => x.treatment_id === id);
    if (s >= 0) summary.splice(s, 1);
    return undefined as T;
  }
  if (method === "POST" && (m = route.match(/^\/treatments\/([^/]+)\/adherence$/))) {
    // Same formula as the API: days taken / days expected since the start (max
    // the window). Today counts once, however often the button is pressed.
    const id = m[1];
    const s = summary.find((x) => x.treatment_id === id);
    if (s && !takenToday.has(id)) {
      takenToday.add(id);
      const started = Date.parse(treatments.find((t) => t.id === id)?.start_date ?? today());
      const expected = Math.max(1, Math.min(s.window_days, Math.floor((Date.now() - started) / DAY) + 1));
      const taken = Math.min(expected, Math.round((s.adherence_pct / 100) * expected) + 1);
      s.adherence_pct = Math.min(100, Math.round((1000 * taken) / expected) / 10);
      s.logged_days = Math.min(s.window_days, s.logged_days + 1);
    }
    return reply({ treatment_id: id, taken: true, date: today() });
  }
  return notInDemo("Not part of the recorded demo.", 404);
}

/** What "Export my data" downloads in the recorded demo. */
export async function snapshotExport(): Promise<unknown> {
  const r = (await load()).responses;
  return structuredClone({
    user: r["GET /auth/me"].user,
    consents: r["GET /auth/me"].consents,
    clinical_history: r["GET /history"],
    treatments: r["GET /treatments"],
    shedding: r["GET /shedding?days=90"],
    note: "Recorded demo export: the synthetic demo record, not a real person.",
  });
}
