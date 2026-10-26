#!/bin/sh
# Claude Code hook -> Agent Office. Reads the hook JSON from stdin and posts it
# in the background, so Claude never waits on (or breaks because of) the office.
URL="${AGENT_OFFICE_URL:-http://127.0.0.1:4777}/event"
payload=$(cat)
( curl -s -m 2 -X POST "$URL" -H 'content-type: application/json' --data-binary "$payload" >/dev/null 2>&1 & ) >/dev/null 2>&1
exit 0
