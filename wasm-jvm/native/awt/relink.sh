#!/usr/bin/env bash
# Link the AWT/Swing-enabled monolithic JVM: build/.../web/jvmawt.js(+.wasm+.data).
# Requires: build-overlays.sh + the native *obj/ built (build-libawt.sh,
# build-mlib-headless.sh, build-fontmanager.sh) + rebuild-stubs.sh done first.
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
cd $BUILD
emcc web/launcher_web.c web/symtab.o awtobj/*.o fontobj/*.o \
     hotspot/variant-zero/libjvm/objs/static/*.o \
     support/native/java.base/libjava/static/*.o support/native/java.base/libjimage/static/*.o \
     support/native/java.base/libnio/static/*.o support/native/java.base/libzip/static/*.o \
     support/native/java.base/libnet/static/*.o support/native/java.base/libverify/static/*.o \
     $FFI/lib/libffi.a -I jdk/include -I jdk/include/emscripten \
  -sUSE_FREETYPE=1 -sUSE_HARFBUZZ=1 \
  -pthread -sPTHREAD_POOL_SIZE=32 -sPTHREAD_POOL_SIZE_STRICT=0 -sPROXY_TO_PTHREAD \
  -sINITIAL_MEMORY=1610612736 -sSTACK_SIZE=8388608 -sWASM_BIGINT -sERROR_ON_UNDEFINED_SYMBOLS=0 -sEXIT_RUNTIME=1 \
  -sEXPORT_NAME=createJVM -sMODULARIZE=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain \
  --preload-file jdk/modules/java.base@/jdk/modules/java.base --preload-file jdk/modules/java.logging@/jdk/modules/java.logging \
  --preload-file jdk/modules/jdk.unsupported@/jdk/modules/jdk.unsupported \
  --preload-file $BOOTMODS/java.desktop@/jdk/modules/java.desktop --preload-file $BOOTMODS/java.datatransfer@/jdk/modules/java.datatransfer \
  --preload-file $BOOTMODS/java.prefs@/jdk/modules/java.prefs --preload-file $BOOTMODS/java.xml@/jdk/modules/java.xml \
  --preload-file jdk/lib/tzdb.dat@/jdk/lib/tzdb.dat --preload-file jdk/lib/jvm.cfg@/jdk/lib/jvm.cfg \
  --preload-file jdk/lib/fonts@/jdk/lib/fonts --preload-file jdk/lib/fontconfig.properties@/jdk/lib/fontconfig.properties \
  --preload-file jdk/release@/jdk/release --preload-file jdk/conf@/jdk/conf \
  --preload-file web/app@/app --preload-file web/awtprobe/addmods@/work/addmods \
  -o web/jvmawt.js 2>&1 | grep -iE "error:|duplicate symbol"
echo "LINKED web/jvmawt.js ($(ls -la web/jvmawt.data 2>/dev/null | awk '{print $5}') bytes of preload data)"
