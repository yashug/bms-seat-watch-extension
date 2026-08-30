/**
 * Phase 0 probe, round four — the last two open questions.
 *
 * Venue-first is settled and exact: byvenue carries EventGroup, the upcoming
 * cards carry event_group, so a theatre-scoped watch matches on EG codes with
 * no heuristics at all. What remains is only the ANY-THEATRE variant, and there
 * are two candidate signals for it.
 *
 *   1. showtimes-by-event, with `language` actually set. Three rounds have now
 *      failed against it, but every attempt left language empty or absent —
 *      and the addresses BookMyShow itself puts in the bar always carry it.
 *      One more matrix, this time varying the thing that was never varied,
 *      plus the headers the app might be adding.
 *
 *   2. The film's own page. "Book tickets" appearing is a coarse but real
 *      any-theatre signal, and one fetch per film per check is affordable. This
 *      compares an open film against an unopened one to find a marker that
 *      actually differs — preferring a structured flag over button text, which
 *      would break on any copy change.
 *
 * Run on any https://in.bookmyshow.com/ page. Read-only.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), href: location.href, probes: {}, notes: [] };
  const log = (...a) => console.log('%c[probe4]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe4]', 'color:#d33;font-weight:bold', ...a);
  if (location.hostname !== 'in.bookmyshow.com') { bad('Run on an in.bookmyshow.com tab.'); return; }

  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const today = () => { const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
  const get = async (path, as = 'text', headers) => {
    try {
      const res = await fetch(path, { credentials: 'same-origin', headers });
      const text = await res.text();
      let json = null;
      if (as === 'json') { try { json = JSON.parse(text); } catch { /* */ } }
      return { ok: res.ok, status: res.status, text, body: as === 'json' ? json : text };
    } catch (e) { return { ok:false, status:0, error:String(e.message||e), text:'', body:null }; }
  };
  const walk = (n, visit, d = 0, seen = new WeakSet()) => {
    if (!n || typeof n !== 'object' || d > 16 || seen.has(n)) return;
    seen.add(n);
    if (!Array.isArray(n)) visit(n);
    for (const v of Object.values(n)) walk(v, visit, d + 1, seen);
  };
  const stateFromHtml = (html) => {
    const out = [];
    const re = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g;
    let m; while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch { /* */ } }
    return out;
  };
  const REGION = (() => {
    const raw = document.cookie.split('; ').find(c => c.startsWith('rgn='));
    try { return JSON.parse(decodeURIComponent(raw.slice(4))).regionCode; } catch { return 'HYD'; }
  })();

  // Establish a film that is definitely selling, from byvenue rather than assumed.
  const bv = await get(`/api/v3/mobile/showtimes/byvenue?dateCode=${today()}&venueCode=ALUC&regionCode=${REGION}`, 'json');
  const openChild = (bv.body?.ShowDetails || []).flatMap(d => d.Event || [])
    .flatMap(g => (g.ChildEvents || []).map(c => ({
      code: c.EventCode, lang: c.EventLanguage, group: c.EventGroup,
      title: g.EventTitle, url: c.EventUrl })))
    .find(x => x.code);
  R.knownOpen = openChild || null;
  log('known-open film:', openChild);

  // ============================================ 1. film-first, varying language
  log('probe 1/2 — showtimes-by-event with language set');
  {
    const p = { matrix: [] };
    if (!openChild) { p.verdict = 'SKIP — no open film to test with'; R.probes.filmFirst = p; }
    else {
      const lang = openChild.lang || 'Telugu';
      const mk = (o) => `/api/movies-data/v5/showtimes-by-event/primary-dynamic?` +
        new URLSearchParams({ dateCode: today(), regionCode: REGION, isDesktop: 'true',
          appCode: 'WEB', xLocationShared: 'false', memberId: '', lsId: '', subCode: '', ...o });

      const cases = [
        ['* + language + refEventCode',   mk({ etCodes:'*', language: lang, refEventCode: openChild.code })],
        ['code + language + refEventCode',mk({ etCodes: openChild.code, language: lang, refEventCode: openChild.code })],
        ['* + lowercase language + ref',  mk({ etCodes:'*', language: lang.toLowerCase(), refEventCode: openChild.code })],
        ['code + language only',          mk({ etCodes: openChild.code, language: lang })],
        ['* + language, no ref',          mk({ etCodes:'*', language: lang })],
      ];
      for (const [name, url] of cases) {
        const r = await get(url, 'json');
        const cards = (r.body?.data?.showtimeWidgets || [])
          .flatMap(w => (w?.data||[]).flatMap(g => g?.data||[])).filter(c => c?.additionalData?.venueCode);
        p.matrix.push({ name, status: r.status, venueCards: cards.length,
          errorCode: r.body?.metadata?.error?.errorCode ?? null });
        (r.status === 200 ? log : bad)(`  ${r.status}  ${name}` +
          (r.status === 200 ? ` → ${cards.length} venues` : ` (${r.body?.metadata?.error?.errorCode ?? '—'})`));
        await pause(1100);
      }

      // If the query is still refused whatever the language, the remaining
      // candidate is a header the app adds and a bare fetch does not.
      const hdrs = [
        ['x-app-code', { 'x-app-code': 'WEB' }],
        ['x-region-code', { 'x-region-code': REGION, 'x-app-code': 'WEB' }],
        ['accept json', { accept: 'application/json, text/plain, */*' }],
      ];
      if (!p.matrix.some(r => r.status === 200)) {
        p.headerTrials = [];
        const url = mk({ etCodes: '*', language: openChild.lang || 'Telugu', refEventCode: openChild.code });
        for (const [name, h] of hdrs) {
          const r = await get(url, 'json', h);
          p.headerTrials.push({ name, status: r.status,
            errorCode: r.body?.metadata?.error?.errorCode ?? null });
          (r.status === 200 ? log : bad)(`  ${r.status}  header: ${name}`);
          await pause(1100);
        }
      }

      const win = p.matrix.find(r => r.status === 200 && r.venueCards > 0) ||
                  (p.headerTrials || []).find(r => r.status === 200);
      p.verdict = win ? `PASS — "${win.name}" works` : 'FAIL — film-first stays unusable; use the film page instead';
      R.probes.filmFirst = p;
      (win ? log : bad)('  ', p.verdict);
    }
  }

  // ================================== 2. the film page as an any-theatre signal
  /**
   * Compares a film that is selling against one that is not, and reports only
   * what actually DIFFERS between them. A marker present on both is useless as
   * a signal however plausible its name, which is why this is a diff and not a
   * search for a hoped-for key.
   */
  log('probe 2/2 — film page, open vs unopened');
  {
    const p = {};
    const listing = await get('/explore/upcoming-movies-hyderabad');
    const upcomingHref = (listing.text.match(/\/movies\/[a-z-]+\/[a-z0-9-]+\/ET\d{6,}/i) || [])[0];
    const openHref = openChild?.url
      ? `/movies/hyderabad/${openChild.url}/${openChild.code}` : null;
    p.openHref = openHref; p.upcomingHref = upcomingHref || null;

    const inspect = async (href) => {
      if (!href) return null;
      const page = await get(href);
      if (!page.ok) return { href, status: page.status };
      const html = page.text;
      const blobs = stateFromHtml(html);

      // Structured flags first — anything boolean whose key sounds like it
      // gates booking. These are what a stable detector would key on.
      const flags = {};
      for (const b of blobs) walk(b, (o) => {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'boolean' && /book|showtime|sell|available|comingSoon|upcoming|notify/i.test(k)) {
            flags[k] = (flags[k] ?? 0) + (v ? 1 : 0);
          }
          if (typeof v === 'string' && v.length < 40 &&
              /^(cta|button|action|label)/i.test(k)) flags[`${k}="${v}"`] = 1;
        }
      });

      const phrase = (re) => (html.match(re) || []).length;
      return {
        href, status: page.status, bytes: html.length,
        flags,
        egCodes: [...new Set((html.match(/EG\d{6,}/g) || []))].slice(0, 4),
        counts: {
          bookTickets: phrase(/Book tickets/gi),
          buytickets: phrase(/buytickets/gi),
          notifyMe: phrase(/Notify\s*Me/gi),
          comingSoon: phrase(/Coming Soon/gi),
          releasingOn: phrase(/Releasing on/gi),
        },
      };
    };

    p.open = await inspect(openHref);
    await pause(900);
    p.upcoming = await inspect(upcomingHref);

    if (p.open && p.upcoming && p.open.counts && p.upcoming.counts) {
      // The diff is the answer: markers that separate the two states.
      p.discriminators = Object.keys(p.open.counts).filter(k =>
        (p.open.counts[k] > 0) !== (p.upcoming.counts[k] > 0))
        .map(k => `${k}: open=${p.open.counts[k]} upcoming=${p.upcoming.counts[k]}`);
      const flagKeys = new Set([...Object.keys(p.open.flags), ...Object.keys(p.upcoming.flags)]);
      p.flagDiff = [...flagKeys].filter(k => p.open.flags[k] !== p.upcoming.flags[k])
        .map(k => `${k}: open=${p.open.flags[k] ?? '—'} upcoming=${p.upcoming.flags[k] ?? '—'}`).slice(0, 20);
      p.verdict = p.flagDiff.length ? 'PASS — a structured flag separates the two states'
        : p.discriminators.length ? 'PARTIAL — only rendered text separates them'
        : 'FAIL — the two pages look the same to this probe';
      log('  text discriminators:', p.discriminators);
      log('  flag diff:', p.flagDiff.slice(0, 8));
    } else p.verdict = 'SKIP — could not fetch both pages';
    R.probes.filmPage = p;
    log('  ', p.verdict);
  }

  console.log('%c\n──────────── PROBE 4 COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([n, x]) => ({ probe: n, verdict: x.verdict || '—' })));
  window.__bmsProbe4 = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbe4))'); }
})();
