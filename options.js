const $ = (id) => document.getElementById(id);
const showsEl = $('shows');

// The last reading of each seat map, so a show's editor can name the rows that
// hall actually has instead of asking you to guess them.
let seatState = {};

// Shows deleted here since the page loaded — a removed card, or one whose
// address was cleared. Save merges against storage, so a deletion has to be
// remembered rather than inferred from a missing card: an absent card is also
// what a show added elsewhere looks like, and those are kept.
const removed = new Set();

function showRow(show = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <div class="top">
      <input type="text" class="label" placeholder="Name it — “Kantara, Friday night”" spellcheck="false">
      <button class="quiet danger remove">Remove</button>
    </div>
    <input type="text" class="url mono" spellcheck="false"
           placeholder="https://in.bookmyshow.com/movies/…/seat-layout/…">
    <div class="pair">
      <div>
        <label>Seats together</label>
        <input type="number" class="minAdj" min="1" max="10" placeholder="use default">
      </div>
      <div>
        <label>Rows</label>
        <input type="text" class="rows" spellcheck="false" placeholder="use default">
        <div class="hint rowsSeen"></div>
      </div>
    </div>
    <div class="err"></div>`;
  wrap.querySelector('.label').value = show.label || '';
  wrap.querySelector('.url').value = show.url || '';
  // Which stored show this card stands for. Save merges on it, so a settings
  // page that has been open a while can't delete a show added since.
  if (show.url) wrap.dataset.orig = show.url;
  wrap.querySelector('.minAdj').value = show.minAdjacent ?? '';
  wrap.querySelector('.rows').value = show.rows || '';
  // The rows this hall actually has, from the last reading. Typing row names
  // blind is guesswork — F might be the fifth row or the fifteenth, and some
  // halls number rather than letter — so where a seat map has been read once,
  // it says what is there.
  const seen = (seatState?.[show.url]?.last?.map?.rows || [])
    .map((r) => r.row).filter(Boolean);
  if (seen.length) {
    wrap.querySelector('.rowsSeen').textContent =
      `This hall: ${seen.join(', ')}`;
  }
  wrap.querySelector('.remove').onclick = () => {
    if (wrap.dataset.orig) removed.add(wrap.dataset.orig);
    wrap.remove();
  };
  showsEl.appendChild(wrap);
  return wrap;
}

function readShows() {
  const out = [];
  let bad = false;
  for (const el of showsEl.querySelectorAll('.card')) {
    const url = el.querySelector('.url').value.trim();
    const err = el.querySelector('.err');
    err.textContent = '';
    if (!url) {
      // Emptying the address is the other way to drop a show.
      if (el.dataset.orig) removed.add(el.dataset.orig);
      continue;
    }
    if (!/^https:\/\/in\.bookmyshow\.com\/.*\/seat-layout\//.test(url)) {
      err.textContent = 'That isn’t a seat-map address. Open the showtime on '
                      + 'BookMyShow until you can see the seats, then copy the address bar.';
      bad = true;
      continue;
    }
    const minAdj = el.querySelector('.minAdj').value;
    out.push({
      orig: el.dataset.orig,
      url,
      label: el.querySelector('.label').value.trim() || undefined,
      minAdjacent: minAdj === '' ? undefined : Number(minAdj),
      rows: el.querySelector('.rows').value.trim() || undefined,
    });
  }
  return bad ? null : out;
}

/**
 * Settings can be saved from a page that was opened before the newest show
 * existed: the popup, the "Watch this show" button on BookMyShow and the
 * worker's retirement sweep all write `shows` behind this page's back. Writing
 * back only what the cards hold would delete every one of those. So the save is
 * a three-way merge against storage as it stands at that moment — a card edited
 * here wins for its own show, a show this page never saw is kept as it is, and
 * a show removed elsewhere stays removed rather than being resurrected by a
 * card that outlived it.
 */
function mergeShows(edited, current) {
  const live = new Set(current.map((s) => s.url));
  const claimed = new Set();
  const out = [];
  for (const { orig, ...show } of edited) {
    // A card that stood for a show which has since been removed elsewhere.
    if (orig && !live.has(orig)) continue;
    if (orig) claimed.add(orig);
    out.push(show);
  }
  for (const show of current) {
    if (!claimed.has(show.url) && !removed.has(show.url)) out.push(show);
  }

  // Typing an address that was also added elsewhere meanwhile would otherwise
  // leave the same show twice; the card wins, because it may carry edits.
  const seen = new Set();
  return out.filter((show) => {
    if (seen.has(show.url)) return false;
    seen.add(show.url);
    return true;
  });
}

/** One card per show, and a single empty one when there are none yet. */
function renderShows(list) {
  removed.clear();
  showsEl.innerHTML = '';
  (list.length ? list : [{}]).forEach(showRow);
}

/** Every show address this page currently has a card for, saved or just typed. */
const cardUrls = () => new Set(
  [...showsEl.querySelectorAll('.card')]
    .flatMap((el) => [el.dataset.orig, el.querySelector('.url').value.trim()])
    .filter(Boolean));

// A show added from the popup or from BookMyShow while this page sits open
// appears here too, rather than being invisible until the next reload. Existing
// cards are left alone — half-typed edits are not worth losing to a repaint.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.shows) return;
  const known = cardUrls();
  for (const show of changes.shows.newValue || []) {
    if (!known.has(show.url) && !removed.has(show.url)) showRow(show);
  }
});

/**
 * Chrome won't let the service worker POST to an address the extension has no
 * permission for, and asking for every host at install time would be a scary
 * prompt for a feature most people don't use. So it's an optional permission,
 * requested for just that one origin, from the click that needs it.
 */
async function allowWebhook(url) {
  if (!url) return true;
  let origin;
  try { origin = new URL(url).origin + '/*'; }
  catch { throw new Error('That doesn’t look like a web address'); }
  if (!/^https:/.test(url)) throw new Error('The address has to start with https://');
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

// The scheduler thinks in 0-1 fractions of the hall's width; people think in
// places. This is the whole translation.
const WHERE = [['middle', 0.5], ['centre', 0.22]];
const offCentreFor = (choice) => WHERE.find(([k]) => k === choice)?.[1] ?? null;

// Seconds on the wire, because that's what the scheduler works in. Only the
// last-hours band is edited in seconds; the rest read better in minutes.
const CADENCE_DEFAULTS = { window: 90, soon: 300, day: 900, far: 1800, unknown: 600 };
const IN_SECONDS = new Set(['window']);
const MIN_SECONDS = 60;

const cadenceFields = () => Object.keys(CADENCE_DEFAULTS)
  .map((band) => ({ band, el: $(`cad-${band}`), unit: IN_SECONDS.has(band) ? 1 : 60 }));

function showCadence(saved = {}) {
  for (const { band, el, unit } of cadenceFields()) {
    el.value = Math.round((saved[band] ?? CADENCE_DEFAULTS[band]) / unit);
  }
}

function readCadence() {
  const out = {};
  for (const { band, el, unit } of cadenceFields()) {
    const n = Math.round(Number(el.value) * unit);
    // The floor is enforced in the scheduler too; clamping here means the box
    // shows what will actually happen rather than what was typed.
    out[band] = Number.isFinite(n) && n > 0
      ? Math.max(MIN_SECONDS, n)
      : CADENCE_DEFAULTS[band];
  }
  return out;
}

// ------------------------------------------------------------- the theatres

/**
 * The cinema picker.
 *
 * Selection is held here rather than read back off the checkboxes at save time,
 * because the list is filtered as you type: a box that has scrolled out of the
 * filter is still checked, and reading the DOM would quietly drop it. Losing a
 * theatre you picked is the kind of bug you only notice by not being told about
 * a film.
 */
/**
 * Chosen theatres, kept per city rather than as one list.
 *
 * A venue code only means anything inside its own city, so switching city used
 * to clear the lot — which quietly threw away a selection you had made and
 * would have to make again on switching back. Keeping a set per city means
 * changing city shows that city's choices, and coming back shows yours.
 * Unsaved choices in other cities survive the session too, and Save writes them
 * all, so a look at another city never costs you the one you were setting up.
 */
let venueChoices = new Map();   // region code -> Set of venue codes
let watchChoices = new Map();   // watch id -> Set of venue codes
let watches = [];               // the films being watched, as stored
let editing = null;             // null = the default for new films; else a watch id
let venueList = [];

const cityKey = () => chosenCity()?.code || '';

/**
 * The set the picker is currently pointed at.
 *
 * Either the city's default — what a newly belled film inherits — or one
 * watched film's own list. Everything that reads or writes the selection goes
 * through here, so pointing the picker somewhere else is the only thing that
 * has to change.
 */
function currentChoice() {
  if (editing) {
    if (!watchChoices.has(editing)) watchChoices.set(editing, new Set());
    return watchChoices.get(editing);
  }
  const key = cityKey();
  if (!venueChoices.has(key)) venueChoices.set(key, new Set());
  return venueChoices.get(key);
}

/**
 * Rebuilds the target list.
 *
 * Only films watched in the city on screen are offered. A venue code means
 * nothing outside its own city, so a picker full of Hyderabad cinemas cannot
 * say anything useful about a film being watched in Mumbai — that film becomes
 * editable when you switch to its city, which is also where its cinemas are.
 */
function paintTargets() {
  const sel = $('venueTarget');
  const row = $('venueTargetRow');
  const code = cityKey();
  const mine = watches.filter((w) => w.regionCode === code);

  // Nothing to disambiguate until a film is being watched here.
  row.hidden = !mine.length;
  if (!mine.length) { editing = null; return; }

  const count = (set) => set?.size ? `${set.size} chosen` : 'any theatre';
  const opts = [`<option value="">New films — ${
    esc(count(venueChoices.get(code)))}</option>`];
  for (const w of mine) {
    opts.push(`<option value="${esc(w.id)}"${w.id === editing ? ' selected' : ''}>${
      esc(w.title || w.eventCode)} — ${esc(count(watchChoices.get(w.id)))}</option>`);
  }
  sel.innerHTML = opts.join('');
  if (editing && !mine.some((w) => w.id === editing)) editing = null;
  sel.value = editing || '';
}

/** A line under the city control, for when the list could not be fetched. */
function cityNote(text) {
  let el = document.getElementById('cityNote');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cityNote';
    el.className = 'hint';
    $('city').insertAdjacentElement('afterend', el);
  }
  el.textContent = text || '';
  el.hidden = !text;
}

function venueTally(shown) {
  const el = document.getElementById('venueCount');
  if (!el) return;
  const picked = currentChoice().size;
  const total = venueList.length;
  const parts = [];
  if (!total) parts.push('No cinemas loaded');
  else if (shown != null && shown < total) parts.push(`${shown} of ${total} cinemas`);
  else parts.push(`${total} cinema${total === 1 ? '' : 's'}`);
  // Silent when nothing is picked: "0 picked" states the obvious and reads as
  // a warning. The blank is the same information, quietly.
  if (picked) parts.push(`${picked} picked`);
  el.textContent = parts.join(' · ');
}

function paintVenues(filter = '') {
  const host = $('venues');
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? venueList.filter((v) => v.name.toLowerCase().includes(needle))
    : venueList;

  // Three different states used to share one message, and the one it chose was
  // wrong in two of them: a city that had been picked and a lookup that had
  // come back empty both read as "pick a city first", which sends you to fix
  // the one thing that was not broken.
  if (!venueList.length) {
    host.innerHTML = !chosenCity()
      ? '<div class="none">Pick a city first.</div>'
      // Names the control exactly as the control names itself.
      : '<div class="none">No cinemas came back for that city. Try ' +
        '<b>Refresh</b> below — and if it stays empty, leave the theatres blank ' +
        'and the watch will check any theatre instead.</div>';
    venueTally(null);
    return;
  }
  if (!shown.length) {
    host.innerHTML = '<div class="none">No cinema matches that.</div>';
    venueTally(0);
    return;
  }

  host.innerHTML = shown.map((v) => {
    const on = currentChoice().has(v.code);
    // A cinema with no dates on sale is dimmed, not hidden — it may well be the
    // one that opens for release day, which is the entire point of watching.
    const dark = v.dates?.length ? '' : ' dark';
    return `<label class="${dark.trim()}" title="${esc(v.code)}">
      <input type="checkbox" value="${esc(v.code)}"${on ? ' checked' : ''}>
      <span>${esc(v.name)}</span></label>`;
  }).join('');
  venueTally(shown.length);
}

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadVenues(citySlug, { refresh = false } = {}) {
  if (!citySlug) { venueList = []; return paintVenues(); }
  $('venues').innerHTML = '<div class="none">Loading cinemas…</div>';
  const res = await chrome.runtime.sendMessage({ type: 'venues', citySlug, refresh });
  if (!res?.ok) {
    $('venues').innerHTML =
      `<div class="none">Couldn’t load the cinema list — ${esc(res?.error || 'try again')}. ` +
      `Leaving theatres blank still works; the watch will check any theatre.</div>`;
    return;
  }
  venueList = res.venues || [];
  paintVenues($('venueFilter').value);
}

async function loadCities(selected) {
  const sel = $('city');
  // A rejected message must land in the same place a failed lookup does. Left
  // to throw, it takes the rest of load() with it and strands the placeholder
  // option, which is the dead <option value=""> all over again.
  const res = await chrome.runtime.sendMessage({ type: 'regions' })
    .catch((e) => ({ ok: false, error: String(e?.message || e) }));
  // A dead <option value=""> was the whole failure: picking it left chosenCity()
  // null, so the change handler returned before loading any cinemas and the
  // page sat there telling you to pick a city you had already picked. Every
  // option this renders must now be one you can actually choose.
  const list = (res?.ok && res.regions?.length) ? res.regions : null;
  if (!list) {
    const fallback = res?.fallback?.length ? res.fallback : [];
    const options = selected
      ? [selected, ...fallback.filter((r) => r.code !== selected.code)]
      : fallback;
    sel.innerHTML = cityOptions(options, selected);
    cityNote(options.length
      ? 'Couldn’t reach BookMyShow’s city list — showing the main cities. ' +
        'Open BookMyShow once and reload this page to pick up yours.'
      : 'Couldn’t load the city list. Open BookMyShow once and reload this page.');
    return;
  }
  cityNote('');
  sel.innerHTML = cityOptions(list, selected);
  if (selected && !list.some((r) => r.code === selected.code)) {
    sel.insertAdjacentHTML('afterbegin',
      `<option value="${esc(selected.slug)}" data-code="${esc(selected.code)}" selected>${esc(selected.name)}</option>`);
  }
}

/**
 * Two groups, the way BookMyShow's own city picker is laid out: the handful of
 * big cities first, then everything else alphabetically. Two thousand regions
 * in one flat alphabetical list makes finding Hyderabad a scroll, and puts a
 * town nobody has heard of at the top purely because it starts with an A.
 */
function cityOptions(regions, selected) {
  const { popular, rest } = groupRegions(regions);
  const option = (r) =>
    `<option value="${esc(r.slug)}" data-code="${esc(r.code)}"${
      selected && r.code === selected.code ? ' selected' : ''}>${esc(r.name)}</option>`;
  // No empty groups, and no group headings at all when there is nothing to
  // separate — a lone "Popular cities" label above every city says nothing.
  if (!popular.length || !rest.length) return [...popular, ...rest].map(option).join('');
  return `<optgroup label="Popular cities">${popular.map(option).join('')}</optgroup>` +
         `<optgroup label="More cities">${rest.map(option).join('')}</optgroup>`;
}

/**
 * The same split the service worker uses, kept here so the settings page needs
 * no module import — it is a plain script, not a module.
 */
function groupRegions(regions) {
  const order = ['MUMBAI', 'NCR', 'BANG', 'HYD', 'CHD', 'AHD', 'PUNE', 'CHEN', 'KOLK', 'KOCH'];
  const names = new Set(['mumbai', 'delhi-ncr', 'ncr', 'bengaluru', 'bangalore', 'hyderabad',
    'chandigarh', 'ahmedabad', 'pune', 'chennai', 'kolkata', 'kochi']);
  const rank = new Map(order.map((c, i) => [c, i]));
  const big = (r) => rank.has(r.code) || names.has(String(r.name || '').toLowerCase());
  return {
    popular: regions.filter(big).sort((a, b) =>
      (rank.has(a.code) ? rank.get(a.code) : 99) - (rank.has(b.code) ? rank.get(b.code) : 99) ||
      a.name.localeCompare(b.name)),
    rest: regions.filter((r) => !big(r)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * "Rows to skip at the front" used to be a fraction of the hall — a fifth, a
 * third, a half — and nobody thinks in fifths of a hall. It is a row count now.
 *
 * A fraction saved by an older version still has to mean something, and it
 * cannot be converted exactly: it was relative to a hall whose depth is only
 * known once that hall has been read. Twelve rows is the ordinary multiplex
 * screen, so that is what it is converted against. The filter still honours the
 * stored fraction until this page is saved, so nothing changes behind anyone's
 * back — this only decides which count the dropdown opens on.
 */
const TYPICAL_ROWS = 12;

function skipRowsFrom(defaults = {}) {
  if (defaults.skipRows != null) return Number(defaults.skipRows) || 0;
  if (defaults.minFromScreen == null) return 0;
  return Math.min(9, Math.max(1, Math.round(Number(defaults.minFromScreen) * TYPICAL_ROWS)));
}

/**
 * A count the dropdown has no option for — a converted fraction, or a value
 * from a newer build — gets one rather than being silently read as "keep them
 * all". Assigning an unmatched value to a <select> selects nothing, and the
 * next save would then quietly turn the filter off.
 */
function setSkipRows(n) {
  const sel = $('skipfront');
  if (!n) { sel.value = ''; return; }
  const want = String(n);
  if (![...sel.options].some((o) => o.value === want)) {
    const opt = new Option(`The first ${want} rows`, want);
    // In with the other counts, in order, rather than tacked on after them.
    const after = [...sel.options].find((o) => o.value && Number(o.value) > n);
    sel.add(opt, after || null);
  }
  sel.value = want;
}

const chosenCity = () => {
  const opt = $('city').selectedOptions[0];
  return opt?.value ? { slug: opt.value, code: opt.dataset.code || '', name: opt.textContent } : null;
};

async function load() {
  const s = await chrome.storage.local.get(null);
  $('token').value = s.telegram?.botToken || '';
  $('chat').value = s.telegram?.chatId || '';
  $('hook').value = s.webhook || '';
  $('minAdj').value = s.defaults?.minAdjacent ?? 2;
  $('where').value = WHERE.find(([, v]) => v === s.defaults?.maxOffCentre)?.[0] ?? '';
  setSkipRows(skipRowsFrom(s.defaults));
  $('bestOnly').checked = s.defaults?.bestsellerOnly === true;
  $('rows').value = s.defaults?.rows || '';
  showCadence(s.cadence);
  seatState = s.state || {};
  renderShows(s.shows || []);

  const rel = s.release || {};
  $('relEvery').value = rel.intervalMinutes ?? 10;
  $('relDormancy').value = rel.dormancyDays ?? 7;
  $('relPremiere').value = rel.premiereDays ?? 1;

  // Every watch already carries its own theatres; this picker sets what a new
  // one starts with, per city.
  venueChoices = new Map();
  const stored = rel.defaultVenues;
  if (Array.isArray(stored)) {
    // Written before this was keyed by city. It belonged to whichever city was
    // current when it was saved, so that is where it goes.
    if (s.city?.code) venueChoices.set(s.city.code, new Set(stored));
  } else {
    for (const [code, list] of Object.entries(stored || {})) {
      venueChoices.set(code, new Set(Array.isArray(list) ? list : []));
    }
  }
  // Nothing stored for a city yet: fall back to the last watch made there, so
  // the common case — the same two or three cinemas every time — needs no
  // clicking at all.
  for (const w of s.releases || []) {
    if (w.regionCode && w.venues?.length && !venueChoices.has(w.regionCode)) {
      venueChoices.set(w.regionCode, new Set(w.venues));
    }
  }

  // Each watched film's own theatres, so one can be changed without disturbing
  // the others or the default.
  watches = s.releases || [];
  watchChoices = new Map(watches.map((w) => [w.id, new Set(w.venues || [])]));
  editing = null;

  await loadCities(s.city);
  // Whatever ended up selected is the city in effect, saved or not — a <select>
  // always has one. Loading only when a city had been stored left a first visit
  // showing a chosen city above an empty theatre list telling you to choose a
  // city, which is the state this whole control exists to avoid.
  paintTargets();
  const city = s.city?.slug ? s.city : chosenCity();
  if (city?.slug) {
    $('upcomingLink').href = `https://in.bookmyshow.com/explore/upcoming-movies-${city.slug}`;
    await loadVenues(city.slug);
  } else {
    paintVenues();
  }
}

