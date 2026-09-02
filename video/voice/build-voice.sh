#!/bin/sh
# Renders the voiceover, one file per scene, and measures it.
#
# Per scene rather than one long take, because the scene lengths are derived
# from the audio: the video is cut to the narration instead of the narration
# being squeezed into a cut. Change a line, rebuild, and that scene grows.
#
# macOS `say` needs nothing installed. The stock voices are serviceable and
# free; Tara is the Indian English one and the default here.
#
# If an Enhanced or Premium version of a voice is installed it is used
# automatically — those are a large quality jump and a one-time download in
# System Settings -> Accessibility -> Spoken Content -> System Voice -> Manage
# Voices. For en-IN look for Isha (Premium) or Tara (Enhanced).
#
# Better still: drop your own 44.1k mono WAVs into video/public/vo/<scene-id>.wav
# and run with KEEP=1 to measure them without overwriting.
set -e
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
OUT="$ROOT/public/vo"
mkdir -p "$OUT"

VOICE="${VOICE:-}"
RATE="${RATE:-}"
KEEP="${KEEP:-}"

python3 - "$ROOT" "$OUT" "$VOICE" "$RATE" "$KEEP" <<'PY'
import json, os, re, subprocess, sys

root, out, voice, rate, keep = sys.argv[1:6]
script = json.load(open(os.path.join(root, 'script.json')))

def installed():
    """The voices `say` will actually use.

    Worth the extra call: `say -v NoSuchVoice` exits 0 and silently renders in
    the system default, so a typo in VOICE produces a whole video narrated by
    the wrong voice with nothing anywhere reporting a problem. Asked for
    "Rishi" once and got Samantha for two and a half minutes.
    """
    out = subprocess.run(['say', '-v', '?'], stdout=subprocess.PIPE,
                         check=True).stdout.decode('utf-8', 'replace')
    # Names can carry a variant in parentheses and are then separated from the
    # locale by a single space -- "Tara (English (India)) en_IN" -- so a
    # two-space rule drops exactly the voices worth having. Duplicates are real:
    # the same display name can appear twice, once for a Siri build that `say`
    # will not actually hand out.
    names = []
    for line in out.splitlines():
        m = re.match(r'^(.+?)\s+([a-z]{2}[_-][A-Z]{2})\s+#', line)
        if m and m.group(1).strip() not in names:
            names.append(m.group(1).strip())
    return names


def pick(want, have):
    """Resolve a short voice name to the best installed build of it.

    Quality first, then the plain name, then a locale variant: macOS lists the
    same voice as "Tara" on one machine and "Tara (English (India))" on the
    next, and asking for the short name should not be a failure on the second.
    """
    for suffix in (' (Premium)', ' (Enhanced)'):
        if want + suffix in have:
            return want + suffix
    if want in have:
        return want
    variants = [v for v in have if v.startswith(want + ' (')]
    if variants:
        return variants[0]
    raise SystemExit(
        'Voice "%s" is not installed. Available:\n  %s' % (want, '\n  '.join(have))
    )


def duration(path):
    """Seconds, read back from the file itself rather than estimated from the
    word count — an estimate that is wrong by 300ms puts every later scene out
    of sync with its own narration."""
    info = subprocess.run(['afinfo', path], stdout=subprocess.PIPE,
                          check=True).stdout.decode()
    m = re.search(r'estimated duration: ([\d.]+) sec', info)
    if not m:
        raise SystemExit('afinfo gave no duration for ' + path)
    return float(m.group(1))

have  = installed()
voice = pick(voice or script.get('voice', 'Tara'), have)
rate  = int(rate or script.get('rate', 168))
print('  voice: %s at %d wpm\n' % (voice, rate))

vo, total = {}, 0.0
for scene in script['scenes']:
    sid, text = scene['id'], scene['vo']
    wav = os.path.join(out, sid + '.wav')
    if keep and os.path.exists(wav):
        note = 'kept'
    else:
        # Straight to 16-bit PCM WAV, which is what Remotion wants. `say` picks
        # the container from the extension, so an .aiff here would need a
        # big-endian format and a second conversion step; this needs neither.
        subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', wav,
                        '--data-format=LEI16@44100', text], check=True)
        note = voice
    d = duration(wav)
    vo[sid] = round(d, 3)
    total += d + scene.get('hold', 0)
    print('  %-11s %6.2fs  +%.1f hold   (%s)' % (sid, d, scene.get('hold', 0), note))

json.dump({'voice': voice, 'rate': rate, 'durations': vo},
          open(os.path.join(out, 'vo.json'), 'w'), indent=2)
print('\n  %d lines, %.1fs of narration, %.1fs of video (%dm %02ds)'
      % (len(vo), sum(vo.values()), total, total // 60, total % 60))
PY
