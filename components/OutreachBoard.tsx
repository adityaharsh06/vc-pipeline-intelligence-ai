"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Investor, Signal } from "@/lib/types";
import { SIGNAL_TYPE_LABEL, STATUS_LABEL } from "@/lib/types";
import type { Draft, Tone } from "@/lib/outreach";

type Item = {
  inv: Investor;
  assessmentId: string;
  score: number | null;
  action: string | null;
  why: string | null;
  signal: Signal;
};

const TONE_LABEL: Record<Tone, string> = { default: "Standard", shorter: "Shorter", warmer: "Warmer", formal: "More formal" };
const KIND_LABEL = { first_touch: "First email", follow_up: "Follow-up", next_step: "Next step" } as const;

const gmailUrl = (subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const mailtoUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

async function post(body: object) {
  const res = await fetch("/api/outreach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not draft the email");
  return json;
}

export default function OutreachBoard({ items, drafts, today }: { items: Item[]; drafts: Draft[]; today: string }) {
  const router = useRouter();
  const missing = items.filter((i) => !drafts.some((d) => d.assessment_id === i.assessmentId && d.tone === "default"));
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const started = useRef(false);

  // First visit after a scan: draft the whole list in one go (one Gemini call per 8 VCs), then show it.
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
  const defaults = items
    .map((i) => ({ i, d: drafts.find((d) => d.assessment_id === i.assessmentId && d.tone === "default") }))
    .filter((x): x is { i: Item; d: Draft } => Boolean(x.d));
  const allText = defaults
    .map(({ i, d }) => `=== ${i.inv.firm} · ${i.inv.name} ===\nSubject: ${d.subject}\n\n${d.body}`)
    .join("\n\n\n");

  return (
    <>
      <div className="toolbar">
        <span className="chip hot"><span className="dot" />{contacted} of {items.length} marked contacted today</span>
        <span className="grow" style={{ flex: 1 }} />
        <button
          className="btn"
          disabled={!defaults.length}
          onClick={async () => {
            await navigator.clipboard.writeText(allText).catch(() => {});
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 1500);
          }}
        >
          {copiedAll ? "Copied ✓" : `Copy all ${defaults.length}`}
        </button>
        <a
          className="btn"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(allText)}`}
          download={`outreach-${today}.txt`}
          aria-disabled={!defaults.length}
        >
          Download .txt
        </a>
      </div>

      {drafting && (
        <div className="callout accent" style={{ marginBottom: 16 }}>
          Drafting {missing.length} email{missing.length === 1 ? "" : "s"} with Gemini Flash from this week&apos;s signals… about 20–40 seconds.
        </div>
      )}
      {error && <div className="callout" style={{ marginBottom: 16 }}><span className="bad">{error}</span></div>}

      <div className="brief">
        {items.map((it) => (
          <EmailCard key={it.assessmentId} item={it} drafts={drafts.filter((d) => d.assessment_id === it.assessmentId)} today={today} />
        ))}
      </div>
    </>
  );
}

function EmailCard({ item, drafts, today }: { item: Item; drafts: Draft[]; today: string }) {
  const router = useRouter();
  const { inv, signal } = item;
  const [tone, setTone] = useState<Tone>("default");
  const draft = drafts.find((d) => d.tone === tone) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [contacted, setContacted] = useState(inv.last_contact_date === today);

  // Editable copy of the current draft; resets whenever a different draft is shown.
  const [edit, setEdit] = useState({ id: "", subject: "", body: "" });
  if (draft && edit.id !== draft.id) setEdit({ id: draft.id, subject: draft.subject, body: draft.body });
  const subject = draft ? edit.subject : "";
  const body = draft ? edit.body : "";

  async function run(label: string, payload: object) {
    setBusy(label);
    setErr(null);
    try {
      await post({ investorId: inv.id, ...payload });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markContacted() {
    setBusy("contacted");
    setErr(null);
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
    if (!res.ok) {
      setErr("Could not update the contact status");
      return;
    }
    setContacted(true);
    router.refresh();
  }

  return (
    <article className="panel card" id={inv.id} style={{ gridTemplateColumns: "68px 1fr" }}>
      <div className={`score ${contacted ? "" : "hot"}`}>
        {item.score ?? "–"}
        <small>{contacted ? "sent" : "act"}</small>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="card-top">
          <h3><Link href={`/investor/${inv.id}`}>{inv.firm}</Link></h3>
          <span className="muted small">{inv.name}</span>
          <span className="chip lock">{STATUS_LABEL[inv.status]}</span>
          {draft && <span className="chip accent">{KIND_LABEL[draft.kind]}</span>}
          {contacted && <span className="chip hot">✓ Contacted today</span>}
        </div>
        <div className="meta">
          <span>{SIGNAL_TYPE_LABEL[signal.type]} · {signal.date}</span>
          <span className="sep">|</span>
          <a href={signal.url} target="_blank" rel="noreferrer">{signal.source} ↗</a>
          <span className="sep">|</span>
          <span>{signal.summary}</span>
        </div>

        <div className="email">
          <div className="email-row">
            <label className="tiny faint" htmlFor={`s-${inv.id}`}>SUBJECT</label>
            <div className="seg tone">
              {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                <button key={t} className={tone === t ? "on" : ""} onClick={() => setTone(t)}>{TONE_LABEL[t]}</button>
              ))}
            </div>
          </div>
          {draft ? (
            <>
              <input id={`s-${inv.id}`} className="email-subject" value={subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
              <textarea className="email-body" value={body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={Math.min(16, body.split("\n").length + 2)} />
            </>
          ) : (
            <div className="email-empty">
              {tone === "default" ? (
                busy ? "Drafting…" : "Drafting with Gemini Flash…"
              ) : (
                <button className="btn primary" disabled={Boolean(busy)} onClick={() => run("tone", { tone })}>
                  {busy ? "Drafting…" : `Write a ${TONE_LABEL[tone].toLowerCase()} version`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card-actions">
          <a className={`btn primary ${draft ? "" : "disabled"}`} href={draft ? gmailUrl(subject, body) : undefined} target="_blank" rel="noreferrer">
            Open in Gmail ↗
          </a>
          <a className="btn" href={draft ? mailtoUrl(subject, body) : undefined}>Mail app</a>
          <button
            className="btn"
            disabled={!draft}
            onClick={async () => {
              await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button className="btn" disabled={!draft || Boolean(busy)} onClick={() => run("regen", { tone, replace: true })}>
            {busy === "regen" ? "Rewriting…" : "↻ Regenerate"}
          </button>
          <span style={{ flex: 1 }} />
          <button className={`btn ${contacted ? "" : "primary"}`} disabled={contacted || busy === "contacted"} onClick={markContacted}>
            {contacted ? "✓ Marked contacted" : busy === "contacted" ? "Saving…" : "Mark as contacted"}
          </button>
        </div>
        {err && <p className="small bad" style={{ marginTop: 8 }}>{err}</p>}
        <p className="tiny faint" style={{ marginTop: 8 }}>
          Draft only, nothing is sent by this app. &quot;Mark as contacted&quot; updates your own status and last-contact
          columns (the signal pipeline never touches them).
        </p>
      </div>
    </article>
  );
}
