#!/usr/bin/env bash
# Build a capability-tiered wasm JVM artifact for the WasmJVM integration kernel.
#
#   build-jvm.sh base   -> web/jvm-base.js  : plain Java, in-VM javac, jars        (smallest)
#   build-jvm.sh awt    -> web/jvm-awt.js   : base + Swing/AWT/Java2D -> canvas
#   build-jvm.sh gl     -> web/jvm-gl.js    : awt  + WebGL/LWJGL + Minecraft
#   build-jvm.sh net    -> web/jvm-net.js   : base + real TCP sockets (needs relay)
#
# Every tier exports the SAME factory name `createJVM`, so the JS SDK is tier-
# agnostic: it just loads the artifact URL the host configured. Prereqs are the
# base port + (for awt/gl) the native libs from ../awt/build-*.sh and the
# static objects from `make static-libs-image` / `make hotspot STATIC_LIBS=true`.
set -u
TIER="${1:-}"
case "$TIER" in base|awt|gl|net|full) ;; *) echo "usage: build-jvm.sh <full|base|awt|gl|net>"; exit 2;; esac
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
cd "$BUILD"
# NET=1 on a non-net tier produces a DISTINCT artifact (jvm-<tier>-net.js) so the
# default artifact stays non-net: the socket-proxy build blocks at boot when no
# relay bridge is connected, so it must only be loaded when networking is requested.
SUF=""; { [ "${NET:-0}" = 1 ] && [ "$TIER" != net ] && [ "$TIER" != full ]; } && SUF="-net"
# EMUNET=1 layers the in-sandbox loopback TCP stack (emunet.c) onto any tier: a
# real server (ServerSocket/Tomcat/Jetty/Netty/...) binds and accepts, the page
# connects and speaks HTTP, all in linear memory -- no relay, no WebSocket. It is
# mutually exclusive with NET (which is the real-internet relay bridge).
[ "${EMUNET:-0}" = 1 ] && SUF="-emunet"
OUT="web/jvm-$TIER$SUF.js"
cp "$JDK/wasm-jvm/framework/kernel/launcher_web.c" web/launcher_web.c   # keep the built copy in sync with source

BIN="fwbin/$TIER"; mkdir -p "$BIN"

# ---- capability flags per tier ------------------------------------------------
WANT_AWT=0; WANT_GL=0; WANT_NET=0; WANT_EMUNET=0
case "$TIER" in
  full) WANT_AWT=1; WANT_GL=1; WANT_NET=1 ;;   # the one universal JVM: Swing + Java2D + OpenGL + TCP sockets
  awt)  WANT_AWT=1 ;;
  gl)   WANT_AWT=1; WANT_GL=1 ;;
  net)  WANT_NET=1 ;;
esac
# NET=1 layers the TCP relay proxy onto any tier (real internet + real server
# sockets over the websocket_to_posix_proxy bridge). Lets the awt/gl PoC reach
# the network exactly like the net tier does -- no per-tier socket reinvention.
[ "${NET:-0}" = 1 ] && WANT_NET=1
# EMUNET=1 wins over NET: use the in-sandbox loopback instead of the relay bridge.
[ "${EMUNET:-0}" = 1 ] && { WANT_EMUNET=1; WANT_NET=0; }

# ---- base static objects (present in every tier) ------------------------------
BASE_OBJS="hotspot/variant-zero/libjvm/objs/static/*.o \
  support/native/java.base/libjava/static/*.o support/native/java.base/libjimage/static/*.o \
  support/native/java.base/libnio/static/*.o support/native/java.base/libzip/static/*.o \
  support/native/java.base/libnet/static/*.o support/native/java.base/libverify/static/*.o"

EXTRA_OBJS=""; EXTRA_FLAGS=""; PRELOADS=""