const flash = (msg, bad = false) => {
  const el = $('status');
  el.textContent = msg;
  el.style.color = bad ? 'var(--bad)' : 'var(--open)';
  setTimeout(() => { el.textContent = ''; }, 5000);
};

$('add').onclick = () => showRow().querySelector('.url').focus();

$('save').onclick = async () => {
  const edited = readShows();
  if (edited === null) return flash('Check the addresses marked below', true);
  const cadence = readCadence();

  const hook = $('hook').value.trim();
  try {
    if (!(await allowWebhook(hook))) {
      return flash('Chrome declined access to that address — nothing saved', true);
    }
  } catch (e) { return flash(e.message, true); }

  // Read as late as possible — the webhook prompt above can sit there for a
  // while, and anything written in that time should still survive this save.
  const now = await chrome.storage.local.get(['shows', 'release']);
  const shows = mergeShows(edited, now.shows || []);

  await chrome.storage.local.set({
    telegram: { botToken: $('token').value.trim(), chatId: $('chat').value.trim() },
    webhook: hook,
    defaults: {
      minAdjacent: Number($('minAdj').value) || 2,
      maxOffCentre: offCentreFor($('where').value),
      skipRows: $('skipfront').value === '' ? null : Number($('skipfront').value),
      // Cleared, not carried: the fraction and the count are two answers to the
      // same question, and leaving the old one behind would apply both.
      minFromScreen: null,
      bestsellerOnly: $('bestOnly').checked,
      rows: $('rows').value.trim() || null,
    },
    cadence,
    shows,
    release: {
      // Anything the worker keeps here that this page has no field for.
      ...(now.release || {}),
      // Below two minutes stops being a watch and starts being a hammer.
      intervalMinutes: Math.max(2, Number($('relEvery').value) || 10),
      dormancyDays: Math.max(0, Number($('relDormancy').value) || 0),
      // Capped: each night back is another request per cinema per check, and a
      // week of them stops being a watch and starts being a crawl.
      premiereDays: Math.min(7, Math.max(0, Number($('relPremiere').value) || 0)),
      enabled: true,
      // Every city's choices, not just the one on screen — switching city to
      // look at it must not silently drop what you picked elsewhere.
      defaultVenues: Object.fromEntries(
        [...venueChoices].filter(([code, set]) => code && set.size)
                         .map(([code, set]) => [code, [...set]])),
    },
    ...(chosenCity() ? { city: chosenCity() } : {}),
  });
  // Per-film theatres go through the worker, which owns `releases`.
  if (watches.length) {
    const venues = {};
    for (const w of watches) {
      const set = watchChoices.get(w.id);
      if (set) venues[w.id] = [...set];
    }
    await chrome.runtime.sendMessage({ type: 'setReleaseVenues', venues })
      .catch(() => { /* the rest of the page saved; the worker will be asked again */ });
  }

  showCadence(cadence);   // reflect anything that got clamped
  // What is on screen is now what is in storage, merged rows included.
  const fromCards = new Set(edited.map((x) => x.url));
  const kept = shows.filter((x) => !fromCards.has(x.url)).length;
  renderShows(shows);
  flash(kept > 0
    ? `Saved — kept ${kept} show${kept === 1 ? '' : 's'} added elsewhere`
    : 'Saved');
};

