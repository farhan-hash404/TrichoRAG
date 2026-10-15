"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { api, type QACitation, type QAResult } from "@/lib/api";
import { AuthGate } from "@/components/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link001 } from "@/components/ui/skiper-ui/skiper40";
import { PageHeader } from "@/components/page-header";
import { ReticleMark } from "@/components/wordmark";
import { FULL_SYSTEM_URL, SNAPSHOT_MODE, recordedQuestions } from "@/lib/snapshot";
import { cn } from "@/lib/utils";

// Live mode suggestions; the recorded demo offers the questions it recorded.
const SUGGESTIONS = [
  "How many hairs a day is normal to lose?",
  "What is telogen effluvium?",
  "Can iron deficiency make your hair fall out?",
  "Who should not use minoxidil foam?",
  "How many mg of finasteride should I take?",
  "What is the capital of France?",
];

export default function AskPage() {
  return (
    <AuthGate>
      <Ask />
    </AuthGate>
  );
}

function Ask() {
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<QAResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>(SNAPSHOT_MODE ? [] : SUGGESTIONS);

  React.useEffect(() => {
    if (SNAPSHOT_MODE) recordedQuestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, []);

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuestion(q);
    setBusy(true);
    setError(null);
    try {
      setResult(await api.ask(q));
    } catch (e: any) {
      setResult(null);
      setError(e?.message ?? "Could not get an answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <PageHeader
        index="Nº 02"
        eyebrow="Ask the evidence"
        title={
          <>
            Answers with their <span className="marker">sources</span> attached.
          </>
        }
        dek="Only from the NHS, MedlinePlus, NIAMS, DailyMed labels and open-access reviews. Every sentence is checked against the passage it cites; an answer that fails is withheld, not shown."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="crop-marks"
      >
        <div className="flex flex-col gap-3 border border-rule bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
          <label className="sr-only" htmlFor="question">
            Your question about hair or scalp health
          </label>
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={600}
            placeholder={SNAPSHOT_MODE ? "Pick a recorded question below" : "Ask about hair or scalp health"}
            className="min-w-0 flex-1 rounded border border-rule-strong bg-surface px-3.5 py-3 font-display text-lg placeholder:font-sans placeholder:text-base placeholder:text-ink-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-marker/70"
          />
          <Button type="submit" size="lg" disabled={busy || !question.trim()}>
            {busy ? "Checking sources…" : "Ask"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <div className="mt-4">
        <p className="label mb-2">{SNAPSHOT_MODE ? "Recorded questions" : "Try"}</p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className={cn(
                "rounded-sm border border-dashed px-2.5 py-1.5 text-left text-sm transition-colors",
                q === result?.question
                  ? "border-ink bg-surface text-ink"
                  : "border-rule-strong text-ink-soft hover:border-ink hover:text-ink"
              )}
            >
              {q}
            </button>
          ))}
        </div>
        {SNAPSHOT_MODE && (
          <p className="caption mt-3">
            Recorded demo: each answer here came from the live API. The{" "}
            <a href={FULL_SYSTEM_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              full system
            </a>{" "}
            answers any question.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-8 border-l-2 border-alert bg-alert-wash px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {busy && !result && (
        <div className="mt-10 flex items-center gap-3 text-ink-soft">
          <ReticleMark className="h-5 w-5 animate-spin text-ink [animation-duration:2.4s]" />
          <span className="label">Retrieving and checking sources…</span>
        </div>
      )}

      {result && <Answer result={result} />}
    </div>
  );
}

const VERDICT: Record<QAResult["mode"], { badge: React.ComponentProps<typeof Badge>["variant"]; label: string; note: string }> = {
  llm: { badge: "ok", label: "verified", note: "Every sentence was checked against the passage it cites." },
  extractive: {
    badge: "ok",
    label: "verified",
    note: "Verbatim quotes from the sources, each cited and checked; no language model was used.",
  },
  guardrail: {
    badge: "caution",
    label: "guardrail",
    note: "Handled by a fixed safety rule before any retrieval or model could run.",
  },
  abstain: {
    badge: "neutral",
    label: "not in the sources",
    note: "Nothing in the corpus answers this, so TrichoRAG says so instead of guessing.",
  },
  withheld: {
    badge: "alert",
    label: "withheld",
    note: "A drafted answer failed verification, so it is not shown.",
  },
};

function Answer({ result }: { result: QAResult }) {
  const verdict = VERDICT[result.mode] ?? VERDICT.abstain;
  const audit = result.audit;

  return (
    <article className="mt-12 animate-rise">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink pb-3">
        <Badge variant={verdict.badge}>{verdict.label}</Badge>
        <p className="text-sm text-ink-soft">{verdict.note}</p>
      </div>

      <h2 className="mt-6 text-3xl">{result.question}</h2>
      <AnswerText text={result.answer} />

      {result.citations.length > 0 && (
        <section className="mt-10">
          <h3 className="flex items-baseline gap-3 text-xl">
            <span className="readout text-xs text-ink-faint">A.</span>
            Sources
          </h3>
          <ol className="mt-3 border-t border-ink">
            {result.citations.map((c) => (
              <Source key={`${c.n}-${c.url}`} citation={c} />
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        {audit && (
          <div>
            <h3 className="flex items-baseline gap-3 text-xl">
              <span className="readout text-xs text-ink-faint">B.</span>
              How it was checked
            </h3>
            <dl className="mt-3 border-t border-ink text-sm">
              {[
                ["Sentences supported by their source", `${Math.round(audit.support_ratio * 100)}%`],
                ["Citations to sources that weren't given", String(audit.fabricated_citations.length)],
                ["Numbers not found in the cited text", String(audit.unmatched_numbers.length)],
                ["Medicines not named in the cited text", String(audit.unmatched_terms.length)],
                ["Doses, diagnoses or treatment orders", String(audit.policy_violations.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-rule py-2">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="readout">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div>
          <h3 className="flex items-baseline gap-3 text-xl">
            <span className="readout text-xs text-ink-faint">{audit ? "C." : "B."}</span>
            Pipeline
          </h3>
          <ol className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink pt-3">
            {result.trace.map((step, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-ink-faint">→</span>}
                <span className="rounded-sm border border-rule-strong px-1.5 py-0.5 font-mono text-[11px]">{step}</span>
              </li>
            ))}
          </ol>
          <p className="caption mt-3">
            {result.model === "extractive" || result.model === "none"
              ? "Answered without a language model"
              : `Model: ${result.model}`}{" "}
            · {result.latency_ms} ms{result.cached ? " · cached" : ""}
          </p>
        </div>
      </section>
    </article>
  );
}

/** The answer as written, with each [n] turned into a link to its source. */
function AnswerText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-4 space-y-2.5 border-l-2 border-marker pl-4">
          {bullets.map((b, i) => (
            <li key={i} className="font-display text-lg leading-snug">
              {withCitations(b)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("- ")) {
      bullets.push(t.slice(2));
      return;
    }
    flush();
    if (t) {
      blocks.push(
        <p key={`p-${i}`} className="mt-4 max-w-[68ch] font-display text-lg leading-relaxed">
          {withCitations(t)}
        </p>
      );
    }
  });
  flush();
  return <div className="mt-2">{blocks}</div>;
}

function withCitations(text: string): React.ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part);
    if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
    return (
      <sup key={i}>
        <a href={`#source-${m[1]}`} className="readout ml-0.5 text-[0.65em] font-medium text-accent hover:underline">
          {m[1]}
        </a>
      </sup>
    );
  });
}

function Source({ citation: c }: { citation: QACitation }) {
  return (
    <li id={`source-${c.n}`} className="grid scroll-mt-24 gap-x-4 border-b border-rule py-4 sm:grid-cols-[2rem_1fr]">
      <span className="readout pt-0.5 text-sm text-ink-faint">{c.n}</span>
      <div className="min-w-0">
        <Link001 href={c.url} className="inline-flex font-medium text-ink">
          {c.title}
        </Link001>
        <p className="caption mt-1">
          {[c.section, c.publisher].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="neutral">{c.license}</Badge>
          {c.evidence_grade && <Badge variant="flag">{c.evidence_grade.replace(/_/g, " ")}</Badge>}
        </div>
        <blockquote className="mt-2.5 line-clamp-4 border-l-2 border-rule-strong pl-3 font-display text-[0.95rem] italic leading-snug text-ink-soft">
          {c.quote}
        </blockquote>
      </div>
    </li>
  );
}
