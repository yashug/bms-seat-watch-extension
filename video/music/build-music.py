"""
The score, synthesised to fit the cut.

Written rather than licensed, for two reasons. A demo video that ends up on a
store listing, YouTube and a Product Hunt post is exactly the kind of thing that
gets a copyright claim eighteen months later from a library whose terms changed,
and there is nothing here to claim: every sample is generated from this file.
The second reason is that the music can then be told where the cut is. It stays
out of the way through the cold open, arrives when the product does, and lands
its last chord on the end card instead of being faded out mid-phrase.

It is deliberately plain — a slow pad, a soft pluck, a low root, three bell
accents. Under narration, anything with more opinion than that is a distraction,
and the video already has a voice.

    python3 music/build-music.py             ->  public/music/bed.wav
    python3 music/build-music.py social      ->  public/music/bed-social.wav

One score per cut, and not out of tidiness: the arrangement is written against
scene start times, so playing the master's under a sixty-second cut opens on an
introduction meant for a two-and-a-half-minute tour and stops dead before the
part that resolves.
"""
import array
import json
import math
import os
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SR = 44100
BEAT = 0.75                      # 80 bpm
CHORD = BEAT * 8                 # 6s a chord
CYCLE = CHORD * 4                # 24s, and the loop length
TAIL = 2.0                       # chords ring past their slot and overlap

# A minor, with sevenths and ninths so it reads warm rather than sad. Voiced
# wide and low — a pad sitting in the same octaves as a speaking voice fights
# the narration for the only frequencies that matter.
CHORDS = [
    [110.00, 164.81, 196.00, 246.94, 329.63],   # Am9   A2 E3 G3 B3 E4
    [ 87.31, 130.81, 164.81, 220.00, 261.63],   # Fmaj7 F2 C3 E3 A3 C4
    [130.81, 196.00, 246.94, 329.63, 392.00],   # Cmaj7 C3 G3 B3 E4 G4
    [ 98.00, 146.83, 246.94, 293.66, 392.00],   # G6    G2 D3 B3 D4 G4
]
ROOTS = [55.00, 87.31 / 2, 65.41, 49.00]        # an octave under each chord

# Which chord tones the pluck walks, per beat of a chord. Eight beats, and the
# rest on beats 3 and 7 is what stops it sounding like a metronome.
PATTERN = [3, None, 4, 2, None, 3, 2, None]

TABLE_BITS = 12
TABLE = 1 << TABLE_BITS
SINE = [math.sin(2 * math.pi * i / TABLE) for i in range(TABLE)]
PHASE_SCALE = float(1 << 32)


def osc_bank(buf, start, length, specs):
    """
    Accumulate a bank of sine oscillators into `buf` in one pass.

    Structured with samples on the outside and oscillators on the inside on
    purpose: pure Python pays for loop iterations far more than for the work
    inside one, and doing it the other way round — a pass per oscillator — made
    this file take four minutes instead of twenty seconds.

    `specs` is a list of (frequency, amplitude, phase01).
    """
    banks = []
    for freq, amp, ph in specs:
        step = int(freq / SR * PHASE_SCALE) & 0xFFFFFFFF
        banks.append([int(ph * PHASE_SCALE) & 0xFFFFFFFF, step, amp])
    shift = 32 - TABLE_BITS
    for i in range(length):
        acc = 0.0
        for b in banks:
            b[0] = (b[0] + b[1]) & 0xFFFFFFFF
            acc += SINE[b[0] >> shift] * b[2]
        buf[start + i] += acc


def env_at(t, length, attack, release):
    """Attack/release shape, evaluated once per sample block rather than per
       sample — a pad envelope moving over seconds does not need 44,100
       resolution, and asking for it doubles the build time."""
    if t < attack:
        x = t / attack
        return x * x * (3 - 2 * x)              # smoothstep, no click at zero
    back = length - t
    if back < release:
        x = max(0.0, back / release)
        return x * x * (3 - 2 * x)
    return 1.0


