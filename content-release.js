/**
 * The bell — watching a film for the moment it goes on sale.
 *
 * The + button on a showtime chip needs a showing to exist before it can be
 * pressed, which is exactly the problem: by the time a chip is there, the good
 * seats for a first-day show have often gone. This button attaches to a film
 * instead of a showing, so it can be pressed weeks earlier, on the upcoming
 * list where there is nothing to book yet.
 *
 * It runs beside content.js rather than inside it. The two share no state and
 * answer different questions, and the pages they care about barely overlap —
 * folding this in would have meant one script that guesses which mode it is in.
 */

/*
 * Everything below is inside this closure.
 *
 * Both content scripts share one isolated world — same extension, same page,
 * one global scope between them — so a top-level `const watched` here and a
 * top-level `let watched` in content.js are the same declaration twice, and the
 * page dies with "Identifier 'watched' has already been declared". They also
 * both wanted `toast`, `pending`, `queue` and `loadWatched`.
 *
 * The body is deliberately not re-indented: shifting every line risks changing
 * the contents of a template literal, and this wrapper is about scope, not
 * layout.
 */
(() => {

const BELL = 'bms-seat-watch-bell';
const RELOAD_NEEDED = 'Seat Watch was updated — reload the page to use this';

/**
 * Is this script still attached to a live extension?
 *
 * Reloading or updating the extension leaves every already-open tab running the
 * old content script with nothing behind it. Touching chrome.runtime then does
 * not reject — it *throws*, synchronously. Inside an async function that turns
 * into a rejected promise nobody is waiting on, which is why this surfaced as
 * "Uncaught (in promise) Extension context invalidated" rather than as
 * something the .catch() at the call site could ever have caught.
 */
const connected = () => {
  try { return Boolean(chrome?.runtime?.id); } catch { return false; }
};

/**
 * The extension has gone. Say so on the buttons rather than leaving them
 * looking live, and stop doing anything else.
 */
let orphaned = false;
function markStale() {
  if (orphaned) return;
  orphaned = true;
  for (const btn of document.querySelectorAll(`.${BELL}-btn`)) {
    btn.classList.add('is-stale');
    btn.title = RELOAD_NEEDED;
    btn.setAttribute('aria-label', RELOAD_NEEDED);
  }
}

/** Where we are. Only the two page shapes that can carry a film identity. */
function pageKind() {
  const p = location.pathname;
  if (/^\/explore\/upcoming-movies-/.test(p)) return 'upcoming';
  if (/^\/movies\/[^/]+\/[^/]+\/ET\w+/.test(p) && !p.includes('/buytickets/')) return 'film';
  return null;
}

/**
 * The city, from BookMyShow's own region cookie. Both halves are needed and
 * they live in different fields: byvenue is keyed on the code, every page
 * address on the slug.
 */
function city() {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('rgn='));
  if (!raw) return null;
  try {
    const rgn = JSON.parse(decodeURIComponent(raw.slice(4)));
    const code = rgn.regionCode || rgn.regionCodeSlug?.toUpperCase();
    const slug = rgn.regionNameSlug ||
      (rgn.regionName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return code && slug ? { code, slug, name: rgn.regionName || slug } : null;
  } catch { return null; }
}

/**
 * Event code to group code, read out of the page's own state.
 *
 * The group is what a watch is keyed on — a film has one group and several
 * event codes, so a watch bound to the code visible on a card would miss the
 * variant that actually goes on sale. Nothing in the rendered card markup
 * carries it; the only copy on the page is inside the analytics payload
 * BookMyShow attaches for its own tracking, so that is what gets read.
 */
function groupIndex() {
  if (groupIndex.cached) return groupIndex.cached;
  // Reset by routeChanged(): a client-side navigation swaps the listing without
  // swapping the document, so a cached index would answer for the page you left.
  const map = new Map();
  const tag = document.getElementById('__NEXT_DATA__');
  if (tag) {
    try {
      const seen = new WeakSet();
      const walk = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
        seen.add(node);
        if (!Array.isArray(node)) {
          const code = node.event_code || node.eventCode;
          const group = node.event_group || node.eventGroup;
          if (typeof code === 'string' && /^ET\d{6,}$/i.test(code) &&
              typeof group === 'string' && /^EG\d{6,}$/i.test(group)) {
            map.set(code.toUpperCase(), {
              group: group.toUpperCase(),
              title: node.title || '',
              language: node.language || '',
            });
          }
        }
        for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v, depth + 1);
      };
      walk(JSON.parse(tag.textContent || '{}'));
    } catch { /* state reshaped — the button still works, just without the group */ }
  }
  groupIndex.cached = map;
  return map;
}

