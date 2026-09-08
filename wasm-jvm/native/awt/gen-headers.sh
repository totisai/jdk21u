#!/usr/bin/env bash
# Generate java.desktop JNI headers for the wasm/headless target. The normal
# java.desktop compile pulls in the X11 toolkit (which needs X11 gensrc our
# target never produces), so instead we compile just the shared classes plus the
# minimal emscripten headless platform layer, as a --patch-module over the boot
# JDK, with -h to emit headers. Output: JDK_TOP/build/<conf>/support/headers/java.desktop
set -euo pipefail
JDK_TOP="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
BOOT="${BOOT_JDK:-/opt/homebrew/Cellar/openjdk/26.0.1}"
OUT="${2:-/tmp/jdh}"
cd "$JDK_TOP"
rm -rf "$OUT" /tmp/jdo; mkdir -p "$OUT" /tmp/jdo
find src/java.desktop/share/classes src/java.desktop/emscripten/classes -name '*.java' \
   ! -name 'module-info.java' ! -path '*/com/sun/java/swing/plaf/gtk/*' > /tmp/jdsrc.txt
"$BOOT/bin/javac" \
   --patch-module java.desktop=src/java.desktop/share/classes:src/java.desktop/emscripten/classes \
   --add-modules java.desktop -XDignore.symbol.file=true -proc:none -nowarn \
   -h "$OUT" -d /tmp/jdo @/tmp/jdsrc.txt
echo "generated $(ls "$OUT" | wc -l) headers in $OUT"