def shaped(length, attack, release, block=256):
    """A gain curve for a buffer, as (index, gain) blocks."""
    out = []
    n = int(length * SR)
    for s in range(0, n, block):
        out.append((s, min(block, n - s), env_at(s / SR, length, attack, release)))
    return out


def zeros(seconds):
    return array.array('d', bytes(8 * int(seconds * SR)))


def add_ring(dst, src, at):
    """Overlap-add with wraparound, so the cycle loops without a seam."""
    n = len(dst)
    start = int(at * SR)
    for i, v in enumerate(src):
        dst[(start + i) % n] += v


# ------------------------------------------------------------------- stems ---

def build_pad():
    cycle = zeros(CYCLE)
    for ci, chord in enumerate(CHORDS):
        note = zeros(CHORD + TAIL)
        specs = []
        for k, freq in enumerate(chord):
            # Two slightly detuned copies per partial: the beating between them
            # is the whole reason a stack of sines sounds like an instrument
            # rather than like a test tone.
            for partial, amp in ((1, 1.0), (2, 0.30), (3, 0.12), (4, 0.05)):
                for cents, ph in ((-1.1, 0.0), (1.3, 0.37)):
                    specs.append((
                        freq * partial * (2 ** (cents / 1200.0)),
                        amp / (1.0 + 0.55 * k),
                        ph + 0.11 * k,
                    ))
        osc_bank(note, 0, len(note), specs)
        for s, n, g in shaped(CHORD + TAIL, 1.5, 2.2):
            for i in range(s, s + n):
                note[i] *= g
        add_ring(cycle, note, ci * CHORD)
    return cycle


def build_pluck():
    cycle = zeros(CYCLE)
    for ci, chord in enumerate(CHORDS):
        for beat, degree in enumerate(PATTERN):
            if degree is None:
                continue
            freq = chord[degree] * 2
            note = zeros(1.3)
            osc_bank(note, 0, len(note), [(freq, 1.0, 0.0), (freq * 2, 0.28, 0.0)])
            # A plucked decay, not an envelope with a sustain: this has to read
            # as a single articulation or it turns into a second pad.
            for i in range(len(note)):
                note[i] *= math.exp(-i / SR / 0.42)
            add_ring(cycle, note, ci * CHORD + beat * BEAT)
    return cycle


def build_bass():
    cycle = zeros(CYCLE)
    for ci, root in enumerate(ROOTS):
        note = zeros(CHORD + TAIL)
        osc_bank(note, 0, len(note), [(root, 1.0, 0.0), (root * 2, 0.16, 0.0)])
        for s, n, g in shaped(CHORD + TAIL, 1.1, 1.8):
            for i in range(s, s + n):
                note[i] *= g
        add_ring(cycle, note, ci * CHORD)
    return cycle


def bell(freq):
    note = zeros(3.2)
    osc_bank(note, 0, len(note), [
        (freq, 1.0, 0.0), (freq * 2.76, 0.42, 0.0), (freq * 5.40, 0.18, 0.0),
    ])
    for i in range(len(note)):
        note[i] *= math.exp(-i / SR / 1.15)
    return note


# ---------------------------------------------------------------- envelope ---

def ramp(points):
    """Piecewise-linear gain over time, as a function of seconds."""
    def at(t):
        if t <= points[0][0]:
            return points[0][1]
        for (t0, v0), (t1, v1) in zip(points, points[1:]):
            if t <= t1:
                return v0 + (v1 - v0) * ((t - t0) / (t1 - t0)) if t1 > t0 else v1
        return points[-1][1]
    return at


