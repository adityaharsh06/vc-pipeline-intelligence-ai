import { getSnapshot } from "@/lib/data";
import { actionTone, daysBetween } from "@/lib/scoring";

// Follow-up calendar (.ics) for Vikram's own calendar app:
//  - "Email <firm>" today for every VC on this week's reach-out list he hasn't contacted yet
//  - "Follow up with <firm>" 7 days after the last contact for every VC he is waiting on

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

function istToday() {
  return new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00Z");
}
function nextWeekday(d: Date) {
  const x = new Date(d);
  while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { rows } = await getSnapshot();
  const today = istToday();
  const todayIso = today.toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const events: string[] = [];

  const add = (uid: string, day: Date, summary: string, description: string, url: string) => {
    const end = new Date(day);
    end.setUTCDate(end.getUTCDate() + 1);
    events.push(
      ["BEGIN:VEVENT", `UID:${uid}@vc-signal-desk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(day)}`,
        `DTEND;VALUE=DATE:${ymd(end)}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`, `URL:${url}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT9H30M", `DESCRIPTION:${esc(summary)}`, "END:VALARM", "END:VEVENT"]
        .map(fold)
        .join("\r\n"),
    );
  };

  for (const { inv, latest } of rows) {
    const page = `${origin}/investor/${inv.id}`;
    const signal = latest?.best_signal ? `Signal: ${latest.best_signal.summary} (${latest.best_signal.url})` : "No recent signal.";
    if (latest?.state === "active" && actionTone(latest.action) === "hot" && inv.status === "not_contacted") {
      add(`email-${inv.id}-${todayIso}`, nextWeekday(today), `Email ${inv.firm} (${inv.name})`,
        `${latest.action}. ${signal}\nDraft: ${origin}/outreach#${inv.id}`, page);
    }
    if (inv.status === "waiting_response" && inv.last_contact_date) {
      const due = new Date(inv.last_contact_date + "T00:00:00Z");
      due.setUTCDate(due.getUTCDate() + 7);
      const day = nextWeekday(due < today ? today : due);
      const waited = daysBetween(inv.last_contact_date, today);
      add(`followup-${inv.id}-${inv.last_contact_date}`, day, `Follow up with ${inv.firm} (${inv.name})`,
        `You contacted them on ${inv.last_contact_date} (${waited} days ago) and are waiting on a reply. ${signal}`, page);
    }
  }

  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VC Signal Desk//Follow-ups//EN", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:VC follow-ups", ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(ics + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="vc-follow-ups-${todayIso}.ics"`,
    },
  });
}