$('hookTest').onclick = async () => {
  const url = $('hook').value.trim();
  if (!url) return flash('Paste a webhook address first', true);
  try {
    if (!(await allowWebhook(url))) return flash('Chrome declined access to that address', true);
  } catch (e) { return flash(e.message, true); }
  const res = await chrome.runtime.sendMessage({ type: 'pingWebhook', url });
  res?.ok ? flash('Test sent') : flash(res?.error || 'That address turned it down', true);
};

$('venues').addEventListener('change', (e) => {
  const box = e.target.closest('input[type=checkbox]');
  if (!box) return;
  const choice = currentChoice();
  box.checked ? choice.add(box.value) : choice.delete(box.value);
  paintTargets();
  venueTally(venueList.length === $('venues').querySelectorAll('label').length
    ? null : $('venues').querySelectorAll('label').length);
});
$('venueTarget').addEventListener('change', (e) => {
  editing = e.target.value || null;
  // The filter is about finding a cinema, not about which film you are setting
  // up — carrying it across would hide most of the list for no reason.
  $('venueFilter').value = '';
  paintVenues();
  paintTargets();
});
$('venueFilter').addEventListener('input', (e) => paintVenues(e.target.value));
$('venueRefresh').onclick = async (e) => {
  const city = chosenCity();
  if (!city) return flash('Pick a city first', true);
  // The button says what it is doing while it does it, and the confirmation
  // uses the same verb it was clicked for.
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    await loadVenues(city.slug, { refresh: true });
    flash(venueList.length ? 'Refreshed' : 'Still no cinemas for that city', !venueList.length);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }
};
$('city').onchange = async () => {
  const city = chosenCity();
  if (!city) return;
  // Deliberately not cleared. currentChoice() is keyed on the city, so the new
  // city shows its own picks and the previous city keeps hers. The target goes
  // back to the default, because the film that was being edited belongs to the
  // city you just left.
  editing = null;
  paintTargets();
  $('upcomingLink').href = `https://in.bookmyshow.com/explore/upcoming-movies-${city.slug}`;
  await chrome.runtime.sendMessage({ type: 'setCity', city });
  await loadVenues(city.slug);
};

