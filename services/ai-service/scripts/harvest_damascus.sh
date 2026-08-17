#!/usr/bin/env bash
# Harvest the Damascus University journals into the exact-match corpus.
#
# Resumable and idempotent: a document whose normalized text is unchanged is
# skipped without re-fingerprinting, so re-running after an interruption costs
# only the OAI round-trips for what is already indexed.
#
# heaj is deliberately absent — its articles redirect to a login page, so it
# needs access from the journal office rather than a harvester change.
#
# Requires: Docker Postgres up (VECTOR_DB_PORT, default 5434), migrations run,
# and Tesseract with `ara` for the --ocr fallback.
#
# Usage:
#   bash scripts/harvest_damascus.sh              # all 12 journals
#   bash scripts/harvest_damascus.sh humj agrj    # only these
set -u

cd "$(dirname "$0")/.." || exit 1

OAI="${DAMASCUS_OAI_URL:-https://journal.damascusuniversity.edu.sy/index.php/index/oai}"
PY="${PYTHON:-python}"

# spec:limit — limits are the census counts with a little headroom.
ALL="AJPD:30 dujc:45 JSP:30 DJRS:40 hisj:230 basj:310 legj:285 ecoj:390 eduj:435 humj:520 agrj:540 engj:585"

if [ "$#" -gt 0 ]; then
  SELECTED=""
  for WANT in "$@"; do
    for ENTRY in $ALL; do
      [ "${ENTRY%%:*}" = "$WANT" ] && SELECTED="$SELECTED $ENTRY"
    done
  done
  JOURNALS="$SELECTED"
else
  JOURNALS="$ALL"
fi

for ENTRY in $JOURNALS; do
  SPEC="${ENTRY%%:*}"
  LIMIT="${ENTRY##*:}"
  echo "########## $SPEC (limit $LIMIT) — $(date +%H:%M:%S) ##########"
  PYTHONIOENCODING=utf-8 "$PY" scripts/import_oai_pmh.py "$OAI" \
    --set "${SPEC}:ART" \
    --limit "$LIMIT" \
    --ocr --ocr-max-pages 40 \
    --sleep 0.4 \
    --category "$SPEC" 2>&1 \
    | grep -E "^INFO import_oai_pmh: (Seen|Full-text|Stoplist|Corpus)|ERROR"
done

echo "########## HARVEST COMPLETE — $(date +%H:%M:%S) ##########"
