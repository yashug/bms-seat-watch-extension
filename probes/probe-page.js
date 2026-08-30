/**
 * Phase 0 probe — page context.
 *
 * Everything the release-watch feature wants to know sits behind Cloudflare,
 * which 403s anything that isn't a real browser holding a real clearance
 * cookie. curl can't answer these questions and neither can a test runner, so
 * this runs where the answers actually live: the console of a tab already on
 * in.bookmyshow.com.
 *
 *   1. open any https://in.bookmyshow.com/ page
 *   2. DevTools → Console → paste this whole file → Enter
 *   3. wait for "PROBE COMPLETE", then paste the copied JSON back
 *
 * It only reads. Nothing is booked, nothing is posted, no member data is
 * touched — the one cookie it looks at is `rgn`, which holds the city.
 */
(async () => {
  const R = {
    ranAt: new Date().toISOString(),
    href: location.href,
    probes: {},
    notes: [],
  };

  const log = (...a) => console.log('%c[probe]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe]', 'color:#d33;font-weight:bold', ...a);

  if (location.hostname !== 'in.bookmyshow.com') {
    bad('Run this on an in.bookmyshow.com tab. Current host:', location.hostname);
    return;
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * Same-origin GET. Always keeps the raw text alongside any parse, because a
   * Cloudflare interstitial arrives as HTML on calls that expected JSON — and
   * a probe that reported those as "no data" instead of "blocked" would send
   * the design down the wrong branch.
   */
  const get = async (path, as = 'text') => {
    const started = performance.now();
    try {
      const res = await fetch(path, { credentials: 'same-origin' });
      const text = await res.text();
      let json = null;
      if (as === 'json') { try { json = JSON.parse(text); } catch { /* not JSON */ } }
      return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - started),
               text, body: as === 'json' ? json : text };
    } catch (e) {
      return { ok: false, status: 0, ms: Math.round(performance.now() - started),
               error: String(e.message || e), text: '', body: null };
    }
  };

  /** Cloudflare's interstitial is HTML with a giveaway title, whatever the code. */
  const blocked = (r) => /Attention Required|cf-browser-verification|Just a moment/i.test(r.text || '');

  /** The __NEXT_DATA__ / state blob out of a fetched HTML document. */
  const jsonFromHtml = (html) => {
    const out = [];
    const re = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch { /* not plain JSON */ } }
    if (!out.length) {
      // Older BMS pages assign to a global instead of using a typed script tag.
      const at = html.search(/__(INITIAL|PRELOADED|NUXT)_STATE__\s*=\s*\{/);
      if (at >= 0) {
        const open = html.indexOf('{', at);
        let depth = 0, str = false, esc = false;
        for (let i = open; i < html.length; i++) {
          const c = html[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') str = !str;
          if (str) continue;
          if (c === '{') depth++;
          else if (c === '}' && --depth === 0) {
            try { out.push(JSON.parse(html.slice(open, i + 1))); } catch { /* truncated */ }
            break;
          }
        }
      }
    }
    return out;
  };

  /**
   * Walks a parsed blob collecting every object that looks like the thing we
   * name. Deliberately shape-based rather than path-based: BMS renames keys
   * between releases, and the point of a probe is to find out what the keys are
   * called today, not to assert what they were called last time.
   */
  const collect = (node, test, out = [], depth = 0, seen = new WeakSet()) => {
    if (!node || typeof node !== 'object' || depth > 14) return out;
    if (seen.has(node)) return out;
    seen.add(node);
    if (!Array.isArray(node) && test(node)) out.push(node);
    for (const v of Array.isArray(node) ? node : Object.values(node)) collect(v, test, out, depth + 1, seen);
    return out;
  };

  const uniqBy = (arr, key) => {
    const m = new Map();
    for (const x of arr) if (!m.has(key(x))) m.set(key(x), x);
    return [...m.values()];
  };

  // ------------------------------------------------------------------ region
  log('probe 1/6 — region code');
  {
    let code = null, from = null;
    const raw = document.cookie.split('; ').find(c => c.startsWith('rgn='));
    if (raw) {
      try {
        const rgn = JSON.parse(decodeURIComponent(raw.slice(4)));
        code = rgn.regionCode || rgn.regionCodeSlug?.toUpperCase() || null;
        if (code) from = 'rgn cookie';
        R.probes.region = { ...R.probes.region, cookieFields: Object.keys(rgn), cookie: rgn };
      } catch { R.notes.push('rgn cookie present but not JSON'); }
    }
    if (!code) {
      const m = document.documentElement.innerHTML.match(/"regionCode"\s*:\s*"([A-Za-z]{2,6})"/);
      if (m) { code = m[1].toUpperCase(); from = 'page html'; }
    }
    R.probes.region = { ...R.probes.region, code, from, verdict: code ? 'PASS' : 'FAIL' };
    (code ? log : bad)('  region:', code, from ? `(${from})` : '');
  }
  const REGION = R.probes.region.code;

  // -------------------------------------------------- upcoming movies listing
  log('probe 2/6 — upcoming movies listing');
  {
    const slug = (R.probes.region.cookie?.regionSlug ||
                  R.probes.region.cookie?.regionName || 'hyderabad')
                  .toString().toLowerCase().replace(/\s+/g, '-');
    const path = `/explore/upcoming-movies-${slug}`;
    const res = await get(path);
    const p = { path, status: res.status, ms: res.ms, blocked: blocked(res) };

    if (res.ok && !p.blocked) {
      const html = res.text;
      const blobs = jsonFromHtml(html);
      p.foundStateBlob = blobs.length > 0;

      // What we need per card: the event code (the whole feature keys on it),
      // a title, and the release date that decides when polling starts.
      const cards = uniqBy(
        blobs.flatMap(b => collect(b, (o) =>
          typeof o.eventCode === 'string' && /^ET\w+$/.test(o.eventCode))),
        (o) => o.eventCode);

      p.cardsInState = cards.length;
      p.sampleCard = cards[0] ? Object.fromEntries(
        Object.entries(cards[0]).filter(([, v]) => typeof v !== 'object').slice(0, 25)) : null;
      p.cardKeys = cards[0] ? Object.keys(cards[0]) : [];

      // A date-ish field is the one thing that might not be there. Name every
      // candidate so the parser can be written against real key names.
      const dateKeys = new Set();
      for (const c of cards) for (const [k, v] of Object.entries(c)) {
        if (typeof v === 'string' && /date|release/i.test(k) && /\d/.test(v)) dateKeys.add(`${k}=${v}`);
      }
      p.dateCandidates = [...dateKeys].slice(0, 20);

      // Regex over raw HTML as the floor: if the state blob is ever reshaped,
      // this is what a fallback parser would have to work with.
      const rawCodes = [...new Set((html.match(/ET\d{6,}/g) || []))];
      p.eventCodesInRawHtml = rawCodes.length;
      p.sampleCodes = rawCodes.slice(0, 12);

      p.verdict = cards.length || rawCodes.length ? 'PASS' : 'FAIL';
      log(`  ${cards.length} cards in state, ${rawCodes.length} ET codes in raw html`);
      if (p.dateCandidates.length) log('  date fields:', p.dateCandidates.slice(0, 5));
      else R.notes.push('no release-date field on upcoming cards — dormancy gate needs another source');
    } else {
      p.verdict = 'FAIL';
      bad(`  ${path} → ${res.status}${p.blocked ? ' (cloudflare)' : ''}`);
    }
    R.probes.upcoming = p;
  }

  // ------------------------------------------------------------ cinemas list
  log('probe 3/6 — city cinemas list');
  {
    const slug = (R.probes.region.cookie?.regionSlug ||
                  R.probes.region.cookie?.regionName || 'hyderabad')
                  .toString().toLowerCase().replace(/\s+/g, '-');
    const path = `/${slug}/cinemas`;
    const res = await get(path);
    const p = { path, status: res.status, ms: res.ms, blocked: blocked(res) };

    if (res.ok && !p.blocked) {
      const html = res.text;
      const blobs = jsonFromHtml(html);

      // The venue picker is only worth building if codes come with the names.
      // Names alone would force substring matching, which is the fallback we
      // deliberately chose against.
      const venues = uniqBy(
        blobs.flatMap(b => collect(b, (o) => {
          const code = o.venueCode || o.VenueCode || o.code;
          const name = o.venueName || o.VenueName || o.name || o.title;
          return typeof code === 'string' && /^[A-Z0-9]{3,8}$/.test(code) &&
                 typeof name === 'string' && name.length > 2;
        })),
        (o) => o.venueCode || o.VenueCode || o.code);

      p.venuesInState = venues.length;
      p.sampleVenues = venues.slice(0, 8).map(v => ({
        code: v.venueCode || v.VenueCode || v.code,
        name: v.venueName || v.VenueName || v.name || v.title,
        area: v.subRegionName || v.area || v.regionName || null,
      }));
      p.venueKeys = venues[0] ? Object.keys(venues[0]) : [];

      // Venue codes also show up in cinema hrefs; a usable fallback.
      const hrefCodes = [...new Set((html.match(/\/cinemas\/[^"'\s]+\/([A-Z0-9]{3,8})\b/g) || []))];
      p.venueCodesInHrefs = hrefCodes.length;
      p.sampleHrefs = hrefCodes.slice(0, 6);

      // The city dropdown you spotted — this is what the settings selector needs.
      const cities = uniqBy(
        blobs.flatMap(b => collect(b, (o) =>
          typeof o.regionCode === 'string' && /^[A-Z]{2,6}$/.test(o.regionCode) &&
          typeof (o.regionName || o.regionSlug) === 'string')),
        (o) => o.regionCode);
      p.citiesInState = cities.length;
      p.sampleCities = cities.slice(0, 8).map(c => ({
        code: c.regionCode, name: c.regionName || null, slug: c.regionSlug || null }));

      p.verdict = (venues.length || hrefCodes.length) ? 'PASS' : 'PARTIAL';
      log(`  ${venues.length} venues in state, ${hrefCodes.length} codes in hrefs, ${cities.length} cities`);
      if (!venues.length && !hrefCodes.length) {
        R.notes.push('no venue codes on the cinemas page — venue picker may need name matching after all');
      }
      if (!cities.length) R.notes.push('city dropdown not in page state — city list needs another source');
    } else {
      p.verdict = 'FAIL';
      bad(`  ${path} → ${res.status}${p.blocked ? ' (cloudflare)' : ''}`);
    }
    R.probes.cinemas = p;
  }

  // ------------------------------------------------ the endpoint, both states
  /**
   * The load-bearing question. A release watch fires on "did any venue card
   * come back", so the not-open answer has to be an empty success. If an
   * unopened film 404s or 500s instead, "not open yet" and "the endpoint moved"
   * become indistinguishable and the whole design needs a different signal.
   */
  const askShowtimes = async (eventCode, dateCode) => {
    const q = new URLSearchParams({
      etCodes: '*', dateCode, isDesktop: 'true', regionCode: REGION || '',
      xLocationShared: 'false', memberId: '', lsId: '', subCode: '', appCode: 'WEB',
      refEventCode: eventCode,
    });
    const path = `/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`;
    const res = await get(path, 'json');
    const body = res.body;
    const widgets = body?.data?.showtimeWidgets || [];
    const cards = widgets.flatMap(w => (w?.data || []).flatMap(g => g?.data || []))
      .filter(c => c?.additionalData?.venueCode);
    const sections = cards.flatMap(c => c.showtimesSections || []);
    return {
      eventCode, dateCode, status: res.status, ms: res.ms,
      blockedByCloudflare: blocked(res),
      parsedAsJson: body != null,
      answeredFor: body?.data?.additionalData?.dateCode ?? null,
      title: body?.data?.header?.title?.text ?? null,
      widgets: widgets.length,
      venueCards: cards.length,
      sessions: sections.reduce((n, s) => n + (s.showtimes?.length || 0), 0),
      // etCodes=* is supposed to bring every language variant back in one call.
      // If it does, no language-dropdown scrape is needed for detection.
      languageEventCodes: uniqBy(
        sections.map(s => ({
          eventCode: s?.additionalData?.eventCode,
          label: s?.text?.[0]?.components?.[0]?.text || '',
        })).filter(x => x.eventCode), (x) => x.eventCode),
      sampleVenues: cards.slice(0, 5).map(c => ({
        code: c.additionalData.venueCode, name: c.additionalData.venueName || null })),
      errorish: body?.error || body?.message || body?.data?.error || null,
    };
  };

  log('probe 4/6 — endpoint on an OPEN movie');
  {
    // Pick a film that is definitely showing today: whatever the region's own
    // now-showing list offers, so this needs no hardcoded code that will rot.
    const slug = (R.probes.region.cookie?.regionSlug ||
                  R.probes.region.cookie?.regionName || 'hyderabad')
                  .toString().toLowerCase().replace(/\s+/g, '-');
    // Several listings, because any single path is one BMS reshuffle away from
    // 404 and this probe should not fail over a broken sample rather than a
    // broken endpoint. Codes on the upcoming list are excluded — the whole
    // point is a film that is definitely already selling.
    const upcoming = new Set(R.probes.upcoming?.sampleCodes || []);
    const sources = [`/explore/movies-${slug}`, '/explore/movies', `/explore/home-${slug}`, '/'];
    let openCode = null, from = null, candidates = [];
    for (const path of sources) {
      const page = await get(path);
      if (!page.ok || blocked(page)) continue;
      const codes = [...new Set((page.text.match(/ET\d{6,}/g) || []))].filter(c => !upcoming.has(c));
      if (!codes.length) continue;
      openCode = codes[0]; from = path; candidates = codes.slice(0, 8);
      break;
    }
    R.probes.openPick = { from, candidates, triedSources: sources };
    if (!openCode) {
      R.probes.showtimesOpen = { verdict: 'SKIP', why: 'no now-showing event code found' };
      bad('  skipped — could not find a now-showing film');
    } else {
      const p = await askShowtimes(openCode, today());
      p.verdict = p.status === 200 && p.venueCards > 0 ? 'PASS'
                : p.status === 200 ? 'INCONCLUSIVE (200 but no venues — may genuinely have no shows today)'
                : 'FAIL';
      R.probes.showtimesOpen = p;
      log(`  ${openCode} → ${p.status}, ${p.venueCards} venues, ${p.sessions} sessions, ` +
          `${p.languageEventCodes.length} language codes`);
      if (p.languageEventCodes.length > 1) {
        log('  languages in one call:', p.languageEventCodes.map(x => x.label || x.eventCode));
      }
    }
  }

  log('probe 5/6 — endpoint on an UNOPENED movie');
  {
    const codes = R.probes.upcoming?.sampleCodes || [];
    const openTitleCodes = new Set([R.probes.showtimesOpen?.eventCode].filter(Boolean));
    const results = [];
    // Try a few: some "upcoming" films have in fact already opened booking,
    // which is exactly the state we are trying to detect and would give a
    // false read if we only sampled one.
    for (const code of codes.filter(c => !openTitleCodes.has(c)).slice(0, 4)) {
      const p = await askShowtimes(code, today());
      results.push(p);
      log(`  ${code} → ${p.status}, ${p.venueCards} venues` +
          (p.errorish ? `, error=${JSON.stringify(p.errorish).slice(0, 80)}` : ''));
      await new Promise(r => setTimeout(r, 1200));   // don't look like a scraper
    }
    const empties = results.filter(r => r.status === 200 && r.venueCards === 0);
    R.probes.showtimesUnopened = {
      tried: results.length,
      results,
      verdict: !results.length ? 'SKIP'
        : empties.length ? 'PASS — unopened answers 200 with zero venue cards'
        : results.every(r => r.venueCards > 0) ? 'INCONCLUSIVE — every sampled film is already open'
        : 'FAIL — unopened does not answer 200/empty',
    };
    log('  verdict:', R.probes.showtimesUnopened.verdict);
  }

  // ------------------------------------------------------- venue-first axis
  /**
   * The other way round. `byvenue` answers "everything showing at this cinema
   * on this date", so a release watch restricted to chosen theatres can ask one
   * question per theatre instead of one per film — and for somebody watching
   * many films at two cinemas that is the cheaper axis by a wide margin.
   *
   * It carries one asymmetry that decides how it can be used. The film-first
   * endpoint is handed `refEventCode` and hands back every sibling language
   * code, so it resolves the code family on its own. `byvenue` only reports the
   * per-language `ChildEvent.EventCode`s it happens to be showing — and before
   * booking opens there is no response to learn the family from. So matching
   * has to fall back to the title, and this measures whether titles come back
   * clean enough to match on.
   */
  log('probe 6/6 — venue-first endpoint (byvenue)');
  {
    const venue = R.probes.cinemas?.sampleVenues?.[0];
    if (!venue?.code || !REGION) {
      R.probes.byVenue = { verdict: 'SKIP', why: !REGION ? 'no region code' : 'no venue code from the cinemas page' };
      bad('  skipped —', R.probes.byVenue.why);
    } else {
      const path = `/api/v3/mobile/showtimes/byvenue` +
        `?dateCode=${encodeURIComponent(today())}` +
        `&venueCode=${encodeURIComponent(venue.code)}` +
        `&regionCode=${encodeURIComponent(REGION)}`;
      const res = await get(path, 'json');
      const body = res.body;
      const days = body?.ShowDetails || [];
      const films = [];
      for (const day of days) {
        for (const group of day.Event || []) {
          for (const child of group.ChildEvents || []) {
            films.push({
              eventCode: child.EventCode || null,
              title: group.EventTitle || child.EventName || null,
              language: child.EventLanguage || '',
              shows: (child.ShowTimes || []).length,
            });
          }
        }
      }
      const p = {
        path: path.split('?')[0], venue, status: res.status, ms: res.ms,
        blockedByCloudflare: blocked(res),
        parsedAsJson: body != null,
        topLevelKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [],
        days: days.length,
        childEvents: films.length,
        sample: films.slice(0, 10),
        // Two films of the same title in different languages must come back as
        // separate codes sharing a title, or title matching cannot work.
        distinctTitles: [...new Set(films.map(f => f.title).filter(Boolean))].length,
        distinctCodes: [...new Set(films.map(f => f.eventCode).filter(Boolean))].length,
      };
      p.titlesUsableForMatching = films.length > 0 && films.every(f => f.title && f.title.trim().length > 1);
      p.verdict = res.status === 200 && films.length ? 'PASS'
                : res.status === 200 ? 'INCONCLUSIVE — 200 but nothing showing at this venue today'
                : p.blockedByCloudflare ? 'FAIL — cloudflare'
                : `FAIL — HTTP ${res.status}`;
      R.probes.byVenue = p;
      log(`  ${venue.code} → ${p.status}, ${p.childEvents} child events, ` +
          `${p.distinctTitles} titles / ${p.distinctCodes} codes`);
      if (!p.titlesUsableForMatching && films.length) {
        R.notes.push('byvenue titles are missing or blank — venue-first matching would need the code family instead');
      }
      if (p.distinctCodes > p.distinctTitles) {
        log('  confirms language variants share a title under distinct codes — title matching viable');
      }
    }
  }

  // ----------------------------------------------------------------- summary
  console.log('%c\n──────────── PROBE COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([name, p]) => ({
    probe: name, verdict: p.verdict || '—', status: p.status ?? '',
  })));
  if (R.notes.length) { console.log('%cnotes:', 'font-weight:bold'); R.notes.forEach(n => console.log('  •', n)); }

  window.__bmsProbe = R;
  const json = JSON.stringify(R, null, 2);
  try { copy(json); console.log('Full report copied to clipboard — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbe))'); }
})();
