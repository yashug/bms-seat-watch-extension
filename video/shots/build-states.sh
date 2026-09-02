#!/bin/sh
# Renders every UI state in the video from the extension's own code.
#
# Served over http rather than file:// because options.js reads its own
# location, and because a filesystem path is not the page it would be. A stub
# supplies the chrome APIs and an anchored clock, so a state rendered today
# matches one rendered next month — which is what lets a cross-dissolve between
# two states move only the thing that actually changed.
#
# Two passes for the tall states. Old headless Chrome screenshots the top of the
# layout no matter where the page is scrolled, so the first pass asks the page
# how tall it is and where its fields are, and the second shoots the whole thing
# at that height. The video pans to the rects.
#
# Kept at 2x and never downscaled: the video pushes into these, and a 1x source
# scrubbed up to a 1080p close-up looks like a screenshot of a screenshot.
set -e
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8751}"
OUT="$ROOT/video/public/states"

[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (set CHROME=…)" >&2; exit 1; }

python3 make-states.py
mkdir -p "$OUT"

( cd "$ROOT" && python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > /tmp/seat-video-server )
sleep 1
trap 'kill "$(cat /tmp/seat-video-server)" 2>/dev/null || true' EXIT

python3 - "$CHROME" "$PORT" "$OUT" <<'PY'
import json, os, re, subprocess, sys

chrome, port, out = sys.argv[1], sys.argv[2], sys.argv[3]
manifest = json.load(open('_stub/manifest.json'))
SCALE = 2
MAX_TALL = 6000     # a runaway scrollHeight should fail loudly, not eat the disk

def url_for(s):
    u = 'http://localhost:%s/video/shots/_stub/%s' % (port, s['file'])
    return u + ('?' + s['query'] if s['query'] else '')

def run(args):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                          check=True).stdout.decode('utf-8', 'replace')

def measure(s):
    """Ask the page how tall it is and where the fields are."""
    dom = run([chrome, '--headless', '--disable-gpu', '--no-sandbox',
               '--window-size=%d,%d' % (s['width'], 900 if s['tall'] else s['height']), '--virtual-time-budget=4000',
               '--dump-dom', url_for(s)])
    m = re.search(r'<script type="application/json" id="seat-geom">(.*?)</script>',
                  dom, re.S)
    if not m:
        raise SystemExit('no geometry from %s — the driver did not run' % s['name'])
    return json.loads(m.group(1))

def shoot(s, height, dest):
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-sandbox',
                    '--hide-scrollbars', '--screenshot=' + dest,
                    '--window-size=%d,%d' % (s['width'], height),
                    '--force-device-scale-factor=%d' % SCALE,
                    '--virtual-time-budget=4000', url_for(s)],
                   stderr=subprocess.DEVNULL, check=True)

states = {}
for s in manifest:
    dest = os.path.join(out, s['name'] + '.png')
    # Measure every state, not only the tall ones. The popup is shot at a fixed
    # size, but the camera still pushes into its hall and its countdown, and
    # those offsets are the page's to report rather than the edit's to guess.
    geom = measure(s)
    rects = geom['rects']
    height = min(int(geom['doc']) + 8, MAX_TALL) if s['tall'] else s['height']
    shoot(s, height, dest)
    states[s['name']] = {'w': s['width'], 'h': height, 'scale': SCALE, 'rects': rects}
    print('  %-18s %4dx%-5d %2d rects  %6.1f KB'
          % (s['name'], s['width'], height, len(rects), os.path.getsize(dest) / 1024))

json.dump(states, open(os.path.join(out, 'states.json'), 'w'), indent=2)
print('%d states -> video/public/states/' % len(states))
PY
