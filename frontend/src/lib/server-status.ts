"use client";

import * as React from "react";

import { SNAPSHOT_MODE } from "@/lib/snapshot";

export type ServerStatus = {
  state: "checking" | "waking" | "ready" | "unreachable";
  /** The API is the public demo: a shared demo record, data wiped on restart. */
  demo: boolean;
};

const GIVE_UP_MS = 150_000;

/**
 * Probes the API until it answers. Free hosting puts an idle server to sleep and
 * the first request after that can take a minute, far past the 8 s budget of
 * normal API calls, so the sign-in page says so instead of failing silently.
 */
export function useServerStatus(): ServerStatus {
  const [status, setStatus] = React.useState<ServerStatus>(
    SNAPSHOT_MODE ? { state: "ready", demo: true } : { state: "checking", demo: false }
  );

  React.useEffect(() => {
    if (SNAPSHOT_MODE) return; // the recorded demo has no server to wake
    let cancelled = false;
    const started = Date.now();

    (async () => {
      while (!cancelled) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
          clearTimeout(timer);
          // A sleeping host can answer 200 with its own HTML page; only our JSON counts.
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (body?.status === "ok") {
            if (!cancelled) setStatus({ state: "ready", demo: Boolean(body.demo_mode) });
            return;
          }
        } catch {
          // Not up yet.
        }
        if (cancelled) return;
        const gaveUp = Date.now() - started > GIVE_UP_MS;
        setStatus((s) => ({ ...s, state: gaveUp ? "unreachable" : "waking" }));
        if (gaveUp) return;
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
