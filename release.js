/**
 * Release watching — telling you the moment a film goes on sale.
 *
 * The seat watcher answers "are there good seats in this showing". This answers
 * the question that comes before it: "can this film be booked at all yet". They
 * share almost nothing operationally. A seat map only exists once a session
 * does, and reading one needs a rendered Konva canvas in a visible window. A
 * release check needs no canvas, no session, and no page — measured in
 * probes/FINDINGS.md, every call below returns 200 straight from the service
 * worker, and byvenue does it with `credentials: 'omit'`, byte for byte
 * identical to a request carrying the signed-in session.
 *
 * So this module is deliberately all plain functions over fetched text: no tab
 * plumbing, no injected scripts, nothing that needs the browser to be showing
 * anything. That is also what makes it testable — verify.mjs imports it
 * directly and runs the parsers against captured fixtures.
 */

const HOST = 'https://in.bookmyshow.com';

// ---------------------------------------------------------------- addresses

/**
 * One film at one cinema on one date. The whole feature rests on this call:
 * three parameters, no authentication, and it answers from anywhere.
 */
export const byVenueApi = (venueCode, dateCode, regionCode) =>
  `${HOST}/api/v3/mobile/showtimes/byvenue` +
  `?dateCode=${encodeURIComponent(dateCode)}` +
  `&venueCode=${encodeURIComponent(venueCode)}` +
  `&regionCode=${encodeURIComponent(regionCode)}`;

export const cinemasUrl = (citySlug) => `${HOST}/${citySlug}/cinemas`;
export const upcomingUrl = (citySlug) => `${HOST}/explore/upcoming-movies-${citySlug}`;
export const regionsApi = () => `${HOST}/api/explore/v1/discover/regions`;
export const filmUrl = (citySlug, slug, eventCode) =>
  `${HOST}/movies/${citySlug}/${slug}/${eventCode}`;
export const buyTicketsUrl = (citySlug, slug, eventCode, dateCode) =>
  `${HOST}/movies/${citySlug}/${slug}/buytickets/${eventCode}/${dateCode}`;

// ---------------------------------------------------------------- fetching

/**
 * Cookies are opt-out here, not opt-in.
 *
 * byvenue was measured returning identical bytes with and without the session,
 * so the default carries nothing that identifies the member — a release check
 * cannot leak who you are, and cannot start failing because a login lapsed.
 * `include` is kept only as a retry, for the pages that were never measured
 * both ways, and it is reached only after an anonymous attempt has failed.
 */
export async function fetchText(url, { signal } = {}) {
  let last;
  for (const credentials of ['omit', 'include']) {
    const res = await fetch(url, { credentials, signal });
    if (res.ok) return res.text();
    last = res.status;
  }
  throw new Error(`HTTP ${last}`);
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try { return JSON.parse(text); }
  catch { throw new Error('response was not JSON'); }
}

// ---------------------------------------------------------------- page data

/**
 * The server-rendered state out of a fetched document.
 *
 * Only the typed `__NEXT_DATA__` script is read. The looser global-assignment
 * form that content.js also handles is not needed here: every page this module
 * fetches was observed shipping the typed tag, and accepting fewer shapes means
 * fewer ways to accidentally parse something that isn't the state.
 */
export function nextData(html) {
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html || '');
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Depth- and cycle-limited walk over parsed JSON. */
export function walk(node, visit, depth = 0, seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
  seen.add(node);
  if (!Array.isArray(node)) visit(node);
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    walk(v, visit, depth + 1, seen);
  }
}

// ---------------------------------------------------------------- the dates

/** A Date as BookMyShow writes dates: 20260826. */
export const toDateCode = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * "2026-08-21T00:00:00" → "20260821", by string surgery rather than by Date.
 *
 * Parsing it as a Date and reformatting would shift the day for anyone west of
 * UTC: the value has no zone, so it is read as UTC midnight and printed as the
 * previous evening. A film would go dormant a day late and the watch would miss
 * the morning bookings opened. The digits are already in the order wanted.
 */
