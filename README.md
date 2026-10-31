# SZMeetups · Agent Mirror — szmeetups-agent

Shenzhen **meetups · language exchanges · shows & nightlife · exhibitions · festivals · sports · trade shows** from [SZMeetups](https://szmeetups.com), republished as agent-friendly structured data and updated **daily**.

- 🌐 Web page: https://yatstudio.github.io/szmeetups-agent/
- 📦 Machine-readable data: [`events.json`](https://yatstudio.github.io/szmeetups-agent/events.json) (format: `events.schema.json`)
- 📡 RSS: `feed.xml` ｜ 📅 Calendar subscription: `events.ics`

> **Unofficial agent-friendly mirror of szmeetups.com — all event data © SZMeetups, always link back to the original event page.**

## Why this exists

szmeetups.com is a great English-language guide to what's on in Shenzhen, but it has no public API, no RSS and no calendar feed — nothing an AI agent can subscribe to. This repo scrapes the schema.org Event data (JSON-LD) that the site already embeds in every event page (its robots.txt explicitly welcomes AI crawlers) and republishes it as `events.json` + RSS + ICS, so any agent can answer "what's on in Shenzhen?" and remind its user. Recurring events are grouped into one entry with `next_occurrences`.

## Subscribe with your Agent (for end users)

You don't need to browse this page yourself. Copy this paragraph to your Agent (Codex, Muse, Hermes, Globot — any agent with web access) and it will watch Shenzhen events for you:

> Please subscribe to the "SZMeetups Agent Mirror" and remind me about Shenzhen events: data source https://yatstudio.github.io/szmeetups-agent/events.json (updated daily, no login needed; it is an unofficial mirror of szmeetups.com). Fetch it once a day and filter by my interests [fill in yours, e.g. live music / language exchange / exhibitions / hiking] and my area [e.g. Shekou / Futian / Nanshan]. Tell me the same day when a new event matches my interests; for events I say I want to attend, remind me 3 days before and 1 day before they start. Never invent events that are not in the data, and always include the original szmeetups.com event link.

中文一句：把上面这段话复制给你的 Agent，它就会每天帮你盯深圳的活动并按你的兴趣提醒你。

Machine-readable entry points: [`llms.txt`](https://yatstudio.github.io/szmeetups-agent/llms.txt) · [`agent.json`](https://yatstudio.github.io/szmeetups-agent/agent.json) · [`AGENTS.md`](AGENTS.md)

## Data notes

- Times are Asia/Shanghai (UTC+8), ISO 8601 with `+08:00` offset.
- Only events with an upcoming occurrence are listed. Ongoing exhibitions/festivals may show a start date in the past — check `end`.
- Prices: the mirror only republishes plausible prices from the source's structured data; where the source price is missing or garbled, `fee` is `null` — check the original page.
- A few source pages (mostly large trade expos) embed no structured event data at all and cannot be mirrored yet.
- Maintainer flow: `node tools/scrape_szmeetups.mjs` → `node tools/build_feeds.mjs` → `./push.sh` (see AGENTS.md).
