#!/usr/bin/env bash
# Disable & remove the "Fullscreen to New Desktop" KWin script.
set -euo pipefail

ID="fullscreen-to-new-desktop"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/kwin/scripts/$ID"

echo "→ Unloading & disabling"
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$ID" >/dev/null 2>&1 || true
kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" false

echo "→ Removing $DEST"
rm -rf "$DEST"

echo
echo "✅ Uninstalled. Any leftover empty desktops can be removed in"
echo "   System Settings → Virtual Desktops."
