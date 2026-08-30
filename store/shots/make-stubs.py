import json, os, re, sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out  = os.path.join(root, 'store', 'shots', '_stub')
os.makedirs(out, exist_ok=True)

# Frozen, so "checked 2m ago" and "in 5 days" mean the same thing whenever the
# shots are rebuilt. Set near the fixture's own dates — a clock in the wrong
# decade renders "starts checking in 9126 days", which is how this was caught.
NOW = 1788356400000          # 2026-09-02 13:40 UTC
SHOWTIME = NOW + 95 * 60000  # 1h35m out, so the countdown reads mid-watch

SEAT_URL = ('https://in.bookmyshow.com/movies/hyderabad/seat-layout/'
            'ET00505091/ALUC/54321/20260902')

# A populated popup, because an empty one shows nothing. The seat numbers,
# prices and counts are invented — the interface around them is the real one,
# rendered by its own code. The listing says so alongside the screenshot.
def hall():
    """
    A hall the way the extension actually records one.

    `rows` is a list of {row, cells}, and `cells` is a string per row: '.' is no
    seat, '#' sold, 'o' free. A marked seat only lights if it is 'o' AND inside
    a mark — passing a row count instead of a row list draws nothing at all,
    silently, which is how this was got wrong the first time.

    23 columns with two aisles is 21 seats a row, 9 rows, 189 seats — matching
    the "20 free / 169 taken" the card reports beside it.
    """
    COLS, AISLES = 23, {7, 15}
    labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']   # halls skip I
    # The two blocks the alert is about, as [row, from, to] column indices.
    marks = [[6, 9, 12], [7, 10, 12]]
    lit = {(gy, cx) for gy, a, b in marks for cx in range(a, b + 1)}
    # Free seats that are not part of a block — scattered singles, the kind you
    # would not cross town for. Fixed, so every rebuild draws the same hall.
    singles = {(0, 3), (0, 18), (1, 11), (2, 5), (2, 20), (3, 1),
               (4, 13), (4, 17), (5, 2), (5, 21), (8, 6), (8, 12), (8, 19)}

    rows = []
    for ry, label in enumerate(labels):
        cells = []
        for cx in range(COLS):
            if cx in AISLES:            cells.append('.')
            elif (ry, cx) in lit:       cells.append('o')
            elif (ry, cx) in singles:   cells.append('o')
            else:                       cells.append('#')
        rows.append({"row": label, "cells": ''.join(cells)})

    seats = sum(c != '.' for r in rows for c in r["cells"])
    free  = sum(c == 'o' for r in rows for c in r["cells"])
    assert (seats, free) == (189, 20), (seats, free)
    return {"cols": COLS, "rows": rows, "marks": marks}

POPUP_STATE = {
  "running": True,
  "release": {"intervalMinutes": 10, "dormancyDays": 7, "premiereDays": 1},
  "releases": [
    {"id": "HYD:EG1", "title": "Ramba Oorvasi Menaka", "regionCode": "HYD",
     "venues": ["ALUC", "AMBH"], "releaseDate": "20260911"},
    {"id": "HYD:EG2", "title": "Once More", "regionCode": "HYD",
     "venues": ["ALUC"], "releaseDate": "20260904"},
  ],
  "releaseState": {
    "HYD:EG1": {"last": {"at": NOW - 130000, "mode": "venues", "checked": 2}},
    "HYD:EG2": {"last": {"at": NOW - 96000, "mode": "venues", "checked": 1}},
  },
  "shows": [{"url": SEAT_URL, "label": "Spider-Man: Brand New Day \u00b7 English"}],
  "state": {
    SEAT_URL: {
      "nextCheck": NOW + 57000,
      "showtimeTs": SHOWTIME,
      "notified": [],
      # Oldest first. The chart maps x across the span between the first and
      # last timestamp, so a newest-first series gives a negative span and
      # draws nothing — which is exactly what it did.
      "history": [{"t": NOW - (11 - i) * 300000, "free": f}
                  for i, f in enumerate([11, 12, 12, 13, 13, 14, 17, 17, 18, 20, 20, 20])],
      "last": {
        "at": NOW - 33000,
        "title": "Spider-Man: Brand New Day \u00b7 English",
        "subtitle": "ALLU Cinemas: Kokapet | Wed, 02 September, 2026 | 03:15 PM",
        "available": 20, "total": 189, "blocks": 2, "minsUntil": 95, "alerted": 2,
        "hits": [
          {"row": "G", "price": 240, "size": 4, "from": 9,  "to": 12, "bestseller": True},
          {"row": "H", "price": 240, "size": 3, "from": 10, "to": 12, "bestseller": False},
        ],
        "map": hall(),
      },
    },
  },
}

OPTIONS_STATE = {
  "city": {"code": "HYD", "name": "Hyderabad", "slug": "hyderabad"},
  "release": {"intervalMinutes": 10, "dormancyDays": 7, "premiereDays": 1,
              "defaultVenues": {"HYD": ["ALUC", "AMBH"]}},
  "releases": [], "shows": [{}],
  "telegram": {"botToken": "8123456789:AAH7q2Xk9pLm", "chatId": "987654321, -1001234567890"},
  "defaults": {"minAdjacent": 4, "maxOffCentre": 0.5, "minFromScreen": 0.25},
}

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

def stub(state, extra=''):
    return """<script>
// Anchored, not frozen. "checked 2m ago" has to mean the same thing on every
// rebuild, but the hall and the trend line are drawn by an animation that reads
// the clock — pin it to a constant and progress never leaves zero, so the
// canvas renders empty. This starts at the fixture's date and then ticks.
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

DRIVER = """
// Scroll to a named element rather than to a pixel offset. The tab bar is
// sticky, so it covers the top of the frame and a raw offset has to guess how
// much — which is how three of these ended up cropped through the middle of a
// field. Naming the element and clearing the bar's height is exact, and it
// survives the page's layout changing underneath it.
addEventListener('load', function () {
  var q = new URLSearchParams(location.search);
  setTimeout(function () {
    var tab = q.get('tab');
    if (tab) { var b = document.querySelector('.tab[data-panel=' + tab + ']'); if (b) b.click(); }

    var sel = q.get('focus');
    if (sel) {
      var el = document.querySelector(decodeURIComponent(sel));
      var bar = document.querySelector('.tabs');
      if (el) {
        var clear = (bar ? bar.getBoundingClientRect().height : 0) + 34;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - clear);
      }
    }
    document.documentElement.dataset.ready = '1';
  }, 350);
});
"""

for src, state, extra in [('popup.html', POPUP_STATE, ''),
                          ('options.html', OPTIONS_STATE, DRIVER)]:
    s = open(os.path.join(root, src)).read()
    s = s.replace('href="ui.css"', 'href="../../../ui.css"')
    s = re.sub(r'<script src="([^"]+)"></script>',
               lambda m: '<script src="../../../%s"></script>' % m.group(1), s)
    first = s.index('<script src=')
    s = s[:first] + stub(state, extra) + '\n' + s[first:]
    open(os.path.join(out, src), 'w').write(s)
    print('stub:', src)
