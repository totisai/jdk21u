#!/usr/bin/env bash
# stage-modules.sh — overlay complete JDK modules into the wasm build image.
#
# The wasm JDK build ships a reduced module set: java.desktop is stripped (no
# module-info.class, no java.beans) and some modules (e.g. java.security.jgss) are
# absent entirely. Real frameworks need them — Spring Boot uses java.beans property
# editors, Tomcat references org.ietf.jgss. These modules are pure bytecode, so we
# extract complete copies from a host OpenJDK 21 image and drop them into the wasm
# image's exploded module dir. Unused classes (e.g. AWT) never load, so nothing
# native is required.
#
# Usage:  stage-modules.sh [module ...]        (run from build/<conf>/)
#   env:  BOOT=<host JDK home>  (default: $BOOT from env.sh, else `java` on PATH)
# Default module set is what Spring Boot + embedded Tomcat need.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; source "$HERE/../../env.sh" 2>/dev/null || true
BOOT="${BOOT:-}"
if [ -z "$BOOT" ]; then BOOT="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"; fi
JIMAGE="$BOOT/lib/modules"
[ -f "$JIMAGE" ] || { echo "no jimage at $JIMAGE (set BOOT to a host JDK 21 home)"; exit 2; }

MODS=("$@")
[ ${#MODS[@]} -eq 0 ] && MODS=(java.desktop java.security.jgss)

DEST="jdk/modules"
[ -d "$DEST" ] || { echo "run from build/<conf>/ (no $DEST here)"; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$BOOT/bin/jimage" extract --dir "$TMP" "$JIMAGE" >/dev/null

for m in "${MODS[@]}"; do
  [ -d "$TMP/$m" ] || { echo "!! host image has no module $m"; continue; }
  rm -rf "${DEST:?}/$m"
  cp -R "$TMP/$m" "$DEST/$m"
  echo "staged $m  ($(find "$DEST/$m" -name '*.class' | wc -l | tr -d ' ') classes)"
done
echo "done. Rebuild the tier (e.g. EMUNET=1 build-jvm.sh base) to bake these in."
