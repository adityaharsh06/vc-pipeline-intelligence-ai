"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  queue: <path d="M4 6h16M4 12h10M4 18h6" />,
  quiet: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  all: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  runs: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  map: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
};

const LINKS = [
  { group: "This week", items: [
    { href: "/", label: "Priority queue", icon: I.queue },
    { href: "/outreach", label: "Outreach emails", icon: I.send },
    { href: "/quiet", label: "Quiet VCs", icon: I.quiet },
  ]},
  { group: "Pipeline", items: [
    { href: "/pipeline", label: "All investors", icon: I.all },
  ]},
  { group: "System", items: [
    { href: "/runs", label: "Runs & audit", icon: I.runs },
    { href: "/architecture", label: "Components map", icon: I.map },
  ]},
];

export default function Nav() {
  const path = usePathname();
  const on = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/pipeline" && path.startsWith("/investor"));
  return (
    <aside className="side">
      <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="brand-mark">V</div>
        <div>
          <b>Vikram</b>
          <span>VC Signal Desk · Seed round</span>
        </div>
      </Link>
      {LINKS.map((g) => (
        <nav className="nav" key={g.group}>
          <div className="nav-label">{g.group}</div>
          {g.items.map((l) => (
            <Link key={l.href} href={l.href} className={on(l.href) ? "on" : ""}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {l.icon}
              </svg>
              {l.label}
            </Link>
          ))}
        </nav>
      ))}
      <div className="side-foot">
        Signals: Google News + Bing News, read by Gemini Flash. Scores: fixed rules. Data: Supabase.
      </div>
    </aside>
  );
}
