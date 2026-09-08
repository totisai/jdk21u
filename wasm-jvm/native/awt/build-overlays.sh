#!/usr/bin/env bash
# Compile the emscripten java.desktop overlay classes (sun.awt.* : the headless
# graphics env, virtual-screen toolkit, window peer, focus peer, etc.; plus a few
# JDK-8 compat shims like com.sun.java.swing.plaf.windows.WindowsLookAndFeel that
# old apps reference) against the boot java.desktop and drop them into $BOOTMODS
# so the link preloads them.
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
SRC=$JDK/src/java.desktop/emscripten/classes
OUT=$(mktemp -d)
# Compile every .java under the overlay, preserving package layout.
SRCS=$(find "$SRC" -name '*.java')
"$BOOT/bin/javac" -XDignore.symbol.file=true --patch-module java.desktop=$SRC \
   --add-modules java.desktop -d "$OUT" $SRCS || exit 1
# Copy all compiled classes back into $BOOTMODS/java.desktop, package dirs and all.
( cd "$OUT" && find . -name '*.class' -print0 | while IFS= read -r -d '' f; do
    mkdir -p "$BOOTMODS/java.desktop/$(dirname "$f")"
    cp "$f" "$BOOTMODS/java.desktop/$f"
  done )
echo "overlaid $(find "$OUT" -name '*.class' | wc -l | tr -d ' ') classes"
rm -rf "$OUT"
