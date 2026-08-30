/**
 * Phase 0 probe, round two — page context.
 *
 * Round one settled the easy half and left four blockers:
 *
 *   1. showtimes-by-event answers 400 even for a film that is demonstrably
 *      selling. The param set is wrong and guessing has already failed once,
 *      so this reads the arguments the page itself sends instead of inventing
 *      another combination.
 *   2. The upcoming-movies cards carry no release date anywhere this found it,
 *      and the 7-day dormancy gate cannot be built without one.
 *   3. The city dropdown is not in the cinemas page state.
 *   4. The venue records carry arrDates / availableEventFormats, unexamined.
 *
 * Run exactly like round one: any https://in.bookmyshow.com/ page → DevTools →
 * Console → paste → Enter. Read-only.
 */
(async () => {
  const R = { ranAt: new Date().toISOString(), href: location.href, probes: {}, notes: [] };
  const log = (...a) => console.log('%c[probe2]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[probe2]', 'color:#d33;font-weight:bold', ...a);

  if (location.hostname !== 'in.bookmyshow.com') { bad('Run on an in.bookmyshow.com tab.'); return; }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };
  const pause = (ms) => new Promise(r => setTimeout(r, ms));

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
      return { ok: false, status: 0, ms: 0, error: String(e.message || e), text: '', body: null };
    }
  };

  /** Balanced-brace slice, so a state blob can be lifted out of raw HTML. */
  const sliceBalanced = (text, open) => {
    let depth = 0, str = false, esc = false;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') str = !str;
      if (str) continue;
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return text.slice(open, i + 1);
    }
    return null;
  };

  const jsonFromHtml = (html) => {
    const out = [];
    const re = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch { /* */ } }
    let at = 0;
    while ((at = html.indexOf('__NEXT_DATA__', at + 1)) > 0 || out.length === 0) {
      const g = html.search(/__(INITIAL|PRELOADED|NUXT)_STATE__\s*=\s*\{/);
      if (g < 0) break;
      const j = sliceBalanced(html, html.indexOf('{', g));
      if (j) { try { out.push(JSON.parse(j)); } catch { /* */ } }
      break;
    }
    return out;
  };

  const walk = (node, visit, depth = 0, seen = new WeakSet(), path = '$') => {
    if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) visit(node, path);
    for (const [k, v] of Object.entries(node)) walk(v, visit, depth + 1, seen, `${path}.${k}`);
  };

  // ============================================================ 1. the params
  /**
   * The endpoint is keyed on a combination nobody has documented, and round one
   * proved that guessing produces 400. But every buytickets page ships the
   * response *and the arguments used to fetch it* inline, so the correct param
   * set can simply be read off a page that already worked.
   */
  log('probe 1/5 — what the app actually sends');
  {
    const p = { };

    // A film that is definitely selling, established by byvenue rather than
    // assumed — the same mistake round one made is not worth repeating.
    const venue = 'ALUC';
    const bv = await get(`/api/v3/mobile/showtimes/byvenue?dateCode=${today()}` +
                         `&venueCode=${venue}&regionCode=HYD`, 'json');
    const first = (bv.body?.ShowDetails || [])
      .flatMap(d => d.Event || [])
      .flatMap(g => (g.ChildEvents || []).map(c => ({
        eventCode: c.EventCode, title: g.EventTitle || c.EventName })))
      .find(x => x.eventCode);
    p.knownOpen = first || null;
    log('  known-open film:', first);

    if (!first) {
      p.verdict = 'SKIP — byvenue returned nothing to test with';
      R.probes.params = p;
    } else {
      // Find the film's own page so the slug is real rather than guessed.
      const listing = await get('/explore/movies-hyderabad');
      const href = (listing.text.match(
        new RegExp(`/movies/[a-z-]+/[a-z0-9-]+/${first.eventCode}`, 'i')) || [])[0]
        || (listing.text.match(new RegExp(`/movies/[a-z0-9-]+/${first.eventCode}`, 'i')) || [])[0];
      p.moviePageHref = href || null;

      const slug = href ? (href.match(/\/movies\/[a-z-]+\/([a-z0-9-]+)\//i) || [])[1] : null;
      p.slug = slug || null;

      const buyUrl = `/movies/hyderabad/${slug || 'x'}/buytickets/${first.eventCode}/${today()}`;
      p.buyticketsUrl = buyUrl;
      const page = await get(buyUrl);
      p.buyticketsStatus = page.status;

      if (page.ok) {
        // (a) Any primary-dynamic URL the server rendered into the document.
        const urls = [...new Set(page.text.match(/[^"'\s]*primary-dynamic\?[^"'\s\\]+/g) || [])];
        p.renderedRequestUrls = urls.slice(0, 4);
        p.renderedParams = urls.slice(0, 4).map(u => {
          const q = u.slice(u.indexOf('?') + 1).replace(/&amp;/g, '&');
          return Object.fromEntries(new URLSearchParams(q));
        });

        // (b) The RTK-query cache, which stores originalArgs verbatim — the
        //     single most authoritative answer available without a network tap.
        const blobs = jsonFromHtml(page.text);
        const args = [];
        for (const b of blobs) {
          walk(b, (o) => {
            if (o.originalArgs && typeof o.originalArgs === 'object' &&
                (o.originalArgs.dateCode || o.originalArgs.etCodes)) args.push(o.originalArgs);
          });
        }
        p.originalArgs = args.slice(0, 4);
        p.originalArgKeys = args[0] ? Object.keys(args[0]) : [];
        if (args[0]) log('  originalArgs:', args[0]);
        else if (p.renderedParams[0]) log('  rendered params:', p.renderedParams[0]);
        else R.notes.push('buytickets page shipped neither a rendered request URL nor originalArgs');

        // (c) Language variants: the dropdown you spotted. Codes sharing this
        //     film's title under different event codes.
        const variants = [];
        for (const b of blobs) {
          walk(b, (o) => {
            const code = o.eventCode || o.EventCode || o.childEventCode;
            const lang = o.language || o.EventLanguage || o.languageName;
            if (typeof code === 'string' && /^ET\w+$/.test(code) && typeof lang === 'string' && lang) {
              variants.push({ eventCode: code, language: lang });
            }
          });
        }
        const seenV = new Set();
        p.languageVariants = variants.filter(v =>
          !seenV.has(v.eventCode) && seenV.add(v.eventCode)).slice(0, 12);
      }

      // (d) Now try the combinations, using anything learned above as the base.
      const base = p.originalArgs?.[0] || p.renderedParams?.[0] || null;
      p.learnedBase = base;
      const mk = (extra) => {
        const q = new URLSearchParams({
          dateCode: today(), regionCode: 'HYD', isDesktop: 'true', appCode: 'WEB',
          xLocationShared: 'false', memberId: '', lsId: '', subCode: '', ...extra,
        });
        return `/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`;
      };
      const combos = [
        ['etCodes=code only',            mk({ etCodes: first.eventCode })],
        ['etCodes=code + refEventCode',  mk({ etCodes: first.eventCode, refEventCode: first.eventCode })],
        ['etCodes=* + refEventCode',     mk({ etCodes: '*', refEventCode: first.eventCode })],
        ['refEventCode only',            mk({ refEventCode: first.eventCode })],
        ['etCodes=code, no extras',      `/api/movies-data/v5/showtimes-by-event/primary-dynamic` +
                                         `?etCodes=${first.eventCode}&dateCode=${today()}&regionCode=HYD`],
      ];
      if (base) {
        combos.unshift(['the page\'s own args verbatim',
          `/api/movies-data/v5/showtimes-by-event/primary-dynamic?${new URLSearchParams(base)}`]);
      }

      p.matrix = [];
      for (const [name, url] of combos) {
        const r = await get(url, 'json');
        const cards = (r.body?.data?.showtimeWidgets || [])
          .flatMap(w => (w?.data || []).flatMap(g => g?.data || []))
          .filter(c => c?.additionalData?.venueCode);
        const row = {
          name, status: r.status, venueCards: cards.length,
          title: r.body?.data?.header?.title?.text ?? null,
          error: r.body?.error || r.body?.message ||
                 (r.status !== 200 ? String(r.text || '').slice(0, 200).replace(/\s+/g, ' ') : null),
          params: Object.fromEntries(new URLSearchParams(url.slice(url.indexOf('?') + 1))),
        };
        p.matrix.push(row);
        (row.status === 200 ? log : bad)(`  ${row.status}  ${name}` +
          (row.status === 200 ? ` → ${row.venueCards} venues` : ` → ${String(row.error).slice(0, 90)}`));
        await pause(1200);
      }
      const win = p.matrix.find(r => r.status === 200 && r.venueCards > 0);
      p.verdict = win ? `PASS — "${win.name}" works` :
                  p.matrix.some(r => r.status === 200) ? 'PARTIAL — 200 but no venues' :
                  'FAIL — every combination rejected';
      R.probes.params = p;
      (win ? log : bad)('  verdict:', p.verdict);
    }
  }

  // ====================================================== 2. the release date
  /**
   * The 7-day dormancy gate needs a release date per film. Round one found the
   * codes but no date, so this looks at what the upcoming cards are actually
   * shaped like rather than testing another guess at a key name.
   */
  log('probe 2/5 — release dates on the upcoming list');
  {
    const res = await get('/explore/upcoming-movies-hyderabad');
    const p = { status: res.status };
    if (res.ok) {
      const blobs = jsonFromHtml(res.text);
      p.blobs = blobs.length;

      // Every object anywhere in the tree that carries an ET code, whatever the
      // key is called — round one only looked for a key named `eventCode`.
      const carriers = [];
      for (const b of blobs) {
        walk(b, (o, path) => {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === 'string' && /^ET\d{6,}$/.test(v)) {
              carriers.push({ path, codeKey: k, code: v, keys: Object.keys(o),
                scalars: Object.fromEntries(Object.entries(o)
                  .filter(([, x]) => typeof x !== 'object').slice(0, 30)) });
              break;
            }
          }
        });
      }
      p.carrierCount = carriers.length;
      p.carrierPaths = [...new Set(carriers.map(c => c.path.replace(/\.\d+/g, '[]')))].slice(0, 10);
      p.sampleCarriers = carriers.slice(0, 3);
      p.allKeysSeen = [...new Set(carriers.flatMap(c => c.keys))].slice(0, 60);

      // Anything date-shaped sitting on a card, by value not by key name.
      const dateish = new Set();
      for (const c of carriers) {
        for (const [k, v] of Object.entries(c.scalars)) {
          if (typeof v === 'string' &&
              (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{8}$/.test(v) ||
               /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(v) ||
               /releas/i.test(k))) dateish.add(`${k} = ${String(v).slice(0, 40)}`);
          if (typeof v === 'number' && v > 1600000000 && v < 2500000000) dateish.add(`${k} = ${v} (epoch?)`);
        }
      }
      p.dateCandidates = [...dateish].slice(0, 25);

      // Failing all that, the rendered text: "Releasing 28 Aug" and similar.
      p.releasePhrasesInHtml = [...new Set(
        (res.text.match(/Releas\w*[^<>{}"]{0,40}/gi) || []).map(s => s.trim()))].slice(0, 12);

      p.verdict = p.dateCandidates.length ? 'PASS'
        : p.releasePhrasesInHtml.length ? 'PARTIAL — only rendered text, no structured date'
        : 'FAIL — no release date anywhere on this page';
      log(`  ${carriers.length} code carriers, ${p.dateCandidates.length} date candidates`);
      if (p.dateCandidates.length) log('  dates:', p.dateCandidates.slice(0, 6));
      if (p.releasePhrasesInHtml.length) log('  phrases:', p.releasePhrasesInHtml.slice(0, 4));
    } else p.verdict = `FAIL — HTTP ${res.status}`;
    R.probes.releaseDate = p;
  }

  // ============================================ 3. release date on movie page
  /**
   * Second source for the same fact. A film's own page states its release date
   * plainly, and one fetch per watch at the moment it is added is a perfectly
   * acceptable price — unlike a fetch per check.
   */
  log('probe 3/5 — release date on a film page');
  {
    const p = {};
    const listing = await get('/explore/upcoming-movies-hyderabad');
    const href = (listing.text.match(/\/movies\/[a-z-]+\/[a-z0-9-]+\/ET\d{6,}/i) || [])[0];
    p.tried = href || null;
    if (href) {
      const page = await get(href);
      p.status = page.status;
      if (page.ok) {
        const blobs = jsonFromHtml(page.text);
        const hits = new Set();
        for (const b of blobs) {
          walk(b, (o) => {
            for (const [k, v] of Object.entries(o)) {
              if (!/releas|firstShow|openingDate/i.test(k)) continue;
              if (typeof v === 'string' || typeof v === 'number') hits.add(`${k} = ${String(v).slice(0, 40)}`);
            }
          });
        }
        p.releaseKeys = [...hits].slice(0, 20);
        // JSON-LD is the most stable of all — schema.org, rarely reshaped.
        const ld = [...(page.text.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g) || [])];
        p.jsonLdBlocks = ld.length;
        p.jsonLdDates = ld.flatMap(block => {
          try {
            const j = JSON.parse(block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/, ''));
            const arr = Array.isArray(j) ? j : [j];
            return arr.map(x => x.datePublished || x.releasedEvent?.startDate || null).filter(Boolean);
          } catch { return []; }
        });
        p.verdict = (p.releaseKeys.length || p.jsonLdDates.length) ? 'PASS' : 'FAIL';
        log(`  ${p.releaseKeys.length} release-ish keys, ${p.jsonLdDates.length} JSON-LD dates`);
        if (p.releaseKeys.length) log('  ', p.releaseKeys.slice(0, 5));
        if (p.jsonLdDates.length) log('  json-ld:', p.jsonLdDates);
      } else p.verdict = `FAIL — HTTP ${page.status}`;
    } else { p.verdict = 'SKIP — no film href on the upcoming list'; }
    R.probes.filmPageDate = p;
  }

  // ================================================================ 4. cities
  log('probe 4/5 — where the city list lives');
  {
    const p = { tried: [] };
    const candidates = [
      '/api/explore/v1/discover/regions', '/api/v3/mobile/regions',
      '/api/movies-data/v1/regions', '/explore/regions',
    ];
    for (const path of candidates) {
      const r = await get(path, 'json');
      const codes = new Set();
      if (r.body) walk(r.body, (o) => {
        if (typeof o.regionCode === 'string' && /^[A-Z]{2,6}$/.test(o.regionCode)) codes.add(o.regionCode);
        if (typeof o.RegionCode === 'string' && /^[A-Z]{2,6}$/.test(o.RegionCode)) codes.add(o.RegionCode);
      });
      p.tried.push({ path, status: r.status, json: r.body != null, regionCodes: codes.size,
                     sample: [...codes].slice(0, 8) });
      log(`  ${r.status}  ${path} → ${codes.size} regions`);
      await pause(900);
    }
    const win = p.tried.find(t => t.regionCodes > 5);
    p.verdict = win ? `PASS — ${win.path}` : 'FAIL — no region list endpoint found';
    R.probes.cities = p;
  }

  // ========================================================= 5. venue extras
  /**
   * The cinemas page shipped arrDates and availableEventFormats on every venue.
   * If arrDates is the list of dates that cinema has shows for, a release watch
   * gets a free pre-filter: no point asking byvenue about a date the venue is
   * not selling at all.
   */
  log('probe 5/5 — arrDates / availableEventFormats');
  {
    const res = await get('/hyderabad/cinemas');
    const p = { status: res.status };
    if (res.ok) {
      const blobs = jsonFromHtml(res.text);
      const venues = [];
      for (const b of blobs) walk(b, (o) => { if (o.VenueCode && o.VenueName) venues.push(o); });
      p.venues = venues.length;
      const v = venues.find(x => x.arrDates) || venues[0];
      p.sample = v ? {
        code: v.VenueCode, name: v.VenueName,
        subRegionCode: v.SubRegionCode ?? null,
        arrDatesType: Array.isArray(v.arrDates) ? 'array' : typeof v.arrDates,
        arrDates: Array.isArray(v.arrDates) ? v.arrDates.slice(0, 6) : v.arrDates ?? null,
        availableEventFormats: v.availableEventFormats ?? null,
        venueLegends: Array.isArray(v.VenueLegends) ? v.VenueLegends.slice(0, 3) : v.VenueLegends ?? null,
      } : null;
      // Sub-regions are how a "theatres near me" picker would group 97 venues.
      p.subRegions = [...new Set(venues.map(x => x.SubRegionCode).filter(Boolean))].slice(0, 20);
      p.verdict = venues.length ? 'PASS' : 'FAIL';
      log(`  ${venues.length} venues, ${p.subRegions.length} sub-regions`);
      if (p.sample) log('  sample:', p.sample);
    } else p.verdict = `FAIL — HTTP ${res.status}`;
    R.probes.venueExtras = p;
  }

  console.log('%c\n──────────── PROBE 2 COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([name, p]) => ({ probe: name, verdict: p.verdict || '—' })));
  if (R.notes.length) { console.log('%cnotes:', 'font-weight:bold'); R.notes.forEach(n => console.log('  •', n)); }

  window.__bmsProbe2 = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbe2))'); }
})();