$('cad-reset').onclick = () => {
  showCadence();
  flash('Defaults restored — save to keep them');
};

$('ping').onclick = async () => {
  await chrome.storage.local.set({
    telegram: { botToken: $('token').value.trim(), chatId: $('chat').value.trim() },
  });
  const res = await chrome.runtime.sendMessage({ type: 'ping' });
  if (!res?.ok) return flash(res?.error || 'Telegram turned it down', true);
  // Naming the count is how you find out one of several destinations is dead;
  // "Test message sent" would look identical either way.
  flash(res.failed?.length
    ? `Sent to ${res.sent}, failed for ${res.failed.length}: ${res.failed[0]}`
    : `Test message sent to ${res.sent} destination${res.sent === 1 ? '' : 's'}`,
    Boolean(res.failed?.length));
};

// Fills the chat ID from whoever has messaged the bot, so nobody has to read
// raw JSON out of a URL to get started.
/** The destinations currently in the field, however they were typed. */
const chatIds = () => $('chat').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

const setChatIds = (ids) => { $('chat').value = [...new Set(ids)].join(', '); };

/**
 * Picking a chat adds it rather than replacing what is there.
 *
 * An alert can go to several places — you and the group, or two groups — so the
 * old behaviour of overwriting the field on every pick made the second choice
 * undo the first. Each is a toggle, and the button says which state it is in.
 */