// ---------------------------------------------------------------- the button

/**
 * Films already being watched: match key to the watch's id.
 *
 * A set of keys was not enough. The id is what removes a watch, and it used to
 * be captured only when you clicked — so after a reload a ✓ had no id behind it
 * and clicking it to stop watching quietly did nothing.
 */
const watched = new Map();          // group code (or event code) -> watch id

function toast(message) {
  let el = document.querySelector(`.${BELL}-toast`);
  if (!el) {
    el = document.createElement('div');
    el.className = `${BELL}-toast`;
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-up');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-up'), 3200);
}

function paint(btn, on) {
  // Idempotent on purpose. Every pass repaints every bell, and a write that
  // changes nothing still mutates the DOM — which wakes the observer, which
  // schedules another pass. That is a message to the worker every 400ms for as
  // long as the tab is open.
  const glyph = on ? '✓' : '🔔';
  if (btn.textContent === glyph && btn.classList.contains('is-on') === on) return;

  btn.classList.toggle('is-on', on);
  // A crossed-out bell is the icon for "muted", which is the opposite of what
  // clicking this does. The + button next door already solves the same problem
  // by going + → ✓, so the bell says what it offers and the tick says it is on.
  btn.textContent = on ? '✓' : '🔔';
  btn.title = on
    ? 'Watching for booking to open — click to stop'
    : 'Tell me when booking opens for this film';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(on));
}

/**
 * Every identifier a film can be recognised by.
 *
 * Both, not one, because the two sides used to disagree. A bell whose page
 * state yielded no group sent the event code; `addRelease` then read the group
 * off the film page and stored the watch under that instead. On the next load
 * the page computed the event code again, found nothing under it, and drew an
 * unwatched bell for a film that was very much being watched.
 *
 * Registering and matching on both makes the two directions agree whichever
 * identifier either side happens to have.
 */
const keysFor = (film) => [film.group, film.eventCode].filter(Boolean);

/** The watch behind any of these keys, or null. */
function watchIdFor(keys) {
  for (const k of keys) if (watched.has(k)) return watched.get(k);
  return null;
}

const isWatched = (keys) => watchIdFor(keys) != null;

function makeButton(film) {
  const keys = keysFor(film);
  const btn = document.createElement('button');
  btn.className = `${BELL}-btn`;
  btn.type = 'button';
  // On the element, so a later load of the watch list can repaint a button
  // that was drawn before the list arrived.
  btn.dataset.bellKeys = keys.join(',');
  paint(btn, isWatched(keys));

  btn.addEventListener('click', async (e) => {
    // The card underneath navigates to the film. This must not.
    e.preventDefault();
    e.stopPropagation();

    const on = isWatched(keys);
    try {
      // The id comes from the watch list, not from a click earlier in this
      // page's life — after a reload there was no such click.
      const id = watchIdFor(keys) || film.watchId;
      const res = on
        ? await chrome.runtime.sendMessage({ type: 'removeRelease', id })
        : await chrome.runtime.sendMessage({ type: 'addRelease', entry: film });
      if (!res?.ok) return toast(res?.error || 'Could not save that film');
      if (res.alreadyOut) {
        return toast('Already in cinemas — open its showtimes and use the + to watch seats');
      }

      if (on) { for (const k of keys) watched.delete(k); }
      else {
        for (const k of keys) watched.set(k, res.id);
        film.watchId = res.id;
      }
      paint(btn, !on);
      toast(on
        ? 'Stopped watching'
        : 'Watching — you’ll get a ping when booking opens. Pick theatres in Settings.');
    } catch {
      // Either the extension went away between the click and the send, or the
      // worker refused it. Only the first has an action attached to it.
      if (!connected()) markStale();
      toast(connected() ? 'Could not save that film' : RELOAD_NEEDED);
    }
  });
  return btn;
}

