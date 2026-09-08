#!/usr/bin/env bash
# Regenerate web/symtab.c: the static name->address table the wasm JVM resolves
# JNI/VM entry points through (os::dll_lookup -> jvm_symtab_lookup). Rebuilt from
# every object that gets linked, so rerun whenever awtobj/ or fontobj/ change.
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh" 2>/dev/null
cd "$BUILD"
NM=$(command -v llvm-nm || echo emnm)
# All objects that will be linked into the monolithic JVM.
OBJS=$(ls hotspot/variant-zero/libjvm/objs/static/*.o \
          support/native/java.base/libjava/static/*.o support/native/java.base/libjimage/static/*.o \
          support/native/java.base/libnio/static/*.o support/native/java.base/libzip/static/*.o \
          support/native/java.base/libnet/static/*.o support/native/java.base/libverify/static/*.o \
          awtobj/*.o fontobj/*.o 2>/dev/null)
# Collect DEFINED (T/t/W/w) symbols the VM resolves via dll_lookup.
$NM --defined-only $OBJS 2>/dev/null \
  | awk '$2 ~ /^[TtWw]$/ {print $3}' \
  | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' \
  | grep -E '^(Java_|JNI_OnLoad_|JNI_OnUnload_|JIMAGE_|JDK_|JNU_|Verify[A-Z]|GetStringPlatformChars|VMGuestLib_|Agent_)' \
  | sort -u > /tmp/symtab_names.txt
N=$(wc -l < /tmp/symtab_names.txt)
{
  echo '/* Auto-generated static symbol table for the Emscripten monolithic JVM. */'
  echo '#include <stddef.h>'
  echo '#include <string.h>'
  while IFS= read -r s; do echo "extern void $s(void);"; done < /tmp/symtab_names.txt
  echo 'typedef struct { const char* name; void* addr; } jvm_sym_t;'
  echo 'static const jvm_sym_t jvm_symtab[] = {'
  while IFS= read -r s; do echo "  {\"$s\", (void*)&$s},"; done < /tmp/symtab_names.txt
  echo '};'
  echo "static const int jvm_symtab_len = $N;"
  echo 'void* jvm_symtab_lookup(const char* name) {'
  echo '  for (int i = 0; i < jvm_symtab_len; i++)'
  echo '    if (!strcmp(jvm_symtab[i].name, name)) return jvm_symtab[i].addr;'
  echo '  return NULL;'
  echo '}'
} > web/symtab.c
echo "symtab entries: $N"
