#!/bin/bash
# Simple HTTP server to test the extension
# This avoids file:// URL issues

echo "Starting local server..."
echo "Open: http://localhost:8000/test-page.html"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 8000


