/**
 * Phase 0 probe, service worker, round two.
 *
 * Round one asked whether Cloudflare blocks extension-origin requests and
 * answered no: both BookMyShow HTML pages returned 200 with real content. Its
 * printed conclusion said otherwise, because it folded the film-first
 * endpoint's 400 into the verdict — but that endpoint returns 400 from inside a
 * real page too, so it was never evidence about transport.
 *
 * What round one never tried is the three calls Phase 1 will actually make. All
 * of them are believed to work from here; "believed" is not good enough for the
 * load-bearing call in the feature.
 *
 *   1. chrome://extensions → Seat Watch → "service worker"
 *   2. Console → paste → Enter
 *
 * Read-only.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), context: 'service worker', probes: {} };
  const log = (...a) => console.log('%c[probe]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe]', 'color:#d33;font-weight:bold', ...a);
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) { bad('Not an extension context.'); return; }

  const today = () => { const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
  const cf = (t) => /Attention Required|cf-browser-verification|Just a moment/i.test(t || '');

  const call = async (url, credentials = 'include') => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { credentials });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* html */ }
      return { status: res.status, ms: Date.now() - t0, bytes: text.length,
               cloudflare: cf(text), json, text };
    } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e) }; }
  };
  const pause = (ms) => new Promise(r => setTimeout(r, ms));

  // ------------------------------------------------------- 1. byvenue (the one)
  log('probe 1/4 — byvenue, the call every check will make');
  {
    const url = `https://in.bookmyshow.com/api/v3/mobile/showtimes/byvenue` +
                `?dateCode=${today()}&venueCode=ALUC&regionCode=HYD`;
    // Both credential modes, because if it works without cookies the poller
    // never touches the signed-in session at all — a real privacy improvement
    // and worth knowing rather than assuming.
    const rows = {};
    for (const c of ['include', 'omit']) {
      const r = await call(url, c);
      const films = (r.json?.ShowDetails || []).flatMap(d => d.Event || [])
        .flatMap(g => (g.ChildEvents || []).map(x => ({
          code: x.EventCode, group: x.EventGroup, title: g.EventTitle })));
      rows[c] = { status: r.status, ms: r.ms, cloudflare: r.cloudflare,
                  childEvents: films.length, sample: films.slice(0, 3) };
      (r.status === 200 ? log : bad)(`  credentials:${c} → ${r.status}, ${films.length} child events`);
      await pause(1200);
    }
    R.probes.byvenue = { rows,
      verdict: rows.include.status === 200 && rows.include.childEvents
        ? (rows.omit.status === 200 && rows.omit.childEvents
            ? 'PASS — works, and works without cookies'
            : 'PASS — works with cookies')
        : 'FAIL — byvenue unusable from the service worker' };
    log('  ', R.probes.byvenue.verdict);
  }

  // ------------------------------------------------------------- 2. the regions
  log('probe 2/4 — region list');
  {
    const r = await call('https://in.bookmyshow.com/api/explore/v1/discover/regions');
    const codes = new Set((r.text || '').match(/"regionCode"\s*:\s*"([A-Z]{2,8})"/g) || []);
    R.probes.regions = { status: r.status, bytes: r.bytes, regionCodes: codes.size,
      verdict: r.status === 200 && codes.size > 5 ? 'PASS' : `FAIL — ${r.status}` };
    log(`  → ${r.status}, ${codes.size} region codes`);
    await pause(1000);
  }

  // -------------------------------------------------- 3. cinemas page + arrDates
  log('probe 3/4 — cinemas page, and whether arrDates survives');
  {
    const r = await call('https://in.bookmyshow.com/hyderabad/cinemas');
    const venues = (r.text || '').match(/"VenueCode"\s*:\s*"[A-Z0-9]{3,8}"/g) || [];
    const dates = (r.text || '').match(/"ShowDateCode"\s*:\s*"(\d{8})"/g) || [];
    R.probes.cinemas = { status: r.status, bytes: r.bytes,
      venueCodes: new Set(venues).size, showDateCodes: new Set(dates).size,
      verdict: r.status === 200 && venues.length ? 'PASS' : `FAIL — ${r.status}` };
    log(`  → ${r.status}, ${new Set(venues).size} venues, ${new Set(dates).size} distinct arrDates`);
    await pause(1000);
  }

  // ------------------------------------------- 4. film page: date + open signal
  log('probe 4/4 — film page: release date and the any-theatre marker');
  {
    const r = await call('https://in.bookmyshow.com/movies/hyderabad/irumudi/ET00487933');
    const iso = (r.text || '').match(/"releaseDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
    const ld = (r.text || '').match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
    const book = ((r.text || '').match(/Book tickets/gi) || []).length;
    const releasing = ((r.text || '').match(/Releasing on/gi) || []).length;
    R.probes.filmPage = {
      status: r.status, bytes: r.bytes,
      releaseDate: iso?.[1] || null, jsonLdDate: ld?.[1] || null,
      bookTickets: book, releasingOn: releasing,
      eg: [...new Set((r.text || '').match(/EG\d{6,}/g) || [])].slice(0, 3),
      verdict: r.status === 200 && (iso || ld) ? 'PASS' : `FAIL — ${r.status}`,
    };
    log(`  → ${r.status}, releaseDate=${iso?.[1] || '—'}, bookTickets=${book}, EG=${R.probes.filmPage.eg}`);
  }

  const ok = Object.values(R.probes).every(p => String(p.verdict).startsWith('PASS'));
  R.conclusion = ok
    ? 'Every call Phase 1 needs works from the service worker. No poller tab.'
    : 'At least one required call fails from the service worker — see the table.';

  console.log('%c\n──────────── PROBE COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([n, p]) => ({ probe: n, verdict: p.verdict })));
  console.log('%c' + R.conclusion, 'font-weight:bold;color:' + (ok ? '#1FAD3E' : '#d33'));

  self.__bmsProbe = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(self.__bmsProbe))'); }
})();
