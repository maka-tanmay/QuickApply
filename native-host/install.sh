#!/bin/bash
# Installs the QuickApply -> Claude Code CLI native messaging host (macOS, Chrome).
# Usage: ./install.sh <extension-id>   (find the ID at chrome://extensions with Developer mode on)
set -e

EXT_ID="${1:?Usage: ./install.sh <chrome-extension-id>  — find it at chrome://extensions}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/quickapply_claude_host.py"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

chmod +x "$HOST_SCRIPT"
mkdir -p "$HOST_DIR"

cat > "$HOST_DIR/com.quickapply.claude.json" <<EOF
{
  "name": "com.quickapply.claude",
  "description": "QuickApply bridge to the local Claude Code CLI",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "Installed native host for extension $EXT_ID."
echo "Restart Chrome, then pick 'Claude Code CLI' as the AI provider in QuickApply options."
