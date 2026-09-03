"""
Every UI state the demo video shows, rendered from the extension's own code.

This is the store-screenshot pipeline (store/shots/make-stubs.py) pointed at a
different problem. The store needs four stills; a video needs the *same screen
either side of a click* — a popup before and after a show is added, the seats
field reading 2 and then 4 — so that a hard cut between two frames reads as the
interface responding.

Nothing here draws an interface. It supplies chrome.* and a fixed clock, then
lets popup.js and options.js render themselves. If the real UI changes, these
change with it, which is the only reason the video can be trusted to still be
showing the product a year from now.
"""
import json, os, re, copy

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out  = os.path.join(root, 'video', 'shots', '_stub')
os.makedirs(out, exist_ok=True)

# Anchored to the fixture's own dates so "checked 2m ago" and "in 5 days" mean
# the same thing on every rebuild. Not frozen — the hall and the trend line are
# drawn by an animation that reads the clock, and a constant leaves them empty.
NOW = 1788356400000            # 2026-09-02 13:40 UTC
SHOWTIME = NOW + 95 * 60000    # 1h35m out, so the countdown reads mid-watch

SEAT_URL = ('https://in.bookmyshow.com/movies/hyderabad/seat-layout/'
            'ET00505091/ALUC/54321/20260902')
SEAT_URL_2 = ('https://in.bookmyshow.com/movies/hyderabad/seat-layout/'
              'ET00505091/AMBH/54399/20260902')

LABEL   = "Spider-Man: Brand New Day · English"
VENUE   = "ALLU Cinemas: Kokapet | Wed, 02 September, 2026 | 03:15 PM"
LABEL_2 = "Spider-Man: Brand New Day · IMAX 2D"
VENUE_2 = "AMB Cinemas: Gachibowli | Wed, 02 September, 2026 | 09:45 PM"


# ---------------------------------------------------------------- the hall ---

def hall(marks, singles_extra=0):
    """
    A hall the way the extension records one: `cells` is a string per row where
    '.' is no seat, '#' sold and 'o' free. A seat only takes the alert colour if
    it is 'o' *and* inside a mark, so the marks and the free seats have to agree
    — passing marks over sold seats draws nothing, silently.

    23 columns with two aisles is 21 a row, 9 rows, 189 seats.
    """
    COLS, AISLES = 23, {7, 15}
    labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']   # halls skip I
    lit = {(gy, cx) for gy, a, b in marks for cx in range(a, b + 1)}
    # Scattered singles: free, but not seats you would cross town for. Fixed,
    # so every rebuild draws the same hall and a cross-dissolve between two
    # states only moves what actually changed.
    singles = [(0, 3), (0, 18), (1, 11), (2, 5), (2, 20), (3, 1),
               (4, 13), (4, 17), (5, 2), (5, 21), (8, 6), (8, 12), (8, 19)]
    extra   = [(1, 4), (3, 19), (6, 2), (7, 20), (5, 14), (2, 12),
               (4, 5), (0, 9), (8, 3), (1, 17), (6, 21), (3, 6)]
    free_set = set(singles) | set(extra[:singles_extra])

    rows = []
    for ry, label in enumerate(labels):
        cells = []
        for cx in range(COLS):
            if cx in AISLES:                       cells.append('.')
            elif (ry, cx) in lit:                  cells.append('o')
            elif (ry, cx) in free_set:             cells.append('o')
            else:                                  cells.append('#')
        rows.append({"row": label, "cells": ''.join(cells)})

    total = sum(c != '.' for r in rows for c in r["cells"])
    free  = sum(c == 'o' for r in rows for c in r["cells"])
    return {"cols": COLS, "rows": rows, "marks": marks}, total, free


def history(series):
    """Oldest first — the chart maps x across first-to-last, so a newest-first
    series gives a negative span and draws nothing at all."""
    return [{"t": NOW - (len(series) - i) * 300000, "free": f}
            for i, f in enumerate(series)]


# A show mid-watch: two matching blocks, the state the popup spends most of its
# life in and the one the video treats as its hero frame.
MAP_QUIET, TOTAL_Q, FREE_Q = hall([[6, 9, 12], [7, 10, 12]])
# The same hall after a release lands: a long centre run in row F as well.
MAP_HIT, TOTAL_H, FREE_H = hall([[5, 8, 13], [6, 9, 12], [7, 10, 12]], singles_extra=8)


