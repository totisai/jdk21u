#!/usr/bin/env bash
# Recompile awt_headless_stubs.c and regenerate the static symbol table
# (web/symtab.c/.o) from every object that will be linked. Run after changing
# stubs or any *obj/ objects, before relink.sh.
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
emcc -c -O2 -I $BUILD/jdk/include -I $BUILD/jdk/include/emscripten \
     "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/awt_headless_stubs.c" -o $BUILD/awtobj/awt_headless_stubs.o || { echo STUB_FAIL; exit 1; }
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gen-symtab.sh" >/dev/null
cd $BUILD/web
emcc -c -O2 -I ../jdk/include -I ../jdk/include/emscripten symtab.c -o symtab.o || { echo SYMTAB_FAIL; exit 1; }
echo "stubs + symtab rebuilt"