$('detect').onclick = async () => {
  const box = $('chats');
  box.innerHTML = '';
  const res = await chrome.runtime.sendMessage({
    type: 'detectChat', token: $('token').value.trim(),
  });
  if (!res?.ok) return flash(res?.error || 'Could not reach Telegram', true);
  if (!res.chats.length) {
    return flash('Message your bot first — or send /start@yourbotname in the group', true);
  }

  for (const c of res.chats) {
    const b = document.createElement('button');
    const paint = () => {
      const on = chatIds().includes(c.id);
      b.textContent = `${on ? '✓ ' : ''}${c.name}`;
      b.classList.toggle('is-on', on);
      // Negative ids are groups. Saying so once, here, saves explaining the
      // minus sign later.
      b.title = c.id.startsWith('-') ? `Group · ${c.id}` : c.id;
    };
    b.onclick = () => {
      const ids = chatIds();
      setChatIds(ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]);
      paint();
      flash(chatIds().length
        ? `Telling ${chatIds().length} destination${chatIds().length === 1 ? '' : 's'}`
        : 'No destinations — nobody will be told');
    };
    paint();
    box.appendChild(b);
  }
  flash(res.chats.length === 1 ? 'Tick it to be told there' : 'Tick everyone who should be told');
};

load();

// -------------------------------------------------------------- the tabs

