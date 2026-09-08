#!/usr/bin/env bash
# Per-module JDK data packs for the WasmJVM kernel.
#
# Instead of baking the whole JDK into every artifact's .data (a ~124 MB relink
# on every change), each JDK module becomes its own pack that the SDK fetches on
# demand and populates into MEMFS before boot. The huge win is the dev loop:
# after `make <module>`, repackaging just that module's pack takes seconds --
#
#     build-packs.sh java.base            # repackage ONLY mod-java.base.data
#     build-packs.sh jdk.net java.base    # a few modules
#     build-packs.sh extras               # the non-module runtime files
#     build-packs.sh                      # full rebuild: every module + manifest
#
# Layout (emscripten file_packager --separate-metadata: <name>.data raw blob +
# <name>.data.metadata JSON {files:[{filename,start,end}], remote_package_size}):
#
#   extras.data     tzdb / jvm.cfg / release / conf / fonts + framework /app
#   mod-<module>    one per JDK module (java.desktop comes from the patched
#                   $BOOTMODS overlay; every other module from the build image)
#   manifest.json   {"packs":[...names...]} the PoC reads to know what to load
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
cd "$BUILD"
FP="$(dirname "$(dirname "$(command -v emcc)")")/emscripten/tools/file_packager.py"
[ -f "$FP" ] || FP="$(python3 -c 'import shutil,os;print(os.path.join(os.path.dirname(os.path.dirname(shutil.which("emcc"))),"emscripten","tools","file_packager.py"))')"
OUT="web/packs"; mkdir -p "$OUT"

pack() {  # pack <name> <preload-args...>
  local name="$1"; shift
  python3 "$FP" "$OUT/$name.data" "$@" --separate-metadata --js-output="/tmp/$name.pack.js" >/dev/null 2>&1
  mv "/tmp/$name.pack.js.metadata" "$OUT/$name.data.metadata"   # metadata sits next to the .data
  local mb nf
  mb=$(( $(wc -c < "$OUT/$name.data") / 1048576 ))
  nf=$(python3 -c "import json;print(len(json.load(open('$OUT/$name.data.metadata'))['files']))")
  echo "[$name] ${mb} MB, ${nf} files -> $OUT/$name.data"
}

# The source dir for a module: java.desktop must be the patched Wasm overlay
# (WasmToolkit/peers etc.) from $BOOTMODS; all others come from the build image.
modsrc() {
  if [ "$1" = "java.desktop" ]; then echo "$BOOTMODS/java.desktop"; else echo "jdk/modules/$1"; fi
}

build_mod() {  # build_mod <module>
  local m="$1" src; src="$(modsrc "$m")"
  if [ ! -d "$src" ]; then echo "[mod-$m] SKIP (no $src)"; return; fi
  pack "mod-$m" --preload "$src@/jdk/modules/$m"
}

build_extras() {
  pack extras \
    --preload jdk/lib/tzdb.dat@/jdk/lib/tzdb.dat \
    --preload jdk/lib/jvm.cfg@/jdk/lib/jvm.cfg \
    --preload jdk/release@/jdk/release \
    --preload jdk/conf@/jdk/conf \
    --preload jdk/lib/fonts@/jdk/lib/fonts \
    --preload jdk/lib/fontconfig.properties@/jdk/lib/fontconfig.properties \
    --preload web/fwapp@/app
}

# Build/dev-tool modules an app never needs at RUNTIME. Java's module system
# resolves the whole graph at boot (scanning each module's packages), so a module
# is either fully present or absent -- there is no valid "descriptor-only" lazy
# state. The lazy win is therefore to simply NOT ship these: they are leaf modules
# (nothing in the runtime graph `requires` them), so --add-modules ALL-SYSTEM
# resolves cleanly over what remains. This is the default "runtime profile".
RUNTIME_EXCLUDE="jdk.compiler jdk.javadoc jdk.jshell jdk.jdeps jdk.jlink jdk.jpackage \
  jdk.jcmd jdk.jconsole jdk.jstatd jdk.jdi jdk.jdwp.agent jdk.hotspot.agent jdk.attach \
  jdk.editpad jdk.internal.ed jdk.internal.le jdk.internal.jvmstat jdk.internal.opt \
  jdk.jartool jdk.jfr jdk.incubator.vector jdk.internal.vm.ci jdk.internal.vm.compiler \
  jdk.internal.vm.compiler.management jdk.management.agent jdk.management.jfr"
in_exclude() { case " $RUNTIME_EXCLUDE " in *" $1 "*) return 0;; *) return 1;; esac; }

# ---- fast path: repackage only the named packs -------------------------------
if [ "$#" -gt 0 ]; then
  for a in "$@"; do
    case "$a" in extras) build_extras ;; *) build_mod "$a" ;; esac
  done
  echo "repackaged: $*"
  exit 0
fi

# ---- full build: extras + every module, then the manifest --------------------
# manifest.packs = every pack (the full JDK, for apps that want everything).
# manifest.runtime = the default "runtime profile" (packs minus dev/build tools);
# the SDK loads this set unless the app asks for more.
build_extras
names='["extras"'; runtime='["extras"'
for d in jdk/modules/*/; do
  m="$(basename "$d")"
  build_mod "$m"
  names="$names,\"mod-$m\""
  in_exclude "$m" || runtime="$runtime,\"mod-$m\""
done
names="$names]"; runtime="$runtime]"
echo "{\"packs\":$names,\"runtime\":$runtime}" > "$OUT/manifest.json"
echo "packs built in $OUT/  (manifest -> $OUT/manifest.json, with runtime profile)"
