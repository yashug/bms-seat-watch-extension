/**
 * Puts a Watch control on every showtime of a BookMyShow listing page, so a
 * show reaches the watch list without anyone copying a URL out of the address
 * bar.
 *
 * Seat-layout addresses are assembled rather than scraped:
 *
 *   /movies/{region}/seat-layout/{eventCode}/{venueCode}/{sessionId}/{date}
 *
 * The listing page's own URL supplies region, venue and date. eventCode and
 * sessionId have to come from the page — see readSessions(), which is the one
 * part of this file that depends on BookMyShow's markup.
 *
 * Sold-out showtimes get the control too. They're the whole point: a greyed
 * chip is exactly the show whose blocked seats might be released later.
 */

const BADGE = 'bms-seat-watch';

/**
 * Whether this script can still reach the extension it came from.
 *
 * A content script keeps running after its extension is reloaded or updated —
 * the page is not re-injected, but the connection is cut, and `chrome.runtime`
 * goes away underneath it. Every button already on the page still looks live
 * and does nothing, which is the worst of both worlds. Checking lets the click
 * say what happened instead of throwing into the console.
 */
const connected = () => {
  try { return Boolean(chrome?.runtime?.id); } catch { return false; }
};

// Said on a click that can no longer be delivered. Reloading is the fix: the
// page has to be injected again before any of this works.
const RELOAD_NEEDED = 'Seat Watch was updated — reload the page to add shows';

// ---------------------------------------------------------------- addresses

/**
 * BookMyShow lists showtimes two ways round, and each needs different handling.
 *
 *   by venue  /cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260801
 *             one cinema, many films. Rows are films; the venue is in the URL.
 *
 *   by film   /movies/hyderabad/spider-man-brand-new-day/buytickets/ET00505091/20260802
 *             one film, many cinemas. Rows are venues, so the venue code has to
 *             come from the data, per showtime.
 *
 * Note the region: a code on one, a slug on the other. Both work in a
 * seat-layout address, so `region` is passed straight through — but the film
 * endpoint needs the code, which is why regionCode() exists below.
 */
