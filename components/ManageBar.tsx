"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { STATUS_LABEL } from "@/lib/types";

const KINDS = ["VC firm", "Angel", "Angel network", "Accelerator", "Corporate VC"];
const EMPTY = { name: "", firm: "", kind: "VC firm", thesis: "", website: "", geography: "", status: "not_contacted", last_contact_date: "", notes: "" };

type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "scanning"; firm: string } | { kind: "done"; text: string; ok: boolean };

export default function ManageBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && panel.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(panel.current, { autoAlpha: 0, y: -12, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: "power2.out" });
      gsap.from(panel.current.querySelectorAll(".field"), { autoAlpha: 0, y: 8, stagger: 0.03, duration: 0.3, delay: 0.1, ease: "power2.out" });
    }
  }, [open]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase({ kind: "saving" });
    const res = await fetch("/api/investors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPhase({ kind: "idle" });
      setError(body.error ?? "Could not add the investor");
      return;
    }
    router.refresh();
    // Scan the new investor right away so it doesn't wait for Monday/Thursday.
    setPhase({ kind: "scanning", firm: form.firm });
    const scan = await fetch(`/api/investors/${body.id}/scan`, { method: "POST" });
    const r = await scan.json().catch(() => ({}));
    const text = !scan.ok
      ? `Added ${form.firm}. The scan didn't finish (${r.error ?? "error"}); it will be checked in the next refresh.`
      : r.state === "active"
        ? `Added ${form.firm} · score ${r.score} · ${r.action}`
        : r.state === "quiet"
          ? `Added ${form.firm} · no signal in the last 30 days (quiet)`
          : `Added ${form.firm}. The scan failed; it will be checked in the next refresh.`;
    setPhase({ kind: "done", text, ok: scan.ok && r.state !== "error" });
    setForm(EMPTY);
    setOpen(false);
    router.refresh();
  }

  const busy = phase.kind === "saving" || phase.kind === "scanning";

  return (
    <div id="manage" className="manage">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button className="btn primary" onClick={() => setOpen(!open)} disabled={busy}>
          {open ? "Close" : "+ Add investor"}
        </button>
        <a className="btn" href="/api/export">⬇ Export CSV</a>
        <a className="btn" href="/api/calendar" title="Reminders to email this week's VCs and follow up with VCs you're waiting on">📅 Follow-up calendar (.ics)</a>
        {phase.kind === "scanning" && <span className="chip accent"><span className="dot pulse" />Scanning {phase.firm} for live signals…</span>}
        {phase.kind === "done" && <span className={`chip ${phase.ok ? "hot" : "warm"}`}>{phase.text}</span>}
      </div>

      {open && (
        <div ref={panel} className="panel pad add-form">
          <h3 style={{ marginBottom: 4 }}>Add an investor to the pipeline</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>
            They are scanned for live signals as soon as you save, then included in every Monday and Thursday run.
          </p>
          <form onSubmit={submit} className="form-grid">
            <label className="field">Partner name *<input required minLength={2} maxLength={80} value={form.name} onChange={set("name")} placeholder="e.g. Anjali Bansal" /></label>
            <label className="field">Firm *<input required minLength={2} maxLength={80} value={form.firm} onChange={set("firm")} placeholder="e.g. Avaana Capital" /></label>
            <label className="field">Type<select value={form.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label className="field">Website<input maxLength={100} value={form.website} onChange={set("website")} placeholder="firm.com" /></label>
            <label className="field wide">Thesis<input maxLength={400} value={form.thesis} onChange={set("thesis")} placeholder="Stage and sectors they invest in" /></label>
            <label className="field">Geography<input maxLength={60} value={form.geography} onChange={set("geography")} placeholder="India / US" /></label>
            <label className="field">Your status<select value={form.status} onChange={set("status")}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field">Last contact<input type="date" value={form.last_contact_date} onChange={set("last_contact_date")} /></label>
            <label className="field wide">Notes<textarea maxLength={2000} value={form.notes} onChange={set("notes")} placeholder="Your private notes (never touched by the pipeline)" /></label>
            <div className="field wide" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn primary" type="submit" disabled={busy}>{phase.kind === "saving" ? "Saving…" : "Save & scan"}</button>
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
              {error && <span className="small bad">{error}</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
