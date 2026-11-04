#!/usr/bin/env bash
# Integriteitscontrole zonder gegevens terug te zetten of te wijzigen.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Gebruik: scripts/verify-backup.sh /pad/naar/back-up.tar.gz" >&2
  exit 2
fi
ARCHIVE="$1"
test -f "$ARCHIVE" || { echo "Geen back-upbestand." >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
CONTENTS="$(tar -tzf "$ARCHIVE")"
for entry in database.dump media.tar.gz SHA256SUMS README.txt; do
  grep -qx "$entry" <<< "$CONTENTS" || { echo "Ontbreekt: $entry" >&2; exit 1; }
done
# Veiligheid: pakket mag geen extra paden of geneste mappen bevatten.
test "$(printf '%s\n' "$CONTENTS" | wc -l)" -eq 4 || { echo "Back-up bevat onverwachte bestanden." >&2; exit 1; }
tar -xzf "$ARCHIVE" -C "$TMP"
(cd "$TMP" && sha256sum -c SHA256SUMS)
tar -tzf "$TMP/media.tar.gz" > /dev/null
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$TMP/database.dump" > /dev/null
else
  echo "pg_restore niet lokaal beschikbaar; database-inhoud is wel met SHA256 gecontroleerd."
fi
echo "Back-up is consistent en leesbaar. Er is niets teruggezet."
