#!/bin/sh
# Idempotent installer for the @contextableai/clawg-ui OpenClaw plugin.
# Runs inside the OpenClaw container. Safe to run on every compose up.
#
# AGENTS.md invariant #3: the openclaw-copilotkit-official-chat app pairs
# exclusively via the clawg-ui plugin route /v1/clawg-ui. This script
# guarantees the plugin is installed, enabled, and registered at runtime.
set -eu

PLUGIN_ID="clawg-ui"
PLUGIN_PKG="@contextableai/clawg-ui"
NPM_ROOT="/home/node/.openclaw/npm"

find_clawg_ui_manifests() {
  find "$NPM_ROOT" -path "*/@contextableai/clawg-ui/openclaw.plugin.json" 2>/dev/null || true
}

if [ -z "$(find_clawg_ui_manifests | head -1)" ]; then
  echo "[clawg-ui-setup] installing $PLUGIN_PKG ..."
  openclaw plugins install "$PLUGIN_PKG"
fi

# Ensure activation.onStartup so the runtime loader registers the channel
# even before any user interaction. The published v0.7.0 manifest ships
# without this flag, which makes the plugin "loaded" but not "registered".
# OpenClaw may load from npm/node_modules OR npm/projects/<hash>/node_modules;
# patch every copy so the active install path is always updated.
node - <<'NODE'
const fs = require("fs");
const path = require("path");

const npmRoot = "/home/node/.openclaw/npm";
const suffix = path.join("@contextableai", "clawg-ui", "openclaw.plugin.json");

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (full.endsWith(suffix.replace(/\\/g, "/")) || full.endsWith(suffix)) out.push(full);
  }
}

const manifests = [];
walk(npmRoot, manifests);

if (manifests.length === 0) {
  console.error("[clawg-ui-setup] no clawg-ui manifest found under", npmRoot);
  process.exit(1);
}

let anyChanged = false;
for (const p of manifests) {
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  let changed = false;
  if (!m.activation || m.activation.onStartup !== true) {
    m.activation = Object.assign({}, m.activation, { onStartup: true });
    changed = true;
  }
  if (m.enabledByDefault !== true) {
    m.enabledByDefault = true;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
    console.log("[clawg-ui-setup] manifest patched:", p);
    anyChanged = true;
  }
}

if (!anyChanged) {
  console.log("[clawg-ui-setup] all manifests already patched (" + manifests.length + ")");
}
NODE

# Idempotent enable in openclaw.json.
openclaw plugins enable "$PLUGIN_ID" >/dev/null 2>&1 || true

echo "[clawg-ui-setup] done"