def show_entry(url, label, subtitle, mapdata, total, free, blocks, hits, alerted,
               hist, nextin=57000):
    return {
        "nextCheck": NOW + nextin,
        "showtimeTs": SHOWTIME,
        "notified": [],
        "history": history(hist),
        "last": {
            "at": NOW - 33000, "title": label, "subtitle": subtitle,
            "available": free, "total": total, "blocks": blocks,
            "minsUntil": 95, "alerted": alerted, "hits": hits, "map": mapdata,
        },
    }


HITS_QUIET = [
    {"row": "G", "price": 240, "size": 4, "from": 9,  "to": 12, "bestseller": True},
    {"row": "H", "price": 240, "size": 3, "from": 10, "to": 12, "bestseller": False},
]
HITS_HIT = [
    {"row": "F", "price": 240, "size": 6, "from": 8,  "to": 13, "bestseller": True},
    {"row": "G", "price": 240, "size": 4, "from": 9,  "to": 12, "bestseller": True},
    {"row": "H", "price": 240, "size": 3, "from": 10, "to": 12, "bestseller": False},
]

RELEASES = [
    {"id": "HYD:EG1", "title": "Ramba Oorvasi Menaka", "regionCode": "HYD",
     "venues": ["ALUC", "AMBH"], "releaseDate": "20260911"},
    {"id": "HYD:EG2", "title": "Once More", "regionCode": "HYD",
     "venues": ["ALUC"], "releaseDate": "20260904"},
]
RELEASE_STATE = {
    "HYD:EG1": {"last": {"at": NOW - 130000, "mode": "venues", "checked": 2}},
    "HYD:EG2": {"last": {"at": NOW - 96000,  "mode": "venues", "checked": 1}},
}

BASE_POPUP = {
    "running": True,
    "release": {"intervalMinutes": 10, "dormancyDays": 7, "premiereDays": 1},
    "releases": [], "releaseState": {}, "shows": [], "state": {},
}


def popup(**kw):
    s = copy.deepcopy(BASE_POPUP)
    s.update(kw)
    return s


ONE_SHOW = {
    "shows":  [{"url": SEAT_URL, "label": LABEL}],
    "state":  {SEAT_URL: show_entry(SEAT_URL, LABEL, VENUE, MAP_QUIET, TOTAL_Q,
                                    FREE_Q, 2, HITS_QUIET, 0,
                                    [11, 12, 12, 13, 13, 14, 17, 17, 18, 20, 20, 20])},
}
TWO_SHOWS = {
    "shows": [{"url": SEAT_URL, "label": LABEL}, {"url": SEAT_URL_2, "label": LABEL_2}],
    "state": {
        SEAT_URL: ONE_SHOW["state"][SEAT_URL],
        SEAT_URL_2: show_entry(SEAT_URL_2, LABEL_2, VENUE_2, MAP_QUIET, TOTAL_Q,
                               FREE_Q, 0, [], 0, [4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8],
                               nextin=214000),
    },
}
HIT_SHOW = {
    "shows": [{"url": SEAT_URL, "label": LABEL}],
    "state": {SEAT_URL: show_entry(SEAT_URL, LABEL, VENUE, MAP_HIT, TOTAL_H, FREE_H,
                                   3, HITS_HIT, 3,
                                   [11, 12, 12, 13, 13, 14, 17, 17, 18, 20, 24, 28],
                                   nextin=41000)},
}

# ------------------------------------------------------------- the options ---

BASE_OPTIONS = {
    "city": {"code": "HYD", "name": "Hyderabad", "slug": "hyderabad"},
    "release": {"intervalMinutes": 10, "dormancyDays": 7, "premiereDays": 1,
                "defaultVenues": {"HYD": ["ALUC", "AMBH"]}},
    "releases": [], "shows": [{}],
    "telegram": {"botToken": "", "chatId": ""},
    "defaults": {"minAdjacent": 2, "maxOffCentre": None, "skipRows": None},
}


