/**
 * Why is a watch alerting for the wrong film?
 *
 * A release alert names the WATCH's title but takes its language and its link
 * from the listing that matched. So "Sardar 2 (Hindi)" linking to Mirzapur
 * means a Mirzapur listing matched the Sardar 2 watch — the identity of the
 * watch is wrong, not the link.
 *
 * A watch matches on identity in two steps (release.js `matchesFilm`):
 *   - if it knows a group, only the group decides;
 *   - if it knows none, any of its event codes decides.
 * So a wrong match means either the group is another film's, or another film's
 * event code was adopted as one of ours. This says which, and where it came from.
 *
 *   chrome://extensions → Seat Watch → "service worker" → Console → paste
 *   optionally set FILTER below to part of the title
 *
 * Read-only: it reads storage and re-fetches the film page the watch was built
 * from. Nothing is written, nothing is cleared.
 */
(async () => {
  const FILTER = '';   // e.g. 'sardar' — empty checks every watch

  const log = (...a) => console.log('%c[watch]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[watch]', 'color:#d33;font-weight:bold', ...a);
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return bad('Run this in the extension\'s service worker console.');
  }

  const { releases = [], releaseState = {}, city } = await chrome.storage.local.get(
    ['releases', 'releaseState', 'city']);
  const mine = releases.filter((w) =>
    !FILTER || `${w.title} ${w.slug}`.toLowerCase().includes(FILTER.toLowerCase()));
  if (!mine.length) return bad('No watches match. Stored watches:', releases.map((w) => w.title));

  // The same two reads the extension does, inlined — a pasted script cannot
  // import release.js, and these are the two that decide identity.
  const groupCounts = (html) => {
    const counts = new Map();
    for (const eg of html.match(/EG\d{6,}/g) || []) counts.set(eg, (counts.get(eg) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  const switcherCodes = (html) => {
    const out = new Map();
    for (const m of html.matchAll(
      /"language"\s*:\s*"([A-Za-z][A-Za-z ()-]{1,23})"\s*,\s*"formats"\s*:\s*\[([^\]]{0,4000})\]/g)) {
      for (const f of m[2].matchAll(/"eventCode"\s*:\s*"(ET\d{6,})"/g)) {
        if (!out.has(f[1])) out.set(f[1].toUpperCase(), m[1].trim());
      }
    }
    return out;
  };
  // What the film page says each code's own address is, so an adopted code can
  // be checked against the film it actually belongs to.
  const addressOf = (html, code) =>
    new RegExp(`/movies/(?:[a-z0-9-]+/)?([a-z0-9-]+)/(?:buytickets/)?${code}`, 'i')
      .exec(html)?.[1] || null;

  const out = [];
  for (const w of mine) {
    const st = releaseState[w.id] || {};
    const report = {
      title: w.title, id: w.id, slug: w.slug,
      eventCode: w.eventCode, group: w.group || null,
      matchesOn: w.group || (w.variants || []).some((v) => v.group) ? 'group' : 'event codes',
      variants: (w.variants || []).map((v) =>
        ({ eventCode: v.eventCode, group: v.group, language: v.language, slug: v.slug, via: v.via })),
      alreadySeen: Object.keys(st.seen || {}),
      lastCheck: st.last || null,
      // What actually went out, and on what evidence. Empty on a watch that was
      // removed and re-added since — the state goes with the bell, so a rebuilt
      // watch cannot explain an alert its predecessor sent.
      alertsSent: st.alerts || [],
    };

    const url = `https://in.bookmyshow.com/movies/${w.citySlug || city?.slug}/${w.slug}/${w.eventCode}`;
    try {
      const html = await (await fetch(url, { credentials: 'omit' })).text();
      const egs = groupCounts(html);
      const codes = switcherCodes(html);
      report.filmPage = {
        url,
        groupsOnPage: egs.slice(0, 6).map(([eg, n]) => `${eg} ×${n}`),
        // addRelease takes the most frequent EG when the card carried none. If
        // the page's top group is not the watch's, one of them is wrong.
        topGroup: egs[0]?.[0] || null,
        watchGroupAppearsOnItsOwnPage: w.group ? egs.some(([eg]) => eg === w.group) : null,
        switcherCodes: [...codes].map(([c, lang]) => `${c} ${lang} → /${addressOf(html, c) || '?'}`),
      };
      // The check that matters: a code this watch answers to whose address on
      // the page is a different film's.
      const stem = String(w.slug || '').replace(
        /-(hindi|telugu|tamil|malayalam|kannada|english|marathi|bengali|punjabi|gujarati)$/, '');
      report.suspects = [w.eventCode, ...(w.variants || []).map((v) => v.eventCode)]
        .filter(Boolean)
        .map((c) => ({ code: c, address: addressOf(html, c) }))
        .filter((x) => x.address && !x.address.startsWith(stem));
    } catch (e) {
      report.filmPage = { url, error: String(e.message || e) };
    }
    out.push(report);
  }

  for (const r of out) {
    log(`${r.title} — matches on ${r.matchesOn}`);
    console.table(r.variants);
    if (r.suspects?.length) {
      bad('codes this watch answers to that belong to another film:', r.suspects);
    } else {
      log('every code this watch answers to lives under its own slug');
    }
    if (r.filmPage?.groupsOnPage) log('groups on its page:', r.filmPage.groupsOnPage.join(', '));
    if (r.alertsSent?.length) {
      log('alerts sent:');
      console.table(r.alertsSent);
      // The line that names the culprit: a row carrying this film's group is
      // BookMyShow's filing; a row that matched on a code is this extension's
      // adoption. They want opposite fixes.
      for (const a of r.alertsSent) {
        if (a.rowGroup && a.watchGroup && a.rowGroup !== a.watchGroup) {
          bad(`alert for ${a.eventCode} matched on ${a.why} with group ${a.rowGroup}, ` +
              `but the watch's group is ${a.watchGroup}`);
        }
      }
    } else if (r.alreadySeen?.length === 0) {
      log('no alerts recorded — this watch has never fired, or was re-added since');
    }
  }
  const json = JSON.stringify(out, null, 2);
  try { copy(json); log('PROBE COMPLETE — copied to clipboard'); }
  catch { console.log(json); log('PROBE COMPLETE — copy the JSON above'); }
  return out;
})();
