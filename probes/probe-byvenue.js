/**
 * What did byvenue actually send?
 *
 * The one question the extension's own state cannot answer. A release alert
 * matches a listing on its EventGroup, so an alert for the wrong film means the
 * row carried a group it should not have — either because BookMyShow filed it
 * that way, or because `parseByVenue` reached for the parent event's group when
 * the child had none (release.js: `child.EventGroup || event.EventGroup`).
 *
 * This prints the raw shape for one venue on one date: every Event, its group
 * and title, and each ChildEvent under it. If a Mirzapur child appears under a
 * Sardar 2 group, that is BookMyShow's data and the fix is on our side to stop
 * trusting it. If Mirzapur is its own Event with its own group, the match came
 * from somewhere else and the fix is elsewhere.
 *
 *   chrome://extensions → Seat Watch → "service worker" → Console → paste
 *
 * Read-only, anonymous — byvenue was measured returning identical bytes with
 * and without a session.
 */
(async () => {
  const VENUE = 'ALUC';        // the cinema the wrong alert named
  const DATE = '20260909';     // the date it named
  const REGION = 'HYD';
  const LOOK_FOR = 'ET00417686';   // the code the alert linked to

  const log = (...a) => console.log('%c[byvenue]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[byvenue]', 'color:#d33;font-weight:bold', ...a);

  const url = 'https://in.bookmyshow.com/api/v3/mobile/showtimes/byvenue' +
              `?dateCode=${DATE}&venueCode=${VENUE}&regionCode=${REGION}`;
  let body;
  try { body = await (await fetch(url, { credentials: 'omit' })).json(); }
  catch (e) { return bad('could not read byvenue:', String(e.message || e)); }

  const rows = [];
  for (const day of body?.ShowDetails || []) {
    for (const event of day.Event || []) {
      for (const child of event.ChildEvents || []) {
        rows.push({
          date: day.Date,
          eventTitle: event.EventTitle || '',
          eventGroup: event.EventGroup || null,
          childCode: child.EventCode || null,
          // The two that decide a match, side by side: what the child says, and
          // what it inherits when it says nothing.
          childGroup: child.EventGroup || null,
          effectiveGroup: child.EventGroup || event.EventGroup || null,
          inherited: !child.EventGroup && Boolean(event.EventGroup),
          language: child.EventLanguage || '',
          url: child.EventUrl || null,
          shows: (child.ShowTimes || []).length,
        });
      }
    }
  }

  log(`${rows.length} child events at ${VENUE} on ${DATE}`);
  console.table(rows);

  const hit = rows.filter((r) => r.childCode === LOOK_FOR);
  if (!hit.length) {
    log(`${LOOK_FOR} is not in this response — the alert's listing is no longer here.`);
  } else {
    for (const h of hit) {
      bad(`${LOOK_FOR} — "${h.eventTitle}" (${h.language}) at /${h.url}`);
      bad(`   child group ${h.childGroup || 'NONE'}, parent group ${h.eventGroup || 'NONE'}` +
          `, effective ${h.effectiveGroup}${h.inherited ? ' ← INHERITED from the parent event' : ''}`);
    }
  }

  // Anything sharing a group across two different film titles is the bug in one
  // line, whether or not it is the code the alert used.
  const byGroup = new Map();
  for (const r of rows) {
    if (!r.effectiveGroup) continue;
    const set = byGroup.get(r.effectiveGroup) || new Set();
    set.add(r.eventTitle);
    byGroup.set(r.effectiveGroup, set);
  }
  const shared = [...byGroup].filter(([, titles]) => titles.size > 1);
  if (shared.length) {
    bad('groups covering more than one film title:',
        shared.map(([g, t]) => `${g}: ${[...t].join(' + ')}`));
  } else {
    log('every group in this response covers exactly one title');
  }

  const out = { url, rows, shared: shared.map(([g, t]) => [g, [...t]]) };
  const json = JSON.stringify(out, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
