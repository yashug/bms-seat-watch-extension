/**
 * Probe — language variants of one film.
 *
 * The bug this exists to settle: a film released in several languages has one
 * event code per language (I'm Game: Malayalam ET00473215, Telugu ET00511702,
 * Hindi ET00511704), and a release watch created from the original's page fired
 * for the original only. Three things decide how that gets fixed, and none of
 * them can be answered from a shell — BookMyShow 403s anything that is not a
 * real browser:
 *
 *   1. Do the language variants share one EventGroup? If they do, the matching
 *      key the code already uses is right and the bug is elsewhere.
 *   2. Does the parent film page name its siblings' event codes anywhere?
 *      That is the only way an any-theatre watch could learn about them.
 *   3. Does byvenue tag every variant with the same EventUrl slug? That is the
 *      discovery path for a watch that names theatres.
 *
 *   1. open any https://in.bookmyshow.com/ page (any city — the probe reads the
 *      city out of the rgn cookie and falls back to hyderabad)
 *   2. DevTools → Console → paste this whole file → Enter
 *   3. wait for "PROBE COMPLETE", then paste the copied JSON back
 *
 * It only reads. Nothing is booked, nothing is posted.
 */
(async () => {
  /** The film under test. Swap these to re-run against a different release. */
  const FILM = {
    slug: 'im-game',
    parent: 'ET00473215',            // Malayalam — the code a watch was made from
    siblings: ['ET00511702', 'ET00511704'],  // Telugu, Hindi — from the dropdown
    date: '20260903',
  };

  const R = { ranAt: new Date().toISOString(), href: location.href, film: FILM, probes: {}, notes: [] };
  const log = (...a) => console.log('%c[lang]', 'color:#1FAD3E;font-weight:bold', ...a);
  const bad = (...a) => console.log('%c[lang]', 'color:#d33;font-weight:bold', ...a);

  if (location.hostname !== 'in.bookmyshow.com') {
    bad('Run this on an in.bookmyshow.com tab. Current host:', location.hostname);
    return;
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const city = (() => {
    try {
      const raw = document.cookie.split('; ').find((c) => c.startsWith('rgn='));
      const rgn = JSON.parse(decodeURIComponent(raw.slice(4)));
      return {
        code: rgn.regionCode || rgn.regionCodeSlug?.toUpperCase() || 'HYD',
        slug: rgn.regionNameSlug || 'hyderabad',
      };
    } catch { return { code: 'HYD', slug: 'hyderabad' }; }
  })();
  R.city = city;
  log('city', city);

  const get = async (path, as = 'text') => {
    const started = performance.now();
    try {
      const res = await fetch(path, { credentials: 'same-origin' });
      const text = await res.text();
      let json = null;
      if (as === 'json') { try { json = JSON.parse(text); } catch { /* not JSON */ } }
      return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - started), text, json };
    } catch (e) {
      return { ok: false, status: 0, error: String(e.message || e), text: '', json: null };
    }
  };

  const blocked = (r) => /Attention Required|cf-browser-verification|Just a moment/i.test(r.text || '');

  const nextData = (html) => {
    const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html || '');
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };

  /** Every path in a parsed blob whose leaf value satisfies `hit`. */
  const paths = (node, hit, out = [], trail = '$', depth = 0, seen = new WeakSet()) => {
    if (depth > 18 || out.length > 40) return out;
    if (node && typeof node === 'object') {
      if (seen.has(node)) return out;
      seen.add(node);
      for (const [k, v] of Object.entries(node)) {
        paths(v, hit, out, Array.isArray(node) ? `${trail}[${k}]` : `${trail}.${k}`, depth + 1, seen);
      }
    } else if (hit(node)) out.push(trail);
    return out;
  };

  /** The smallest enclosing object of a path, so the shape around a hit is visible. */
  const at = (root, path) => {
    let node = root;
    for (const step of path.replace(/^\$\.?/, '').split(/\.|\[|\]\.?/).filter(Boolean)) {
      node = node?.[step];
      if (node == null) return null;
    }
    return node;
  };
  const parentOf = (root, path) => at(root, path.replace(/(\.[^.[\]]+|\[\d+\])$/, ''));

  const codesIn = (text) => [...new Set(text.match(/ET\d{6,}/g) || [])];
  const groupsIn = (text) => {
    const counts = {};
    for (const eg of text.match(/EG\d{6,}/g) || []) counts[eg] = (counts[eg] || 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6));
  };
  const phrase = (html, re) => (html.match(re) || []).length;

  const filmUrl = (code) => `/movies/${city.slug}/${FILM.slug}/${code}`;

  /** One film page, reduced to the facts the watch cares about. */
  const inspectFilm = async (code) => {
    const page = await get(filmUrl(code));
    if (!page.ok || blocked(page)) {
      return { url: filmUrl(code), status: page.status, blocked: blocked(page), error: page.error };
    }
    const html = page.text;
    const data = nextData(html);
    const et = codesIn(html);
    const eg = groupsIn(html);
    const iso = /"releaseDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/.exec(html)?.[1] ||
                /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1] || null;
    return {
      url: filmUrl(code), status: page.status, bytes: html.length,
      title: /<title>([^<]{2,160})</.exec(html)?.[1] || null,
      releaseDate: iso,
      topGroups: eg,
      etCount: et.length,
      etCodes: et.slice(0, 25),
      hasNextData: Boolean(data),
      // The three words the any-theatre detector keys on.
      counts: {
        bookTickets: phrase(html, /Book tickets/gi),
        releasingOn: phrase(html, /Releasing on/gi),
        notifyMe: phrase(html, /Notify\s*Me/gi),
      },
      // Does this page name the other languages at all, and under what key?
      siblingsPresent: FILM.siblings.filter((s) => html.includes(s)),
      languageWords: [...new Set((html.match(
        /\b(Malayalam|Telugu|Hindi|Tamil|Kannada|English|Marathi|Bengali)\b/g) || []))],
    };
  };

  // ---- 1. the parent page: does it name its siblings? ---------------------
  {
    log('1/4  parent film page', FILM.parent);
    const p = await inspectFilm(FILM.parent);

    // Where in the state a sibling code sits — that path is what the extension
    // would have to read to discover the other languages.
    const page = await get(filmUrl(FILM.parent));
    const data = page.ok ? nextData(page.text) : null;
    if (data) {
      const wanted = new Set(FILM.siblings);
      p.siblingPaths = paths(data, (v) => typeof v === 'string' && wanted.has(v)).slice(0, 12)
        .map((path) => ({ path, record: JSON.stringify(parentOf(data, path))?.slice(0, 500) }));
      // Anything that looks like a language switcher, whether or not it holds
      // the codes we already know about.
      p.languageNodes = paths(data, (v) =>
        typeof v === 'string' && /^(Telugu|Hindi|Malayalam|Tamil|Kannada)$/i.test(v)).slice(0, 12)
        .map((path) => ({ path, record: JSON.stringify(parentOf(data, path))?.slice(0, 400) }));
    }
    p.verdict = p.siblingsPresent?.length
      ? `PASS — parent page names ${p.siblingsPresent.length}/${FILM.siblings.length} sibling codes`
      : p.status === 200 ? 'FAIL — parent page names none of the sibling codes'
      : `SKIP — page ${p.status}`;
    R.probes.parentPage = p;
    log('  ', p.verdict, '| groups:', p.topGroups);
  }
  await pause(900);

  // ---- 2. the siblings: one group or several? ----------------------------
  {
    log('2/4  sibling film pages');
    const out = {};
    for (const code of FILM.siblings) { out[code] = await inspectFilm(code); await pause(900); }
    const groupOf = (x) => Object.keys(x?.topGroups || {})[0] || null;
    const all = [R.probes.parentPage, ...Object.values(out)].filter((x) => x?.status === 200);
    const groups = [...new Set(all.map(groupOf).filter(Boolean))];
    const p = {
      byCode: out,
      groupPerCode: Object.fromEntries(
        [[FILM.parent, groupOf(R.probes.parentPage)], ...Object.entries(out).map(([c, x]) => [c, groupOf(x)])]),
      distinctGroups: groups,
      verdict: groups.length === 1
        ? 'SHARED — every language sits under one EventGroup; matching on the group is enough'
        : groups.length > 1
        ? `SPLIT — ${groups.length} distinct EventGroups; a watch must carry a set of codes, not one group`
        : 'SKIP — no group could be read',
    };
    R.probes.siblings = p;
    log('  ', p.verdict, p.groupPerCode);
  }
  await pause(900);

  // ---- 3. the buytickets page: the language dropdown --------------------
  {
    log('3/4  buytickets page (the dropdown)');
    const url = `/movies/${city.slug}/${FILM.slug}/buytickets/${FILM.parent}/${FILM.date}`;
    const page = await get(url);
    const p = { url, status: page.status, blocked: blocked(page), bytes: page.text.length };
    if (page.ok && !blocked(page)) {
      const data = nextData(page.text);
      p.hasNextData = Boolean(data);
      p.etCodes = codesIn(page.text).slice(0, 25);
      p.siblingsPresent = FILM.siblings.filter((s) => page.text.includes(s));
      if (data) {
        // The dropdown's own records: whatever object holds both a language
        // name and an event code is the thing worth reading.
        const wanted = new Set([FILM.parent, ...FILM.siblings]);
        p.codePaths = paths(data, (v) => typeof v === 'string' && wanted.has(v)).slice(0, 15)
          .map((path) => ({ path, record: JSON.stringify(parentOf(data, path))?.slice(0, 400) }));
      }
      p.verdict = p.siblingsPresent.length
        ? 'PASS — the buytickets page carries every language’s code'
        : 'FAIL — the dropdown’s codes are not in the served HTML (rendered client-side)';
    } else p.verdict = `SKIP — ${page.status}${p.blocked ? ' (Cloudflare)' : ''}`;
    R.probes.buytickets = p;
    log('  ', p.verdict);
  }
  await pause(900);

  // ---- 4. byvenue: what the poller actually sees -------------------------
  {
    log('4/4  byvenue — how the variants look to the poller');
    const cinemas = await get(`/${city.slug}/cinemas`);
    const venues = [...new Set((cinemas.text.match(/"VenueCode"\s*:\s*"([A-Z0-9]{3,8})"/g) || [])
      .map((m) => /"([A-Z0-9]{3,8})"$/.exec(m)[1]))];
    const p = { venuesKnown: venues.length, sampled: [], rows: [], verdict: '' };

    // Six venues is enough to see the shape without hammering the API; a film
    // in three languages is rarely in fewer.
    for (const venueCode of venues.slice(0, 6)) {
      const body = await get(
        `/api/v3/mobile/showtimes/byvenue?dateCode=${FILM.date}&venueCode=${venueCode}&regionCode=${city.code}`,
        'json');
      p.sampled.push({ venueCode, status: body.status, ok: body.ok });
      for (const day of body.json?.ShowDetails || []) {
        for (const event of day.Event || []) {
          for (const child of event.ChildEvents || []) {
            const hay = `${child.EventCode} ${child.EventUrl || ''} ${event.EventTitle || ''}`.toLowerCase();
            if (!hay.includes(FILM.slug) && ![FILM.parent, ...FILM.siblings].includes(child.EventCode)) continue;
            p.rows.push({
              venueCode,
              eventCode: child.EventCode,
              childGroup: child.EventGroup || null,
              eventGroup: event.EventGroup || null,
              language: child.EventLanguage || null,
              dimension: child.EventDimension || null,
              eventUrl: child.EventUrl || null,
              eventTitle: event.EventTitle || null,
              childName: child.EventName || null,
              shows: (child.ShowTimes || []).length,
            });
          }
        }
      }
      await pause(700);
    }
    const codes = [...new Set(p.rows.map((r) => r.eventCode))];
    const groups = [...new Set(p.rows.map((r) => r.childGroup).filter(Boolean))];
    const urls = [...new Set(p.rows.map((r) => r.eventUrl).filter(Boolean))];
    p.summary = { codes, groups, eventUrls: urls,
                  languages: [...new Set(p.rows.map((r) => r.language).filter(Boolean))] };
    p.verdict = !p.rows.length
      ? 'INCONCLUSIVE — the film is not on sale at the sampled venues on this date'
      : `${codes.length} code(s), ${groups.length} group(s), ${urls.length} EventUrl value(s)` +
        (urls.length === 1 ? ' — EventUrl is a usable sibling key' : '');
    R.probes.byVenue = p;
    log('  ', p.verdict, p.summary);
  }

  console.log('%c\n──────────── PROBE COMPLETE ────────────', 'font-weight:bold');
  console.table(Object.entries(R.probes).map(([n, x]) => ({ probe: n, verdict: x.verdict || '—' })));
  window.__bmsProbeLang = R;
  try { copy(JSON.stringify(R, null, 2)); console.log('Report copied — paste it back to Claude.'); }
  catch { console.log('Copy failed; run: copy(JSON.stringify(window.__bmsProbeLang))'); }
})();
