/**
 * What does the bell actually send?
 *
 * A watch is keyed on its film's EventGroup, and a watch carrying another
 * film's group alerts for that film under your film's name — every language of
 * it, at every cinema you picked. The group has exactly two possible sources:
 * the analytics payload on the upcoming-movies list (read by `groupIndex()` in
 * content-release.js), or the film's own page (`parseFilmPage`, most frequent
 * EG). The film page has been checked and is clean. This checks the other one.
 *
 *   1. open https://in.bookmyshow.com/explore/upcoming-movies-hyderabad
 *   2. DevTools → Console → paste this whole file → Enter
 *   3. set FILTER below to part of the film's name or slug
 *
 * It reproduces the bell's own reads exactly — the same walk, the same anchor
 * regex — and prints the entry a click would hand to the worker. Read-only.
 */
(() => {
  const FILTER = '';   // '' prints every card on the page

  const log = (...a) => console.log('%c[upcoming]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[upcoming]', 'color:#d33;font-weight:bold', ...a);

  // ---- the same index content-release.js builds ---------------------------
  const map = new Map();
  const tag = document.getElementById('__NEXT_DATA__');
  if (!tag) bad('no __NEXT_DATA__ on this page — the bell would send no group at all');
  if (tag) {
    const seen = new WeakSet();
    const walk = (node, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
      seen.add(node);
      if (!Array.isArray(node)) {
        const code = node.event_code || node.eventCode;
        const group = node.event_group || node.eventGroup;
        if (typeof code === 'string' && /^ET\d{6,}$/i.test(code) &&
            typeof group === 'string' && /^EG\d{6,}$/i.test(group)) {
          // Every pairing, not just the last one written: the extension's map
          // keeps the last write, so a code paired with two different groups
          // anywhere in this state is the thing worth seeing.
          const prev = map.get(code.toUpperCase()) || { pairings: [] };
          prev.pairings.push({ group: group.toUpperCase(), title: node.title || '',
                               language: node.language || '' });
          map.set(code.toUpperCase(), prev);
        }
      }
      for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v, depth + 1);
    };
    try { walk(JSON.parse(tag.textContent || '{}')); }
    catch (e) { bad('state did not parse:', String(e.message || e)); }
  }

  // ---- is the group anywhere in this payload at all? ----------------------
  //
  // `groupIndex()` looks for `event_group` / `eventGroup` beside an event code.
  // Finding none for any film could mean the group has gone from the payload,
  // or that it is still there under a name nobody has looked for. Those want
  // different answers, so the raw text is asked directly: every EG code in it,
  // and the key it sits under.
  const raw = tag?.textContent || '';
  const keys = new Map();
  for (const m of raw.matchAll(/"([A-Za-z_][A-Za-z_0-9]*)"\s*:\s*"(EG\d{6,})"/g)) {
    keys.set(m[1], (keys.get(m[1]) || 0) + 1);
  }
  const egTotal = (raw.match(/EG\d{6,}/g) || []).length;

  // ---- the same anchors decorateUpcoming() decorates -----------------------
  const cards = [];
  const seenCodes = new Set();
  for (const a of document.querySelectorAll('a[href*="/movies/"]')) {
    const m = a.getAttribute('href')?.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d{6,})/i);
    if (!m) continue;
    const [, , slug, code] = m;
    const eventCode = code.toUpperCase();
    if (seenCodes.has(eventCode)) continue;
    seenCodes.add(eventCode);
    const entry = map.get(eventCode);
    const last = entry?.pairings?.[entry.pairings.length - 1] || {};
    cards.push({
      // Exactly what makeButton() would carry, and addRelease() would store.
      slug, eventCode,
      groupSentByBell: last.group || null,
      title: last.title || '',
      language: last.language || '',
      pairings: entry?.pairings?.length || 0,
      // The one that matters: this code paired with more than one group in the
      // page's own state, so which one the bell sends is down to walk order.
      conflicting: (entry?.pairings || []).some((p) => p.group !== last.group),
    });
  }

  const want = cards.filter((c) =>
    !FILTER || `${c.slug} ${c.title}`.toLowerCase().includes(FILTER.toLowerCase()));
  if (!want.length) {
    bad(`nothing matching "${FILTER}". Films on this page:`, cards.map((c) => c.slug));
  }
  console.table(want.length ? want : cards);

  for (const c of want) {
    if (c.conflicting) {
      bad(`${c.slug} (${c.eventCode}) is paired with more than one group in this page's ` +
          `state: ${map.get(c.eventCode).pairings.map((p) => p.group).join(', ')}`);
    } else if (!c.groupSentByBell) {
      log(`${c.slug}: no group on this page — the bell sends none and the worker ` +
          `reads the film's own page instead`);
    } else {
      log(`${c.slug}: bell would send ${c.groupSentByBell}`);
    }
  }

  // Any group covering two different slugs on this page is the bug outright.
  const byGroup = new Map();
  for (const c of cards) {
    if (!c.groupSentByBell) continue;
    const set = byGroup.get(c.groupSentByBell) || new Set();
    set.add(c.slug.replace(/-(hindi|telugu|tamil|malayalam|kannada|english)$/, ''));
    byGroup.set(c.groupSentByBell, set);
  }
  const shared = [...byGroup].filter(([, slugs]) => slugs.size > 1);
  shared.length
    ? bad('one group covering two films:', shared.map(([g, s]) => `${g}: ${[...s].join(' + ')}`))
    : log('every group on this page covers one film');

  if (!egTotal) {
    bad('no EG code appears anywhere in this page\'s state — the group is not here to be ' +
        'read, under any key, and every watch\'s group must come from the film page');
  } else if (!keys.size) {
    bad(`${egTotal} EG codes in the state, but none as a "key": "EG…" pair — ` +
        'they are somewhere this does not look');
  } else {
    log('EG codes appear under these keys:',
        [...keys].map(([k, n]) => `${k} ×${n}`).join(', '));
    const unread = [...keys.keys()].filter((k) => !/^(event_group|eventGroup)$/.test(k));
    if (unread.length) {
      bad('the group IS on this page, under a key groupIndex() does not read:',
          unread.join(', '));
    }
  }

  const out = { href: location.href, cards: want.length ? want : cards,
                shared: shared.map(([g, s]) => [g, [...s]]),
                groupKeysInState: [...keys], egCodesInState: egTotal };
  const json = JSON.stringify(out, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
