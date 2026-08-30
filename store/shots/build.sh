#!/bin/sh
# Renders the store screenshots from the real interface.
#
# The pages are loaded over http rather than file:// because they are framed in
# an iframe, and because options.js reads its own location — a filesystem path
# is not the page it would be. A stub supplies the chrome APIs and a fixed
# clock, so a shot taken today matches one taken next month.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8749}"

python3 make-stubs.py
( cd ../.. && python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > /tmp/seat-shot-server )
sleep 1
trap 'kill "$(cat /tmp/seat-shot-server)" 2>/dev/null' EXIT

render() {  # shot-file  out-name
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --screenshot="/tmp/seat-$2.png" --window-size=1280,800 \
    --force-device-scale-factor=2 --virtual-time-budget=4000 \
    "http://localhost:$PORT/store/shots/$1" 2>/dev/null
  sips -Z 1280 "/tmp/seat-$2.png" --out "../$2.png" >/dev/null
  echo "store/$2.png  1280x800"
}

render shot-1-popup.html     screenshot-1
render shot-2-release.html   screenshot-2
render shot-3-theatres.html  screenshot-3
render shot-4-alerts.html    screenshot-4