def options(**kw):
    s = copy.deepcopy(BASE_OPTIONS)
    for k, v in kw.items():
        if isinstance(v, dict) and isinstance(s.get(k), dict):
            s[k] = {**s[k], **v}
        else:
            s[k] = v
    return s


VENUES = [
  {"code": "ALUC", "name": "ALLU Cinemas: Kokapet", "dates": ["1"]},
  {"code": "AMBH", "name": "AMB Cinemas: Gachibowli", "dates": ["1"]},
  {"code": "AACN", "name": "Aparna Cinemas: Nallagandla", "dates": ["1"]},
  {"code": "CPMH", "name": "Cinepolis: Lulu Mall, Hyderabad", "dates": ["1"]},
  {"code": "ASHN", "name": "Asian Cinemart: RC Puram", "dates": []},
  {"code": "PVTP", "name": "PVR: Preston, Gachibowli", "dates": ["1"]},
]
REGIONS = [{"code": "HYD", "name": "Hyderabad", "slug": "hyderabad"},
           {"code": "MUMBAI", "name": "Mumbai", "slug": "mumbai"},
           {"code": "BANG", "name": "Bengaluru", "slug": "bengaluru"}]


# ------------------------------------------------------------- the harness ---

DRIVER = """
// Measures rather than scrolls.
//
// The first cut of this scrolled the window to the field it wanted and shot the
// viewport. Old headless Chrome screenshots the top of the layout regardless of
// scroll, so six of the seventeen states came out as blank paper — the page was
// fine, the camera was pointed at the wrong part of it.
//
// So: shoot the whole panel, tall, once, and hand the geometry to the video.
// Remotion pans to a rect, which is what it is good at, and a settings page
// that grows a field next year moves the shot with it instead of breaking it.
addEventListener('load', function () {
  var q = new URLSearchParams(location.search);
  setTimeout(function () {
    var tab = q.get('tab');
    if (tab) { var b = document.querySelector('.tab[data-panel=' + tab + ']'); if (b) b.click(); }

    // Values the page would only take from a user: options.js reads these from
    // storage, but `where` and `skipfront` are <select>s whose stored form is a
    // number, so setting them here is how a state shows a chosen option.
    var set = q.get('set');
    if (set) {
      JSON.parse(decodeURIComponent(set)).forEach(function (pair) {
        var el = document.querySelector(pair[0]);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!pair[1];
        else el.value = pair[1];
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // body.scrollHeight, not documentElement's: the latter is clamped up to
    // the viewport, so a 572px popup measured in a 821px window reported 821
    // and every popup shot carried 250px of dead paper the camera then framed.
    var geom = { doc: document.body.scrollHeight, rects: {} };
    var want = JSON.parse(decodeURIComponent(q.get('rects') || '[]'));
    want.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      geom.rects[sel] = { x: r.left + scrollX, y: r.top + scrollY,
                          w: r.width, h: r.height };
    });
    var tag = document.createElement('script');
    tag.type = 'application/json';
    tag.id = 'seat-geom';
    tag.textContent = JSON.stringify(geom);
    document.body.appendChild(tag);
    document.documentElement.dataset.ready = '1';
  }, 450);
});
"""


def stub(state, extra=''):
    return """<script>
(function () { var BASE = %d, t0 = performance.now();
  Date.now = function () { return BASE + (performance.now() - t0); }; })();
window.chrome = {
  storage: { local: { get: async () => (%s), set: async () => {} },
             onChanged: { addListener() {} } },
  runtime: {
    openOptionsPage() {},
    sendMessage: async (m) =>
        m.type === 'regions' ? { ok: true, regions: %s, fallback: %s }
      : m.type === 'venues'  ? { ok: true, venues: %s }
      : { ok: true, releases: [] },
  },
  permissions: { contains: async () => true, request: async () => true },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
};
%s
</script>""" % (NOW, json.dumps(state), json.dumps(REGIONS), json.dumps(REGIONS),
                json.dumps(VENUES), extra)


