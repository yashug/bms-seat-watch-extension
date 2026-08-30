/**
 * Is BookMyShow still answering the way the extension expects?
 *
 * The six probe-*.js files were archaeology: each answered a question that is now
 * settled, and their conclusions live in FINDINGS.md. This is the one worth keeping
 * around, because it asks the only question that stays open — do the four calls the
 * feature depends on still behave?
 *
 * Run it when release watches stop firing, or when a check starts reporting errors,
 * before assuming the bug is in the extension.
 *
 *   chrome://extensions → Seat Watch → "service worker" → Console → paste
 *
 * Read-only. No cookies are sent for the calls that do not need them.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), checks: {} };
  const log = (...a) => console.log('%c[health]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[health]', 'color:#d33;font-weight:bold', ...a);
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    bad('Run this in the extension\'s service worker console.'); return;
  }

  // Whatever city is actually configured, so this checks what you use.
  const { city } = await chrome.storage.local.get('city');
  const slug = city?.slug || 'hyderabad';
  const code = city?.code || 'HYD';
  log('city:', code, `(${slug})`);

  const today = () => { const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
  const get = async (url, credentials = 'omit') => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { credentials });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* html */ }
      return { status: res.status, ms: Date.now() - t0, text, json,
               cloudflare: /Attention Required|Just a moment/i.test(text) };
    } catch (e) { return { status: 0, error: String(e.message || e), text: '' }; }
  };
  const pause = (ms) => new Promise(r => setTimeout(r, ms));

  // 1 ── the venue listing: the call every release check makes.
  {
    const venue = (await chrome.storage.local.get('venueCache'))
      .venueCache?.[slug]?.venues?.[0]?.code || 'ALUC';
    const r = await get(`https://in.bookmyshow.com/api/v3/mobile/showtimes/byvenue` +
                        `?dateCode=${today()}&venueCode=${venue}&regionCode=${code}`);
    const children = (r.json?.ShowDetails || []).flatMap(d => d.Event || [])
      .flatMap(g => (g.ChildEvents || []).map(c => ({ code: c.EventCode, group: c.EventGroup })));
    const withGroup = children.filter(c => c.group).length;
    R.checks.byvenue = {
      venue, status: r.status, childEvents: children.length, carryingGroup: withGroup,
      verdict: r.status !== 200 ? `FAIL — HTTP ${r.status}${r.cloudflare ? ' (cloudflare)' : ''}`
        : !children.length ? 'INCONCLUSIVE — nothing showing there today'
        : !withGroup ? 'FAIL — EventGroup is gone; matching would fall back to one code'
        : 'PASS',
    };
    (R.checks.byvenue.verdict === 'PASS' ? log : bad)('byvenue:', R.checks.byvenue.verdict);
    await pause(900);
  }

  // 2 ── the city list, which the settings picker is built from.
  {
    const r = await get('https://in.bookmyshow.com/api/explore/v1/discover/regions');
    const codes = new Set((r.text.match(/"[Rr]egionCode"\s*:\s*"([A-Za-z]{2,12})"/g) || []));
    R.checks.regions = { status: r.status, regionCodes: codes.size,
      verdict: r.status === 200 && codes.size > 5 ? 'PASS' : `FAIL — ${r.status}, ${codes.size} regions` };
    (codes.size > 5 ? log : bad)('regions:', R.checks.regions.verdict);
    await pause(900);
  }

  // 3 ── the cinema list, and the dates each venue is selling.
  {
    const r = await get(`https://in.bookmyshow.com/${slug}/cinemas`, 'include');
    const venues = new Set(r.text.match(/"VenueCode"\s*:\s*"[A-Z0-9]{3,8}"/g) || []);
    const dates = new Set(r.text.match(/"ShowDateCode"\s*:\s*"\d{8}"/g) || []);
    R.checks.cinemas = { status: r.status, venues: venues.size, arrDates: dates.size,
      verdict: r.status === 200 && venues.size ? 'PASS' : `FAIL — ${r.status}, ${venues.size} venues` };
    (venues.size ? log : bad)('cinemas:', R.checks.cinemas.verdict);
    await pause(900);
  }

  // 4 ── a film page: the release date, and the any-theatre wording.
  {
    const { releases = [] } = await chrome.storage.local.get('releases');
    const w = releases.find(x => x.slug && x.eventCode);
    if (!w) {
      R.checks.filmPage = { verdict: 'SKIP — no watched film with a page to read' };
      log('film page: skipped (add a film to check this)');
    } else {
      const r = await get(`https://in.bookmyshow.com/movies/${w.citySlug || slug}/${w.slug}/${w.eventCode}`, 'include');
      const iso = /"releaseDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(r.text);
      const book = /Book tickets/i.test(r.text);
      const soon = /Releasing on|Coming Soon/i.test(r.text);
      R.checks.filmPage = {
        film: w.title || w.eventCode, status: r.status,
        releaseDate: iso?.[1] || null, bookTickets: book, comingSoon: soon,
        // Neither phrase present is the failure that matters: an any-theatre
        // watch then cannot tell the two states apart, and says so rather than
        // guessing — but it will never fire either.
        verdict: r.status !== 200 ? `FAIL — HTTP ${r.status}`
          : !iso ? 'FAIL — release date no longer readable'
          : (!book && !soon) ? 'FAIL — neither "Book tickets" nor "Releasing on"; any-theatre watches are blind'
          : 'PASS',
      };
      (R.checks.filmPage.verdict === 'PASS' ? log : bad)('film page:', R.checks.filmPage.verdict);
    }
  }

  const bad_ = Object.values(R.checks).filter(c => String(c.verdict).startsWith('FAIL'));
  R.conclusion = bad_.length
    ? `${bad_.length} of ${Object.keys(R.checks).length} broken — BookMyShow changed something.`
    : 'Everything the feature depends on still answers as expected.';

  console.log('%c\n──────────── HEALTH CHECK ────────────', 'font-weight:bold');
  console.table(Object.entries(R.checks).map(([n, c]) => ({ check: n, verdict: c.verdict })));
  console.log('%c' + R.conclusion, 'font-weight:bold;color:' + (bad_.length ? '#d33' : '#1FAD3E'));
  self.__bmsHealth = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied.'); } catch {}
})();