def main(cut='master'):
    script = json.load(open(os.path.join(ROOT, 'script.json')))
    vo = json.load(open(os.path.join(ROOT, 'public', 'vo', 'vo.json')))['durations']
    holds = {sc['id']: sc['hold'] for sc in script['scenes']}
    ids = script['cuts'][cut]

    starts, t = {}, 0.0
    for sid in ids:
        starts[sid] = t
        t += vo[sid] + holds[sid]
    total = t

    # The arrangement, in scene ids rather than in timecodes — a rewritten line
    # moves the cut, and the music has to move with it.
    # Keyed on scenes, not seconds — but a cut need not contain them all, so
    # each landmark falls back to the nearest one it does have.
    def mark(*names, default=0.0):
        for n in names:
            if n in starts:
                return starts[n]
        return default

    enter = mark('add')                       # the product arrives
    deepen = mark('criteria', 'hall')         # the tour settles in
    resolve = mark('trust', 'card')           # the closing claim
    card = mark('card', default=total)

    pad_g = ramp([(0, 0.42), (enter, 0.62), (mark('hall', 'add'), 0.70),
                  (resolve, 0.88), (card, 0.95), (total, 0.95)])
    # The pluck is the product arriving. It has no business in the cold open,
    # and it gets out of the way again for the closing claim.
    plk_g = ramp([(0, 0.0), (enter - 0.6, 0.0), (enter + 1.2, 0.34),
                  (mark('hall', 'add'), 0.40),
                  (mark('elsewhere', 'alert'), 0.34),
                  (resolve - 0.5, 0.0), (total, 0.0)])
    bas_g = ramp([(0, 0.0), (deepen, 0.0), (deepen + 2.0, 0.45),
                  (resolve, 0.55), (card, 0.5), (total, 0.5)])

    print('  %s: %.1fs — pluck in at %.1fs, bass at %.1fs, resolve at %.1fs'
          % (cut, total, enter, deepen, resolve))

    pad, pluck, bass = build_pad(), build_pluck(), build_bass()
    n = int((total + 0.5) * SR)
    mix = array.array('d', bytes(8 * n))
    cyc = len(pad)

    BLOCK = 512
    for s in range(0, n, BLOCK):
        m = min(BLOCK, n - s)
        t0 = (s + m / 2) / SR
        gp, gk, gb = pad_g(t0), plk_g(t0), bas_g(t0)
        for i in range(s, s + m):
            j = i % cyc
            mix[i] = pad[j] * gp + pluck[j] * gk + bass[j] * gb

    # Three accents, on the three moments the video changes subject.
    for at, freq, amp in ((enter - 0.25, 880.0, 0.5),
                          (mark('alert', 'hall') + 0.55, 1174.66, 0.62),
                          (card - 0.15, 659.26, 0.55)):
        b = bell(freq)
        off = int(at * SR)
        for i, v in enumerate(b):
            if 0 <= off + i < n:
                mix[off + i] += v * amp

    # Master shape: up out of silence, and a real ending rather than a fade
    # that catches the last chord halfway through.
    fade_in, fade_out = 3.0, 3.4
    for s in range(0, n, BLOCK):
        m = min(BLOCK, n - s)
        t0 = (s + m / 2) / SR
        g = 1.0
        if t0 < fade_in:
            x = t0 / fade_in
            g = x * x * (3 - 2 * x)
        back = total - t0
        if back < fade_out:
            x = max(0.0, back / fade_out)
            g = min(g, x * x * (3 - 2 * x))
        for i in range(s, s + m):
            mix[i] *= g

    peak = max(abs(v) for v in mix) or 1.0
    gain = 0.70 / peak
    out = array.array('h', bytes(2 * n))
    for i in range(n):
        v = mix[i] * gain
        # A soft knee rather than a hard clip: nothing should reach it, and if
        # something does it should not announce itself.
        v = math.tanh(v * 1.12) * 0.92
        out[i] = int(max(-32767, min(32767, v * 32767)))

    name = 'bed.wav' if cut == 'master' else 'bed-%s.wav' % cut
    dest = os.path.join(ROOT, 'public', 'music', name)
    with wave.open(dest, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(out.tobytes())
    print('  %s  %.1fs  %.1f MB' % (os.path.relpath(dest, ROOT), n / SR,
                                    os.path.getsize(dest) / 1e6))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'master')