export function dateCodeFromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** A date code as a local-midnight timestamp, for comparing against now. */
export function dateCodeToTs(code) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(code || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

export const addDays = (ts, days) => ts + days * 86400000;

// ---------------------------------------------------------------- the venues

/**
 * The cinemas page, which carries every venue in a city along with the dates it
 * is currently selling.
 *
 * `arrDates` is not used to decide whether a film is on sale — it is per venue,
 * not per film, so a cinema selling *anything* on a date would read as a false
 * positive. It is shown in the picker so a venue that has gone dark is visible
 * as such, and nothing schedules on it.
 */
export function parseCinemas(html) {
  const data = nextData(html);
  const byCode = new Map();
  if (data) {
    walk(data, (o) => {
      const code = o.VenueCode || o.venueCode;
      const name = o.VenueName || o.venueName;
      if (typeof code !== 'string' || !/^[A-Z0-9]{3,8}$/.test(code)) return;
      if (typeof name !== 'string' || name.length < 2) return;
      if (byCode.has(code)) return;
      byCode.set(code, {
        code, name,
        subRegion: o.SubRegionCode || o.subRegionCode || null,
        address: o.VenueAddress || null,
        dates: Array.isArray(o.arrDates)
          ? o.arrDates.map((d) => d?.ShowDateCode).filter(Boolean) : [],
      });
    });
  }
  // The state walk is the good path, but it depends on the page shipping its
  // data in a shape this recognises. The venue records were measured present in
  // the raw text of the very same fetch, so when the walk comes back empty the
  // text is worth reading directly rather than reporting no cinemas at all.
  if (!byCode.size) {
    const text = String(html || '');
    const re = /"VenueCode"\s*:\s*"([A-Z0-9]{3,8})"/g;
    let m;
    while ((m = re.exec(text))) {
      const code = m[1];
      if (byCode.has(code)) continue;
      // The name sits beside the code in the same record. A bounded window
      // keeps this from pairing a code with some other venue's name further
      // down the document.
      const around = text.slice(Math.max(0, m.index - 700), m.index + 700);
      const name = /"VenueName"\s*:\s*"([^"]{2,90})"/.exec(around)?.[1];
      if (!name) continue;
      byCode.set(code, { code, name, subRegion: null, address: null, dates: [] });
    }
  }

  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The city list. Both spellings of the key are accepted because the response
 * has been seen using each, and a city picker that silently comes back empty is
 * worse than one that casts a slightly wider net.
 */
export function parseRegions(body) {
  const out = new Map();
  walk(body, (o) => {
    const code = o.RegionCode || o.regionCode || o.code;
    if (typeof code !== 'string' || !/^[A-Za-z]{2,12}$/.test(code)) return;

    const name = [o.RegionName, o.regionName, o.name, o.title, o.displayName]
      .find((x) => typeof x === 'string' && x.trim());
    const slug = [o.RegionNameSlug, o.regionNameSlug, o.RegionSlug, o.regionSlug, o.slug]
      .find((x) => typeof x === 'string' && x.trim());

    // A code alone is useless in a picker — it names nothing you would
    // recognise and builds no address. Either half of the pair is enough
    // though: a slug can be prettified into a name, and a name can be
    // slugified into an address. Requiring both, as this first did, threw away
    // every region on a response that happened to spell one of them
    // differently, and the picker came up empty with nothing to say about why.
    if (!name && !slug) return;
    if (out.has(code.toUpperCase())) return;

    out.set(code.toUpperCase(), {
      code: code.toUpperCase(),
      name: name || titleCase(slug),
      slug: slug || slugify(name),
    });
  });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Turns HTML entities back into characters.
 *
 * Titles are lifted out of raw markup with a regex, and markup is where
 * entities live — a service worker has no DOM to decode them with. Left alone,
 * "I&#x27;m Game" is stored verbatim and then escaped again for display, so the
 * entity itself ends up on screen.
 */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // An unparseable or out-of-range reference is left as it was: showing
      // "&#99999999;" is worse than showing nothing, but inventing a character
      // is worse than both.
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    const name = body.toLowerCase();
    return name in NAMED ? NAMED[name] : whole;
  });
}

/**
 * A film's name as it should be shown.
 *
 * BookMyShow appends a year to disambiguate re-releases and same-name films.
 * It is not part of the name, and the release date is already on the row.
 */
