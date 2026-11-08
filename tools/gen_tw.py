#!/usr/bin/env python3
"""Generate Traditional Chinese fields for events.json (SZMeetups mirror).

Usage: python3 tools/gen_tw.py

Run AFTER tools/merge_summary_zh.mjs in the daily flow. Converts the
Simplified Chinese fields with OpenCC (s2tw, character-level — same
conversion the Yat's List main site uses):
  title_zh   -> title_tw
  summary_zh -> summary_tw
Null stays null. Purely mechanical generation: never hand-edit the _tw
fields in events.json. Writes events.json back in the same format the
Node tools produce (JSON.stringify with 1-space indent + trailing \n).
Requires the Python `opencc` package (pip install --user opencc).
"""
import json
import os
import sys

try:
    from opencc import OpenCC
except ImportError:
    print("ERROR: python package 'opencc' not installed (pip install --user opencc)")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "events.json")

cc = OpenCC("s2tw")


def conv(v):
    return cc.convert(v) if isinstance(v, str) and v else None


def main():
    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)
    events = data.get("events", [])
    n_title = n_summary = 0
    for e in events:
        e["title_tw"] = conv(e.get("title_zh"))
        e["summary_tw"] = conv(e.get("summary_zh"))
        n_title += bool(e["title_tw"])
        n_summary += bool(e["summary_tw"])
    out = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"total: {len(events)} / title_tw: {n_title} / summary_tw: {n_summary}")


if __name__ == "__main__":
    main()