// ---------------------------------------------------------------- placement

/**
 * Every film link on the upcoming list, one button each.
 *
 * Anchors are the anchor, so to speak: the card markup is rewritten between
 * releases but the href has to keep carrying the film's code for the link to
 * work at all, which makes it the most stable thing on the page.
 */
function decorateUpcoming() {
  const index = groupIndex();
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/movies/"]')) {
    const m = a.getAttribute('href')?.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d{6,})/i);
    if (!m) continue;
    const [, , slug, code] = m;
    const eventCode = code.toUpperCase();
    if (seen.has(eventCode)) continue;
    seen.add(eventCode);

    const card = a.closest('[class*="card"], li, article') || a;
    // A bell already here is repainted, never skipped. Skipping is what made a
    // reload lose the tick: the first pass can run before the watch list has
    // arrived, and a button drawn blank then stayed blank for good.
    const existing = card.querySelector(`.${BELL}-btn`);
    if (existing) {
      paint(existing, isWatched((existing.dataset.bellKeys || '').split(',').filter(Boolean)));
      continue;
    }

    const meta = index.get(eventCode) || {};
    const btn = makeButton({
      eventCode, slug, group: meta.group || null,
      // The language this listing is in. A film out in three languages has a
      // card and an event code for each, and the watch needs to know which one
      // it was created from before it can tell you a *different* one opened.
      language: meta.language || '',
      // No title rather than a bad one. The card's text is the whole card —
      // genre, like count, the name twice over — and it would be stored and
      // shown as the film's name. The worker reads the real title off the
      // film's own page, and falls back to the slug.
      title: meta.title || null,
      city: city(),
    });
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(btn);
  }
}

/** One button on a film's own page, floated clear of the page's own chrome. */
function decorateFilm() {
  const existing = document.querySelector(`.${BELL}-btn`);
  if (existing) {
    paint(existing, isWatched((existing.dataset.bellKeys || '').split(',').filter(Boolean)));
    return;
  }
  const m = location.pathname.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d{6,})/i);
  if (!m) return;
  const [, , slug, code] = m;
  const eventCode = code.toUpperCase();
  const group = (document.documentElement.innerHTML.match(/EG\d{6,}/g) || [])
    .reduce((best, eg, _, all) => {
      const n = all.filter((x) => x === eg).length;
      return n > best.n ? { eg, n } : best;
    }, { eg: null, n: 0 }).eg;

  const btn = makeButton({
    eventCode, slug, group,
    language: groupIndex().get(eventCode)?.language || '',
    title: document.title.split(/\s+[|–-]\s+/)[0].trim(),
    city: city(),
  });
  btn.classList.add('is-floating');
  document.body.appendChild(btn);
}

// ---------------------------------------------------------------- run

/** Repaints every bell on the page from the current watch list. */
function repaintAll() {
  for (const btn of document.querySelectorAll(`.${BELL}-btn`)) {
    paint(btn, isWatched((btn.dataset.bellKeys || '').split(',').filter(Boolean)));
  }
}

/**
 * Loads the watch list, reporting whether it actually arrived.
 *
 * The service worker is usually asleep when a page loads, and the first message
 * to it can be refused while it starts. Treating that as "nothing is watched"
 * is what dropped the tick on reload, so the failure is now returned rather
 * than swallowed, and the caller retries.
 */
/**
 * Every identifier one watch answers to, including the languages it has adopted
 * since it was created.
 *
 * A film out in three languages has three cards and three film pages, and one
 * watch covers all of them. Registering only the code it was created from left
 * the Telugu card showing an unwatched bell — and clicking it would have made a
 * second watch for a film already being watched.
 */
const keysOf = (w) => [w.group, w.eventCode,
  ...(w.variants || []).flatMap((v) => [v.group, v.eventCode])].filter(Boolean);

async function loadWatched() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'listReleases' });
    if (!res?.ok) return false;
    watched.clear();
    // Under both identifiers, so a page that can only produce one of them still
    // recognises the watch.
    for (const w of res.releases) {
      for (const k of keysOf(w)) watched.set(k, w.id);
    }
    return true;
  } catch {
    return false;
  }
}

