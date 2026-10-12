"use client";
import { useState } from "react";

type Result = { investor: string; blocked: boolean; database_said: string; note_unchanged: boolean; tested_at: string };

export default function GuardTest() {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/guard-test", { method: "POST" }).then((x) => x.json()).catch(() => null);
          setRes(r);
          setBusy(false);
        }}
      >
        {busy ? "Testing…" : "Try to overwrite a note as the pipeline"}
      </button>
      {res && (
        <div className="callout" style={{ marginTop: 12 }}>
          <div>
            {res.blocked ? <span className="ok">✓ Blocked by the database</span> : <span className="bad">✗ Not blocked</span>}
            {" · "}tried on <b>{res.investor}</b>
          </div>
          <div className="mono small" style={{ marginTop: 6 }}>{res.database_said}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Note after the attempt: {res.note_unchanged ? <span className="ok">unchanged</span> : <span className="bad">changed</span>}
          </div>
        </div>
      )}
    </div>
  );
}
