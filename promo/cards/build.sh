#!/bin/sh
# Renders the social cards to PNG, the same way icons/build.sh renders the icons:
# headless Chrome at the card's exact pixel size, no scaling afterwards.
#
# Each card is rendered at 2× and resampled down. The type is small relative to the
# canvas on the OG card in particular, and 1× headless renders hint it badly.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

render() {  # name  width  height
  "$CHROME" --headless=new --disable-gpu \
    --screenshot="/tmp/seat-watch-$1.png" \
    --window-size="$2,$3" --force-device-scale-factor=2 \
    --hide-scrollbars --virtual-time-budget=2000 \
    "$PWD/$1.html" 2>/dev/null
  sips -Z "$(( $2 > $3 ? $2 : $3 ))" "/tmp/seat-watch-$1.png" --out "$1.png" >/dev/null
  echo "$1.png  ${2}x${3}"
}

render og-1200x630        1200  630
render square-1080x1080   1080  1080
render vertical-1080x1920 1080  1920

# The release cards. Same three sizes, a different object on them: the hall
# answers "which seats", the board answers "which cinema is selling yet".
render release-og-1200x630        1200  630
render release-square-1080x1080   1080  1080
render release-vertical-1080x1920 1080  1920
