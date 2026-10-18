#!/usr/bin/env bash
# Recreate the machine-local links that let plain Node import dsh-only packages.
# Needed only for running tests / smoke tests outside dsh. dsh itself resolves them at runtime.
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${DSH_PROFILE:-web}"
PROFILE_NM="$DSH_HOME/profiles/$PROFILE/node_modules/@deepseek-ai"
DSH_BIN="$(command -v dsh || true)"
[ -n "$DSH_BIN" ] || { echo "dsh not found on PATH" >&2; exit 1; }
DSH_REAL="$(node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$DSH_BIN")"
DSH_PKG="$(cd "$(dirname "$DSH_REAL")/.." && pwd)"
DSH_NM="$DSH_PKG/node_modules/@deepseek-ai"

[ -d "$PROFILE_NM/schemastery" ] || { echo "missing $PROFILE_NM/schemastery (is profile '$PROFILE' initialised?)" >&2; exit 1; }
[ -d "$DSH_NM/dsh-tools" ] || { echo "missing $DSH_NM/dsh-tools (dsh install layout changed?)" >&2; exit 1; }

mkdir -p node_modules/@deepseek-ai
ln -sfn "$PROFILE_NM/schemastery" node_modules/@deepseek-ai/schemastery
ln -sfn "$PROFILE_NM/cosmokit"    node_modules/@deepseek-ai/cosmokit
ln -sfn "$DSH_NM/dsh-tools"       node_modules/@deepseek-ai/dsh-tools
echo "linked schemastery, cosmokit, dsh-tools into node_modules/@deepseek-ai"
