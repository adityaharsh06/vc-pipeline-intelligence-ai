"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Investor, Signal } from "@/lib/types";
import { SIGNAL_TYPE_LABEL, STATUS_LABEL } from "@/lib/types";
import type { WarmupDraft } from "@/lib/warmup";

type Item = { inv: Investor; assessmentId: string; score: number | null; signal: Signal };

const LIMIT = 300;

async function post(body: object) {
  const res = await fetch("/api/warmup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not draft the warm-up kit");
  return json;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      await navigator.clipboard.writeText(text).catch(() => {});
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    },
  };
}

export default function WarmupBoard({ items, drafts, today }: { items: Item[]; drafts: WarmupDraft[]; today: string }) {
  const router = useRouter();
  const missing = items.filter((i) => !drafts.some((d) => d.assessment_id === i.assessmentId));
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!missing.length || started.current) return;
    started.current = true;
    setDrafting(true);
    post({})
      .then(() => router.refresh())
      .catch((e) => setError(e.message))
      .finally(() => setDrafting(false));
  }, [missing.length, router]);

  const contacted = items.filter((i) => i.inv.last_contact_date === today).length;

  return (
    <>
      <div className="toolbar">
        <span className="chip warm"><span className="dot" />{contacted} of {items.length} marked contacted today</span>
      </div>
      {drafting && (
        <div className="callout accent" style={{ marginBottom: 16 }}>
          Drafting {missing.length} warm-up kit{missing.length === 1 ? "" : "s"} with Gemini Flash… about 20–40 seconds.
        </div>
      )}
      {error && <div className="callout" style={{ marginBottom: 16 }}><span className="bad">{error}</span></div>}
      <div className="brief">
        {items.map((it) => (
          <WarmupCard key={it.assessmentId} item={it} draft={drafts.find((d) => d.assessment_id === it.assessmentId) ?? null} today={today} />
        ))}
      </div>
    </>
  );
}

function WarmupCard({ item, draft, today }: { item: Item; draft: WarmupDraft | null; today: string }) {
  const router = useRouter();
  const { inv, signal } = item;
  const { copied, copy } = useCopy();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [contacted, setContacted] = useState(inv.last_contact_date === today);

  const [edit, setEdit] = useState({ id: "", note: "", subject: "", body: "" });
  if (draft && edit.id !== draft.id) {
    setEdit({ id: draft.id, note: draft.linkedin_note, subject: draft.intro_subject, body: draft.intro_body });
  }
  const over = edit.note.length > LIMIT;
  const linkedinSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${inv.name} ${inv.firm.replace(/\s*\(.*?\)/g, "")}`)}`;
  const introMail = `mailto:?subject=${encodeURIComponent(edit.subject)}&body=${encodeURIComponent(edit.body)}`;

  async function regenerate() {
    setBusy("regen");
    setErr(null);
    try {
      await post({ investorId: inv.id, replace: true });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markContacted() {
    setBusy("contacted");
    const res = await fetch(`/api/investors/${inv.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: inv.status === "in_conversation" ? "in_conversation" : "waiting_response",
        last_contact_date: today,
        notes: inv.notes,
      }),
    });
    setBusy(null);
    if (!res.ok) return setErr("Could not update the contact status");
    setContacted(true);
    router.refresh();
  }

  return (
    <article className="panel card" id={inv.id}>
      <div className={`score ${contacted ? "" : "warm"}`}>
        {item.score ?? "–"}
        <small>{contacted ? "sent" : "warm"}</small>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="card-top">
          <h3><Link href={`/investor/${inv.id}`}>{inv.firm}</Link></h3>
          <span className="muted small">{inv.name}</span>
          <span className="chip lock">{STATUS_LABEL[inv.status]}</span>
          {contacted && <span className="chip hot">✓ Contacted today</span>}
        </div>
        <div className="meta">
          <span>{SIGNAL_TYPE_LABEL[signal.type]} · {signal.date}</span>
          <span className="sep">|</span>
          <a href={signal.url} target="_blank" rel="noreferrer">{signal.source} ↗</a>
          <span className="sep">|</span>
          <span>Logistics relevance <b className="mono">{signal.relevance}</b></span>
        </div>
        <p className="why">{signal.summary}</p>

        {!draft ? (
          <div className="email email-empty">Drafting with Gemini Flash…</div>
        ) : (
          <div className="kit">
            <div className="email">
              <div className="email-row">
                <span className="kit-title"><span className="kit-ico li">in</span>LinkedIn connection note</span>
                <span className={`tiny mono ${over ? "bad" : "faint"}`}>{edit.note.length}/{LIMIT}</span>
              </div>
              <textarea className="email-body" style={{ minHeight: 110 }} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              <div className="card-actions" style={{ marginTop: 0 }}>
                <button className="btn primary" disabled={over} onClick={() => copy("note", edit.note)}>{copied === "note" ? "Copied ✓" : "Copy note"}</button>
                <a className="btn" href={linkedinSearch} target="_blank" rel="noreferrer">Find {inv.name.split(" ")[0]} on LinkedIn ↗</a>
              </div>
            </div>
            <div className="email">
              <div className="email-row">
                <span className="kit-title"><span className="kit-ico intro">↪</span>Warm-intro request (to a mutual contact)</span>
              </div>
              <input className="email-subject" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} aria-label="Intro request subject" />
              <textarea className="email-body" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={Math.min(14, edit.body.split("\n").length + 2)} />
              <div className="card-actions" style={{ marginTop: 0 }}>
                <button className="btn primary" onClick={() => copy("intro", `Subject: ${edit.subject}\n\n${edit.body}`)}>{copied === "intro" ? "Copied ✓" : "Copy request"}</button>
                <a className="btn" href={introMail}>Mail app</a>
              </div>
            </div>
          </div>
        )}

        <div className="card-actions">
          <button className="btn" disabled={!draft || Boolean(busy)} onClick={regenerate}>{busy === "regen" ? "Rewriting…" : "↻ Regenerate kit"}</button>
          <span style={{ flex: 1 }} />
          <button className={`btn ${contacted ? "" : "primary"}`} disabled={contacted || busy === "contacted"} onClick={markContacted}>
            {contacted ? "✓ Marked contacted" : busy === "contacted" ? "Saving…" : "Mark as contacted"}
          </button>
        </div>
        {err && <p className="small bad" style={{ marginTop: 8 }}>{err}</p>}
      </div>
    </article>
  );
}