/**
 * Two jobs that happen at different moments — a film that is playing, and a
 * film that is not out yet — kept on separate panels rather than stacked into
 * one long page. Alerts sit on their own because both modes send them.
 *
 * The save button is deliberately outside all three: it writes every field on
 * the page, and hiding it inside a panel would suggest it only saves that one.
 */
const TAB_KEY = 'seatwatch.tab';
const tabs = [...document.querySelectorAll('.tab')];

function showTab(name, { focus = false } = {}) {
  for (const tab of tabs) {
    const on = tab.dataset.panel === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(`panel-${tab.dataset.panel}`).hidden = !on;
    if (on && focus) tab.focus();
  }
  try { localStorage.setItem(TAB_KEY, name); } catch { /* private window */ }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab.dataset.panel));
  // Arrow keys move between tabs, which is what a tablist is expected to do —
  // without it the panel only reachable by mouse.
  tab.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    showTab(next.dataset.panel, { focus: true });
  });
}

// Reopening on the panel you were last using; a first visit starts on seats,
// which is what the extension is for until you add an upcoming film.
try {
  const saved = localStorage.getItem(TAB_KEY);
  if (saved && tabs.some((t) => t.dataset.panel === saved)) showTab(saved);
} catch { /* private window — the default stands */ }
