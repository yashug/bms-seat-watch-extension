/**
 * Which seat statuses does BookMyShow actually use?
 *
 * The seat watcher's whole judgement rests on one line:
 *
 *     const open = seats.filter(s => s.status !== SOLD);   // SOLD = 2
 *
 * Everything that is not status 2 is counted as free and can be alerted on.
 * That is right for status 1 (available) and 4 (bestseller, bookable), which
 * are the only values README records. It is wrong for any value BookMyShow
 * introduces or uses for a seat you cannot buy — blocked, held, under repair,
 * a social-distancing gap, a companion seat. Such a seat would be alerted as
 * free, and the alert would be right about the block and wrong about it being
 * available.
 *
 * Nothing offline can answer this: the statuses only exist in a rendered seat
 * canvas. So it counts them, and shows where each one sits, so an unfamiliar
 * value can be checked against what the screen shows.
 *
 *   1. open a seat map with a good spread of sold and free seats — a
 *      half-full evening show is more useful than an empty one
 *   2. wait for the seats to draw
 *   3. DevTools → Console → paste this whole file → Enter
 *
 * Read-only. It reads the rendered canvas and books nothing.
 */
(() => {
  const KNOWN = { 1: 'available', 2: 'booked / held (treated as SOLD)', 4: 'bestseller, bookable' };

  const log = (...a) => console.log('%c[status]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[status]', 'color:#d33;font-weight:bold', ...a);

  const K = window.Konva;
  if (!K?.stages?.length) {
    return bad('No Konva stage. Open a seat-layout URL and let the seats draw first.');
  }
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
  if (!nodes.length) return bad('no seats drawn yet — wait for the map and re-run');

  const seats = nodes.map((n) => {
    const box = n.getClientRect({ relativeTo: stage });
    const o = n.attrs.seatObj;
    return { row: o.rowNumber, num: o.displaySeatNumber, status: o.seatStatus,
             type: o.seatType || '', price: o.curPrice,
             x: Math.round(box.x), y: Math.round(box.y) };
  });

  const byStatus = new Map();
  for (const s of seats) {
    const k = String(s.status);
    const g = byStatus.get(k) || { status: s.status, count: 0, types: new Set(), examples: [] };
    g.count++;
    if (s.type) g.types.add(s.type);
    if (g.examples.length < 6) g.examples.push(`${s.row}${s.num}`);
    byStatus.set(k, g);
  }

  const rows = [...byStatus.values()].sort((a, b) => b.count - a.count).map((g) => ({
    status: g.status,
    meaning: KNOWN[g.status] || 'UNKNOWN — not in README, and counted as FREE today',
    seats: g.count,
    // The extension's own reading, spelled out: this is what it would do.
    countedAs: g.status === 2 ? 'sold' : 'free',
    seatTypes: [...g.types].join(', '),
    examples: g.examples.join(' '),
  }));

  log(`${seats.length} seats, ${rows.length} distinct status value${rows.length === 1 ? '' : 's'}`);
  console.table(rows);

  const unknown = rows.filter((r) => !KNOWN[r.status]);
  if (unknown.length) {
    bad('statuses this extension has never seen, all of which it would alert on as free:',
        unknown.map((r) => `${r.status} ×${r.seats} (e.g. ${r.examples})`).join('; '));
    bad('check those seats on screen: if any is not actually bookable, that is a false alert ' +
        'waiting to happen, and SOLD needs to become a set rather than a single value');
  } else {
    log('every status on this map is one the extension knows');
  }

  const free = seats.filter((s) => s.status !== 2).length;
  log(`the extension would call ${free} of ${seats.length} seats free — ` +
      'compare that with the map on screen');

  const out = { href: location.href, total: seats.length, wouldCallFree: free, rows };
  const json = JSON.stringify({ ...out, rows: rows.map((r) => ({ ...r })) }, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
