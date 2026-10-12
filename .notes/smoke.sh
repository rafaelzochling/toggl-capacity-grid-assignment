#!/bin/sh
# End-to-end check against a running `make up`. Asserts the hand-written
# cases in the seed and a PATCH round trip. Exit code is non-zero on any
# mismatch. Usage: sh .notes/smoke.sh [http://localhost:8080]
set -eu
API=${1:-http://localhost:8080}
fail=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1: $3"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}

row() { # person id -> "allocated,... | weeklyHours". Ids 1-5 are also the first five names.
  cursor=""; [ "$1" -gt 1 ] && cursor="&cursor=$(( $1 - 1 ))"
  curl -sf "$API/api/capacity?from=2025-12-29&to=2026-01-16&limit=1$cursor" |
    python3 -c 'import json,sys; p=json.load(sys.stdin)["people"][0]; print(",".join(str(c["allocated"]) for c in p["cells"]), "|", p["weeklyHours"])'
}

echo "# health"; curl -sf "$API/api/health"; echo
echo "# range snaps to whole weeks"
check "weeks" "2025-12-29,2026-01-05,2026-01-12" "$(curl -sf "$API/api/capacity?from=2025-12-29&to=2026-01-16&limit=1" | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)["weeks"]))')"

echo "# curated people, weekday model"
check "Ana exactly full"            "40,0,30 | 40" "$(row 1)"
check "Bo weekend + week split"     "0,32,8 | 40"  "$(row 2)"
check "Dee over-allocated"          "0,45,40 | 40" "$(row 4)"
check "Eli zero capacity"           "0,20,0 | 0"   "$(row 5)"

echo "# pagination walks all 500 people once"
check "distinct people" "500 500" "$(python3 - "$API" <<'PY'
import json, sys, urllib.request
api = sys.argv[1]; seen = []; cursor = ""
while True:
    url = f"{api}/api/capacity?from=2025-12-29&to=2026-01-04&limit=137" + (f"&cursor={cursor}" if cursor else "")
    d = json.load(urllib.request.urlopen(url))
    seen += [p["id"] for p in d["people"]]
    if d["nextCursor"] is None: break
    cursor = d["nextCursor"]
print(len(seen), len(set(seen)))
PY
)"

echo "# PATCH round trip"
check "set 32" '{"id":1,"name":"Ana Ferreira","weeklyHours":32}' "$(curl -sf -X PATCH "$API/api/people/1" -d '{"weeklyHours":32}')"
check "capacity follows" "40,0,30 | 32" "$(row 1)"
check "restore 40" '{"id":1,"name":"Ana Ferreira","weeklyHours":40}' "$(curl -sf -X PATCH "$API/api/people/1" -d '{"weeklyHours":40}')"
check "bad hours -> 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/api/people/1" -d '{"weeklyHours":-1}')"
check "unknown id -> 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/api/people/99999" -d '{"weeklyHours":1}')"
check "53 weeks -> 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/capacity?from=2026-01-01&to=2026-12-31")"

[ $fail -eq 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
