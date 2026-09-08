# Portable toolchain env for the wasm-jvm build.
# Every path is overridable; defaults are username-free so nothing leaks per machine.
# Repo root is derived from this file's location (repo/wasm-jvm/env.sh).
export JDK="${JDK:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export BUILD="${BUILD:-$JDK/build/emscripten-wasm32-zero-release}"
export EMSDK_ENV="${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
export FFI="${FFI:-$HOME/wasm-toolchain/ffi-install}"
export BOOT="${BOOT:-/opt/homebrew/Cellar/openjdk@21/21.0.9/libexec/openjdk.jdk/Contents/Home}"
export BOOTMODS="${BOOTMODS:-$HOME/wasm-toolchain/bootmods21}"
# emsdk/emscripten drivers break under Python 3.14 (platform.mac_ver() returns '' on
# macOS 26 -> emsdk "unknown OS"). Pin the toolchain's Python to 3.13.
export EMSDK_PYTHON="${EMSDK_PYTHON:-/opt/homebrew/bin/python3.13}"
source "$EMSDK_ENV" 2>/dev/null || echo "WARN emsdk"
