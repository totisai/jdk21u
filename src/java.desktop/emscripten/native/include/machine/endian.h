/* Shim for BSD <machine/endian.h> on the emscripten (wasm32) target, which is
 * little-endian. Provides the byte-order macros mlib_image and other desktop
 * native code expect from the BSD/macOS build path. */
#ifndef _EMSCRIPTEN_MACHINE_ENDIAN_H
#define _EMSCRIPTEN_MACHINE_ENDIAN_H

#define _LITTLE_ENDIAN  1234
#define _BIG_ENDIAN     4321
#define _PDP_ENDIAN     3412
#define _BYTE_ORDER     _LITTLE_ENDIAN

#ifndef BYTE_ORDER
#define LITTLE_ENDIAN   _LITTLE_ENDIAN
#define BIG_ENDIAN      _BIG_ENDIAN
#define PDP_ENDIAN      _PDP_ENDIAN
#define BYTE_ORDER      _BYTE_ORDER
#endif

#endif
