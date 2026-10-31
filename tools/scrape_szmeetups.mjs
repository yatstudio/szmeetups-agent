// Scrape szmeetups.com (sitemap -> event pages -> JSON-LD) into events.json.
// No dependencies. Usage: node tools/scrape_szmeetups.mjs
// Polite scraping: normal UA, concurrency <= 8, 1 retry on failure.
// robots.txt on szmeetups.com explicitly allows AI crawlers (GPTBot/ClaudeBot etc.).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITEMAP_URL = "https://szmeetups.com/sitemap/events.xml";
const SOURCE_SITE = "https://szmeetups.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 szmeetups-agent-mirror/1.0 (+https://github.com/yatstudio/szmeetups-agent)";
const CONCURRENCY = 7;

// ---------- time helpers (Asia/Shanghai, UTC+08:00, no DST) ----------
const shFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
function toShanghaiISO(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = {};
  for (const p of shFmt.formatToParts(d)) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+08:00`;
}
function todayStartCST() {
  // Today 00:00:00 in Asia/Shanghai, as a Date
  const now = new Date();
  const parts = {};
  for (const p of shFmt.formatToParts(now)) parts[p.type] = p.value;
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`);
}

// ---------- fetch with 1 retry ----------
async function fetchText(url) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// ---------- JSON-LD parsing ----------
function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && Array.isArray(parsed["@graph"])) blocks.push(...parsed["@graph"]);
      else if (parsed) blocks.push(parsed);
    } catch { /* skip unparsable block */ }
  }
  return blocks;
}
function typeList(obj) {
  const t = obj && obj["@type"];
  if (Array.isArray(t)) return t.map(String);
  return t ? [String(t)] : [];
}
function isEventObj(obj) {
  // Most pages use *Event types, but many big listings use @type "Festival",
  // and a few pages carry no Event object at all (BreadcrumbList/FAQPage only).
  if (typeList(obj).some((t) => t === "Event" || /Event$/.test(t) || t === "Festival")) return true;
  return Boolean(obj && obj.startDate && obj.name);
}
function breadcrumbCategories(blocks) {
  const bc = blocks.find((b) => typeList(b).includes("BreadcrumbList"));
  if (!bc || !Array.isArray(bc.itemListElement)) return [];
  const items = [...bc.itemListElement].sort((a, b) => (a.position || 0) - (b.position || 0));
  const cats = [];
  const pos2 = items.find((i) => i.position === 2);
  const pos3 = items.find((i) => i.position === 3);
  const nameOf = (i) => (i && (i.name || (i.item && i.item.name))) ? String(i.name || i.item.name).trim() : null;
  const major = nameOf(pos2);
  const sub = nameOf(pos3);
  if (major) cats.push(major);
  if (sub) cats.push(sub);
  return cats;
}

// ---------- field helpers ----------
function firstString(v) {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === "object") return firstString(v.url || v["@id"] || null);
  return null;
}
function cleanLanguages(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out = [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const s = x.name || x.alternateName || x["@value"];
      if (s) out.push(String(s).trim());
    }
  }
  return [...new Set(out)];
}
function feeFromOffers(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const raw = [];
  for (const o of list) {
    if (!o) continue;
    const fields = [o.price, o.lowPrice, o.highPrice];
    for (const f of fields) {
      if (f === undefined || f === null || f === "") continue;
      if (typeof f === "number") raw.push(f);
      else {
        // String prices: extract each number token ("32-48" -> [32, 48])
        const toks = String(f).match(/\d+(?:\.\d+)?/g);
        if (toks) raw.push(...toks.map(Number));
      }
    }
  }
  // Source-site bug: some single price fields are tier prices concatenated
  // without separators (e.g. 99129249299) or float garbage (2.6e+22).
  // Only plausible single ticket prices (integer, <= ¥2000) are republished;
  // anything else becomes null instead of printing nonsense.
  const prices = raw.filter((n) => Number.isFinite(n) && n >= 0 && Number.isInteger(n) && n <= 2000);
  if (!prices.length) return null;
  if (prices.every((p) => p === 0)) return "Free";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n));
  return min === max ? `¥${fmt(min)}` : `¥${fmt(min)}–¥${fmt(max)}`;
}

