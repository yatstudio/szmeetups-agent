#!/usr/bin/env bash
# Fixed push entry for the SZMeetups agent mirror daily update.
# The ONLY command the daily worker may run to publish site updates.
# Variable data (commit message + file list) comes from .push-manifest:
#   line 1      = commit message
#   lines 2..N  = file paths relative to this directory (e.g. events.json)
# NOTE: push_files must receive plaintext paths (the tool handles encoding);
# a batch must NEVER include files under .github/workflows/ (whole batch 403s).
set -euo pipefail
DIR="/home/hatch/workspace/szmeetups-agent"
MANIFEST="$DIR/.push-manifest"
if [ ! -f "$MANIFEST" ]; then
  echo "push.sh: manifest not found: $MANIFEST" >&2
  exit 1
fi
MSG="$(head -n 1 "$MANIFEST")"
if [ -z "$MSG" ]; then
  echo "push.sh: empty commit message in manifest" >&2
  exit 1
fi
PATHS_BIN="$(mktemp /tmp/szmeetups-paths.XXXXXX.bin)"
tail -n +2 "$MANIFEST" | tr '\n' '\0' > "$PATHS_BIN"
if [ ! -s "$PATHS_BIN" ]; then
  echo "push.sh: no files listed in manifest" >&2
  exit 1
fi
/opt/hatch/bin/github push-files --owner yatstudio --repo szmeetups-agent --branch main --message "$MSG" --source-dir "$DIR" --paths-file "$PATHS_BIN"
