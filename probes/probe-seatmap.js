/**
 * Seat-map orientation probe.
 *
 * `fromScreen` — the fraction behind "Rows to skip at the front" — rests on one
 * assumption written into background.js and never checked against a real hall:
 *
 *   "BookMyShow draws the screen at the BOTTOM of the layout, so the largest y
 *    is the row nearest it and index 0 is the back of the hall."
 *
 * If that is backwards for a hall, the filter skips the back rows and keeps the
 * neck-craning ones — silently, because both ends look identical in an alert.
 * Nothing offline can settle it: the seat canvas only exists in a real browser,
 * on a real seat-layout page, with the seats rendered.
 *
 *   1. open the seat map you are watching, and WAIT for the seats to draw
 *      e.g. https://in.bookmyshow.com/movies/HYD/seat-layout/ET00511702/ALUC/4576/20260903
 *   2. DevTools → Console → paste this whole file → Enter
 *   3. paste back the table it prints (it is also copied to the clipboard)
 *
 * It only reads the rendered canvas. Nothing is booked, nothing is sent.
 */
(() => {
  const log = (...a) => console.log('%c[seatmap]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[seatmap]', 'color:#d33;font-weight:bold', ...a);

  const K = window.Konva;
  if (!K?.stages?.length) {
    return bad('No Konva stage on this page. Open a seat-layout URL and let the seats draw first.');
  }

  // The same walk the extension does: the page mounts more than one stage, and
  // the interesting one is whichever holds seats.
  const collect = (stage) => {
    const out = [];
    (function walk(n) {
      if (n.attrs?.seatObj) out.push(n);
      (n.children || []).forEach(walk);
    })(stage);
    return out;
  };
  let nodes = [], stage = null;
  for (const st of K.stages) {
    const found = collect(st);
    if (found.length > nodes.length) { nodes = found; stage = st; }
  }
  if (!nodes.length) return bad('Konva is here but no seats are drawn yet. Wait for the map, then re-run.');

  const seats = nodes.map((n) => {
    const box = n.getClientRect({ relativeTo: stage });
    const o = n.attrs.seatObj;
    return { row: o.rowNumber, num: o.displaySeatNumber, status: o.seatStatus,
             x: Math.round(box.x), y: Math.round(box.y) };
  });

  // Rows in the order the hall DRAWS them, top of the canvas first — the order
  // the extension indexes, and the thing this probe exists to label.
  const rowYs = [...new Set(seats.map((s) => s.y))].sort((a, b) => a - b);
  const lastRow = Math.max(1, rowYs.length - 1);
  const rows = rowYs.map((y, i) => {
    const line = seats.filter((s) => s.y === y);
    return {
      i, y, label: line.find((s) => s.row)?.row ?? '',
      seats: line.length,
      // What background.js computes today: 0 = at the screen, 1 = back of hall,
      // and screenRow 0 = the row it believes is right under the screen.
      fromScreen: Number((1 - i / lastRow).toFixed(3)),
      screenRow: rowYs.length - 1 - i,
    };
  });

  // Where the screen actually is. Three independent readings, because any one
  // of them can be absent on a given layout:
  //   - the "All eyes this way please" marker in the DOM
  //   - any Konva text drawn outside the seat block
  //   - the seat canvas's own position on the page
  const canvasRect = (() => {
    try { return stage.container().getBoundingClientRect(); } catch { return null; }
  })();
  const pageY = (clientTop) => Math.round(clientTop + window.scrollY);

  const domMarkers = [...document.querySelectorAll('*')]
    .filter((el) => !el.children.length &&
                    /eyes this way|all eyes|^\s*screen\s*$|screen this way/i.test(el.textContent || ''))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim().slice(0, 60), pageTop: pageY(r.top), height: Math.round(r.height) };
    })
    .filter((m) => m.pageTop);

  const konvaText = [];
  (function walk(n) {
    if (n.attrs?.text && !n.attrs?.seatObj) {
      try {
        const b = n.getClientRect({ relativeTo: stage });
        konvaText.push({ text: String(n.attrs.text).slice(0, 40), y: Math.round(b.y) });
      } catch { /* a node that refuses to measure */ }
    }
    (n.children || []).forEach(walk);
  })(stage);

  // The verdict, stated as the one thing the code needs to be right about.
  const seatTopPage = canvasRect ? pageY(canvasRect.top) + rowYs[0] : null;
  const seatBottomPage = canvasRect ? pageY(canvasRect.top) + rowYs[rowYs.length - 1] : null;
  const marker = domMarkers[0] || null;
  let screenSide = 'unknown';
  if (marker && seatTopPage != null) {
    screenSide = marker.pageTop > seatBottomPage ? 'BOTTOM (below the seats)'
               : marker.pageTop < seatTopPage ? 'TOP (above the seats)'
               : 'inside the seat block — inconclusive';
  }

  const out = {
    ranAt: new Date().toISOString(),
    href: location.href,
    rowCount: rows.length,
    rowsTopToBottom: rows.map((r) => r.label || '?').join(' '),
    codeThinks: {
      nearestTheScreen: rows.filter((r) => r.fromScreen === 0).map((r) => r.label),
      backOfHall: rows.filter((r) => r.fromScreen === 1).map((r) => r.label),
      droppedBySkippingFirst2: rows.filter((r) => r.screenRow < 2).map((r) => r.label),
      droppedBySkippingFirst3: rows.filter((r) => r.screenRow < 3).map((r) => r.label),
      droppedBySkippingFirst5: rows.filter((r) => r.screenRow < 5).map((r) => r.label),
    },
    screenMarkerSays: screenSide,
    domMarkers, konvaText,
    seatBlockPageTop: seatTopPage, seatBlockPageBottom: seatBottomPage,
    rows,
  };

  console.table(rows.map((r) => ({ 'draw order': r.i, row: r.label, y: r.y,
                                   seats: r.seats, 'rows from screen': r.screenRow })));
  log('rows as drawn, top of canvas first:', out.rowsTopToBottom);
  log('the screen marker sits at the', screenSide);
  log('"The first 3 rows" would currently drop:', out.codeThinks.droppedBySkippingFirst3.join(', ') || '(nothing)');
  log('code calls these the back of the hall:', out.codeThinks.backOfHall.join(', '));

  const json = JSON.stringify(out, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard, paste it back'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
