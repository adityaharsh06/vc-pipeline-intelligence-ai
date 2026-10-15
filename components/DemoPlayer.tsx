"use client";
import { useRef, useState } from "react";

const CHAPTERS = [
  { t: 0, label: "The question", detail: "50 investors. Who do you email this week?" },
  { t: 3, label: "The dashboard", detail: "Live news on every VC, ranked by who's warm" },
  { t: 7, label: "Signal → score", detail: "A real Axios story becomes an 86/100 score" },
  { t: 11, label: "The email", detail: "Gemini Flash drafts it; open it in Gmail" },
  { t: 15, label: "Notes stay yours", detail: "The database blocks the pipeline from your notes" },
  { t: 18.5, label: "Recap", detail: "50 VCs · 200 live searches · 7 AI calls per run" },
];

export default function DemoPlayer() {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const active = CHAPTERS.reduce((a, c, i) => (now >= c.t ? i : a), 0);

  function seek(t: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
  }

  return (
    <div className="demo">
      <div className="panel demo-frame">
        <video
          ref={video}
          src="/demo/vc-signal-desk-demo.mp4"
          poster="/demo/vc-signal-desk-poster.jpg"
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        >
          Your browser can&apos;t play this video. <a href="/demo/vc-signal-desk-demo.mp4">Download it instead.</a>
        </video>
      </div>
      <div className="panel pad demo-chapters">
        <h3 style={{ marginBottom: 10 }}>Chapters</h3>
        <ol>
          {CHAPTERS.map((c, i) => (
            <li key={c.t}>
              <button className={i === active ? "on" : ""} onClick={() => seek(c.t)}>
                <span className="mono ts">0:{String(Math.floor(c.t)).padStart(2, "0")}</span>
                <span>
                  <b>{c.label}</b>
                  <span className="small muted">{c.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <a className="btn" href="/demo/vc-signal-desk-demo.mp4" download style={{ marginTop: 12 }}>⬇ Download MP4</a>
      </div>
    </div>
  );
}