# ---- AWT/GL native objects + desktop modules/fonts ----------------------------
if [ "$WANT_AWT" = 1 ]; then
  EXTRA_OBJS="$EXTRA_OBJS awtobj/*.o fontobj/*.o"
  EXTRA_FLAGS="$EXTRA_FLAGS -sUSE_FREETYPE=1 -sUSE_HARFBUZZ=1"
  # java.desktop must be our patched overlay (Wasm toolkit/peers); the rest of the
  # modules come from the stock jdk/modules preload below.
  PRELOADS="$PRELOADS \
    --preload-file $BOOTMODS/java.desktop@/jdk/modules/java.desktop \
    --preload-file jdk/lib/fonts@/jdk/lib/fonts \
    --preload-file jdk/lib/fontconfig.properties@/jdk/lib/fontconfig.properties"
  # java.management native (MXBeans): apps like IntelliJ touch ManagementFactory
  # during startup; without libmanagement its static init throws UnsatisfiedLinkError.
  if ls support/native/java.management/libmanagement/static/*.o >/dev/null 2>&1; then
    EXTRA_OBJS="$EXTRA_OBJS support/native/java.management/libmanagement/static/*.o"
  fi
  # jdk.management supplies the PlatformMBeanProvider SPI via libmanagement_ext.
  if ls support/native/jdk.management/libmanagement_ext/static/*.o >/dev/null 2>&1; then
    EXTRA_OBJS="$EXTRA_OBJS support/native/jdk.management/libmanagement_ext/static/*.o"
  fi
fi

# java.management native (JMX/MXBeans) for non-AWT tiers that need it: servlet
# containers (Tomcat/Jetty) register MBeans during startup, so System.loadLibrary
# ("management") must resolve. Link the same static libmanagement objects.
if [ "$WANT_EMUNET" = 1 ] && [ "$WANT_AWT" != 1 ]; then
  if ls support/native/java.management/libmanagement/static/*.o >/dev/null 2>&1; then
    EXTRA_OBJS="$EXTRA_OBJS support/native/java.management/libmanagement/static/*.o"
  fi
  if ls support/native/jdk.management/libmanagement_ext/static/*.o >/dev/null 2>&1; then
    EXTRA_OBJS="$EXTRA_OBJS support/native/jdk.management/libmanagement_ext/static/*.o"
  fi
fi

# ---- GL: compile the translator + generate LWJGL dispatch ---------------------
if [ "$WANT_GL" = 1 ]; then
  emcc -c -O2 "$JDK/wasm-jvm/native/gl/wgl.c"     -I jdk/include -I jdk/include/emscripten -o "$BIN/wgl.o"     || { echo WGL_FAIL; exit 1; }
  emcc -c -O2 "$JDK/wasm-jvm/native/gl/lwjgl.c"   -I jdk/include -I jdk/include/emscripten -o "$BIN/lwjgl.o"   || { echo LWJGL_FAIL; exit 1; }
  # netstub is built once, below (shared with the NET path so a combined AWT+GL+net
  # artifact -- one JVM that also does direct OpenGL -- doesn't duplicate it).
  GLJAR="$BUILD/web/app/mc/lwjgl.jar"
  if [ -f "$GLJAR" ]; then
    python3 "$JDK/wasm-jvm/native/gl/gen-gl.py" "$GLJAR" "$BIN/gl_gen.c" GL11 GL12 GL13 GL14 GL15 ARBMultitexture EXTFramebufferObject || { echo GEN_FAIL; exit 1; }
    emcc -c -O2 "$BIN/gl_gen.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/gl_gen.o" || { echo GLGEN_FAIL; exit 1; }
    python3 "$JDK/wasm-jvm/native/gl/gen-al.py" "$GLJAR" "$BIN/al_gen.c" AL10 AL11 ALC10 ALC11 EFX10 || { echo ALGEN_FAIL; exit 1; }
    emcc -c -O2 "$BIN/al_gen.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/al_gen.o" || { echo ALGENC_FAIL; exit 1; }
    emcc -c -O2 "$JDK/wasm-jvm/native/gl/openal.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/openal.o" || { echo OPENAL_FAIL; exit 1; }
  fi
  EXTRA_OBJS="$EXTRA_OBJS $BIN/wgl.o $BIN/lwjgl.o $(ls $BIN/gl_gen.o $BIN/al_gen.o $BIN/openal.o 2>/dev/null)"
  EXTRA_FLAGS="$EXTRA_FLAGS -lGL -sOFFSCREEN_FRAMEBUFFER=1 -sGL_SUPPORT_EXPLICIT_SWAP_CONTROL=1"
fi

# ---- netstub (shared by GL + NET) + NET socket proxy --------------------------
# One netstub for both: the proxy build (-DUSE_PROXY_SOCKETS) when NET is on, the
# plain stub otherwise. Built once so AWT+GL+net can all live in ONE artifact.
if [ "$WANT_GL" = 1 ] || [ "$WANT_NET" = 1 ] || [ "$WANT_EMUNET" = 1 ]; then
  # emunet provides its own socketpair, so it also takes -DUSE_PROXY_SOCKETS (which
  # tells netstub NOT to define socketpair); netstub then contributes only mprotect.
  NSFLAG=""; { [ "$WANT_NET" = 1 ] || [ "$WANT_EMUNET" = 1 ]; } && NSFLAG="-DUSE_PROXY_SOCKETS"
  emcc -c -O2 $NSFLAG "$JDK/wasm-jvm/native/gl/netstub.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/netstub.o" || { echo NETSTUB_FAIL; exit 1; }
  EXTRA_OBJS="$EXTRA_OBJS $BIN/netstub.o"
fi
# jdkstubs: benign fallbacks for JDK/libc natives the port doesn't implement
# (ProcessHandle os_*, xattr, futimes, sigsuspend, wcsftime). Linked into every tier
# so real frameworks (e.g. Spring Boot reading the PID) don't hit a "missing
# function" abort. Only fills symbols confirmed absent from the build.
emcc -c -O2 "$JDK/wasm-jvm/framework/kernel/jdkstubs.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/jdkstubs.o" || { echo JDKSTUBS_FAIL; exit 1; }
EXTRA_OBJS="$EXTRA_OBJS $BIN/jdkstubs.o"
if [ "$WANT_NET" = 1 ]; then
  emcc -c -O2 -pthread -matomics -mbulk-memory "$JDK/wasm-jvm/framework/kernel/wsps.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/wsps.o" || { echo WSPS_FAIL; exit 1; }
  EXTRA_OBJS="$EXTRA_OBJS $BIN/wsps.o"
  EXTRA_FLAGS="$EXTRA_FLAGS -sPROXY_POSIX_SOCKETS -lwebsocket.js -Wl,--wrap=read -Wl,--wrap=write -Wl,--wrap=close -Wl,--wrap=readv -Wl,--wrap=writev"
fi
if [ "$WANT_EMUNET" = 1 ]; then
  # In-sandbox loopback: strong socket defs (need PROXY_POSIX_SOCKETS to suppress
  # musl's), but NO -lwebsocket.js and NO relay. Wrap the fd-routed syscalls plus
  # poll/fcntl (NIO selectors + non-blocking config). -DEMUNET drops the launcher's
  # relay boot-gate and keeps its emunet_* entry points exported for the browser.
  emcc -c -O2 -pthread -matomics -mbulk-memory "$JDK/wasm-jvm/framework/net/emunet.c" -I jdk/include -I jdk/include/emscripten -o "$BIN/emunet.o" || { echo EMUNET_FAIL; exit 1; }
  EXTRA_OBJS="$EXTRA_OBJS $BIN/emunet.o"
  # Intercept the whole socket surface via --wrap (musl keeps the __real_* originals
  # for non-emu fds), so NO PROXY_POSIX_SOCKETS and NO -lwebsocket.js are needed.
  # emunet_* are exported via EMSCRIPTEN_KEEPALIVE; ccall/cwrap (added to the base
  # link's EXPORTED_RUNTIME_METHODS) let the JS client marshal byte arrays.
  EMUNET_WRAPS="socket socketpair bind listen connect accept accept4 shutdown \
    getsockname getpeername getsockopt setsockopt send recv sendto recvfrom \
    read write close readv writev poll fcntl"
  for w in $EMUNET_WRAPS; do EXTRA_FLAGS="$EXTRA_FLAGS -Wl,--wrap=$w"; done
  EXTRA_FLAGS="$EXTRA_FLAGS -DEMUNET"
fi

# ---- generate the static JNI symbol table from this tier's objects ------------
NM=$(command -v llvm-nm || echo emnm)
$NM --defined-only $(ls $BASE_OBJS $EXTRA_OBJS 2>/dev/null) 2>/dev/null | awk '$2 ~ /^[TtWw]$/ {print $3}' \
  | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' \
  | grep -E '^(Java_|JNI_OnLoad_|JNI_OnUnload_|JIMAGE_|JDK_|JNU_|Verify[A-Z]|GetStringPlatformChars|VMGuestLib_|Agent_)' \
  | sort -u > "$BIN/syms.txt"
N=$(wc -l < "$BIN/syms.txt")
{ echo '#include <stddef.h>'; echo '#include <string.h>'
  while read s; do echo "extern void $s(void);"; done < "$BIN/syms.txt"
  echo 'typedef struct { const char* name; void* addr; } jvm_sym_t;'
  echo 'static const jvm_sym_t jvm_symtab[] = {'
  while read s; do echo "  {\"$s\", (void*)&$s},"; done < "$BIN/syms.txt"
  echo '};'; echo "static const int jvm_symtab_len = $N;"
  echo 'void* jvm_symtab_lookup(const char* n){for(int i=0;i<jvm_symtab_len;i++)if(!strcmp(jvm_symtab[i].name,n))return jvm_symtab[i].addr;return 0;}'
} > "$BIN/symtab.c"
emcc -c -O2 -I jdk/include -I jdk/include/emscripten "$BIN/symtab.c" -o "$BIN/symtab.o"
echo "[$TIER] symtab: $N symbols"

# ---- data preloads ------------------------------------------------------------
# Monolithic (default): bake the JDK files into this artifact's .data.
# Modular (PACKS=1): bake nothing — the SDK fetches core/compiler/desktop packs
# and populates MEMFS before boot, so java.base is shared across tiers/apps.
DATA_PRELOADS=""
if [ "${PACKS:-0}" = 1 ]; then
  # emcc relinks the .js manifest but does NOT rewrite an existing .data, so a leftover
  # monolithic web/jvm-$TIER.data from an earlier non-PACKS build would be silently
  # reused -- shipping a ~124MB blob under the "modular" artifact. Remove it so the
  # PACKS build is genuinely empty (packs are fetched at boot instead).
  rm -f "web/jvm-$TIER$SUF.data"
fi
if [ "${PACKS:-0}" != 1 ]; then
  # Bake EVERY JDK module so no app ever hits a missing-module boot failure.
  # java.desktop is skipped here (awt/gl tiers supply the patched $BOOTMODS one via
  # $PRELOADS; base/net get the stock one, harmless since they don't run AWT).
  MODS=""
  for d in jdk/modules/*/; do
    m=$(basename "$d")
    if [ "$m" = "java.desktop" ] && [ "$WANT_AWT" = 1 ]; then continue; fi
    MODS="$MODS --preload-file jdk/modules/$m@/jdk/modules/$m"
  done
  DATA_PRELOADS="$MODS \
    --preload-file jdk/lib/tzdb.dat@/jdk/lib/tzdb.dat --preload-file jdk/lib/jvm.cfg@/jdk/lib/jvm.cfg \
    --preload-file jdk/release@/jdk/release --preload-file jdk/conf@/jdk/conf \
    $PRELOADS \
    --preload-file web/fwapp@/app"
