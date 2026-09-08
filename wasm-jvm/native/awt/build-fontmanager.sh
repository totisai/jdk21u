#!/usr/bin/env bash
set -u
cd "${JDK:-$(cd "$(dirname "$0")/../../.." && pwd)}"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}" 2>/dev/null
B=build/emscripten-wasm32-zero-release; S=src/java.desktop; JB=src/java.base
SR=$EMSDK/upstream/emscripten/cache/sysroot/include
INC=(-I$S/share/native/libfontmanager -I$S/share/native/common/awt -I$S/share/native/common/awt/utility
 -I$S/share/native/common/font -I$S/share/native/libawt/java2d -I$S/share/native/libawt/java2d/pipe
 -I$S/share/native/libawt/java2d/loops -I$S/share/native/libawt/awt/image
 -I$S/share/native/include -I$S/unix/native/libawt/java2d -Isrc/java.desktop/emscripten/native/include
 -I$B/support/headers/java.desktop -I$JB/share/native/include -I$JB/unix/native/include
 -I$JB/share/native/libjava -I$JB/unix/native/libjava -Isrc/hotspot/share/include -Isrc/hotspot/os/posix/include
 -I$B/support/modules_include/java.base -I$SR/freetype2 -I$SR/harfbuzz)
CF=(-O2 -DLE_STANDALONE -DHEADLESS -DSTATIC_BUILD -DLIBRARY_NAME=fontmanager -D_ALLBSD_SOURCE -DMACOSX
 -DGETPAGESIZE -DHAVE_MPROTECT -DHAVE_PTHREAD -DHAVE_SYSCONF -DHAVE_SYS_MMAN_H -DHAVE_UNISTD_H
 -DHB_NO_PRAGMA_GCC_DIAGNOSTIC -Wno-implicit-function-declaration -Wno-int-conversion)
mkdir -p $B/fontobj
: > /tmp/font_srcs.txt
for f in freetypeScaler.c sunFont.c DrawGlyphList.c scriptMapping.c ColorGlyphSurfaceData.c HBShaper.c \
         hb-jdk-font.cc hb-jdk-font-p.cc; do
  [ -f "$S/share/native/libfontmanager/$f" ] && echo "$S/share/native/libfontmanager/$f" >> /tmp/font_srcs.txt
done
echo "sources: $(wc -l < /tmp/font_srcs.txt)"
ok=0; fail=0; : > /tmp/font_fail.txt
while IFS= read -r f; do
  ext="${f##*.}"; STD=(); [ "$ext" = "cc" ] && STD=(-std=c++17 -fno-rtti -fno-exceptions)
  if emcc -c "${CF[@]}" ${STD[@]+"${STD[@]}"} "${INC[@]}" "$f" -o "$B/fontobj/$(basename ${f%.*}).o" 2>>/tmp/font_fail.txt; then
    ok=$((ok+1)); else fail=$((fail+1)); echo "### FAIL $f" >> /tmp/font_fail.txt; fi
done < /tmp/font_srcs.txt
echo "DONE OK=$ok FAIL=$fail"
