import type { SignalType } from "@/lib/types";

// Small, dependency-free SVG charts for the briefing page.

export function StatIcon({ name }: { name: "send" | "note" | "moon" | "users" | "check" | "clock" | "bolt" | "alert" }) {
  const paths = {
    send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
    note: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
    alert: <><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></>,
  };
  return (
    <span className="ico">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths[name]}
      </svg>
    </span>
  );
}

const TYPE_SHORT: Record<SignalType, string> = {
  investment: "Investment",
  portfolio_milestone: "Portfolio",
  fund_or_thesis: "Fund/thesis",
  blog_post: "Blog",
  interview_or_podcast: "Interview",
  event: "Event",
  other: "Other",
};

export function SignalTypeBars({ data }: { data: { type: SignalType; onThesis: number; other: number }[] }) {
  const W = 600, H = 250, L = 34, B = 212, T = 14;
  const max = Math.max(5, ...data.map((d) => d.onThesis + d.other));
  const top = Math.ceil(max / 5) * 5;
  const step = (W - L - 10) / data.length;
  const bw = Math.min(26, step * 0.42);
  const y = (v: number) => B - ((B - T) * v) / top;
  const ticks = [0, top / 5, (2 * top) / 5, (3 * top) / 5, (4 * top) / 5, top];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Signals this week by type">
      <defs>
        <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a9bff" /><stop offset="1" stopColor="#2f6ae6" /></linearGradient>
        <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffc06b" /><stop offset="1" stopColor="#ff9a4a" /></linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} stroke="#e8eef8" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#95a0b8">{Math.round(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = L + step * i + step / 2;
        const h1 = B - y(d.onThesis);
        const h2 = B - y(d.other);
        return (
          <g key={d.type}>
            {d.onThesis > 0 && <rect x={cx - bw / 2} y={B - h1} width={bw} height={h1} rx={4} fill="url(#gBlue)" />}
            {d.other > 0 && <rect x={cx - bw / 2} y={B - h1 - h2} width={bw} height={h2} rx={4} fill="url(#gOrange)" />}
            {d.onThesis + d.other > 0 && (
              <text x={cx} y={B - h1 - h2 - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#5f6b85">{d.onThesis + d.other}</text>
            )}
            <text x={cx} y={B + 18} textAnchor="middle" fontSize="11.5" fill="#5f6b85">{TYPE_SHORT[d.type]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export type DonutSlice = { label: string; value: number; color: string; sub: string };

export function Donut({ slices, center, caption }: { slices: DonutSlice[]; center: string; caption: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 70, C = 2 * Math.PI * R, GAP = slices.filter((s) => s.value).length > 1 ? 4 : 0;
  const lens = slices.map((s) => (s.value / total) * C);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <>
      <div className="donut-wrap">
        <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label={caption}>
          <circle cx="100" cy="100" r={R} fill="none" stroke="#eef2f9" strokeWidth="22" />
          {slices.map((s, i) =>
            s.value ? (
              <circle
                key={s.label} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="22" strokeLinecap="round"
                strokeDasharray={`${Math.max(0, lens[i] - GAP)} ${C}`} strokeDashoffset={-offsets[i]}
                transform="rotate(-90 100 100)"
              />
            ) : null,
          )}
          <text x="100" y="98" textAnchor="middle" fontSize="32" fontWeight="700" fill="#1d2740">{center}</text>
          <text x="100" y="120" textAnchor="middle" fontSize="12.5" fill="#95a0b8">{caption}</text>
        </svg>
      </div>
      <div className="donut-legend">
        {slices.map((s) => (
          <div key={s.label}>
            <div className="lbl"><i style={{ background: s.color }} />{s.label}</div>
            <div className="pct" style={{ color: s.color }}>{Math.round((s.value / total) * 100)}%</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}
