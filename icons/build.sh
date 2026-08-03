#!/bin/sh
# Regenerates the PNGs the manifest points at from the SVGs beside this script.
#
# Each size is drawn at 512 and resampled down rather than rendered small:
# Chrome will not open a window as small as 16px, and downsampling a large
# vector render antialiases better than asking for 16px directly.
#
# The size is forced with CSS rather than by rewriting the svg's width/height.
# Those same numbers appear again on the container rect, and a substitution
# catches both — which pushes the rect outside the viewBox and squares off
# three of its four corners.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
for s in 16 48 128; do
  { printf '<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block;width:512px;height:512px}</style>'
    cat "icon$s.svg"; } > "/tmp/bms-icon$s.html"
  "$CHROME" --headless=new --disable-gpu --screenshot="/tmp/bms-icon$s.png" \
    --window-size=512,512 --force-device-scale-factor=1 \
    --default-background-color=00000000 --hide-scrollbars "/tmp/bms-icon$s.html" 2>/dev/null
  sips -Z $s "/tmp/bms-icon$s.png" --out "../icon$s.png" >/dev/null
  echo "icon$s.png"
done
