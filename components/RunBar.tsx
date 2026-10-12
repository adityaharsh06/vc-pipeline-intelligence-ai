"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Run } from "@/lib/types";

function rel(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
const ist = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";

const STATUS: Record<Run["status"], { label: string; cls: string }> = {
  running: { label: "Refreshing", cls: "accent" },
  succeeded: { label: "Last run succeeded", cls: "hot" },
  partial: { label: "Last run partial", cls: "warm" },
  failed: { label: "Last run failed", cls: "hold" },
  stalled: { label: "Run paused - resume", cls: "warm" },
};

export default function RunBar({ initial, nextIso }: { initial: Run | null; nextIso: string | null }) {
  const [run, setRun] = useState<Run | null>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const running = run?.status === "running";

  const poll = useCallback(async () => {
    const r = await fetch("/api/run", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.run) return;
    setRun((prev) => {
      if (prev?.status === "running" && r.run.status !== "running") router.refresh();
      else if (prev && r.run.processed !== prev.processed) router.refresh();
      return r.run;
    });
  }, [router]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [running, poll]);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/run", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(body.error ?? "Could not start a refresh");
      return;
    }
    setRun(body.run);
  }

  const pct = run && run.total ? Math.round((run.processed / run.total) * 100) : 0;
  const st = run ? STATUS[run.status] : null;

  return (
    <div className="runbar">
      <div className="runbar-in">
        {st && <span className={`chip ${st.cls}`}><span className="dot" />{st.label}</span>}
        {running && run ? (
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
            <span className="progress"><i style={{ width: `${pct}%` }} /></span>
            <span className="mono">Scanning {run.processed}/{run.total} investors</span>
          </span>
        ) : run ? (
          <span><span className="k">Last refresh</span>{rel(run.finished_at ?? run.started_at)}</span>
        ) : (
          <span className="muted">No runs yet</span>
        )}
        {nextIso && <span><span className="k">Next auto-run</span>{ist(nextIso)}<span className="sched-days"> · Mon &amp; Thu</span></span>}
        <span className="grow" />
        {msg && <span className="small" style={{ color: "var(--hold)" }}>{msg}</span>}
        <button className="btn primary" onClick={refresh} disabled={busy || running}>
          {running ? "Refreshing…" : run?.status === "stalled" ? "Resume refresh" : "Refresh now"}
        </button>
      </div>
    </div>
  );
}
