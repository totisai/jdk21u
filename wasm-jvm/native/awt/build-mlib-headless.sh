#!/usr/bin/env bash
set -u
cd "${JDK:-$(cd "$(dirname "$0")/../../.." && pwd)}"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}" 2>/dev/null
B=build/emscripten-wasm32-zero-release; S=src/java.desktop; JB=src/java.base
INC=(-I$S/share/native/libawt/awt/image -I$S/share/native/libawt/awt/image/cvutils
 -I$S/share/native/libawt/java2d -I$S/share/native/libawt/java2d/loops -I$S/share/native/libawt/java2d/pipe
 -I$S/share/native/libawt/awt/medialib -I$S/share/native/common/awt/medialib -I$S/share/native/libmlib_image
 -I$S/share/native/include -I$S/share/native/common/awt/debug -I$S/share/native/common/awt
 -I$S/share/native/common/java2d -I$S/share/native/common/font -I$S/share/native/common/awt/utility
 -I$S/unix/native/common/awt -I$S/unix/native/libawt/java2d
 -Isrc/java.desktop/emscripten/native/include -I$B/support/headers/java.desktop
 -I$JB/share/native/include -I$JB/unix/native/include -I$JB/share/native/libjava -I$JB/unix/native/libjava
 -Isrc/hotspot/share/include -Isrc/hotspot/os/posix/include -I$B/support/modules_include/java.base)
CF=(-O2 -DHEADLESS=true -D__MEDIALIB_OLD_NAMES -D__USE_J2D_NAMES -DMLIB_NO_LIBSUNMATH -DSTATIC_BUILD -DLIBRARY_NAME=awt_headless
 -D_ALLBSD_SOURCE -DMACOSX -Wno-implicit-function-declaration -Wno-int-conversion)
mkdir -p $B/awtobj
find $S/share/native/libmlib_image -name '*.c' > /tmp/awt2_srcs.txt
find $S/unix/native/libawt_headless -name '*.c' >> /tmp/awt2_srcs.txt
find $S/share/native/common/font -name '*.c' >> /tmp/awt2_srcs.txt
find $S/share/native/common/java2d -name '*.c' ! -name 'GLX*' ! -name 'X11*' >> /tmp/awt2_srcs.txt
echo "sources: $(wc -l < /tmp/awt2_srcs.txt)"
ok=0; fail=0; : > /tmp/awt2_fail.txt
while IFS= read -r f; do
  if emcc -c "${CF[@]}" "${INC[@]}" "$f" -o "$B/awtobj/$(basename ${f%.c}).o" 2>>/tmp/awt2_fail.txt; then
    ok=$((ok+1)); else fail=$((fail+1)); echo "### FAIL $f" >> /tmp/awt2_fail.txt; fi
done < /tmp/awt2_srcs.txt
echo "DONE OK=$ok FAIL=$fail"

# mlib_ImageUtils.c auto-generates JNI_OnLoad_<LIBRARY_NAME> under STATIC_BUILD,
# colliding with HeadlessToolkit.c's JNI_OnLoad_awt_headless. Recompile it with a
# throwaway LIBRARY_NAME so its (unused) JNI_OnLoad symbol is unique.
CFU=("${CF[@]}"); CFU=("${CFU[@]/-DLIBRARY_NAME=awt_headless/-DLIBRARY_NAME=mlibimage_unused}")
emcc -c "${CFU[@]}" "${INC[@]}" "$S/share/native/libmlib_image/mlib_ImageUtils.c" \
     -o "$B/awtobj/mlib_ImageUtils.o" && echo "FIXUP mlib_ImageUtils LIBRARY_NAME=mlibimage_unused OK"