// Area / district detection from venue + address text
function detectArea(text) {
  const t = ` ${text || ""} `;
  const has = (re) => re.test(t);
  if (has(/shekou|蛇口/i)) return "Shekou";
  if (has(/\bOCT\b|oct\s*-?\s*loft|华侨城/i)) return "OCT";
  if (has(/huaqiangbei|华强北/i)) return "Futian";
  if (has(/futian|福田/i)) return "Futian";
  if (has(/nanshan|南山/i)) return "Nanshan";
  if (has(/bao['’]?an|宝安/i)) return "Bao'an";
  if (has(/longgang|龙岗/i)) return "Longgang";
  if (has(/longhua|龙华/i)) return "Longhua";
  if (has(/luohu|罗湖/i)) return "Luohu";
  return "Shenzhen";
}
function detectDistrict(area, text) {
  const t = ` ${text || ""} `;
  if (/huaqiangbei|华强北/i.test(t)) return "福田区";
  switch (area) {
    case "Shekou": return "南山区";
    case "OCT": return "南山区";
    case "Futian": return "福田区";
    case "Nanshan": return "南山区";
    case "Bao'an": return "宝安区";
    case "Longgang": return "龙岗区";
    case "Longhua": return "龙华区";
    case "Luohu": return "罗湖区";
    default: return null;
  }
}
function slugFromUrl(u) {
  try {
    const parts = new URL(u).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch { return null; }
}

// ---------- per-page parse ----------
function parsePage(pageUrl, html) {
  const blocks = extractJsonLd(html);
  const eventObjs = blocks.filter(isEventObj);
  if (!eventObjs.length) return null;
  const categories = breadcrumbCategories(blocks);

  // Group occurrences by canonical event url (usually == pageUrl)
  const groups = new Map();
  for (const ev of eventObjs) {
    const key = (typeof ev.url === "string" && ev.url) || pageUrl;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  // This mirror is one entry per page/slug; if a page somehow holds several
  // distinct event urls, keep the group matching the page url, else the largest.
  let groupUrl = pageUrl;
  let occ = groups.get(pageUrl);
  if (!occ) {
    let best = null;
    for (const [k, v] of groups) if (!best || v.length > best[1].length) best = [k, v];
    groupUrl = best[0]; occ = best[1];
  }

  occ = [...occ].sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
  const cutoff = todayStartCST();
  const occWithDates = occ.map((o) => ({
    raw: o,
    start: o.startDate ? new Date(o.startDate) : null,
    end: o.endDate ? new Date(o.endDate) : (o.startDate ? new Date(o.startDate) : null),
  })).filter((o) => o.start && !Number.isNaN(o.start.getTime()));

  const futureOcc = occWithDates.filter((o) => o.end && o.end >= cutoff);
  const main = futureOcc[0] || occWithDates[occWithDates.length - 1];
  if (!main) return null;
  const ev = main.raw;
  const slug = slugFromUrl(groupUrl) || slugFromUrl(pageUrl);
  if (!slug) return null;

  const locRaw = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  const loc = locRaw && typeof locRaw === "object" ? locRaw : null;
  const venue = loc ? (typeof loc.name === "string" ? loc.name.trim() : null) : (typeof locRaw === "string" ? locRaw : null);
  let address = null;
  if (loc && loc.address) {
    if (typeof loc.address === "string") address = loc.address.trim() || null;
    else if (typeof loc.address === "object") address = (loc.address.streetAddress || "").trim() || null;
  }
  const areaText = `${venue || ""} ${address || ""}`;
  const area = detectArea(areaText);
  const district = detectDistrict(area, areaText);

  const orgRaw = Array.isArray(ev.organizer) ? ev.organizer[0] : ev.organizer;
  const organizer = orgRaw && typeof orgRaw === "object" ? (orgRaw.name ? String(orgRaw.name).trim() : null) : (typeof orgRaw === "string" ? orgRaw : null);

  // Title cleanup: Festival-type pages append a trailing " Shenzhen" to name,
  // with the clean title as alternateName[0]. alternateName is either a plain
  // Chinese-name string, or an array [short English name, venue Chinese name]
  // (occasionally [English subtitle, event Chinese name] — told apart by
  // comparing against the venue's own alternateName).
  let title = ev.name ? String(ev.name).trim() : slug;
  let titleZh = null;
  const venueAlt = loc && typeof loc.alternateName === "string" ? loc.alternateName.trim() : null;
  if (typeof ev.alternateName === "string") {
    titleZh = ev.alternateName.trim() || null;
  } else if (Array.isArray(ev.alternateName)) {
    const alts = ev.alternateName.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    if (alts.length && title === `${alts[0]} Shenzhen`) title = alts[0];
    for (const a of alts) {
      if (/[\u4e00-\u9fff]/.test(a) && a !== venueAlt && a !== venue && a !== title) { titleZh = a; break; }
    }
  }

  return {
    id: slug,
    title,
    title_zh: titleZh,
    start: toShanghaiISO(main.start),
    end: main.end ? toShanghaiISO(main.end) : null,
    venue: venue || null,
    address,
    area,
    district,
    categories,
    schema_type: typeList(ev)[0] || "Event",
    fee: feeFromOffers(ev.offers),
    languages: cleanLanguages(ev.inLanguage),
    organizer,
    summary: ev.description ? String(ev.description).replace(/\s+/g, " ").trim() : null,
    image: firstString(ev.image),
    url: groupUrl,
    calendar_url: `${SOURCE_SITE}/events/${slug}/calendar.ics`,
    source: "SZMeetups",
    occurrences_count: occWithDates.length,
    next_occurrences: futureOcc.slice(0, 8).map((o) => toShanghaiISO(o.start)),
    _hasFuture: futureOcc.length > 0,
    _endTime: main.end ? main.end.getTime() : 0,
  };
}

// ---------- main ----------
async function main() {
  console.log(`Fetching sitemap: ${SITEMAP_URL}`);
  const sitemapXml = await fetchText(SITEMAP_URL);
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
  console.log(`Sitemap URLs: ${urls.length}`);

  const results = [];
  const failed = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      try {
        const html = await fetchText(url);
        const parsed = parsePage(url, html);
        if (parsed) results.push(parsed);
        else failed.push(slugFromUrl(url) || url);
      } catch (e) {
        failed.push(slugFromUrl(url) || url);
        console.warn(`FAILED ${url}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const cutoff = todayStartCST().getTime();
  const kept = results
    .filter((e) => e._hasFuture && e._endTime >= cutoff)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  for (const e of kept) { delete e._hasFuture; delete e._endTime; }

  const out = {
    updated_at: toShanghaiISO(new Date()),
    source_site: SOURCE_SITE,
    city: "深圳",
    events: kept,
  };
  writeFileSync(join(root, "events.json"), JSON.stringify(out, null, 1) + "\n", "utf8");

  console.log("---- scrape stats ----");
  console.log(`sitemap total:      ${urls.length}`);
  console.log(`parsed OK:          ${results.length}`);
  console.log(`kept (future):      ${kept.length}`);
  console.log(`failed (${failed.length}): ${failed.join(", ") || "none"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
