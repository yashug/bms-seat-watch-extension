/**
 * Phase 0 probe — extension context.
 *
 * Decides the whole shape of the release poller with one question: can a fetch
 * made from the extension's own origin get past Cloudflare?
 *
 *   yes → the service worker calls the endpoint directly. No tab, no window,
 *         no visibility tricks, a few hundred bytes per check.
 *   no  → every check has to run inside a page on in.bookmyshow.com, so we
 *         need a poller tab and the batching that makes one tab serve many
 *         watched releases.
 *
 * The difference matters because an extension-origin request is cross-site: it
 * carries Chrome's real TLS fingerprint, but SameSite=Lax cookies — including
 * whatever clearance Cloudflare issued to the browsing session — may not ride
 * along. That is exactly what this measures.
 *
 *   1. chrome://extensions → Seat Watch → "service worker" (opens DevTools)
 *   2. Console → paste this whole file → Enter
 *   3. wait for "PROBE COMPLETE", then paste the copied JSON back
 *
 * Read-only. Nothing is stored and no extension state is touched.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), context: 'service worker', probes: {}, notes: [] };
  const log = (...a) => console.log('%c[probe]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe]', 'color:#d33;font-weight:bold', ...a);

  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    bad('Not an extension context. Open the service worker DevTools from chrome://extensions.');
    return;
  }
  log('extension id', chrome.runtime.id);

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const blocked = (text) => /Attention Required|cf-browser-verification|Just a moment|cf-error/i.test(text || '');

  /**
   * `credentials` is the variable under test, so it is a parameter rather than
   * a constant. 'include' is the interesting case — it is the only one that
   * would carry a Cloudflare clearance cookie on a cross-site request.
   */
  const probe = async (url, credentials) => {
    const started = Date.now();
    try {
      const res = await fetch(url, { credentials });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* html, almost certainly the interstitial */ }
      return {
        credentials, status: res.status, ms: Date.now() - started,
        type: res.type, contentType: res.headers.get('content-type') || null,
        bytes: text.length,
        cloudflare: blocked(text),
        json: json != null,
        // Enough of the body to tell an interstitial from a real error page.
        head: json ? null : text.slice(0, 160).replace(/\s+/g, ' '),
      };
    } catch (e) {
      return { credentials, status: 0, ms: Date.now() - started, error: String(e.message || e) };
    }
  };

  const summarise = (rows) => {
    const win = rows.find(r => r.status === 200 && !r.cloudflare);
    return win ? `PASS (credentials: ${win.credentials})`
      : rows.some(r => r.cloudflare) ? 'FAIL — cloudflare interstitial'
      : rows.some(r => r.status) ? `FAIL — ${rows.map(r => r.status).join('/')}`
      : 'FAIL — network error';
  };

  // ------------------------------------------------------------ the endpoint
  log('probe 1/3 — showtimes endpoint from the extension origin');
  {
    // A film code is needed and none should be hardcoded, so take one from a
    // show already being watched; failing that, fall back to a bare call which
    // still distinguishes "Cloudflare blocked" from "endpoint answered".
    const { shows = [] } = await chrome.storage.local.get('shows');
    const fromWatch = shows.map(s => (s.url || '').match(/\/(ET\w+)\//)?.[1]).find(Boolean);
    R.probes.sampleFrom = fromWatch ? 'a watched show' : 'none — bare call';

    const q = new URLSearchParams({
      etCodes: '*', dateCode: today(), isDesktop: 'true', regionCode: 'HYD',
      xLocationShared: 'false', memberId: '', lsId: '', subCode: '', appCode: 'WEB',
    });
    if (fromWatch) q.set('refEventCode', fromWatch);
    const url = `https://in.bookmyshow.com/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`;

    const rows = [];
    for (const c of ['include', 'omit']) {
      const r = await probe(url, c);
      rows.push(r);
      log(`  credentials:${c} → ${r.status}${r.cloudflare ? ' CLOUDFLARE' : ''}${r.json ? ' json' : ''} ${r.ms}ms`);
      await new Promise(r2 => setTimeout(r2, 1500));
    }
    R.probes.endpoint = { url: url.split('?')[0], eventCode: fromWatch || null, rows, verdict: summarise(rows) };
    (R.probes.endpoint.verdict.startsWith('PASS') ? log : bad)('  verdict:', R.probes.endpoint.verdict);
  }

  // ----------------------------------------------------------- the two pages
  log('probe 2/3 — cinemas page from the extension origin');
  {
    const rows = [await probe('https://in.bookmyshow.com/hyderabad/cinemas', 'include')];
    log(`  → ${rows[0].status}${rows[0].cloudflare ? ' CLOUDFLARE' : ''} ${rows[0].bytes ?? 0}b`);
    R.probes.cinemasPage = { rows, verdict: summarise(rows) };
  }

  log('probe 3/3 — upcoming movies page from the extension origin');
  {
    const rows = [await probe('https://in.bookmyshow.com/explore/upcoming-movies-hyderabad', 'include')];
    log(`  → ${rows[0].status}${rows[0].cloudflare ? ' CLOUDFLARE' : ''} ${rows[0].bytes ?? 0}b`);
    R.probes.upcomingPage = { rows, verdict: summarise(rows) };
  }

  // ----------------------------------------------------------------- summary
  // Transport is what this probe measures, and only the page fetches it
  // cleanly: the showtimes endpoint answers 400 from inside a real BookMyShow
  // page too, so its failure says nothing about whether the extension origin
  // can reach the host. Reading it as a transport failure — as an earlier
  // version of this file did — inverts the conclusion.
  const reachable = [R.probes.cinemasPage, R.probes.upcomingPage]
    .some(p => String(p?.verdict).startsWith('PASS'));
  const endpointOk = R.probes.endpoint.verdict.startsWith('PASS');
  R.conclusion = !reachable
    ? 'Extension origin cannot reach BookMyShow — release checks need a poller tab.'
    : endpointOk
      ? 'Extension origin reaches BookMyShow, and the showtimes endpoint answers. No poller tab needed.'
      : 'Extension origin reaches BookMyShow (pages 200). The showtimes endpoint 400s here as it does everywhere — a fault in that endpoint, not in transport.';

  console.log('%c\n──────────── PROBE COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes)
    .filter(([, p]) => p && p.verdict)
    .map(([name, p]) => ({ probe: name, verdict: p.verdict })));
  console.log('%c' + R.conclusion, 'font-weight:bold;color:' + (reachable ? '#1FAD3E' : '#d33'));

  self.__bmsProbe = R;
  const json = JSON.stringify(R, null, 2);
  try { copy(json); console.log('Full report copied to clipboard — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(self.__bmsProbe))'); }
})();