async function run() {
  // Every button on this page is now inert, so say so before anyone clicks one.
  if (!connected()) return markStale();

  const kind = pageKind();
  if (!kind) return;
  const ok = await loadWatched();

  // Tell the worker which city the browser is set to, so the settings page
  // opens on the right one without asking. It only takes the hint if nothing
  // has been chosen — a hint must never override a choice.
  //
  // try/catch as well as .catch(): the send throws outright once the extension
  // is gone, and a throw never reaches a .catch() on a promise that was never
  // created.
  const c = city();
  if (c) {
    try { chrome.runtime.sendMessage({ type: 'cityHint', city: c }).catch(() => {}); }
    catch { return markStale(); }
  }

  kind === 'upcoming' ? decorateUpcoming() : decorateFilm();

  // If the list never arrived, the bells on screen are showing "not watched"
  // without knowing it. Ask again, and repaint whatever is already drawn.
  if (!ok) retryLoad();
}

/**
 * Asks again when the first attempt found the worker asleep.
 *
 * A few tries, spaced out, then it stops — the observer below will also call
 * run() as the listing renders, and an endless retry on a page whose extension
 * has genuinely gone away is just noise.
 */
let retries = 0;
function retryLoad() {
  if (orphaned || retries >= 4) return;
  const wait = 400 * 2 ** retries;
  retries++;
  setTimeout(async () => {
    if (await loadWatched()) { retries = 0; repaintAll(); }
    else retryLoad();
  }, wait);
}

/**
 * A change made anywhere else — Stop in the popup, a removal in settings, a
 * bell clicked in another tab — repaints the bells here.
 *
 * Without this the page keeps whatever it learned when it loaded, so a film
 * removed from the watchlist went on showing a tick until you reloaded. The
 * `+` buttons have watched storage this way since the beginning; the bell
 * simply never did.
 *
 * The new value is read straight from the change rather than asked for again:
 * it is the same list `listReleases` would return, and it is already here.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.releases) return;
  watched.clear();
  for (const w of changes.releases.newValue || []) {
    for (const k of keysOf(w)) watched.set(k, w.id);
  }
  repaintAll();
});

run().catch(markStale);

// The listings render client-side and re-render on filter changes, so one pass
// at load would leave most cards bare. Debounced, because the observer fires
// many times for one visual update.
let pending;
let lastHref = location.href;

/**
 * A click inside BookMyShow changes the URL without loading a document, so
 * everything remembered about "this page" has to be dropped when it happens.
 */
function routeChanged() {
  if (location.href === lastHref) return false;
  lastHref = location.href;
  groupIndex.cached = undefined;

  // The film page's bell floats over the page from <body>, which is outside the
  // markup BookMyShow swaps on a route change — so nothing takes it away, and
  // it followed you to the home page and everywhere after.
  //
  // Removing it also fixes the quieter half: the bell is bound to one film, and
  // decorateFilm() repaints an existing button rather than rebuilding it. Left
  // in place across a move from one film to another it would keep the first
  // film's identity while sitting on the second's page, and clicking it would
  // watch the wrong film.
  for (const btn of document.querySelectorAll(`.${BELL}-btn.is-floating`)) btn.remove();
  return true;
}

function queue() {
  if (orphaned) return;
  clearTimeout(pending);
  pending = setTimeout(() => {
    routeChanged();
    // run() is started from a timer, so nothing is awaiting it — an error
    // escaping here is an unhandled rejection in the page's console.
    if (pageKind()) run().catch(markStale);
  }, 400);
}


/** Did this batch of mutations come from us? Adding a bell must not schedule a
 *  pass that adds another one — the listing then costs a message per button. */
const isOurs = (n) => n?.nodeType === 1 && String(n.className || '').startsWith(BELL);
const oursOnly = (records) => records.every((r) =>
  // The target matters as much as the nodes: changing a bell's label adds a
  // text node, whose parent is the bell. Checking only addedNodes sees a bare
  // text node, decides it is the page's, and schedules a pass.
  isOurs(r.target) || [...r.addedNodes, ...r.removedNodes].every(isOurs));

new MutationObserver((records) => {
  if (!oursOnly(records)) queue();
}).observe(document.body, { childList: true, subtree: true });

// Back and forward move between routes without touching the DOM first, so the
// observer alone would miss them.
addEventListener('popstate', queue);

})();
