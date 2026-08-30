/**
 * Phase 0 probe, round three — must run ON A BUYTICKETS PAGE.
 *
 *   https://in.bookmyshow.com/movies/hyderabad/irumudi/buytickets/ET00487933/20260826
 *
 * Round two proved the film-first endpoint rejects even its own arguments
 * replayed verbatim, memberId and lsId included. Params are therefore not the
 * variable. The one thing that differed from the working case in content.js is
 * where the call was made from — the endpoint is only ever called from a
 * buytickets page there, and round two called it from the explore home page.
 *
 * If that is the whole story, the question immediately becomes how tightly it
 * is scoped, because that is what sets the cost of a film-first check:
 *
 *   any buytickets page works   → one parked tab serves every watched film
 *   only this film's page works → a navigation per film per check, which is
 *                                 expensive enough to drop the axis for
 *                                 anything but the any-theatre case
 *
 * Also settles whether an EG group code can replace title matching on the
 * venue-first axis, which is the one soft spot left in that design.
 *
 * Read-only.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), href: location.href, probes: {}, notes: [] };
  const log = (...a) => console.log('%c[probe3]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe3]', 'color:#d33;font-weight:bold', ...a);

  const ctx = location.pathname.match(/\/movies\/([^/]+)\/[^/]+\/buytickets\/(ET\w+)\/(\d{8})/);
  if (!ctx) {
    bad('Not on a buytickets page. Open this, then re-run:');
    bad('https://in.bookmyshow.com/movies/hyderabad/irumudi/buytickets/ET00487933/20260826');
    return;
  }
  const [, regionSlug, PAGE_CODE, DATE] = ctx;
  R.page = { regionSlug, eventCode: PAGE_CODE, date: DATE };
  log('on buytickets for', PAGE_CODE, DATE);

  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const get = async (path, as = 'text') => {
    try {
      const res = await fetch(path, { credentials: 'same-origin' });
      const text = await res.text();
      let json = null;
      if (as === 'json') { try { json = JSON.parse(text); } catch { /* */ } }
      return { ok: res.ok, status: res.status, text, body: as === 'json' ? json : text };
    } catch (e) { return { ok: false, status: 0, error: String(e.message || e), text: '', body: null }; }
  };
  const walk = (node, visit, depth = 0, seen = new WeakSet()) => {
    if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) visit(node);
    for (const v of Object.values(node)) walk(v, visit, depth + 1, seen);
  };

  const REGION = (() => {
    const raw = document.cookie.split('; ').find(c => c.startsWith('rgn='));
    try { return JSON.parse(decodeURIComponent(raw.slice(4))).regionCode; } catch { return 'HYD'; }
  })();

  const askFilm = async (etCodes, dateCode, extra = {}) => {
    const q = new URLSearchParams({
      etCodes, dateCode, isDesktop: 'true', regionCode: REGION,
      xLocationShared: 'false', memberId: '', lsId: '', subCode: '', appCode: 'WEB', ...extra,
    });
    const r = await get(`/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`, 'json');
    const cards = (r.body?.data?.showtimeWidgets || [])
      .flatMap(w => (w?.data || []).flatMap(g => g?.data || []))
      .filter(c => c?.additionalData?.venueCode);
    return {
      status: r.status, venueCards: cards.length,
      title: r.body?.data?.header?.title?.text ?? null,
      errorCode: r.body?.metadata?.error?.errorCode ?? null,
      sampleVenues: cards.slice(0, 4).map(c => c.additionalData.venueCode),
    };
  };

  // ================================================ 1. does the referer matter
  log('probe 1/4 — the same call, made from here');
  {
    const own = await askFilm(PAGE_CODE, DATE);
    log(`  this page's own film → ${own.status}, ${own.venueCards} venues` +
        (own.errorCode ? ` (${own.errorCode})` : ''));
    R.probes.fromBuytickets = {
      ...own,
      verdict: own.status === 200 && own.venueCards
        ? 'PASS — the endpoint works from a buytickets page; page context was the missing variable'
        : own.status === 200 ? 'PARTIAL — 200 but no venue cards'
        : `FAIL — still ${own.status}${own.errorCode ? ' ' + own.errorCode : ''}, page context is not the variable`,
    };
    (own.status === 200 ? log : bad)('  ', R.probes.fromBuytickets.verdict);
  }

  // ============================================== 2. how tightly is it scoped
  /**
   * The architecture question. Asking about a DIFFERENT film from this page
   * separates "any BMS listing page unlocks the endpoint" from "the page must
   * be for the film being asked about".
   */
  log('probe 2/4 — asking about a different film from this page');
  {
    const bv = await get(`/api/v3/mobile/showtimes/byvenue?dateCode=${DATE}` +
                         `&venueCode=ALUC&regionCode=${REGION}`, 'json');
    const others = (bv.body?.ShowDetails || [])
      .flatMap(d => d.Event || [])
      .flatMap(g => (g.ChildEvents || []).map(c => c.EventCode))
      .filter(c => c && c !== PAGE_CODE);
    const other = others[0] || null;
    R.probes.crossFilm = { triedCode: other };
    if (!other) {
      R.probes.crossFilm.verdict = 'SKIP — no second film selling at ALUC today';
      bad('  skipped — nothing else selling to test against');
    } else {
      const r = await askFilm(other, DATE);
      log(`  ${other} → ${r.status}, ${r.venueCards} venues` + (r.errorCode ? ` (${r.errorCode})` : ''));
      R.probes.crossFilm = {
        ...R.probes.crossFilm, ...r,
        verdict: r.status === 200 && r.venueCards
          ? 'PASS — any buytickets page unlocks it; ONE parked tab can serve every watched film'
          : `FAIL — scoped to this page's film; film-first costs a navigation per film (${r.status}${r.errorCode ? ' ' + r.errorCode : ''})`,
      };
      (r.status === 200 ? log : bad)('  ', R.probes.crossFilm.verdict);
    }
    await pause(1200);
  }

  // ====================================== 3. what the shipped extension does
  /**
   * The extension is installed and has already scanned this page. Its own trace
   * says which source actually answered — direct evidence about whether the
   * endpoint path carries production traffic or whether the fallbacks have been
   * quietly doing the work all along.
   */
  log('probe 3/4 — the extension\'s own trace for this page');
  {
    let trace = null;
    try { trace = typeof window.__bmsSeatWatch === 'function' ? window.__bmsSeatWatch() : null; } catch { /* */ }
    R.probes.extensionTrace = trace
      ? { ...trace, verdict: `source = ${trace.source ?? 'unknown'}` }
      : { verdict: 'SKIP — extension not present on this page (is it enabled?)' };
    log('  ', R.probes.extensionTrace.verdict);
    if (trace) log('  ', trace);
  }

  // ================================ 4. can a group code replace title matching
  /**
   * Venue-first matching currently leans on the film's title, because byvenue
   * reports only per-language child codes and a watch added before booking
   * opens has no way to learn the code family. The upcoming cards carry an
   * `event_group` EG code. If byvenue or this page carries the same EG code,
   * matching becomes exact and the title heuristic can go.
   */
  log('probe 4/4 — is there an EG group code to match on');
  {
    const p = {};
    const bv = await get(`/api/v3/mobile/showtimes/byvenue?dateCode=${DATE}` +
                         `&venueCode=ALUC&regionCode=${REGION}`, 'json');
    const events = (bv.body?.ShowDetails || []).flatMap(d => d.Event || []);
    p.eventKeys = events[0] ? Object.keys(events[0]) : [];
    p.childKeys = events[0]?.ChildEvents?.[0] ? Object.keys(events[0].ChildEvents[0]) : [];
    p.egInByVenue = [...new Set((JSON.stringify(bv.body || {}).match(/EG\d{6,}/g) || []))].slice(0, 10);
    p.sampleEvent = events[0] ? Object.fromEntries(
      Object.entries(events[0]).filter(([, v]) => typeof v !== 'object').slice(0, 20)) : null;
    p.sampleChild = events[0]?.ChildEvents?.[0] ? Object.fromEntries(
      Object.entries(events[0].ChildEvents[0]).filter(([, v]) => typeof v !== 'object').slice(0, 25)) : null;

    // And on this page: the language family plus any EG code beside it.
    p.egOnThisPage = [...new Set((document.documentElement.innerHTML.match(/EG\d{6,}/g) || []))].slice(0, 10);
    const codes = new Set();
    walk(window.__NEXT_DATA__ || {}, (o) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && /^ET\d{6,}$/.test(v)) codes.add(v);
        if (typeof v === 'string' && /^EG\d{6,}$/.test(v)) codes.add(v);
      }
    });
    p.codesOnThisPage = [...codes].slice(0, 15);

    p.verdict = p.egInByVenue.length ? 'PASS — byvenue carries EG codes; exact group matching is possible'
      : p.egOnThisPage.length ? 'PARTIAL — EG code on the page but not in byvenue; title matching stays'
      : 'FAIL — no EG code available; title matching stays';
    R.probes.groupCode = p;
    log(`  byvenue EG: ${p.egInByVenue.length}, page EG: ${p.egOnThisPage.length}`);
    log('  ', p.verdict);
    if (p.sampleEvent) log('  Event keys:', p.eventKeys);
  }

  console.log('%c\n──────────── PROBE 3 COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([n, p]) => ({ probe: n, verdict: p.verdict || '—' })));

  window.__bmsProbe3 = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbe3))'); }
})();
