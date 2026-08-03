const $ = (id) => document.getElementById(id);
const showsEl = $('shows');

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
    </div>
    <div class="err"></div>`;
  wrap.querySelector('.label').value = show.label || '';
  wrap.querySelector('.url').value = show.url || '';
  wrap.querySelector('.minAdj').value = show.minAdjacent ?? '';
  wrap.querySelector('.remove').onclick = () => wrap.remove();
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
    if (!url) continue;
    if (!/^https:\/\/in\.bookmyshow\.com\/.*\/seat-layout\//.test(url)) {
      err.textContent = 'That isn’t a seat-map address. Open the showtime on '
                      + 'BookMyShow until you can see the seats, then copy the address bar.';
      bad = true;
      continue;
    }
    const minAdj = el.querySelector('.minAdj').value;
    out.push({
      url,
      label: el.querySelector('.label').value.trim() || undefined,
      minAdjacent: minAdj === '' ? undefined : Number(minAdj),
    });
  }
  return bad ? null : out;
}

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

async function load() {
  const s = await chrome.storage.local.get(null);
  $('token').value = s.telegram?.botToken || '';
  $('chat').value = s.telegram?.chatId || '';
  $('hook').value = s.webhook || '';
  $('minAdj').value = s.defaults?.minAdjacent ?? 2;
  $('where').value = WHERE.find(([, v]) => v === s.defaults?.maxOffCentre)?.[0] ?? '';
  $('skipfront').value = s.defaults?.minFromScreen == null ? '' : String(s.defaults.minFromScreen);
  $('bestOnly').checked = s.defaults?.bestsellerOnly === true;
  showCadence(s.cadence);
  showsEl.innerHTML = '';
  (s.shows?.length ? s.shows : [{}]).forEach(showRow);
}

const flash = (msg, bad = false) => {
  const el = $('status');
  el.textContent = msg;
  el.style.color = bad ? 'var(--bad)' : 'var(--open)';
  setTimeout(() => { el.textContent = ''; }, 5000);
};

$('add').onclick = () => showRow().querySelector('.url').focus();

$('save').onclick = async () => {
  const shows = readShows();
  if (shows === null) return flash('Check the addresses marked below', true);
  const cadence = readCadence();

  const hook = $('hook').value.trim();
  try {
    if (!(await allowWebhook(hook))) {
      return flash('Chrome declined access to that address — nothing saved', true);
    }
  } catch (e) { return flash(e.message, true); }

  await chrome.storage.local.set({
    telegram: { botToken: $('token').value.trim(), chatId: $('chat').value.trim() },
    webhook: hook,
    defaults: {
      minAdjacent: Number($('minAdj').value) || 2,
      maxOffCentre: offCentreFor($('where').value),
      minFromScreen: $('skipfront').value === '' ? null : Number($('skipfront').value),
      bestsellerOnly: $('bestOnly').checked,
    },
    cadence,
    shows,
  });
  showCadence(cadence);   // reflect anything that got clamped
  flash('Saved');
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

$('cad-reset').onclick = () => {
  showCadence();
  flash('Defaults restored — save to keep them');
};

$('ping').onclick = async () => {
  await chrome.storage.local.set({
    telegram: { botToken: $('token').value.trim(), chatId: $('chat').value.trim() },
  });
  const res = await chrome.runtime.sendMessage({ type: 'ping' });
  res?.ok ? flash('Test message sent') : flash(res?.error || 'Telegram turned it down', true);
};

// Fills the chat ID from whoever has messaged the bot, so nobody has to read
// raw JSON out of a URL to get started.
$('detect').onclick = async () => {
  const box = $('chats');
  box.innerHTML = '';
  const res = await chrome.runtime.sendMessage({
    type: 'detectChat', token: $('token').value.trim(),
  });
  if (!res?.ok) return flash(res?.error || 'Could not reach Telegram', true);
  if (!res.chats.length) {
    return flash('Send your bot a message first, then try again', true);
  }
  if (res.chats.length === 1) {
    $('chat').value = res.chats[0].id;
    return flash(`Found ${res.chats[0].name}`);
  }
  for (const c of res.chats) {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.onclick = () => { $('chat').value = c.id; box.innerHTML = ''; flash(`Using ${c.name}`); };
    box.appendChild(b);
  }
  flash('Pick a chat');
};

load();
