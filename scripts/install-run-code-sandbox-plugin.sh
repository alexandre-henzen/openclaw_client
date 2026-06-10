#!/bin/sh
# Idempotent installer for openclaw-run-code-sandbox plugin into the gateway.
# Stages the plugin (without node_modules) to a fast tmpfs path to avoid copying
# the entire dev tree from a slow Windows bind-mount.
set -eu

PLUGIN_ID="openclaw-run-code-sandbox"
PLUGIN_SRC="${PLUGIN_SRC:-/srv/plugin}"
STAGE="/tmp/openclaw-run-code-sandbox-stage"
EXTENSIONS_DIR="${XDG_CONFIG_HOME:-/home/node/.openclaw}/extensions"
INSTALL_DIR="$EXTENSIONS_DIR/$PLUGIN_ID"

echo "[run-code-installer] staging $PLUGIN_SRC -> $STAGE (without node_modules)"
rm -rf "$STAGE"
mkdir -p "$STAGE"
# Copy everything except node_modules / dist artifacts that aren't needed for runtime.
# We require: package.json, openclaw.plugin.json, dist/, README.md.
cp -r "$PLUGIN_SRC/package.json" "$STAGE/"
cp -r "$PLUGIN_SRC/openclaw.plugin.json" "$STAGE/"
cp -r "$PLUGIN_SRC/dist" "$STAGE/"
[ -f "$PLUGIN_SRC/README.md" ] && cp "$PLUGIN_SRC/README.md" "$STAGE/" || true

echo "[run-code-installer] installing runtime deps in stage"
( cd "$STAGE" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

echo "[run-code-installer] installing $PLUGIN_ID to $INSTALL_DIR"
mkdir -p "$EXTENSIONS_DIR"
mkdir -p "$INSTALL_DIR"
cp "$STAGE/package.json" "$INSTALL_DIR/"
cp "$STAGE/openclaw.plugin.json" "$INSTALL_DIR/"
[ -f "$STAGE/README.md" ] && cp "$STAGE/README.md" "$INSTALL_DIR/" || true
rm -rf "$INSTALL_DIR/dist"
cp -r "$STAGE/dist" "$INSTALL_DIR/dist"

if [ ! -d "$INSTALL_DIR/node_modules/@e2b/code-interpreter" ]; then
	echo "[run-code-installer] installing runtime deps in $INSTALL_DIR"
	( cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund --loglevel=error )
fi
mkdir -p "$INSTALL_DIR/node_modules"
ln -sfn /app "$INSTALL_DIR/node_modules/openclaw"
echo "[run-code-installer] installed $PLUGIN_ID; gateway will load it on restart"
echo "[run-code-installer] done"