fi

# ---- link ---------------------------------------------------------------------
# emunet serves long-lived servers whose main() returns after starting their event
# loops (Netty/Tomcat) — their non-daemon threads keep a real JVM alive, so the
# runtime must NOT tear down when main() returns. Other tiers keep EXIT_RUNTIME=1.
EXITRT=1; [ "$WANT_EMUNET" = 1 ] && EXITRT=0
# Fixed heap up front. emunet uses 768 MB (the JVM is tuned to fit — see the demo's
# /work/vmopts): growable shared memory fails to instantiate the pthread worker pool
# in some browsers, and Safari refuses the default 1.5 GB SharedArrayBuffer.
MEMFLAGS="-sINITIAL_MEMORY=1610612736"
[ "$WANT_EMUNET" = 1 ] && MEMFLAGS="-sINITIAL_MEMORY=805306368"
emcc web/launcher_web.c "$BIN/symtab.o" $EXTRA_OBJS $BASE_OBJS \
     "$FFI/lib/libffi.a" -I jdk/include -I jdk/include/emscripten \
  $EXTRA_FLAGS \
  -pthread -sPTHREAD_POOL_SIZE=48 -sPTHREAD_POOL_SIZE_STRICT=0 -sPROXY_TO_PTHREAD \
  $MEMFLAGS -sSTACK_SIZE=8388608 -sWASM_BIGINT -sERROR_ON_UNDEFINED_SYMBOLS=0 -sEXIT_RUNTIME=$EXITRT \
  -lidbfs.js -sALLOW_TABLE_GROWTH \
  -sEXPORT_NAME=createJVM -sMODULARIZE=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=FS,IDBFS,ENV,callMain,addRunDependency,removeRunDependency,addFunction,HEAPU8,HEAP32,ccall,cwrap \
  $DATA_PRELOADS \
  -o "$OUT" 2>&1 | grep -iE "error:|duplicate symbol" | head
DATA_MB=$(( $(wc -c < "web/jvm-$TIER$SUF.data" 2>/dev/null || echo 0) / 1048576 ))
echo "[$TIER] LINKED $OUT  (preload data: ${DATA_MB} MB)"
