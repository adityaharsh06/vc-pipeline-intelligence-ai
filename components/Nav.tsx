"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { group: "This week", items: [
    { href: "/", label: "Priority queue" },
    { href: "/quiet", label: "Quiet VCs" },
  ]},
  { group: "Pipeline", items: [
    { href: "/pipeline", label: "All investors" },
  ]},
  { group: "System", items: [
    { href: "/runs", label: "Runs & audit" },
    { href: "/architecture", label: "Components map" },
  ]},
];

export default function Nav() {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/pipeline" && path.startsWith("/investor")));
  return (
    <aside className="side">
      <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="brand-mark">VS</div>
        <div>
          <b>VC Signal Desk</b>
          <span>Vikram · Seed round</span>
        </div>
      </Link>
      {LINKS.map((g) => (
        <nav className="nav" key={g.group}>
          <div className="nav-label">{g.group}</div>
          {g.items.map((l) => (
            <Link key={l.href} href={l.href} className={on(l.href) ? "on" : ""}>
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
