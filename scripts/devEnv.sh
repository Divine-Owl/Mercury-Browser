#!/bin/sh
# Source this before any local install or build:
#
#     source scripts/devEnv.sh
#
# There is no Python virtualenv here, and there does not need to be. This is a
# Node project: node_modules/ is already project-local, and node-gyp installs
# no Python packages, so a venv would isolate nothing. What actually escapes a
# checkout is download caches, and this points all of them inside it.
#
# With this sourced, deleting the checkout deletes every byte the build
# downloaded. Nothing is written to $HOME.

MERCURY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

# Fail loudly rather than silently writing to the wrong place. Uses this file's
# own presence so the check holds before the Min import lands.
if [ ! -f "$MERCURY_ROOT/scripts/devEnv.sh" ]; then
  echo "devEnv.sh: could not locate the Mercury checkout (resolved $MERCURY_ROOT)." >&2
  echo "devEnv.sh: source this file by path, e.g. source scripts/devEnv.sh" >&2
  return 1 2>/dev/null || exit 1
fi

# Electron's binary download (~120MB). Read by electron's own install.js as
# `cacheRoot: process.env.electron_config_cache` — NOT ELECTRON_CACHE. That
# legacy name is ignored by @electron/get, whose Cache class falls back to
# env-paths('electron').cache, i.e. ~/.cache/electron, which is how the first
# install leaked 120MB into $HOME.
export electron_config_cache="$MERCURY_ROOT/.cache/electron"

# electron-builder's fpm / appimage / rpm helpers, read by electron-builder.
export ELECTRON_BUILDER_CACHE="$MERCURY_ROOT/.cache/electron-builder"

# The same two values npm already reads from .npmrc, exported again so they
# still apply when npm or a lifecycle script runs from another directory.
export npm_config_cache="$MERCURY_ROOT/.cache/npm"
export npm_config_devdir="$MERCURY_ROOT/.cache/node-gyp"

echo "Mercury build env: dependency caches under $MERCURY_ROOT/.cache"