export function cleanTitle(text) {
  return decodeEntities(text)
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "ramba-oorvasi-menaka" → "Ramba Oorvasi Menaka". The last resort for a name. */
export const titleFromSlug = (slug) => titleCase(String(slug || ''));

const titleCase = (s) =>
  String(s).split('-').filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * The cities BookMyShow itself puts above the fold, in its own order.
 *
 * Not a guess: the region endpoint was observed returning MUMBAI, NCR, BANG,
 * HYD, CHD, AHD, PUNE, CHEN in exactly this sequence, which is the same order
 * the site's own "Popular Cities" row uses. Sorting the response alphabetically
 * — as this first did — threw that ranking away and buried Hyderabad among two
 * thousand others.
 *
 * Kept as an explicit list rather than "the first ten of the response", so a
 * reordering upstream changes which cities are popular rather than silently
 * promoting whatever now happens to come back first.
 */
export const POPULAR_REGION_CODES =
  ['MUMBAI', 'NCR', 'BANG', 'HYD', 'CHD', 'AHD', 'PUNE', 'CHEN', 'KOLK', 'KOCH'];

const POPULAR_NAMES = new Set(
  ['mumbai', 'delhi-ncr', 'ncr', 'bengaluru', 'bangalore', 'hyderabad', 'chandigarh',
   'ahmedabad', 'pune', 'chennai', 'kolkata', 'kochi']);

/**
 * Splits a region list the way the site's own picker does: a short row of the
 * big ones, then everything else alphabetically.
 *
 * Matching is by code and falls back to name, because a code that turns out to
 * be spelled differently should cost that city its place at the top, not drop
 * it from the list — it simply appears further down with the rest.
 */
export function groupRegions(regions) {
  const rank = new Map(POPULAR_REGION_CODES.map((c, i) => [c, i]));
  const isPopular = (r) =>
    rank.has(r.code) || POPULAR_NAMES.has(String(r.name || '').toLowerCase());

  const popular = regions.filter(isPopular).sort((a, b) =>
    (rank.has(a.code) ? rank.get(a.code) : 99) - (rank.has(b.code) ? rank.get(b.code) : 99) ||
    a.name.localeCompare(b.name));
  const rest = regions.filter((r) => !isPopular(r))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { popular, rest };
}

/**
 * Cities to fall back on when the region endpoint cannot be read.
 *
 * Not a substitute for the real list — it is the handful of regions large
 * enough that somebody is likely to be in one, so a failed lookup leaves the
 * picker usable rather than dead. Codes and slugs are BookMyShow's own, taken
 * from its addresses.
 */
export const FALLBACK_REGIONS = [
  { code: 'MUMBAI', name: 'Mumbai', slug: 'mumbai' },
  { code: 'NCR', name: 'Delhi-NCR', slug: 'national-capital-region-ncr' },
  { code: 'BANG', name: 'Bengaluru', slug: 'bengaluru' },
  { code: 'HYD', name: 'Hyderabad', slug: 'hyderabad' },
  { code: 'CHD', name: 'Chandigarh', slug: 'chandigarh' },
  { code: 'AHD', name: 'Ahmedabad', slug: 'ahmedabad' },
  { code: 'PUNE', name: 'Pune', slug: 'pune' },
  { code: 'CHEN', name: 'Chennai', slug: 'chennai' },
  { code: 'KOLK', name: 'Kolkata', slug: 'kolkata' },
  { code: 'KOCH', name: 'Kochi', slug: 'kochi' },
];

// ------------------------------------------------------------- the showtimes

/**
 * Flattens byvenue into one record per bookable child event.
 *
 * `group` is the field that matters. A film is one EventGroup and many
 * EventCodes — Irumudi ships three, all Telugu — so a watch created against the
 * code shown on a listing would silently miss whichever variant actually goes
 * on sale. The group is stable across all of them, and across languages.
 */
export function parseByVenue(body, venueCode) {
  const out = [];
  for (const day of body?.ShowDetails || []) {
    const date = day.Date || null;
    const venue = day.Venues?.VenueCode || venueCode || null;
    for (const event of day.Event || []) {
      for (const child of event.ChildEvents || []) {
        const shows = (child.ShowTimes || []).map((s) => ({
          sessionId: s.SessionId ? String(s.SessionId) : null,
          time: s.ShowTime || '',
          screen: s.ScreenName || '',
        })).filter((s) => s.sessionId);
        if (!child.EventCode) continue;
        out.push({
          eventCode: String(child.EventCode),
          group: child.EventGroup || event.EventGroup || null,
          title: event.EventTitle || child.EventName || '',
          language: child.EventLanguage || '',
          dimension: child.EventDimension || '',
          slug: child.EventUrl || null,
          venueCode: venue, date, shows,
        });
      }
    }
  }
  return out;
}

/**
 * Does this child event belong to the film being watched?
 *
 * Group first, and only the group when the watch has one — that comparison is
 * exact and needs no normalising. The event code is a fallback for watches
 * created before a group was known, and it is genuinely weaker: matching it can
 * miss a sibling variant. Title is never matched on; it was the plan until the
 * group turned up, and keeping it would reintroduce every normalisation problem
 * the group avoids.
 */
export function matchesFilm(child, watch) {
  if (watch.group && child.group) return child.group === watch.group;
  if (watch.eventCode && child.eventCode === watch.eventCode) return true;
  return Boolean(watch.eventCode && watch.codes?.includes(child.eventCode));
}

// ------------------------------------------------------------- the film page

/**
 * Whether a film's own page says booking is open, in three values rather than
 * two.
 *
 * There is no structured flag to read — an open film and an unopened one were
 * measured differing only in rendered text, so this keys on wording that
 * BookMyShow can change at any time. A two-valued version would report a
 * reworded page as "not open", and a watch would sit silent through the exact
 * event it exists to catch, looking like it was working. `unknown` is therefore
 * a real answer: it never fires an alert, and it surfaces as a warning so a
 * broken detector is visible instead of quiet.
 */
export function bookingSignal(html) {
  const text = String(html || '');
  const open = /Book tickets/i.test(text);
  const pending = /Releasing on|Coming Soon|Notify Me/i.test(text);
  if (open) return 'open';
  if (pending) return 'closed';
  return 'unknown';
}

/**
 * The facts a watch needs, taken once when it is created: the group to match
 * on, and the release date the schedule is built around.
 *
 * The group is the most frequently occurring EG code on the page rather than
 * the first. A film page carries its own group many times over, and may mention
 * another once in a "you might also like" rail; taking the first would
 * occasionally bind a watch to the wrong film, and the failure would look like
 * the film simply never going on sale.
 */
export function parseFilmPage(html) {
  const text = String(html || '');
  const counts = new Map();
  for (const eg of text.match(/EG\d{6,}/g) || []) counts.set(eg, (counts.get(eg) || 0) + 1);
  const group = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const iso = /"releaseDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/.exec(text) ||
              /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(text);
  const raw = /<title>([^<]{2,160})</.exec(text)?.[1]?.split(/\s+[|–—-]\s+/)[0];
  const title = raw ? (cleanTitle(raw) || null) : null;

  return {
    group,
    releaseDate: iso ? dateCodeFromIso(iso[1]) : null,
    title,
    booking: bookingSignal(text),
  };
}

/**
 * The upcoming-movies listing. Every card's identifiers live in the analytics
 * object BookMyShow attaches for its own tracking, which is the only place on
 * that page carrying the group code — the visible card markup does not.
 */
export function parseUpcoming(html) {
  const data = nextData(html);
  const out = new Map();
  if (data) {
    walk(data, (o) => {
      const code = o.event_code || o.eventCode;
      if (typeof code !== 'string' || !/^ET\d{6,}$/i.test(code)) return;
      if (out.has(code)) return;
      out.set(code, {
        eventCode: code.toUpperCase(),
        group: (o.event_group || o.eventGroup || '').toUpperCase() || null,
        title: o.title || o.event_name || '',
        language: o.language || '',
        genre: o.genre || '',
      });
    });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- scheduling

export const RELEASE_DEFAULTS = {
  intervalMinutes: 10,   // one flat cadence; the user sets it
  dormancyDays: 7,       // nothing is polled until this close to release
  enabled: true,
  // Premieres run the evening or night BEFORE release day — benefit shows, 1am
  // and 4am shows, paid previews. They are frequently the first thing to go on
  // sale and the thing fans most want, so watching release day alone misses the
  // booking that mattered most. One day back covers the ordinary case; 0 turns
  // it off, 2 covers a film with previews spread over two nights.
  premiereDays: 1,

  // What a newly added watch starts with, keyed by region code. Venue codes
  // only mean anything inside one city, so a single flat list could not
  // survive changing city — it either carried nonsense across or was thrown
  // away, and thrown away is what it used to do. Empty for a city means "any
  // theatre" there, which is the weaker signal.
  defaultVenues: {},
};

/**
 * The theatres chosen for one city.
 *
 * Accepts the old flat-array shape as well, because a config written before
 * this was keyed by city still has one — and the city it belonged to is the
 * one that was current when it was saved, which is the only city it can
 * sensibly still apply to.
 */
export function venuesForCity(defaultVenues, cityCode, savedUnderCity) {
  if (Array.isArray(defaultVenues)) {
    return (!savedUnderCity || savedUnderCity === cityCode) ? [...defaultVenues] : [];
  }
  const list = defaultVenues?.[cityCode];
  return Array.isArray(list) ? [...list] : [];
}

/**
 * When a watch should start polling.
 *
 * A film three months out polled every ten minutes is roughly thirteen thousand
 * requests before the first one could possibly matter — wasted battery, and the
 * surest way to start looking like a scraper. Sleeping until the release is
 * within reach costs nothing, because booking does not open months ahead.
 *
 * A watch with no release date is not held back. That is deliberate: the date
 * could not be read, so the only safe assumption is that the film might go on
 * sale at any moment, and being noisy is a far better failure than being late.
 */
export function wakesAt(watch, dormancyDays = RELEASE_DEFAULTS.dormancyDays) {
  const ts = dateCodeToTs(watch.releaseDate);
  if (ts == null) return 0;
  return addDays(ts, -Math.max(0, dormancyDays));
}

export const isDormant = (watch, now, dormancyDays) => now < wakesAt(watch, dormancyDays);

/**
 * A watch is finished once its release date is a day behind us. Either it fired
 * and the film is out, or it never did and polling further cannot help.
 */
export function isExpired(watch, now) {
  const ts = dateCodeToTs(watch.releaseDate);
  return ts != null && now > addDays(ts, 1);
}

/**
 * A watch wakes before its earliest premiere, not before release day.
 *
 * With a 1-day dormancy and a premiere the night before, waking on release day
 * would mean the premiere had already come and gone unwatched.
 */
export function wakesAtWithPremieres(watch, dormancyDays, premiereDays) {
  const base = wakesAt(watch, dormancyDays);
  if (!base) return base;
  const dates = datesFor(watch, premiereDays);
  const earliest = dateCodeToTs(dates[0]);
  return earliest == null ? base : Math.min(base, earliest);
}

/** Spread the checks out, so many watches don't fire in the same second. */
export const jitter = (ms) => Math.round(ms * (0.85 + Math.random() * 0.3));

export function nextCheckAt(now, intervalMinutes = RELEASE_DEFAULTS.intervalMinutes) {
  const ms = Math.max(1, Number(intervalMinutes) || RELEASE_DEFAULTS.intervalMinutes) * 60000;
  return now + jitter(ms);
}

/**
 * The dates a watch asks about: release day, and the premiere nights before it.
 *
 * Oldest first, so an alert naming several dates reads in the order they happen.
 * Each date costs one request per cinema, which is why this is a small number
 * and not a window.
 */
export function datesFor(watch, premiereDays = RELEASE_DEFAULTS.premiereDays) {
  if (!watch.releaseDate) return [toDateCode(new Date())];
  const release = dateCodeToTs(watch.releaseDate);
  if (release == null) return [watch.releaseDate];

  const back = Math.max(0, Math.min(7, Number(premiereDays) || 0));
  const out = [];
  for (let i = back; i >= 1; i--) out.push(toDateCode(new Date(addDays(release, -i))));
  out.push(watch.releaseDate);
  return out;
}

/** Is this showing before the film is officially out — i.e. a premiere? */
export const isPremiere = (dateCode, watch) => {
  const a = dateCodeToTs(dateCode);
  const b = dateCodeToTs(watch?.releaseDate);
  return a != null && b != null && a < b;
};

/**
 * How a date is named in an alert.
 *
 * The day matters as much as the cinema — "premiere, Thu 27 Aug" and "Fri 28
 * Aug" are two different things to decide about, and an alert that only named
 * the cinema would leave you to work out which one opened.
 */
export function dateLabel(dateCode, watch) {
  const ts = dateCodeToTs(dateCode);
  if (ts == null) return '';
  const when = new Date(ts).toLocaleDateString('en-IN',
    { weekday: 'short', day: 'numeric', month: 'short' });
  return isPremiere(dateCode, watch) ? `Premiere · ${when}` : when;
}

/** A stable key for "this film, at this venue, on this date". */
export const seenKey = (venueCode, eventCode, date) => `${venueCode}|${eventCode}|${date}`;
