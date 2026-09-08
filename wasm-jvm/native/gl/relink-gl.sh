#!/usr/bin/env bash
# Build the WebGL-enabled JVM variant: build/.../web/jvmgl.js. Compiles the GL JNI
# shim (wgl.c), builds a GL-aware symtab (base + awt + font + our GL natives), and
# links with WebGL flags. Separate artifact so it can't affect the stable jvmawt.js.
# Requires the same prereqs as ../awt/relink.sh (see ../awt/BUILD.md).
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
cd "$BUILD"
mkdir -p glbin
emcc -c -O2 "$JDK/wasm-jvm/native/gl/wgl.c" -I jdk/include -I jdk/include/emscripten -o glbin/wgl.o || { echo WGL_FAIL; exit 1; }
emcc -c -O2 "$JDK/wasm-jvm/native/gl/lwjgl.c" -I jdk/include -I jdk/include/emscripten -o glbin/lwjgl.o || { echo LWJGL_FAIL; exit 1; }
emcc -c -O2 "$JDK/wasm-jvm/native/gl/netstub.c" -I jdk/include -I jdk/include/emscripten -o glbin/netstub.o || { echo NETSTUB_FAIL; exit 1; }
# Generate LWJGL 2's ngl* GL dispatch layer from the (uncommitted) lwjgl.jar.
GLJAR="$BUILD/web/app/mc/lwjgl.jar"
if [ -f "$GLJAR" ]; then
  python3 "$JDK/wasm-jvm/native/gl/gen-gl.py" "$GLJAR" glbin/gl_gen.c \
      GL11 GL12 GL13 GL14 GL15 ARBMultitexture EXTFramebufferObject || { echo GEN_FAIL; exit 1; }
  emcc -c -O2 glbin/gl_gen.c -I jdk/include -I jdk/include/emscripten -o glbin/gl_gen.o || { echo GLGEN_FAIL; exit 1; }
  # Stub OpenAL so paulscode sound init succeeds (silent) instead of NPE-crashing MC.
  python3 "$JDK/wasm-jvm/native/gl/gen-al.py" "$GLJAR" glbin/al_gen.c AL10 AL11 ALC10 ALC11 EFX10 || { echo ALGEN_FAIL; exit 1; }
  emcc -c -O2 glbin/al_gen.c -I jdk/include -I jdk/include/emscripten -o glbin/al_gen.o || { echo ALGEN_C_FAIL; exit 1; }
  emcc -c -O2 "$JDK/wasm-jvm/native/gl/openal.c" -I jdk/include -I jdk/include/emscripten -o glbin/openal.o || { echo OPENAL_FAIL; exit 1; }
  # Minimal jinput stub jar so LWJGL's Controllers.create() finds ControllerEnvironment
  # (reports zero controllers) instead of NoClassDefFoundError-ing.
  ( cd "$JDK/wasm-jvm/native/gl/jinput-stub" && "$BOOT/bin/javac" -d /tmp/jinput net/java/games/input/*.java \
      && "$BOOT/bin/jar" cf "$BUILD/web/app/mc/jinput-stub.jar" -C /tmp/jinput . ) || echo "WARN: jinput stub build failed"
else
  echo "WARN: $GLJAR not found — skipping GL dispatch generation (download lwjgl.jar, see ../awt/mc/README.md)"
  rm -f glbin/gl_gen.o
fi
NM=$(command -v llvm-nm || echo emnm)
OBJS=$(ls hotspot/variant-zero/libjvm/objs/static/*.o \
          support/native/java.base/libjava/static/*.o support/native/java.base/libjimage/static/*.o \
          support/native/java.base/libnio/static/*.o support/native/java.base/libzip/static/*.o \
          support/native/java.base/libnet/static/*.o support/native/java.base/libverify/static/*.o \
          awtobj/*.o fontobj/*.o glbin/*.o 2>/dev/null)
$NM --defined-only $OBJS 2>/dev/null | awk '$2 ~ /^[TtWw]$/ {print $3}' \
  | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' \
  | grep -E '^(Java_|JNI_OnLoad_|JNI_OnUnload_|JIMAGE_|JDK_|JNU_|Verify[A-Z]|GetStringPlatformChars|VMGuestLib_|Agent_)' \
  | sort -u > /tmp/gl_syms.txt
N=$(wc -l < /tmp/gl_syms.txt)
{ echo '#include <stddef.h>'; echo '#include <string.h>'
  while read s; do echo "extern void $s(void);"; done < /tmp/gl_syms.txt
  echo 'typedef struct { const char* name; void* addr; } jvm_sym_t;'
  echo 'static const jvm_sym_t jvm_symtab[] = {'
  while read s; do echo "  {\"$s\", (void*)&$s},"; done < /tmp/gl_syms.txt
  echo '};'; echo "static const int jvm_symtab_len = $N;"
  echo 'void* jvm_symtab_lookup(const char* n){for(int i=0;i<jvm_symtab_len;i++)if(!strcmp(jvm_symtab[i].name,n))return jvm_symtab[i].addr;return 0;}'
} > glbin/gl_symtab.c
emcc -c -O2 -I jdk/include -I jdk/include/emscripten glbin/gl_symtab.c -o glbin/gl_symtab.o
echo "gl symtab: $N symbols (GLDemo natives: $(grep -c Java_GLDemo /tmp/gl_syms.txt))"
emcc web/launcher_web.c glbin/gl_symtab.o awtobj/*.o fontobj/*.o glbin/wgl.o glbin/lwjgl.o glbin/netstub.o $(ls glbin/gl_gen.o glbin/al_gen.o glbin/openal.o 2>/dev/null) \
     hotspot/variant-zero/libjvm/objs/static/*.o \
     support/native/java.base/libjava/static/*.o support/native/java.base/libjimage/static/*.o \
     support/native/java.base/libnio/static/*.o support/native/java.base/libzip/static/*.o \
     support/native/java.base/libnet/static/*.o support/native/java.base/libverify/static/*.o \
     "$FFI/lib/libffi.a" -I jdk/include -I jdk/include/emscripten \
  -sUSE_FREETYPE=1 -sUSE_HARFBUZZ=1 \
  -lGL -sOFFSCREEN_FRAMEBUFFER=1 -sGL_SUPPORT_EXPLICIT_SWAP_CONTROL=1 \
  -pthread -sPTHREAD_POOL_SIZE=48 -sPTHREAD_POOL_SIZE_STRICT=0 -sPROXY_TO_PTHREAD \
  -sINITIAL_MEMORY=1610612736 -sSTACK_SIZE=8388608 -sWASM_BIGINT -sERROR_ON_UNDEFINED_SYMBOLS=0 -sEXIT_RUNTIME=1 \
  -lidbfs.js \
  -sEXPORT_NAME=createJVMGL -sMODULARIZE=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=FS,IDBFS,ENV,callMain,addRunDependency,removeRunDependency \
  --preload-file jdk/modules/java.base@/jdk/modules/java.base --preload-file jdk/modules/java.logging@/jdk/modules/java.logging \
  --preload-file jdk/modules/jdk.unsupported@/jdk/modules/jdk.unsupported \
  --preload-file jdk/modules/jdk.compiler@/jdk/modules/jdk.compiler \
  --preload-file jdk/modules/java.compiler@/jdk/modules/java.compiler \
  --preload-file jdk/modules/jdk.zipfs@/jdk/modules/jdk.zipfs \
  --preload-file jdk/modules/jdk.internal.opt@/jdk/modules/jdk.internal.opt \
  --preload-file "$BOOTMODS/java.desktop@/jdk/modules/java.desktop" --preload-file "$BOOTMODS/java.datatransfer@/jdk/modules/java.datatransfer" \
  --preload-file "$BOOTMODS/java.prefs@/jdk/modules/java.prefs" --preload-file "$BOOTMODS/java.xml@/jdk/modules/java.xml" \
  --preload-file jdk/lib/tzdb.dat@/jdk/lib/tzdb.dat --preload-file jdk/lib/jvm.cfg@/jdk/lib/jvm.cfg \
  --preload-file jdk/lib/fonts@/jdk/lib/fonts --preload-file jdk/lib/fontconfig.properties@/jdk/lib/fontconfig.properties \
  --preload-file jdk/release@/jdk/release --preload-file jdk/conf@/jdk/conf \
  --preload-file web/app@/app --preload-file web/awtprobe/addmods@/work/addmods \
  -o web/jvmgl.js 2>&1 | grep -iE "error:|duplicate symbol" | head
echo "LINKED jvmgl.js"
