/**
 * Probe — the any-theatre path, per language.
 *
 * Round one settled how the languages of one film relate: shared EventGroup,
 * separate EventUrl slugs. A watch that names theatres now alerts per language
 * off a single byvenue call. A watch that names none does not, and this is what
 * it needs to:
 *
 *   1. HOW do the sibling codes appear in the parent film page's markup? They
 *      are in there — round one proved the substrings are present — but the
 *      extension reads them with a URL-shaped regex, and if BookMyShow ships
 *      them as bare codes in a JSON blob instead, that regex finds nothing and
 *      an any-theatre watch never learns its own languages.
 *
 *   2. Is there a per-LANGUAGE "on sale" signal a service worker can fetch?
 *      The film page is not one: round one measured identical "Book tickets" /
 *      "Releasing on" counts on all three language pages — but all three were
 *      on sale at the time, so that measured nothing. This asks the buytickets
 *      page instead, which is per code and per date.
 *
 *   3. What does an UNOPENED listing look like? Impossible to see on this film
 *      now, so it is faked honestly: the same code on a date it is certainly
 *      not showing. If that page differs structurally from a live one, the
 *      difference is the signal.
 *
 *   1. open any https://in.bookmyshow.com/ page
 *   2. DevTools → Console → paste this whole file → Enter
 *   3. wait for "PROBE COMPLETE", then paste the copied JSON back
 *
 * It only reads. Nothing is booked, nothing is posted.
 */
(async () => {
  const FILM = {
    slug: 'im-game',
    parent: 'ET00473215',
    siblings: ['ET00511702', 'ET00511704'],
    live: '20260903',        // a date it is on sale
    dead: '20270115',        // a date nothing is showing
  };

  const R = { ranAt: new Date().toISOString(), film: FILM, probes: {} };
  const log = (...a) => console.log('%c[lang2]', 'color:#1FAD3E;font-weight:bold', ...a);

  if (location.hostname !== 'in.bookmyshow.com') {
    console.log('%c[lang2]', 'color:#d33', 'Run this on an in.bookmyshow.com tab.');
    return;
  }
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const city = (() => {
    try {
      const rgn = JSON.parse(decodeURIComponent(
        document.cookie.split('; ').find((c) => c.startsWith('rgn=')).slice(4)));
      return { code: rgn.regionCode || 'HYD', slug: rgn.regionNameSlug || 'hyderabad' };
    } catch { return { code: 'HYD', slug: 'hyderabad' }; }
  })();
  R.city = city;

  const get = async (path) => {
    try {
      const res = await fetch(path, { credentials: 'same-origin' });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } catch (e) { return { ok: false, status: 0, error: String(e.message || e), text: '' }; }
  };

  // ---- 1. how a sibling code is written into the parent page --------------
  {
    log('1/3  where the sibling codes sit in the markup');
    const page = await get(`/movies/${city.slug}/${FILM.slug}/${FILM.parent}`);
    const p = { status: page.status, bytes: page.text.length, occurrences: {} };

    for (const code of FILM.siblings) {
      const spots = [];
      let i = -1;
      while ((i = page.text.indexOf(code, i + 1)) !== -1 && spots.length < 4) {
        // A window either side, so the shape around the code is visible: an
        // href, a JSON key, a data attribute — each implies a different reader.
        spots.push(page.text.slice(Math.max(0, i - 160), i + 120).replace(/\s+/g, ' '));
      }
      p.occurrences[code] = spots;
    }

    // Does the extension's own rule find them? This is the question that
    // decides whether an any-theatre watch can learn its languages at all.
    const stemRe = new RegExp(
      `/movies/[a-z0-9-]+/(${FILM.slug}(?:-[a-z]+)?)/(?:buytickets/)?(ET\\d{6,})`, 'gi');
    p.urlShaped = [...new Set([...page.text.matchAll(stemRe)].map((m) => `${m[1]}/${m[2]}`))];
    // And the looser question: does the page contain the language slugs at all?
    p.languageSlugs = [...new Set(
      (page.text.match(new RegExp(`${FILM.slug}-[a-z]+`, 'g')) || []))].slice(0, 12);

    p.verdict = p.urlShaped.length > 1
      ? `PASS — ${p.urlShaped.length} listings readable as addresses: ${p.urlShaped.join(', ')}`
      : 'FAIL — the codes are present but not as addresses; linkedListings finds nothing';
    R.probes.markup = p;
    log('  ', p.verdict, '| slugs seen:', p.languageSlugs);
  }
  await pause(900);

  // ---- 2 & 3. the buytickets page, live and dead -------------------------
  {
    log('2/3  buytickets per code, on a live date and a dead one');
    const shape = (html) => ({
      bytes: html.length,
      // Structural markers: a listing with no shows cannot name a cinema.
      venueCodes: [...new Set((html.match(/"[Vv]enueCode"\s*:\s*"([A-Z0-9]{3,8})"/g) || []))].length,
      sessionIds: (html.match(/"sessionId"/gi) || []).length,
      showTimes: (html.match(/"showTime(?:Code)?"/gi) || []).length,
      // Textual markers, for comparison with what the extension reads today.
      bookTickets: (html.match(/Book tickets/gi) || []).length,
      releasingOn: (html.match(/Releasing on/gi) || []).length,
      noShows: /No shows|not available|Sorry|no longer/i.test(html),
      title: /<title>([^<]{2,120})</.exec(html)?.[1] || null,
    });

    const p = { rows: [] };
    const targets = [
      { code: FILM.parent, slug: FILM.slug, date: FILM.live, label: 'Malayalam · live' },
      { code: FILM.siblings[0], slug: `${FILM.slug}-telugu`, date: FILM.live, label: 'Telugu · live' },
      { code: FILM.siblings[1], slug: `${FILM.slug}-hindi`, date: FILM.live, label: 'Hindi · live' },
      { code: FILM.parent, slug: FILM.slug, date: FILM.dead, label: 'Malayalam · dead date' },
      // The original's slug with a sibling's code — the address the extension
      // used to build. Does BookMyShow even serve it?
      { code: FILM.siblings[0], slug: FILM.slug, date: FILM.live, label: 'Telugu code under the original slug' },
    ];

    for (const t of targets) {
      const url = `/movies/${city.slug}/${t.slug}/buytickets/${t.code}/${t.date}`;
      const res = await get(url);
      p.rows.push({ ...t, url, status: res.status, ...(res.ok ? shape(res.text) : { error: res.error }) });
      await pause(800);
    }

    const live = p.rows.filter((r) => r.label.includes('live') && r.status === 200);
    const dead = p.rows.find((r) => r.label.includes('dead date'));
    const sep = (key) =>
      live.length && dead && live.every((l) => (l[key] || 0) > 0) && !(dead[key] || 0);
    p.discriminators = ['venueCodes', 'sessionIds', 'showTimes'].filter(sep);
    p.verdict = p.discriminators.length
      ? `PASS — ${p.discriminators.join(', ')} separate a selling listing from a dead one`
      : 'FAIL — nothing structural separates them; a per-language signal needs another source';
    R.probes.buytickets = p;
    log('  ', p.verdict);
    console.table(p.rows.map(({ label, status, bytes, venueCodes, sessionIds, showTimes, noShows }) =>
      ({ label, status, bytes, venueCodes, sessionIds, showTimes, noShows })));
  }

  console.log('%c\n──────────── PROBE COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([n, x]) => ({ probe: n, verdict: x.verdict })));
  window.__bmsProbeLang2 = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbeLang2))'); }
})();