# Each state is one screenshot.
#
# The popup is shot at its real size — it is a fixed-width panel and the video
# shows it whole. The options page is shot tall, whole panel at once, with the
# rects listed here measured in the same pass; the video pans to those. That is
# also why near-identical options states are cheap: one tall shot serves the
# four beats that happen on the same panel.
POPUP_RECTS = ['.bar', '.new', '.up', '.shows', '.show', '.hall', '.map',
               '.caption', '.trend', '.clockline', '.clock', '.next', '.track',
               '.blocks', '.tail', '.foot', '.empty', '.name', '.head .open',
               '.film', '.up-head']
SEAT_RECTS = ['#panel-seats .howto', '#minAdj', '#skipfront', '#where',
              '#bestOnly', '#cad-far', '.ladder', '.ladder li.hot', '#shows']
REL_RECTS  = ['#panel-release .howto', '#city', '#relEvery', '#relDormancy',
              '#relPremiere', '.venuebox', '#venues']
ALERT_RECTS = ['#hook', '#hookTest', '#token', '#chat', '#detect']

STATES = [
  # ---- the popup, at its real width ---------------------------------------
  ("popup-empty",  'popup.html', popup(), '', (384, 0), POPUP_RECTS),
  ("popup-one",    'popup.html', popup(**ONE_SHOW), '', (384, 0), POPUP_RECTS),
  ("popup-two",    'popup.html', popup(**TWO_SHOWS), '', (384, 0), POPUP_RECTS),
  ("popup-hit",    'popup.html', popup(**HIT_SHOW), '', (384, 0), POPUP_RECTS),
  ("popup-full",   'popup.html',
       popup(releases=RELEASES, releaseState=RELEASE_STATE, **ONE_SHOW), '', (384, 0), POPUP_RECTS),
  ("popup-films",  'popup.html',
       popup(releases=RELEASES, releaseState=RELEASE_STATE), '', (384, 0), POPUP_RECTS),
  ("popup-paused", 'popup.html', popup(running=False, **ONE_SHOW), '', (384, 0), POPUP_RECTS),

  # ---- seat watch settings, tall ------------------------------------------
  ("opt-seats-loose", 'options.html', options(defaults={"minAdjacent": 2}),
       'tab=seats', (1040, 0), SEAT_RECTS),
  ("opt-seats-tight", 'options.html',
       # skipfront is a <select>, so the fixture has to name a row count it
       # actually offers — a value that is merely plausible renders as an empty
       # box, which is what the video showed for eleven seconds before anyone
       # noticed. (The page now adds an option for an unknown count rather than
       # showing nothing, but a fixture should still picture the real choices.)
       options(defaults={"minAdjacent": 4, "maxOffCentre": 0.5, "skipRows": 5}),
       'tab=seats', (1040, 0), SEAT_RECTS),

  # ---- release watch, tall -------------------------------------------------
  ("opt-release", 'options.html', options(), 'tab=release', (1040, 0), REL_RECTS),

  # ---- alerts, tall, before and after it is filled in ----------------------
  ("opt-alerts-empty", 'options.html', options(), 'tab=alerts', (1040, 0), ALERT_RECTS),
  ("opt-alerts-set",   'options.html',
       options(telegram={"botToken": "8123456789:AAH7q2Xk9pLm",
                         "chatId": "987654321, -1001234567890"}),
       'tab=alerts', (1040, 0), ALERT_RECTS),
]

SOURCE = {}
for name in ('popup.html', 'options.html'):
    s = open(os.path.join(root, name)).read()
    s = s.replace('href="ui.css"', 'href="../../../ui.css"')
    s = re.sub(r'<script src="([^"]+)"></script>',
               lambda m: '<script src="../../../%s"></script>' % m.group(1), s)
    SOURCE[name] = s

import urllib.parse
manifest = []
for name, src, state, query, (w, h), rects in STATES:
    s = SOURCE[src]
    extra = DRIVER
    first = s.index('<script src=')
    s = s[:first] + stub(state, extra) + '\n' + s[first:]
    open(os.path.join(out, name + '.html'), 'w').write(s)
    q = query
    if rects:
        q += ('&' if q else '') + 'rects=' + urllib.parse.quote(json.dumps(rects))
    manifest.append({"name": name, "file": name + '.html', "query": q,
                     "width": w, "height": h, "tall": h == 0})
    print('stub:', name)

open(os.path.join(out, 'manifest.json'), 'w').write(json.dumps(manifest, indent=2))
print('%d states' % len(manifest))
