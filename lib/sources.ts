// Live external data: Google News RSS (publisher-dated) + page verification helpers.

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  date: string; // YYYY-MM-DD
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function googleNews(query: string, sinceDays = 30): Promise<NewsItem[]> {
  const q = encodeURIComponent(`${query} when:${sinceDays}d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  const xml = await res.text();
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const get = (tag: string) => decode(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
    const pub = new Date(get("pubDate"));
    if (isNaN(pub.getTime())) continue;
    const source = get("source");
    let title = get("title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    items.push({ title, url: get("link"), source: source || "news", date: isoDate(pub) });
  }
  return items;
}

// Bing News RSS: second publisher-dated feed. Links carry the real article URL, so pages can be verified.
export async function bingNews(query: string): Promise<NewsItem[]> {
  const url =
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss` +
    `&qft=${encodeURIComponent('interval="8"')}&setlang=en-IN`;
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Bing News ${res.status}`);
  const xml = await res.text();
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const get = (tag: string) => decode(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
    const pub = new Date(get("pubDate"));
    if (isNaN(pub.getTime())) continue;
    let link = get("link");
    try {
      const real = new URL(link).searchParams.get("url");
      if (real) link = real;
    } catch {}
    items.push({ title: get("title"), url: link, source: get("News:Source") || domainOf(link), date: isoDate(pub) });
  }
  return items;
}

// Gemini grounding links are redirects; resolve to the publisher URL so we can show and verify it.
export async function resolveRedirect(uri: string): Promise<string> {
  if (!uri.includes("grounding-api-redirect")) return uri;
  try {
    const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(6_000) });
    return res.headers.get("location") || uri;
  } catch {
    return uri;
  }
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const DATE_PATTERNS = [
  /"datePublished"\s*:\s*"([^"]+)"/i,
  /property=["']article:published_time["'][^>]*content=["']([^"']+)/i,
  /content=["']([^"']+)["'][^>]*property=["']article:published_time/i,
  /name=["'](?:pubdate|publish-date|date|parsely-pub-date|sailthru\.date)["'][^>]*content=["']([^"']+)/i,
  /<time[^>]*datetime=["']([^"']+)/i,
];

// Fetch a page and check (a) it mentions the investor, (b) its published date if exposed.
export async function verifyPage(
  url: string,
  names: string[],
): Promise<{ reachable: boolean; mentions: boolean; date: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return { reachable: false, mentions: false, date: null };
    const html = (await res.text()).slice(0, 600_000);
    const lower = html.toLowerCase();
    const mentions = names.some((n) => n && lower.includes(n.toLowerCase()));
    let date: string | null = null;
    for (const p of DATE_PATTERNS) {
      const m = html.match(p);
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) {
          date = isoDate(d);
          break;
        }
      }
    }
    return { reachable: true, mentions, date };
  } catch {
    return { reachable: false, mentions: false, date: null };
  }
}
