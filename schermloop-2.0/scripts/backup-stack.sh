#!/usr/bin/env bash
# Maak een back-up van SchermLoop 2.0 in een LOKALE, AFGESCHERMDE map.
# Geen data wordt naar GitHub of externe diensten gestuurd.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Gebruik: scripts/backup-stack.sh /veilig/backup-pad [compose-project]" >&2
  exit 2
fi

DEST="$1"
PROJECT="${2:-schermloop2-ci}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.coolify.yml"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
chmod 700 "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d "$DEST/.schermloop2-${STAMP}-XXXXXXXX")"
FINAL="$DEST/schermloop2-${STAMP}.tar.gz"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT

dc() {
  docker compose -f "$COMPOSE" -p "$PROJECT" "$@"
}

if [[ -e "$FINAL" ]]; then
  echo "De back-up bestaat al. Bestaande bestanden worden niet overschreven." >&2
  exit 1
fi

# PostgreSQL custom-formaat: hersteltabel en indices zijn later te controleren.
dc exec -T db pg_dump -U schermloop -d schermloop -Fc --no-owner --no-acl > "$TMP/database.dump"
# Media wordt apart meegenomen. Archiveren in dezelfde map behoudt bestandsnamen.
dc exec -T web tar -C /app/storage -czf - . > "$TMP/media.tar.gz"

# Validatie voor het pakket wordt uitgegeven.
test -s "$TMP/database.dump"
test -s "$TMP/media.tar.gz"
tar -tzf "$TMP/media.tar.gz" > /dev/null
dc exec -T db pg_restore --list < "$TMP/database.dump" > /dev/null
printf '%s\n' "SchermLoop 2.0" "UTC: $STAMP" "Compose-project: $PROJECT" > "$TMP/README.txt"
(cd "$TMP" && sha256sum database.dump media.tar.gz > SHA256SUMS)
tar -C "$TMP" -czf "$FINAL" database.dump media.tar.gz SHA256SUMS README.txt
chmod 600 "$FINAL"
echo "Back-up opgeslagen in $FINAL"
echo "BELANGRIJK: verplaats een kopie naar een andere machine of externe opslag."
