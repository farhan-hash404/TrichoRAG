// The recorded demo must behave like the API it replays.
//   npm run test:snapshot   (Node 22.6+: runs TypeScript by stripping types)
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_DEMO_SNAPSHOT = "true";
const raw = JSON.parse(readFileSync(new URL("../public/snapshot/data.json", import.meta.url), "utf8"));

// Pretend the recording is 20 days old: everything should move forward 20 days.
const DAY = 86_400_000;
const recordedAt = new Date(Date.now() - 20 * DAY - 3_600_000).toISOString();
const aged = { ...raw, recorded_at: recordedAt };
globalThis.fetch = (async () => new Response(JSON.stringify(aged), { status: 200 })) as typeof fetch;

const snap = await import(new URL("../src/lib/snapshot.ts", import.meta.url).href);
const call = (path: string, init: RequestInit = {}) => snap.snapshotRequest<any>(path, init);
const post = (path: string, body: unknown) => call(path, { method: "POST", body: JSON.stringify(body) });

// 1. dates
const scans = await call("/scans");
const original = raw.responses["GET /scans"][0].created_at;
const shiftedDays = Math.round((Date.parse(scans[0].created_at) - Date.parse(original + "Z")) / DAY);
assert.equal(shiftedDays, 20, "scan dates move forward by the recording's age");
assert.equal(snap.shiftDates("2026-10-12", 3), "2026-10-15");
assert.equal(snap.shiftDates("2026-10-12T07:24:31.898516", 1), "2026-10-13T07:24:31.898Z");
assert.equal(snap.shiftDates("not a date", 5), "not a date");
console.log(`dates: shifted ${shiftedDays} days (${original} -> ${scans[0].created_at})`);

// 2. adherence goes up when a dose is logged
const before = await call("/treatments/adherence/summary");
await post(`/treatments/${before[0].treatment_id}/adherence`, { taken: true });
const after = await call("/treatments/adherence/summary");
assert.ok(after[0].adherence_pct > before[0].adherence_pct || before[0].adherence_pct === 100);
await post(`/treatments/${before[0].treatment_id}/adherence`, { taken: true });
const again = await call("/treatments/adherence/summary");
assert.equal(again[0].adherence_pct, after[0].adherence_pct, "today counts once");
const fresh = await post("/treatments", { name: "New foam", category: "topical", start_date: new Date().toISOString().slice(0, 10) });
await post(`/treatments/${fresh.id}/adherence`, { taken: true });
const freshPct = (await call("/treatments/adherence/summary")).find((x: any) => x.treatment_id === fresh.id).adherence_pct;
assert.equal(freshPct, 100, "a treatment started today and taken today is 100%");
console.log(`adherence: ${before[0].adherence_pct}% -> ${after[0].adherence_pct}% (${before[0].name})`);

// 3. a logged shedding entry appears, and responses are copies (React must see a new array)
const s0 = await call("/shedding?days=90");
const entry = await post("/shedding", { context: "brush", bucket: "light", count: null, washed_hair: false });
const s1 = await call("/shedding?days=90");
assert.equal(s1.length, s0.length + 1);
assert.notEqual(s1, s0);
console.log(`shedding: ${s0.length} -> ${s1.length} entries, new one dated ${entry.date}`);

// 4. treatments: add then delete
const t = await post("/treatments", { name: "Test shampoo", category: "shampoo", start_date: "2026-10-15" });
assert.ok((await call("/treatments")).some((x: any) => x.id === t.id));
await call(`/treatments/${t.id}`, { method: "DELETE" });
assert.ok(!(await call("/treatments")).some((x: any) => x.id === t.id));
console.log("treatments: add and delete work");

// 5. questions, sign-in rules, unknown calls
const a = await post("/qa/ask", { question: "  how many HAIRS a day is normal to lose??  " });
assert.equal(a.mode, "extractive");
await assert.rejects(post("/qa/ask", { question: "Something never recorded" }), (e: any) => e.status === 404);
await assert.rejects(post("/auth/login", { email: "someone@else.com", password: "x" }), (e: any) => e.status === 403);
assert.equal((await post("/auth/login", { email: "demo@example.com", password: "x" })).access_token, "recorded-demo");
await assert.rejects(post("/scans", { domain: "hair" }), (e: any) => e.status === 409);
console.log("questions match loosely; strangers, live scans and unrecorded questions are refused clearly");
console.log("ALL SNAPSHOT CHECKS PASSED");