function pageContext(href) {
  const cinema = href.match(
    /\/cinemas\/([^/?#]+)\/[^/?#]+\/buytickets\/([^/?#]+)\/(\d{8})/);
  if (cinema) {
    return { kind: 'venue', region: cinema[1], venueCode: cinema[2], date: cinema[3] };
  }
  const movie = href.match(/\/movies\/([^/?#]+)\/[^/?#]+\/buytickets\/(ET\w+)\/(\d{8})/);
  if (movie) {
    return {
      kind: 'movie', region: movie[1], eventCode: movie[2], date: movie[3],
      venueCode: null, search: href.includes('?') ? href.slice(href.indexOf('?')) : '',
    };
  }
  return null;
}

/**
 * The three-letter region the film endpoint wants — "HYD", where the URL only
 * carries "hyderabad". BookMyShow keeps it in its own `rgn` cookie.
 *
 * Only that one cookie is read, and only its region fields. The same cookie jar
 * holds the signed-in member's details, which nothing here goes near.
 */
function regionCode() {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('rgn='));
  if (raw) {
    try {
      const rgn = JSON.parse(decodeURIComponent(raw.slice(4)));
      const code = rgn.regionCode || rgn.regionCodeSlug?.toUpperCase();
      if (code) return code;
    } catch { /* not JSON — fall through */ }
  }
  // If the cookie is unreadable, take the one field by name out of the page's
  // own state. Matching the field directly rather than walking the object keeps
  // this away from everything else stored beside it.
  const m = document.documentElement.innerHTML.match(/"regionCode"\s*:\s*"([A-Za-z]{2,6})"/);
  return m ? m[1].toUpperCase() : null;
}

const seatLayoutUrl = ({ region, eventCode, venueCode, sessionId, date }) =>
  `https://in.bookmyshow.com/movies/${region}/seat-layout/${eventCode}/${venueCode}/${sessionId}/${date}`;

/**
 * "07:40 PM" and "19:40" both become "1940", so a time printed on a chip can be
 * matched against a time carried in the page's data whichever way it's written.
 */
function timeKey(text) {
  const raw = String(text || '').trim();
  // BookMyShow's own ShowTimeCode is already this format.
  const code = raw.match(/^(\d{2})(\d{2})$/);
  if (code) return Number(code[1]) <= 23 && Number(code[2]) <= 59 ? raw : null;

  const m = raw.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) {
    h %= 12;
    if (/pm/i.test(m[3])) h += 12;
  }
  if (h > 23) return null;
  return String(h).padStart(2, '0') + m[2];
}

// ---------------------------------------------------------------- showtimes

/**
 * The listing page is backed by a plain JSON endpoint keyed on exactly the
 * three things the page URL already gives us. Asking it directly beats reading
 * the rendered state: it returns the session IDs verbatim, along with the
 * screen, the price and whether the show is sold out.
 *
 * The path is deliberately host-relative: it resolves against whatever page the
 * content script is running on, so the request is same-origin by construction,
 * carries the page's own cookies, and needs no extra permission.
 */
const showtimesApi = ({ region, venueCode, date }) =>
  `/api/v3/mobile/showtimes/byvenue` +
  `?dateCode=${encodeURIComponent(date)}` +
  `&venueCode=${encodeURIComponent(venueCode)}` +
  `&regionCode=${encodeURIComponent(region)}`;

/**
 * Flattens the response into one record per showtime.
 *
 * The nesting matters: a film is an `Event` (one poster on the listing), but
 * the thing you actually book is a `ChildEvent` — the same film in Telugu 2D
 * and in Dolby 3D English are different child events with different event
 * codes, shown as separate rows. That distinction is what makes a chip
 * identifiable when two rows start at the same minute.
 */
function parseShowtimes(body, ctx = {}) {
  const out = [];
  for (const day of body?.ShowDetails || []) {
    const date = day.Date || ctx.date;
    const venueCode = day.Venues?.VenueCode || ctx.venueCode;
    for (const group of day.Event || []) {
      for (const child of group.ChildEvents || []) {
        for (const s of child.ShowTimes || []) {
          const key = timeKey(s.ShowTime) || timeKey(s.ShowTimeCode);
          if (!key || !child.EventCode || !s.SessionId) continue;
          out.push({
            eventCode: String(child.EventCode),
            sessionId: String(s.SessionId),
            venueCode, date, timeKey: key,
            title: group.EventTitle || child.EventName || '',
            language: child.EventLanguage || '',
            dimension: child.EventDimension || '',
            screen: s.ScreenName || '',
            time: s.ShowTime || '',
            price: Number(s.MinPrice) || null,
            // What BookMyShow *displays*, not what is true. Observed: a show
            // reporting AvailStatus 0 can have free seats on its layout page,
            // which is what happens when blocked inventory is released late —
            // the one moment this extension exists for. Read as a label only.
            // Nothing about watching, checking, or alerting may consult it.
            listedSoldOut: String(s.AvailStatus) === '0',
          });
        }
      }
    }
  }
  return out;
}

/**
 * The film-first listing has its own endpoint. Query parameters that describe
 * *what you are looking at* — which formats, which language — are copied off
 * the page's own address rather than invented, so switching format or language
 * on the page and letting it re-scan asks for the same thing the page did.
 */
const EVENT_SHOWTIMES = '/api/movies-data/v5/showtimes-by-event/primary-dynamic';

const eventShowtimesApi = ({ date, search, region, observed, template }) => {
  // Two sources, and which one wins per parameter is the whole point.
  //
  // The address bar says *which listing is on screen* — the film, the format,
  // the language. It is rewritten on every route change, so it is never stale.
  //
  // The page's last request says *how this browser asks* — the app code, the
  // member and session ids. A URL never carries those. But it can easily be for
  // a format or a day the page has since navigated away from: the app caches a
  // request per format-and-date and does not discard the old ones. Letting it
  // override the address bar asks for a listing nobody is looking at, and the
  // endpoint answers 400.
  //
  // So: the address bar decides what to ask about, the prior request fills in
  // the rest. Both come from the page's own request rather than the cookie
  // holding the member's details, which nothing here reads.
  const from = new URLSearchParams(search || '');
  const prior = observed ? new URLSearchParams(observed.search)
    : template ? new URLSearchParams({ ...template })
    : new URLSearchParams();

  const q = new URLSearchParams({
    etCodes: from.get('etCodes') || prior.get('etCodes') || '*',
    dateCode: date,
    isDesktop: prior.get('isDesktop') || 'true',
    regionCode: region || prior.get('regionCode') || '',
    xLocationShared: prior.get('xLocationShared') || 'false',
    memberId: prior.get('memberId') || '',
    lsId: prior.get('lsId') || '',
    subCode: prior.get('subCode') || '',
    appCode: prior.get('appCode') || 'WEB',
  });
  for (const key of ['language', 'refEventCode']) {
    const v = from.get(key) || prior.get(key);
    if (v) q.set(key, v);
  }
  return `${EVENT_SHOWTIMES}?${q}`;
};

/**
 * The listing request the page has already made, taken from its own resource
 * timing. Nothing is intercepted and nothing is replayed — the browser records
 * every address the document fetched, and this reads the latest matching one.
 *
 * This is what makes the click-through work. Arriving from the film's page is a
 * client-side route change: no reload, so no fresh page state, and the new URL
 * need not carry the language or format the endpoint is keyed on. The app's own
 * request carries all of it.
 *
 * Only same-origin entries are considered, so what comes back is an address on
 * the page's own host and can't be pointed elsewhere.
 */
function observedRequest() {
  const entries = performance.getEntriesByType?.('resource') || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    let url;
    try { url = new URL(entries[i].name, location.href); } catch { continue; }
    if (url.origin !== location.origin) continue;
    if (url.pathname === EVENT_SHOWTIMES && url.search) return url;
  }
  return null;
}

/**
 * Flattens the film endpoint's response.
 *
 * This one needs walking by hand rather than by key-matching, because the two
 * identifiers a seat-layout address needs sit in `additionalData` objects that
 * are *siblings* of the showtimes, not ancestors:
 *
 *   venue-card.additionalData.venueCode          the cinema
 *   showtimesSections[].additionalData.eventCode the film, per format
 *   showtimes[].additionalData.sessionId         the showing
 *
 * A generic walk carries context downward and would never see either, so every
 * showtime would come out unattributed.
 *
 * The widget list also holds ad slots and a "change location" card; both fail
 * the shape test naturally rather than needing to be named and excluded.
 */
function parseEventShowtimes(body) {
  const out = [];
  const film = body?.data?.header?.title?.text || '';
  // The date the server answered for. Each showing normally carries its own,
  // but this is the fallback — and it is the response's word, not the URL's,
  // so a seat-layout address can never be built for a day nobody asked about.
  const answeredFor = body?.data?.additionalData?.dateCode;

  for (const widget of body?.data?.showtimeWidgets || []) {
    for (const group of widget?.data || []) {
      for (const card of group?.data || []) {
        const venue = card?.additionalData;
        if (!venue?.venueCode) continue;

        for (const section of card.showtimesSections || []) {
          const eventCode = section?.additionalData?.eventCode;
          if (!eventCode) continue;
          // "English HDR By Barco" — language and format in one string, which
          // is also how the row is labelled on the page.
          const format = section.text?.[0]?.components?.[0]?.text || '';

          for (const show of section.showtimes || []) {
            const at = show?.additionalData || {};
            const key = timeKey(at.showTime || show.title) || timeKey(at.showTimeCode);
            if (!key || !at.sessionId) continue;
            out.push({
              eventCode: String(eventCode),
              sessionId: String(at.sessionId),
              venueCode: String(venue.venueCode),
              venueName: venue.venueName || '',
              date: at.showDateCode || answeredFor || undefined,
              timeKey: key,
              title: film,
              format,
              screen: show.screenAttr || at.attributes || '',
              time: at.showTime || show.title || '',
              listedSoldOut: String(at.availStatus) === '0',
            });
          }
        }
      }
    }
  }
  return out;
}

async function readSessionsFromApi(ctx) {
  if (ctx.kind === 'movie') {
    const region = regionCode();
    trace.region = region;
    if (!region) throw new Error('region code not readable from cookie or page');
    const observed = observedRequest();
    trace.asked = observed ? 'url + page request' : requestArgs() ? 'url + page state' : 'url';
    const url = eventShowtimesApi({ ...ctx, region, observed, template: requestArgs() });
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    trace.answeredFor = body?.data?.additionalData?.dateCode || null;
    const found = parseEventShowtimes(body);
    // If the envelope has been reshaped, fall back to the key-matching walk,
    // which will at least find anything that still nests the usual way.
    return (found.length ? found : harvest(body)).map((s) => ({ date: ctx.date, ...s }));
  }

  const res = await fetch(showtimesApi(ctx), { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseShowtimes(await res.json(), ctx);
}

// ---------------------------------------------------------------- page data

/**
 * Branches of the page state that cannot hold showtimes. `cookies` is the
 * important one — on a logged-in page it carries the member's name, email,
 * mobile number and session token. Not descending into it means this code never
 * touches them, which is a stronger guarantee than choosing not to read them.
 * The rest are skipped because the SEO block alone is tens of thousands of
 * nodes of footer links.
 */
const SKIP = /^(cookies|seo|appConfig|config|user|ud|userDetails|analytics|ads|footer|links|breadcrumbs)$/i;

/**
 * Walks the page state and collects anything that looks like a showtime. Keys
 * are matched loosely on purpose: BookMyShow renames fields between releases,
 * and a missed rename should cost a button, not a crash.
 *
 * `ctx` carries the nearest enclosing eventCode/venueCode downward, because
 * sessions are nested under the movie they belong to rather than repeating its
 * identifiers.
 */
function harvest(node, ctx = {}, out = [], depth = 0) {
  if (!node || depth > 14) return out;
  if (Array.isArray(node)) {
    for (const v of node) harvest(v, ctx, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;

  const keys = Object.keys(node);
  const val = (re) => {
    const k = keys.find((x) => re.test(x));
    const v = k === undefined ? undefined : node[k];
    return (typeof v === 'string' || typeof v === 'number') ? String(v) : undefined;
  };

  const eventCode = val(/^event(code|id)$/i) || val(/event.?code/i);
  const venueCode = val(/^venue(code|id)$/i) || val(/venue.?code/i);
  const isEvent = /^ET\w+$/i.test(eventCode || '');
  const next = {
    eventCode: isEvent ? eventCode : ctx.eventCode,
    venueCode: venueCode || ctx.venueCode,
    // On a film-first listing the rows are cinemas, so the venue's name is what
    // tells two same-minute showtimes apart — the film is the same on all of them.
    venueName: val(/^venue(name|title)$/i) || val(/venue.?name/i) || ctx.venueName,
    // A bare `title` is only the movie's name on the object that also carries
    // its code. Elsewhere in the state it's a page title or a footer heading.
    eventName: val(/^(event|movie)name$/i) || (isEvent && val(/^title$/i)) || ctx.eventName,
  };

  const sessionId = val(/^(session|show)(id|code)$/i) || val(/session.?id/i);
  const showTime = val(/^(show|session)time$/i) || val(/^time$/i) || val(/show.?time/i);
  if (sessionId && /^\d{2,8}$/.test(sessionId) && showTime && next.eventCode) {
    const key = timeKey(showTime);
    if (key) out.push({ ...next, sessionId, timeKey: key, time: showTime });
  }

  for (const [k, v] of Object.entries(node)) {
    if (!SKIP.test(k)) harvest(v, next, out, depth + 1);
  }
  return out;
}

/**
 * Slices a balanced {...} out of a script body. Braces inside string literals
 * don't count, which a naive scan gets wrong on the first movie title
 * containing one.
 */
function sliceBalanced(text, start) {
  let depth = 0, quote = null, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * The listing ships its data as `window.__INITIAL_STATE__ = {…}` inside an
 * ordinary inline script. Reading the script's text works from the isolated
 * world and before the page hydrates, so it's tried first.
 */
/**
 * The date pill the page is actually showing, which is not always the one in the
 * address bar — changing the date re-renders without necessarily rewriting the
 * URL, and binding chips from one day to sessions from another would be wrong in
 * a way nobody could see.
 *
 * Each pill carries its own date code as an id. The selected one is the only one
 * with a filled background; the rest are white and the sold-out ones are too.
 * That's a property of what "selected" means here, not of a class name that
 * changes every deploy.
 */
function selectedDate() {
  for (const el of document.querySelectorAll('[id]')) {
    if (!/^\d{8}$/.test(el.id)) continue;
    const rgb = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    if (rgb.length < 3) continue;
    const [r, g, b, a = 1] = rgb;
    if (a < 0.1) continue;                          // transparent
    if (r > 240 && g > 240 && b > 240) continue;    // white — not this one
    return el.id;
  }
  return null;
}

/** The server-rendered state, parsed once. Static for the document's life. */
function pageState() {
  if (pageState.cached !== undefined) return pageState.cached;
  pageState.cached = null;
  for (const tag of document.querySelectorAll('script:not([src])')) {
    const text = tag.textContent || '';
    const at = text.search(/__(INITIAL|PRELOADED|NUXT)_STATE__\s*=/);
    if (at < 0) continue;
    const open = text.indexOf('{', at);
    if (open < 0) continue;
    const json = sliceBalanced(text, open);
    if (!json) continue;
    try { pageState.cached = JSON.parse(json); break; } catch { /* not plain JSON */ }
  }
  return pageState.cached;
}

/**
 * A film page ships its listing inline: the server puts the very same
 * primary-dynamic response into the page's state before sending it. Reading it
 * costs nothing, needs no request, and is available before the endpoint would
 * have answered — so it's tried first and the endpoint only covers date changes.
 *
 * Navigated by explicit key path rather than by walking. The same state object
 * holds the signed-in member's name, email, mobile and session token; going
 * straight to one branch means this never passes near them.
 */
/** The arguments the page itself used, so a refetch can reuse them exactly. */
function requestArgs() {
  const queries = Object.entries(pageState()?.showtimesFunctionalApi?.queries || {});
  // Newest last: the app appends as you change format or date, and the oldest
  // entry can be several navigations out of date.
  for (let i = queries.length - 1; i >= 0; i--) {
    const [name, query] = queries[i];
    if (name.startsWith('fetchPrimaryDynamic') && query?.originalArgs?.dateCode) {
      return query.originalArgs;
    }
  }
  return null;
}

function readSessionsFromState(wantDate) {
  const queries = pageState()?.showtimesFunctionalApi?.queries;
  if (!queries) return [];
  for (const [name, query] of Object.entries(queries)) {
    if (!name.startsWith('fetchPrimaryDynamic')) continue;
    if (query?.status !== 'fulfilled') continue;
    // The state caches every date visited, so take the one being asked for.
    if (wantDate && query.originalArgs?.dateCode !== wantDate) continue;
    const found = parseEventShowtimes(query.data);
    if (found.length) return found;
  }
  return [];
}

function readSessionsFromInlineScript() {
  const out = [];
  for (const tag of document.querySelectorAll('script:not([src])')) {
    const text = tag.textContent || '';
    const at = text.search(/__(INITIAL|PRELOADED|NUXT)_STATE__\s*=/);
    if (at < 0) continue;
    const open = text.indexOf('{', at);
    if (open < 0) continue;
    const json = sliceBalanced(text, open);
    if (!json) continue;
    try { harvest(JSON.parse(json), {}, out); } catch { /* not plain JSON */ }
  }
  return out;
}

/** Server-rendered JSON, readable straight from the DOM. */
function readSessionsFromDom() {
  const out = readSessionsFromInlineScript();
  for (const tag of document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
    try { harvest(JSON.parse(tag.textContent), {}, out); } catch { /* not ours */ }
  }
  return out;
}

/**
 * Anything the page kept on a JS global is invisible from a content script's
 * isolated world, so the service worker reads it for us in the MAIN world.
 */
async function readSessionsFromPage() {
  try {
    if (!connected()) return [];
    const res = await chrome.runtime.sendMessage({ type: 'harvestSessions' });
    return res?.ok ? res.sessions : [];
  } catch { return []; }
}

/**
 * Reports where the showtimes nearly matched, when they didn't match at all.
 *
 * Prints paths and key *names* only, never values — the same page state holds
 * the signed-in member's email, mobile number and session token, and a
 * diagnostic that has to be pasted somewhere must not carry those with it.
 */
function explainMiss() {
  const near = [];
  const walk = (node, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 12 || near.length >= 6) return;
    if (Array.isArray(node)) return node.slice(0, 2).forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    const keys = Object.keys(node);
    if (keys.some((k) => /session|showid/i.test(k)) || keys.some((k) => /showtime/i.test(k))) {
      near.push(`${path}  →  ${keys.slice(0, 12).join(', ')}`);
    }
    for (const [k, v] of Object.entries(node)) if (!SKIP.test(k)) walk(v, `${path}.${k}`, depth + 1);
  };
  for (const tag of document.querySelectorAll('script:not([src])')) {
    const at = tag.textContent.search(/__(INITIAL|PRELOADED|NUXT)_STATE__\s*=/);
    if (at < 0) continue;
    const json = sliceBalanced(tag.textContent, tag.textContent.indexOf('{', at));
    try { walk(JSON.parse(json), 'state', 0); } catch { /* not plain JSON */ }
  }
  console.warn(
    'Seat Watch: found no showtimes on this page.\n' +
    (near.length
      ? 'Closest matches (paths and key names only — no values):\n  ' + near.join('\n  ')
      : 'No object carrying a session-like key was found in the page state.'));
}

/**
 * Three ways to the same answer, best first. The endpoint is authoritative and
 * survives any redesign; the rendered state is the fallback if it ever moves or
 * refuses the request.
 */
let sessionCache = { key: null, sessions: [] };
async function readSessions(ctx) {
  const key = `${ctx.region}/${ctx.venueCode}/${ctx.date}/${ctx.search || ''}`;
  if (sessionCache.key === key && sessionCache.sessions.length) return sessionCache.sessions;

  let found = [];
  // Free and already here — the page was rendered with it.
  if (ctx.kind === 'movie' && (found = readSessionsFromState(ctx.date)).length) {
    trace.source = 'page state';
  }
  if (!found.length) {
    try {
      found = await readSessionsFromApi(ctx);
      if (found.length) trace.source = 'endpoint';
    } catch (e) {
      console.warn('Seat Watch: showtimes endpoint unavailable, reading the page instead —', e.message);
    }
  }
  if (!found.length && (found = readSessionsFromDom()).length) trace.source = 'page walk';
  if (!found.length && (found = await readSessionsFromPage()).length) trace.source = 'main world';
  if (!found.length) explainMiss();

  sessionCache = { key, sessions: found };
  return found;
}

// ---------------------------------------------------------------- the chips

/**
 * Walks up from the time text to the box the button should hang on.
 *
 * The time sits two or three levels inside the bordered chip, so the immediate
 * parent is the wrong element. BookMyShow's class names are content hashes that
 * change with every deploy, so this looks for what the chip *is* — bordered,
 * and about the size of one — rather than what it's currently called.
 */
function chipBox(timeEl) {
  const sized = (el) => {
    const { width, height } = el.getBoundingClientRect();
    return width >= 60 && width <= 300 && height >= 28 && height <= 96;
  };
  let el = timeEl, firstSized = null;
  for (let i = 0; i < 5 && el.parentElement; i++) {
    el = el.parentElement;
    if (!sized(el)) continue;
    const style = getComputedStyle(el);
    // A bordered box of about the right size is unambiguously the chip.
    if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderLeftWidth) > 0) return el;
    // Otherwise remember the first chip-sized ancestor: some listings draw the
    // outline with a background or a shadow instead of a border.
    firstSized ||= el;
  }
  return firstSized || timeEl.closest('a') || timeEl.parentElement;
}

/**
 * An element whose text *starts* with a clock time.
 *
 * Deliberately not an exact match. On a film listing BookMyShow appends a
 * subtitle acronym to the time ("07:50 PM ENG", from `subtitleAcronym`), so
 * requiring the whole text to be a time finds nothing on those pages while
 * working perfectly on venue listings. The length cap keeps it from matching a
 * paragraph that happens to open with a time.
 */
const TIME_LEAF = /^\d{1,2}:\d{2}\s*(AM|PM)/i;

function findChips() {
  // Not "is a leaf" — the time is a leaf on most chips, but when a show has
  // subtitles BookMyShow puts an ENG badge inside the same element, and that
  // child made the whole chip invisible to a leaf test. Match on the text and
  // then keep only the innermost hit, which is the time either way.
  const hits = [];
  for (const el of document.querySelectorAll('a, div, span, li, button, p')) {
    const text = el.textContent.trim();
    if (text.length > 28 || !TIME_LEAF.test(text)) continue;
    // "12:00 AM - 11:59 AM" is a filter's time range, not a showtime. A chip
    // never prints two clock times, so a second one rules the element out.
    if ((text.match(/\d{1,2}:\d{2}/g) || []).length > 1) continue;
    hits.push(el);
  }

  const chips = [];
  for (const el of hits) {
    if (hits.some((other) => other !== el && el.contains(other))) continue;
    const box = chipBox(el);
    if (box && !chips.includes(box)) chips.push(box);
  }
  return chips;
}

/** Applies a filter only when it actually narrows things down. */
const narrow = (list, pred) => {
  const kept = list.filter(pred);
  return kept.length ? kept : list;
};

/**
 * Ties a chip to its session.
 *
 * Start time alone settles most chips. When it doesn't, the row around the chip
 * does: it prints the film, its language and its format, and those three
 * identify a child event exactly. The format test takes the *longest* match,
 * because "DOLBY CINEMA 3D" contains "3D" — a plain substring test would call
 * the Dolby row ambiguous with the ordinary 3D row every time.
 */
function bind(chip, sessions, used = new Set()) {
  const key = timeKey(chip.textContent);
  if (!key) return null;

  // A showing already claimed by an earlier chip can't be this one. If every
  // showing at this time is spoken for, this chip gets nothing rather than a
  // duplicate of one already on the page.
  let same = sessions.filter((s) => s.timeKey === key && !used.has(s.sessionId));
  if (!same.length) return null;
  if (same.length === 1) return same[0];

  let row = chip;
  for (let i = 0; i < 6 && row.parentElement; i++) {
    row = row.parentElement;
    const text = row.textContent;

    // On a venue listing the row names a film; on a film listing it names a
    // cinema. Both are tried, because only one of them is present either way.
    let hit = narrow(same, (s) => (s.title || s.eventName) &&
                                  text.includes(s.title || s.eventName));
    if (hit.length > 1) hit = narrow(hit, (s) => s.venueName && text.includes(s.venueName));
    if (hit.length > 1) hit = narrow(hit, (s) => s.language && text.includes(s.language));
    if (hit.length > 1) hit = narrow(hit, (s) => s.format && text.includes(s.format));
    if (hit.length > 1) hit = narrow(hit, (s) => s.screen && text.includes(s.screen));
    if (hit.length > 1) {
      const shown = hit.filter((s) => s.dimension && text.includes(s.dimension));
      if (shown.length) {
        const longest = Math.max(...shown.map((s) => s.dimension.length));
        hit = shown.filter((s) => s.dimension.length === longest);
      }
    }
    if (hit.length === 1) return hit[0];

    // One cinema can run the same film at the same minute on two screens —
    // ALLU and Aparna both do. Nothing printed on the page tells them apart,
    // so the only honest tie-break left is order: the page lists them in the
    // order the endpoint returned them, and `used` has already removed the one
    // claimed by the chip before this.
    if (hit.length > 1 &&
        hit.every((s) => s.venueCode === hit[0].venueCode && s.eventCode === hit[0].eventCode)) {
      return hit[0];
    }
  }
  return null;
}

// ---------------------------------------------------------------- the button

let watched = new Set();

/** A brief confirmation, in the extension's own voice rather than the page's. */
function toast(message) {
  let el = document.querySelector(`.${BADGE}-toast`);
  if (!el) {
    el = document.createElement('div');
    el.className = `${BADGE}-toast`;
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-up');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-up'), 2600);
}

function paintButton(btn, on, session) {
  btn.classList.toggle('is-on', on);
  btn.textContent = on ? '✓' : '+';
  // The wording never claims a show is sold out — BookMyShow's own status can
  // say that while the seat map disagrees. It only explains why watching a
  // greyed-out chip is worth doing.
  btn.title = on
    ? 'Watching this show — click to stop'
    : session?.listedSoldOut
      ? 'Listed as sold out — watch anyway, seats are often released late'
      : 'Watch this show for open seats';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(on));
}

/**
 * "Spider-Man: Brand New Day · Dolby Cinema 3D · 08:00 PM · SCREEN 1", or on a
 * film-first listing the cinema's name in place of the film's — whichever the
 * page you added it from didn't already make obvious.
 */
const describe = (s) =>
  [s.title || s.eventName, s.venueName, s.format || s.dimension, s.time, s.screen]
    .filter(Boolean).join(' · ') || undefined;

function attach(chip, session, ctx) {
  const url = seatLayoutUrl({
    region: ctx.region,
    date: session.date || ctx.date,
    eventCode: session.eventCode,
    venueCode: ctx.venueCode || session.venueCode,
    sessionId: session.sessionId,
  });

  const btn = document.createElement('button');
  btn.className = `${BADGE}-btn`;
  btn.type = 'button';
  paintButton(btn, watched.has(url), session);

  btn.addEventListener('click', async (e) => {
    // The chip itself navigates to the seat map. This button must not.
    e.preventDefault();
    e.stopPropagation();

    const on = watched.has(url);
    try {
      const res = await chrome.runtime.sendMessage({
        type: on ? 'removeShow' : 'addShow',
        url,
        label: describe(session),
      });
      if (!res?.ok) return toast(res?.error || 'Could not save that show');

      on ? watched.delete(url) : watched.add(url);
      paintButton(btn, !on, session);

      toast(on ? 'Stopped watching' : 'Watching — you’ll get a ping when seats open');
    } catch {
      // Either the extension went away between the click and the send, or the
      // worker refused it. Only the first has an action attached to it.
      toast(connected() ? 'Could not save that show' : RELOAD_NEEDED);
    }
  });

  if (getComputedStyle(chip).position === 'static') chip.style.position = 'relative';
  chip.querySelector(`.${BADGE}-btn`)?.remove();   // rebinding, not doubling up
  chip.appendChild(btn);
  chip.dataset.bmsWatch = '1';
  chip.dataset.bmsDate = session.date || ctx.date || '';
  chip.dataset.bmsWatchUrl = url;   // lets a change made elsewhere repaint this button
  chip.dataset.bmsSession = session.sessionId;   // claimed, so a rescan won't reuse it
}

// ---------------------------------------------------------------- run

/**
 * What the last scan did, stage by stage. Printed once when a page has chips
 * but nothing binds, and always available as `__bmsSeatWatch()` in the console
 * — which is the whole of what anyone needs to send when it misbehaves.
 *
 * Counts and identifiers only; no page text and nothing from the account.
 */
const trace = { page: null, region: null, date: null, shown: null, answeredFor: null, asked: null,
                source: null, sessions: 0, chips: 0, bound: 0,
                missed: { noTime: 0, noSession: 0, taken: 0, ambiguous: 0 } };
let reported = false;

window.__bmsSeatWatch = () => ({ ...trace, version: 'v1.1' });

function reportOnce() {
  if (reported) return;
  reported = true;
  console.warn('Seat Watch: found showtimes on the page but could not match them.',
    JSON.stringify(trace));
  if (!trace.sessions) explainMiss();
}

async function scan() {
  // Every button on this page is now inert, so say so before anyone clicks one.
  // Chrome updates extensions on its own schedule and does not re-inject
  // content scripts into pages that are already open, so this is not only a
  // development-time thing — a tab left open overnight can wake up like this.
  if (!connected()) return markOrphaned();

  let ctx = pageContext(location.href);
  trace.page = ctx?.kind || 'not a listing';
  if (!ctx) return;

  // What's on screen beats what's in the address bar. Picking a different date
  // re-renders the chips; if the URL lags behind, the URL is the wrong answer.
  const shown = selectedDate();
  if (shown && shown !== ctx.date) ctx = { ...ctx, date: shown };
  trace.date = ctx.date;
  trace.shown = shown;

  // A chip needs work if it has no button, or if the button belongs to a
  // different day — switching dates can reuse the same elements and rewrite the
  // text, and a button left over from yesterday would watch the wrong show.
  const stale = (c) => c.dataset.bmsWatch !== '1' || c.dataset.bmsDate !== ctx.date;

  trace.chips = findChips().length;
  if (!findChips().some(stale)) return;

  const sessions = await readSessions(ctx);
  trace.sessions = sessions.length;
  if (!sessions.length) return reportOnce();

  // Found again after the await, never before it. Reading the listing can take
  // a moment, and on a date change the app finishes re-rendering while we wait —
  // the chips captured earlier are detached by now, so buttons hung on them
  // would be attached to nothing and never appear.
  const chips = findChips().filter((c) => c.isConnected && stale(c));

  // Claimed showings, so two identical chips can't both take the same one.
  const used = new Set([...document.querySelectorAll('[data-bms-session]')]
    .filter((el) => el.dataset.bmsDate === ctx.date)
    .map((el) => el.dataset.bmsSession));

  let bound = 0;
  for (const chip of chips) {
    const session = bind(chip, sessions, used);
    if (!session) { trace.missed[whyUnbound(chip, sessions, used)]++; continue; }
    used.add(session.sessionId);
    attach(chip, session, ctx);
    bound++;
  }
  trace.bound += bound;
  if (!bound) reportOnce();
}

/**
 * Why a chip got no button — counted, never printed.
 *
 * `bind` returning null is three different situations wearing the same face,
 * and a bug report saying "130 of 132" cannot tell them apart. Each needs a
 * different fix, so each gets its own tally:
 *
 *   noTime    the element read as a showtime but holds no parseable clock time,
 *             which means findChips is picking up something that isn't a chip
 *   noSession the time is real but the listing never returned a showing at it —
 *             the response and the page disagree
 *   taken     every showing at that time was already claimed, so the page has
 *             more chips at one minute than the endpoint has showings
 *   ambiguous several showings at that minute and nothing on the row separates
 *             them, so binding one would be a guess
 *
 * Counts only. The reason is a category, never the chip's text or the film.
 */
function whyUnbound(chip, sessions, used) {
  const key = timeKey(chip.textContent);
  if (!key) return 'noTime';
  const at = sessions.filter((s) => s.timeKey === key);
  if (!at.length) return 'noSession';
  if (at.every((s) => used.has(s.sessionId))) return 'taken';
  return 'ambiguous';
}

let orphaned = false;

/**
 * Dims the buttons this page can no longer act on.
 *
 * The script keeps running after its extension goes away; only the pipe back to
 * it is gone. The buttons therefore stay on the page looking exactly as usable
 * as they were a moment ago, which is the part that wastes someone's time.
 */
function markOrphaned() {
  if (orphaned) return;
  orphaned = true;
  for (const btn of document.querySelectorAll(`.${BADGE}-btn`)) {
    btn.classList.add('is-stale');
    btn.title = RELOAD_NEEDED;
  }
}

async function loadWatched() {
  if (!connected()) return;
  const { shows = [] } = await chrome.storage.local.get('shows');
  watched = new Set(shows.map((s) => s.url));
}

let pending = null;
const queue = () => {
  clearTimeout(pending);
  pending = setTimeout(scan, 400);
};

(async function start() {
  await loadWatched();
  scan();

  // BookMyShow is a single-page app, and this matters more than it looks.
  //
  // You reach a film's showtimes by clicking "Book tickets" on the film's page,
  // which is a client-side route change — no document load, so no second chance
  // to inject. That's why the manifest also matches the film page itself: the
  // script loads there, survives the route change, and this observer picks up
  // the listing when it renders. Changing the date or format works the same way.
  //
  // scan() re-reads location.href every time and the session cache is keyed on
  // region/venue/date/query, so a route change refetches and everything else
  // reuses what it already has.
  new MutationObserver(queue)
    .observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('popstate', queue);

  if (!connected()) return;
  chrome.storage.onChanged.addListener(async (changes) => {
    if (!changes.shows) return;
    await loadWatched();
    for (const btn of document.querySelectorAll(`.${BADGE}-btn`)) {
      const chip = btn.parentElement;
      if (chip) paintButton(btn, watched.has(chip.dataset.bmsWatchUrl || ''));
    }
  });
})();
