/**
 * Does the any-theatre signal still read true?
 *
 * A watch that names no cinemas cannot use byvenue, so it asks each of the
 * film's listings whether its own buytickets page is selling — measured
 * 2026-09-02: 17 cinemas for Malayalam, 54 for Telugu, 2 for Hindi, same film,
 * same day. `listingSignal()` turns that into open / closed / unknown, and only
 * a transition into `open` fires an alert.
 *
 * It is the least-exercised path in the extension and the one most watches fall
 * into, since a bell inherits no cinemas unless the picker has some. Three ways
 * it can rot silently, none visible from the extension's own state:
 *   - the venue/session markers move, so a selling listing reads `closed`
 *     — a watch that never fires, which looks exactly like a film not opening;
 *   - a dead address returns something big enough to read, so it reads `open`
 *     — an alert for a film that has not opened;
 *   - the film page stops naming its other languages, so only one is watched.
 *
 *   chrome://extensions → Seat Watch → "service worker" → Console → paste
 *
 * Read-only. It fetches the same pages a check would, and sends nothing.
 */
(async () => {
  const FILTER = '';   // part of a title, or '' for every watch

  const log = (...a) => console.log('%c[any]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[any]', 'color:#d33;font-weight:bold', ...a);
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return bad('Run this in the extension\'s service worker console.');
  }

  const { releases = [], releaseState = {} } = await chrome.storage.local.get(
    ['releases', 'releaseState']);
  const mine = releases.filter((w) =>
    !FILTER || `${w.title} ${w.slug}`.toLowerCase().includes(FILTER.toLowerCase()));
  if (!mine.length) return bad('no watches to check');

  const today = () => { const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

  // The same three-valued read the worker does, inlined — a pasted script
  // cannot import release.js.
  const signalOf = (text, code) => {
    if (text.length < 2000) return { signal: 'unknown', why: 'page too small to be a listing',
                                     venues: 0, sessions: 0, bytes: text.length };
    const venues = new Set(
      [...text.matchAll(/"[Vv]enue[Cc]ode"\s*:\s*"([A-Z0-9]{3,8})"/g)].map((m) => m[1]));
    const sessions = (text.match(/"sessionId"/gi) || []).length;
    if (venues.size || sessions) {
      return { signal: 'open', why: 'venues or sessions on the page',
               venues: venues.size, sessions, bytes: text.length };
    }
    const names = text.toUpperCase().includes(String(code).toUpperCase());
    return { signal: names ? 'closed' : 'unknown',
             why: names ? 'nothing rendered, and the page names this listing'
                        : 'nothing rendered, and the page does not name this listing',
             venues: 0, sessions: 0, bytes: text.length };
  };

  const out = [];
  for (const w of mine) {
    const st = releaseState[w.id] || {};
    const codes = [w.eventCode, ...(w.variants || []).map((v) => v.eventCode)].filter(Boolean);
    const date = w.releaseDate || today();
    const rows = [];
    for (const code of codes) {
      const v = (w.variants || []).find((x) => x.eventCode === code);
      const slug = v?.slug || w.slug;
      const url = `https://in.bookmyshow.com/movies/${w.citySlug}/${slug}/buytickets/${code}/${date}`;
      try {
        const text = await (await fetch(url, { credentials: 'omit' })).text();
        const read = signalOf(text, code);
        rows.push({ code, language: v?.language || w.language || '', slug, ...read,
                    // What the worker recorded last time, so a signal that has
                    // moved since is visible rather than inferred.
                    stored: st.signals?.[code] || null });
      } catch (e) {
        rows.push({ code, slug, signal: 'error', why: String(e.message || e) });
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    log(`${w.title} — ${codes.length} listing${codes.length === 1 ? '' : 's'}, ` +
        `${w.venues?.length ? 'names cinemas (this path is not used)' : 'any theatre'}`);
    console.table(rows);

    // A page that cannot be read at all is the failure that hides: it is
    // recorded as `unknown`, which never fires and never complains.
    const unreadable = rows.filter((r) => r.signal === 'unknown' || r.signal === 'error');
    if (unreadable.length === rows.length && rows.length) {
      bad(`${w.title}: not one listing could be read — this watch cannot fire at all`);
    }
    if (codes.length === 1 && !w.venues?.length) {
      log(`${w.title}: only one listing known, so the check falls back to the film page, ` +
          'which cannot say which language opened');
    }
    const moved = rows.filter((r) => r.stored && r.stored !== r.signal);
    if (moved.length) {
      log('signal has changed since the last check:',
          moved.map((r) => `${r.code} ${r.stored} → ${r.signal}`).join(', '));
    }
    out.push({ title: w.title, id: w.id, anyTheatre: !w.venues?.length, rows });
  }

  const json = JSON.stringify(out, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
