// Build feed.xml (RSS) and events.ics from events.json. Usage: node tools/build_feeds.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "events.json"), "utf8"));
const events = (data.events || []).filter((e) => e && e.title && e.url);
const site = "https://yatstudio.github.io/szmeetups-agent/";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDt = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// RSS
const items = events.map((e) => `  <item>
    <title>${esc(e.title)}</title>
    <link>${esc(e.url)}</link>
    <guid isPermaLink="false">${esc(e.url)}</guid>
    <pubDate>${new Date(data.updated_at || Date.now()).toUTCString()}</pubDate>
    <description>${esc([e.start ? "Time: " + e.start : "", e.venue ? "Venue: " + e.venue : "", e.summary ? (e.summary_zh ? e.summary + " ｜ " + e.summary_zh : e.summary) : ""].filter(Boolean).join(" | "))}</description>
  </item>`).join("\n");
writeFileSync(join(root, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>SZMeetups Agent Mirror</title>
  <link>${site}</link>
  <description>Unofficial agent-friendly mirror of szmeetups.com — Shenzhen meetups, shows, nightlife, exhibitions, festivals and trade shows, updated daily. All event data (c) SZMeetups.</description>
  <lastBuildDate>${new Date(data.updated_at || Date.now()).toUTCString()}</lastBuildDate>
${items}
</channel></rss>
`);

// ICS (one VEVENT per event; missing end defaults to +2h)
const vevents = events.filter((e) => e.start).map((e) => {
  const start = new Date(e.start);
  const end = e.end ? new Date(e.end) : new Date(start.getTime() + 2 * 3600e3);
  const uid = `${e.id}@szmeetups-agent`;
  return ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${icsDt(data.updated_at || new Date())}`, `DTSTART:${icsDt(start)}`, `DTEND:${icsDt(end)}`,
    `SUMMARY:${icsEsc(e.title)}`, `LOCATION:${icsEsc([e.venue, e.address].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${icsEsc((e.summary || "") + " Details: " + e.url)}`, `URL:${e.url}`, "END:VEVENT"].join("\r\n");
}).join("\r\n");
writeFileSync(join(root, "events.ics"), ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//szmeetups-agent//EN", "CALSCALE:GREGORIAN", vevents, "END:VCALENDAR", ""].join("\r\n"));
console.log(`feed.xml + events.ics generated from ${events.length} events`);
