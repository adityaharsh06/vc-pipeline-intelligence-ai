"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Investor, Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

type Row = { inv: Investor; state: "active" | "quiet" | "error" | null; signalUrl: string | null; delta: number | null };

const tone = (a: string | null) =>
  !a ? "" : a.startsWith("Reach out this week") || a.startsWith("Follow up") ? "hot" : a.startsWith("Reach out with") ? "warm" : a.startsWith("Hold") || a.startsWith("Wait") || a.startsWith("Do not") ? "hold" : "";

export default function PipelineTable({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "quiet" | "unchecked">("all");
  const [status, setStatus] = useState<"" | Status>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"score" | "firm" | "signal" | "contact">("score");
  const [editing, setEditing] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (filter === "active" && r.state !== "active") return false;
      if (filter === "quiet" && r.state !== "quiet") return false;
      if (filter === "unchecked" && r.state) return false;
      if (status && r.inv.status !== status) return false;
      if (needle && !`${r.inv.firm} ${r.inv.name} ${r.inv.thesis} ${r.inv.notes}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const by: Record<typeof sort, (a: Row, b: Row) => number> = {
      score: (a, b) => (b.inv.follow_up_score ?? -1) - (a.inv.follow_up_score ?? -1),
      firm: (a, b) => a.inv.firm.localeCompare(b.inv.firm),
      signal: (a, b) => (b.inv.last_signal_date ?? "").localeCompare(a.inv.last_signal_date ?? ""),
      contact: (a, b) => (b.inv.last_contact_date ?? "").localeCompare(a.inv.last_contact_date ?? ""),
    };
    return out.sort(by[sort]);
  }, [rows, filter, status, q, sort]);

  const count = (f: typeof filter) =>
    rows.filter((r) => (f === "all" ? true : f === "unchecked" ? !r.state : r.state === f)).length;

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {(["all", "active", "quiet", "unchecked"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)} <span className="mono">{count(f)}</span>
            </button>
          ))}
        </div>
        <select className="sel" value={status} onChange={(e) => setStatus(e.target.value as Status | "")} aria-label="Contact status">
          <option value="">Any contact status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="sel" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="score">Sort: follow-up score</option>
          <option value="signal">Sort: latest signal</option>
          <option value="contact">Sort: last contact</option>
          <option value="firm">Sort: firm A–Z</option>
        </select>
        <input className="search" placeholder="Search firm, partner, thesis, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th rowSpan={2}>Investor</th>
              <th colSpan={3} className="grp manual">🔒 Vikram&apos;s columns · never written by the pipeline</th>
              <th colSpan={4} className="grp signal">⟳ Signal columns · updated every run</th>
            </tr>
            <tr>
              <th>Status</th><th>Last contact</th><th>Notes</th>
              <th>Score</th><th>Last signal</th><th>Signal summary</th><th>Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) =>
              editing === r.inv.id ? (
                <tr key={r.inv.id}>
                  <td colSpan={8}><Editor inv={r.inv} onDone={() => setEditing(null)} /></td>
                </tr>
              ) : (
                <tr key={r.inv.id}>
                  <td>
                    <Link href={`/investor/${r.inv.id}`}><b>{r.inv.firm}</b></Link>
                    <div className="small muted">{r.inv.name}</div>
                    <div className="tiny faint">{r.inv.kind} · {r.inv.geography}</div>
                    {r.inv.source === "added" && <span className="chip accent" style={{ marginTop: 4, fontSize: 11 }}>Added by you</span>}
                  </td>
                  <td className="manual"><span className="chip lock">{STATUS_LABEL[r.inv.status]}</span></td>
                  <td className="manual mono small">{r.inv.last_contact_date ?? "—"}</td>
                  <td className="manual notes-cell small">
                    {r.inv.notes || <span className="faint">—</span>}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn ghost" style={{ padding: "2px 8px", marginTop: 4, fontSize: 12 }} onClick={() => setEditing(r.inv.id)}>
                        Edit
                      </button>
                      {r.inv.source === "added" && <RemoveButton id={r.inv.id} firm={r.inv.firm} />}
                    </div>
                  </td>
                  <td className="mono">
                    <b>{r.inv.follow_up_score ?? "—"}</b>
                    {r.delta ? <div className={`delta ${r.delta > 0 ? "up" : "down"}`}>{r.delta > 0 ? "▲" : "▼"}{Math.abs(r.delta)}</div> : null}
                  </td>
                  <td className="mono small">{r.inv.last_signal_date ?? "—"}</td>
                  <td className="sum-cell small">
                    {r.inv.signal_summary ?? <span className="faint">Not scanned yet</span>}
                    {r.signalUrl && <> <a href={r.signalUrl} target="_blank" rel="noreferrer">source ↗</a></>}
                  </td>
                  <td>
                    {r.inv.recommended_action ? <span className={`chip ${tone(r.inv.recommended_action)}`}>{r.inv.recommended_action}</span> : "—"}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {!list.length && <div className="empty">No investors match these filters.</div>}
      </div>
    </>
  );
}

function Editor({ inv, onDone }: { inv: Investor; onDone: () => void }) {
  const [status, setStatus] = useState<Status>(inv.status);
  const [date, setDate] = useState(inv.last_contact_date ?? "");
  const [notes, setNotes] = useState(inv.notes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/investors/${inv.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, last_contact_date: date || null, notes }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Save failed");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <div className="edit">
      <b>Edit Vikram&apos;s columns · {inv.firm}</b>
      <div className="edit-row">
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Last contact date" />
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" maxLength={2000} />
      <div className="edit-row">
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
        <span className="small muted" style={{ alignSelf: "center" }}>
          Try it: edit a note, press Refresh now, and check the note survives the run.
        </span>
        {err && <span className="small bad">{err}</span>}
      </div>
    </div>
  );
}

function RemoveButton({ id, firm }: { id: string; firm: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn ghost"
      style={{ padding: "2px 8px", marginTop: 4, fontSize: 12, color: "var(--hold)" }}
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Remove ${firm} from the pipeline? This deletes its signal history too.`)) return;
        setBusy(true);
        await fetch(`/api/investors/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}
