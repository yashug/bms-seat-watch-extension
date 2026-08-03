/**
 * Seat Watch — MV3 service worker.
 *
 * Polls seat-layout pages in a reusable background tab, reads the Konva scene
 * graph via a MAIN-world injection, and alerts on Telegram + a desktop
 * notification when a contiguous block of free seats appears.
 */

const SOLD = 2;             // seatStatus 2 = Booked / Held
const PITCH = 32;           // seats sit on a 28px grid; wider means an aisle
const TICK_MINUTES = 0.5;   // scheduler granularity
const READY_TIMEOUT_MS = 45000;

/**
 * How often a show's seat map is read, in seconds, by how far off it is. Each
 * show runs on its own clock — a screening tonight is checked far harder than
 * one next week — so these are bands, not one interval.
 *
 * Editable in Settings. `window` is the one that matters: blocked inventory
 * tends to be released in the last few hours, so that band is the whole point
 * of the extension and everything above it is just staying informed cheaply.
 */
const CADENCE = {
  window: 90,         // under 3h — the release window
  soon: 5 * 60,       // 3 to 6h
  day: 15 * 60,       // 6 to 24h
  far: 30 * 60,       // more than 24h away
  unknown: 10 * 60,   // showtime could not be read off the page
};

/**
 * A floor no setting can go under. Each check drives a real page load in a real
 * browser, and BookMyShow fronts the site with bot detection — a tight loop is
 * a pattern worth not making, whatever the box says.
 */
const MIN_INTERVAL = 60;

/**
 * How long a show stays in the list after its showtime has passed.
 *
 * Long enough to open the popup that evening and see how it went; gone by the
 * next morning. A retired show is never checked again, so what is being kept
 * is a record, and a record nobody is going to read is just a longer list.
 */
const RETIRED_KEEP_HOURS = 6;
const MONTHS = ['january','february','march','april','may','june','july',
                'august','september','october','november','december'];

// ---------------------------------------------------------------- injected

/**
 * Runs in the page's MAIN world (it needs window.Konva, which is invisible to
 * an isolated content script). Returns null while the canvas is still mounting.
 */
function extractFromPage({ SOLD, PITCH }) {
  if (!window.Konva || !Konva.stages || !Konva.stages.length) return null;

  const collect = (stage) => {
    const out = [];
    (function walk(node) {
      if (node.attrs && node.attrs.seatObj) out.push(node);
      (node.children || []).forEach(walk);
    })(stage);
    return out;
  };

  // The page mounts more than one Konva stage. Pick the one holding seats,
  // not whichever happens to be last in the array.
  let nodes = [], stage = null;
  for (const st of Konva.stages) {
    const found = collect(st);
    if (found.length > nodes.length) { nodes = found; stage = st; }
  }
  if (!nodes.length) return null;

  const seats = nodes.map(n => {
    const box = n.getClientRect({ relativeTo: stage });
    const o = n.attrs.seatObj;
    return {
      row: o.rowNumber,
      num: o.displaySeatNumber,
      price: Number(o.curPrice),
      status: o.seatStatus,
      bestseller: o.seatStatus === 4,
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
    };
  });

  // The layout scales with window width, so derive the adjacency threshold from
  // the rendered geometry rather than a hardcoded pixel constant. Seat WIDTH is
  // the anchor: it always exists and, unlike gap statistics, can't be skewed by
  // aisles. Measured live: 23px seats on a 28px grid, aisles at exact multiples
  // (56/84/112), so 1.5x width sits cleanly between one step and two.
  const widths = seats.map(s => s.w).filter(Boolean).sort((a, b) => a - b);
  const medianW = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const threshold = medianW ? medianW * 1.5 : PITCH;

  // Physical adjacency from canvas geometry, so aisles correctly break a run.
  const open = seats.filter(s => s.status !== SOLD);
  const byRowLine = {};
  for (const s of open) (byRowLine[s.y] ||= []).push(s);

  const runs = [];
  for (const list of Object.values(byRowLine)) {
    list.sort((a, b) => a.x - b.x);
    let run = [list[0]];
    for (let i = 1; i < list.length; i++) {
      if (list[i].x - run[run.length - 1].x <= threshold) run.push(list[i]);
      else { runs.push(run); run = [list[i]]; }
    }
    runs.push(run);
  }

  // A compact picture of the hall, so the popup can draw the real layout instead
  // of describing it. One string per seat line: '#' sold, 'o' free, '.' nothing
  // there. Columns come from the rendered pitch — the smallest repeating x-step —
  // so aisles survive as actual gaps rather than being closed up.
  const rowYs = [...new Set(seats.map(s => s.y))].sort((a, b) => a - b);
  const rowIndex = new Map(rowYs.map((y, i) => [y, i]));
  const steps = [];
  for (const y of rowYs) {
    const line = seats.filter(s => s.y === y).sort((a, b) => a.x - b.x);
    for (let i = 1; i < line.length; i++) {
      const d = line[i].x - line[i - 1].x;
      if (d > 0 && d <= threshold) steps.push(d);   // single steps only; aisles excluded
    }
  }
  steps.sort((a, b) => a - b);
  const pitch = steps.length ? steps[Math.floor(steps.length / 2)] : (medianW || PITCH);
  const minX = Math.min(...seats.map(s => s.x));
  const colOf = (x) => Math.round((x - minX) / pitch);

  let grid = null;
  const cols = Math.max(...seats.map(s => colOf(s.x))) + 1;
  if (Number.isFinite(cols) && cols > 0 && cols <= 200 && rowYs.length <= 100) {
    const lines = rowYs.map(() => new Array(cols).fill('.'));
    const labels = new Array(rowYs.length).fill('');
    for (const s of seats) {
      const ri = rowIndex.get(s.y);
      lines[ri][colOf(s.x)] = s.status === SOLD ? '#' : 'o';
      labels[ri] ||= String(s.row ?? '');
    }
    grid = { cols, rows: lines.map((cells, i) => ({ row: labels[i], cells: cells.join('') })) };
  }

  const title = document.querySelector('h1')?.textContent?.trim() || null;
  const subtitle = [...document.querySelectorAll('span, div, p')]
    .filter(e => !e.children.length && /\|/.test(e.textContent) && /\b(AM|PM)\b/.test(e.textContent))
    .map(e => e.textContent.trim())[0] || null;

  // Where a block sits in the room, as two 0-1 fractions, both taken from the
  // rendered layout rather than from seat numbers — numbering runs in different
  // directions in different halls, and row letters skip I.
  //
  //   offCentre  0 = dead centre,       1 = hard against a side wall
  //   fromScreen 0 = front row,         1 = back row
  //
  // fromScreen inverts the row index on purpose: BookMyShow draws the screen at
  // the BOTTOM of the layout, so the largest y is the row nearest it and index 0
  // is the back of the hall.
  const xs = seats.map(s => s.x);
  const hallLeft = Math.min(...xs), hallRight = Math.max(...xs);
  const halfWidth = Math.max(1, (hallRight - hallLeft) / 2);
  const midX = (hallLeft + hallRight) / 2;
  const lastRow = Math.max(1, rowYs.length - 1);

  return {
    title, subtitle, grid,
    total: seats.length,
    available: open.length,
    rows: rowYs.length,
    runs: runs.map(r => {
      const blockMid = (r[0].x + r[r.length - 1].x) / 2;
      return {
        row: r[0].row,
        price: r[0].price,
        size: r.length,
        nums: r.map(s => s.num).sort((a, b) => Number(a) - Number(b)),
        bestseller: r.some(s => s.bestseller),
        gy: rowIndex.get(r[0].y),
        gx0: colOf(r[0].x),
        gx1: colOf(r[r.length - 1].x),
        offCentre: Math.min(1, Math.abs(blockMid - midX) / halfWidth),
        fromScreen: 1 - rowIndex.get(r[0].y) / lastRow,
      };
    }),
  };
}

// ---------------------------------------------------------------- storage

const DEFAULTS = {
  telegram: { botToken: '', chatId: '' },
  webhook: '',
  defaults: {
    minAdjacent: 2,
    maxOffCentre: null, minFromScreen: null, bestsellerOnly: false,
  },
  cadence: CADENCE,
  shows: [],
  state: {},      // url -> { nextCheck, notified: [], fails, retired, last }
  running: true,
};

async function getCfg() {
  const s = await chrome.storage.local.get(null);
  return {
    ...DEFAULTS, ...s,
    state: s.state || {},
    // Merged per key, not replaced: a config saved before a band existed must
    // still get that band's default rather than undefined.
    cadence: { ...CADENCE, ...(s.cadence || {}) },
  };
}
const setCfg = (patch) => chrome.storage.local.set(patch);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- tab plumbing

/**
 * BookMyShow only mounts the seat canvas when the page is VISIBLE. In a
 * background tab, window.Konva loads but never creates a stage — and Chrome
 * eventually freezes the renderer outright. So the watcher lives in its own
 * small popup window created with focused:false: the tab is the active tab of
 * that window, so document.visibilityState === 'visible', while your current
 * window keeps keyboard focus.
 *
 * The window must stay on screen. Minimising it, or fully covering it on
 * platforms that track occlusion, makes the page hidden again.
 */
/**
 * If you already have this exact seat map open and visible, read that instead
 * of opening anything. Costs nothing, and while you're sitting on the page the
 * watcher window never appears at all.
 *
 * The test is deliberately strict — the same URL, in a window that isn't
 * minimised, as its window's active tab. Anything less and the page would be
 * hidden, the canvas would never mount, and we'd have thrown away a working
 * check for a tab that can't answer.
 */
async function borrowOpenTab(url) {
  try {
    const tabs = await chrome.tabs.query({ url, status: 'complete' });
    for (const tab of tabs) {
      if (!tab.active || tab.id == null) continue;
      const win = await chrome.windows.get(tab.windowId);
      if (win.state === 'minimized') continue;
      return tab.id;
    }
  } catch { /* no host permission for that URL, or it closed mid-query */ }
  return null;
}

async function ensureWatcherTab(url) {
  const { watchWindowId, watchTabId } = await chrome.storage.local.get(['watchWindowId', 'watchTabId']);

  if (watchWindowId != null && watchTabId != null) {
    try {
      await chrome.windows.get(watchWindowId);
      await chrome.tabs.get(watchTabId);
      await chrome.tabs.update(watchTabId, { url, active: true });
      return watchTabId;
    } catch { /* user closed it — fall through and rebuild */ }
  }

  const win = await createWatcherWindow(url);
  const tabId = win.tabs?.[0]?.id;
  await chrome.storage.local.set({ watchWindowId: win.id, watchTabId: tabId });
  return tabId;
}

/**
 * Chrome refuses bounds that leave a window more than half off-screen
 * ("Bounds must be at least 50% within visible screen space"). A service worker
 * can't read screen dimensions without the system.display permission, so we
 * position the popup INSIDE the focused browser window's rectangle — that's
 * guaranteed to be on-screen — and fall back to letting Chrome place it.
 */
async function createWatcherWindow(url) {
  const WANT_W = 1100, WANT_H = 780, MARGIN = 20;
  try {
    const cur = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (cur?.width && cur?.height) {
      const width = Math.min(WANT_W, Math.max(400, cur.width - MARGIN * 2));
      const height = Math.min(WANT_H, Math.max(400, cur.height - MARGIN * 2));
      return await chrome.windows.create({
        url, type: 'popup', focused: false, width, height,
        left: Math.round((cur.left || 0) + Math.max(0, cur.width - width - MARGIN)),
        top: Math.round((cur.top || 0) + Math.max(0, cur.height - height - MARGIN)),
      });
    }
  } catch { /* bad bounds or no normal window — fall through */ }

  try {
    return await chrome.windows.create({ url, type: 'popup', focused: false, width: 1000, height: 720 });
  } catch {
    return await chrome.windows.create({ url, type: 'popup', focused: false });
  }
}

/**
 * Runs in the MAIN world of a listing page and hands back whatever showtime
 * data the page kept on a JS global. A content script can't see those globals
 * from its isolated world, so it asks us to look.
 *
 * The walk is deliberately loose about key names — BookMyShow renames fields
 * between releases, and a missed rename should cost a button, not a crash.
 */
function harvestFromPage() {
  const roots = ['__NEXT_DATA__', '__INITIAL_STATE__', '__PRELOADED_STATE__',
                 '__NUXT__', '__APOLLO_STATE__', 'INITIAL_STATE']
    .map(k => window[k]).filter(Boolean);
  if (!roots.length) return [];

  // Never descend into the signed-in member's details, and skip the SEO block,
  // which is tens of thousands of nodes of footer links. Kept in step with the
  // same list in content.js.
  const SKIP = /^(cookies|seo|appConfig|config|user|ud|userDetails|analytics|ads|footer|links|breadcrumbs)$/i;

  const out = [];
  const timeKey = (text) => {
    const m = String(text || '').match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3]) { h %= 12; if (/pm/i.test(m[3])) h += 12; }
    return h > 23 ? null : String(h).padStart(2, '0') + m[2];
  };

  const walk = (node, ctx, depth) => {
    if (!node || depth > 14 || out.length > 4000) return;
    if (Array.isArray(node)) { for (const v of node) walk(v, ctx, depth + 1); return; }
    if (typeof node !== 'object') return;

    const keys = Object.keys(node);
    const val = (re) => {
      const k = keys.find(x => re.test(x));
      const v = k === undefined ? undefined : node[k];
      return (typeof v === 'string' || typeof v === 'number') ? String(v) : undefined;
    };
    const ev = val(/^event(code|id)$/i) || val(/event.?code/i);
    const isEvent = /^ET\w+$/i.test(ev || '');
    const next = {
      eventCode: isEvent ? ev : ctx.eventCode,
      venueCode: val(/^venue(code|id)$/i) || val(/venue.?code/i) || ctx.venueCode,
      eventName: val(/^(event|movie)name$/i) || (isEvent && val(/^title$/i)) || ctx.eventName,
    };

    const sessionId = val(/^(session|show)(id|code)$/i) || val(/session.?id/i);
    const showTime = val(/^(show|session)time$/i) || val(/^time$/i) || val(/show.?time/i);
    if (sessionId && /^\d{2,8}$/.test(sessionId) && showTime && next.eventCode) {
      const key = timeKey(showTime);
      if (key) out.push({ ...next, sessionId, timeKey: key });
    }

    for (const [k, v] of Object.entries(node)) if (!SKIP.test(k)) walk(v, next, depth + 1);
  };

  for (const r of roots) walk(r, {}, 0);
  return out;
}

/** Ask the page how it's doing, so timeouts produce an actionable message. */
async function probePage(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: () => ({
        vis: document.visibilityState,
        konva: typeof window.Konva,
        stages: (window.Konva && window.Konva.stages || []).length,
        canvas: document.querySelectorAll('canvas').length,
      }),
    });
    return r?.result || null;
  } catch { return null; }
}

/** Poll the MAIN world until seats exist or we give up. */
async function readSeats(tabId) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',                       // <- required: Konva lives on the page
        func: extractFromPage,
        args: [{ SOLD, PITCH }],
      });
      if (res?.result) return res.result;
    } catch (e) {
      lastErr = e;                           // page still navigating, keep trying
    }
  }
  const probe = await probePage(tabId);
  if (probe && probe.vis === 'hidden') {
    throw new Error('watcher window is hidden — keep it on screen (behind is fine, minimised is not)');
  }
  throw new Error(lastErr?.message || 'seat layout did not render in time');
}

// ---------------------------------------------------------------- scheduling

/** "ALLU Cinemas: Kokapet | Fri, 07 August, 2026 | 07:45 PM" -> Date */
function parseShowtime(subtitle, url) {
  if (subtitle) {
    const m = subtitle.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s*\|\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
      const [, d, monName, y, hh, mm, ap] = m;
      const mon = MONTHS.indexOf(monName.toLowerCase());
      if (mon >= 0) {
        let h = Number(hh) % 12;
        if (/pm/i.test(ap)) h += 12;
        const dt = new Date(
          `${y}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` +
          `T${String(h).padStart(2, '0')}:${mm}:00+05:30`);
        if (!isNaN(dt)) return dt;
      }
    }
  }
  const d = url.match(/\/(\d{8})(?:\/|$)/);
  if (d) {
    const s = d[1];
    const dt = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T23:59:00+05:30`);
    if (!isNaN(dt)) return dt;
  }
  return null;
}

/**
 * Adaptive cadence. Seconds, or null to retire the show.
 *
 * Anything unusable in `cadence` — missing, blank, zero, not a number — falls
 * back to that band's default rather than to a shared one, so a single bad
 * field can't quietly retune the whole ladder.
 */
function intervalSeconds(minutesUntilShow, cadence) {
  const c = { ...CADENCE, ...(cadence || {}) };
  const at = (value, fallback) => {
    const n = Math.round(Number(value));
    return Math.max(MIN_INTERVAL, Number.isFinite(n) && n > 0 ? n : fallback);
  };
  if (minutesUntilShow == null) return at(c.unknown, CADENCE.unknown);
  if (minutesUntilShow < -15) return null;
  if (minutesUntilShow <= 180) return at(c.window, CADENCE.window);
  if (minutesUntilShow <= 360) return at(c.soon, CADENCE.soon);
  if (minutesUntilShow <= 1440) return at(c.day, CADENCE.day);
  return at(c.far, CADENCE.far);
}

const jitter = (sec) => Math.round(sec * (0.85 + Math.random() * 0.3));

// ---------------------------------------------------------------- notifying

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendTelegram(tg, html) {
  if (!tg?.botToken || !tg?.chatId) throw new Error('Telegram not configured');
  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: tg.chatId, text: html,
      parse_mode: 'HTML', disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(body.description || `HTTP ${res.status}`);
}

/**
 * Reads back everyone who has messaged the bot, so Settings can offer the chat
 * ID as a pick list instead of asking people to read raw JSON out of a URL.
 */
async function detectChatIds(token) {
  if (!token) throw new Error('Enter your bot token first');
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(body.description || `HTTP ${res.status}`);
  const seen = new Map();
  for (const u of body.result || []) {
    const c = (u.message || u.edited_message || u.channel_post || {}).chat;
    if (c && !seen.has(c.id)) {
      seen.set(c.id, [c.title, c.first_name, c.last_name].filter(Boolean).join(' ')
                     || (c.username ? `@${c.username}` : String(c.id)));
    }
  }
  return [...seen].map(([id, name]) => ({ id: String(id), name }));
}

/**
 * A webhook you paste one URL for. Discord and ntfy are both a single paste,
 * which is a very different ask from BotFather's four steps — for most people
 * this is the only remote alert they'll actually finish setting up.
 *
 * The shape is chosen from the URL rather than a dropdown, because the URL
 * already says which service it is and asking twice is a way to get it wrong.
 */
function webhookRequest(url, text, title) {
  if (/discord(app)?\.com\/api\/webhooks\//i.test(url)) {
    return { headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ content: `**${title}**\n${text}` }) };
  }
  if (/(^|\/\/)([^/]*\.)?ntfy\./i.test(url)) {
    return { headers: { 'Content-Type': 'text/plain', Title: title, Priority: 'high' },
             body: text };
  }
  // Anything else gets plain JSON with the parts kept separate, which is what a
  // Zapier/Make/self-hosted endpoint can actually work with.
  return { headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ title, text }) };
}

async function sendWebhook(url, text, title = 'Seats open') {
  if (!url) throw new Error('No webhook address set');
  const { headers, body } = webhookRequest(url, text, title);
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 90)}`);
}

/** The same alert as Telegram's, without the HTML. */
function buildPlain(show, data, fresh) {
  const lines = [];
  if (data.title) lines.push(data.title);
  if (data.subtitle) lines.push(data.subtitle);
  for (const r of fresh.slice(0, 12)) {
    const span = r.nums.length > 1 ? `${r.nums[0]}–${r.nums[r.nums.length - 1]}` : r.nums[0];
    lines.push(`• Row ${r.row} · seats ${span} (${r.size}) · ₹${r.price}${r.bestseller ? ' ⭐' : ''}`);
  }
  if (fresh.length > 12) lines.push(`…and ${fresh.length - 12} more`);
  lines.push(`${data.available} of ${data.total} seats free`);
  lines.push(show.url);
  return lines.join('\n');
}

function buildMessage(show, data, fresh) {
  const lines = ['🎟 <b>Seats open</b>'];
  if (data.title) lines.push(esc(data.title));
  if (data.subtitle) lines.push(`<i>${esc(data.subtitle)}</i>`);
  lines.push('');
  lines.push(`<b>${fresh.length} block${fresh.length > 1 ? 's' : ''} of ${show.minAdjacent}+ together:</b>`);
  for (const r of fresh.slice(0, 12)) {
    const span = r.nums.length > 1 ? `${r.nums[0]}–${r.nums[r.nums.length - 1]}` : r.nums[0];
    lines.push(`• Row <b>${esc(r.row)}</b> · seats ${esc(span)} (${r.size}) · ₹${r.price}${r.bestseller ? ' ⭐' : ''}`);
  }
  if (fresh.length > 12) lines.push(`…and ${fresh.length - 12} more`);
  lines.push('');
  lines.push(`${data.available} of ${data.total} seats free overall`);
  lines.push(`<a href="${esc(show.url)}">Open on BookMyShow</a>`);
  return lines.join('\n');
}

const SNOOZE_MINUTES = 15;

/**
 * The notification is the whole product at its most important moment, so it has
 * to lead somewhere. The show's own URL is the notification id — that survives
 * the service worker being torn down between the alert firing and you clicking
 * it, which an in-memory map would not.
 */
function desktopNotify(show, data, fresh) {
  const top = fresh.slice(0, 3)
    .map(r => `Row ${r.row} ${r.nums[0]}–${r.nums[r.nums.length - 1]} (${r.size})`)
    .join('\n');
  chrome.notifications.create(show.url, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: `Seats open — ${show.label || data.title || 'BookMyShow'}`,
    message: top || `${data.available} seats free`,
    priority: 2,
    requireInteraction: true,   // don't fade out while you're away from the desk
    buttons: [{ title: 'Open seats' }, { title: `Snooze ${SNOOZE_MINUTES}m` }],
  }, () => void chrome.runtime.lastError);   // swallow "no buttons" on some builds
}

function openSeats(url) {
  chrome.notifications.clear(url);
  chrome.tabs.create({ url, active: true });
}

/** Quiets one show without unwatching it — checks continue, alerts wait. */
async function snooze(url, minutes = SNOOZE_MINUTES) {
  const cfg = await getCfg();
  const st = cfg.state[url] || {};
  st.snoozedUntil = Date.now() + minutes * 60000;
  cfg.state[url] = st;
  await setCfg({ state: cfg.state });
  await refreshBadge();
  chrome.notifications.clear(url);
}

/** Ends a snooze early. Checks never stopped; alerts resume from here. */
async function wake(url) {
  const cfg = await getCfg();
  if (!cfg.state[url]) return;
  delete cfg.state[url].snoozedUntil;
  await setCfg({ state: cfg.state });
  await refreshBadge();
}

chrome.notifications.onClicked.addListener(openSeats);
chrome.notifications.onButtonClicked.addListener((url, index) => {
  index === 1 ? snooze(url) : openSeats(url);
});

// ---------------------------------------------------------------- core

const runKey = (r) => `${r.row}:${r.nums[0]}-${r.nums[r.nums.length - 1]}`;

/**
 * Keeps the blocks you'd actually buy.
 *
 * Size is the blunt instrument; position is the one that decides whether an
 * alert is worth acting on. Four free seats in the front corner and four dead
 * centre are the same row length, and only one is worth leaving the house for.
 *
 *   minAdjacent  seats side by side, no aisle between them
 *   maxOffCentre 0-1; 0.5 keeps the middle half of the hall
 *   minFromScreen 0-1; 0.25 skips the front quarter of the rows
 *   bestsellerOnly  only blocks BookMyShow marks as its best seats
 */
function wanted(runs, want) {
  return runs.filter((r) => {
    if (r.size < (want.minAdjacent ?? 2)) return false;
    if (want.bestsellerOnly && !r.bestseller) return false;
    // Older readings predate the geometry, so a missing value can't exclude.
    if (want.maxOffCentre != null && r.offCentre != null &&
        r.offCentre > want.maxOffCentre) return false;
    if (want.minFromScreen != null && r.fromScreen != null &&
        r.fromScreen < want.minFromScreen) return false;
    return true;
  });
}

async function checkShow(show, cfg) {
  const st = cfg.state[show.url] || { notified: [], fails: 0 };
  let data;
  try {
    const borrowed = await borrowOpenTab(show.url);
    const tabId = borrowed ?? await ensureWatcherTab(show.url);
    data = await readSeats(tabId);
    st.borrowed = borrowed != null;
  } catch (e) {
    st.fails = (st.fails || 0) + 1;
    st.last = { at: Date.now(), error: String(e.message || e).slice(0, 160) };
    st.nextCheck = Date.now() + jitter(Math.min(60 * st.fails, 600)) * 1000;
    cfg.state[show.url] = st;
    await setCfg({ state: cfg.state });
    return st;
  }
  st.fails = 0;

  const showtime = parseShowtime(data.subtitle, show.url);
  const minsUntil = showtime ? Math.round((showtime - Date.now()) / 60000) : null;
  const every = intervalSeconds(minsUntil, cfg.cadence);

  if (every === null) {
    st.retired = true;
    st.last = { at: Date.now(), note: 'showtime passed' };
    cfg.state[show.url] = st;
    await setCfg({ state: cfg.state });
    return st;
  }

  // Per show first, then the defaults — a blank field on a show means "use the
  // default", so ?? has to fall through rather than treat 0 as unset.
  const pick = (key) => show[key] ?? cfg.defaults[key] ?? null;
  const want = {
    minAdjacent: pick('minAdjacent') ?? 2,
    maxOffCentre: pick('maxOffCentre'),
    minFromScreen: pick('minFromScreen'),
    bestsellerOnly: pick('bestsellerOnly') === true,
  };
  const minAdj = want.minAdjacent;
  const qualifying = wanted(data.runs, want);

  const prev = new Set(st.notified || []);
  const fresh = qualifying.filter(r => !prev.has(runKey(r)));

  if (st.snoozedUntil && st.snoozedUntil <= Date.now()) delete st.snoozedUntil;
  const snoozed = Boolean(st.snoozedUntil);

  if (fresh.length && !snoozed) {
    const named = { ...show, minAdjacent: minAdj };
    const heading = `Seats open — ${show.label || data.title || 'BookMyShow'}`;

    // Each channel is tried on its own. One misconfigured destination must not
    // swallow the alert on the others — this is the moment they exist for.
    delete st.telegramError;
    delete st.webhookError;
    if (cfg.telegram?.botToken && cfg.telegram?.chatId) {
      try { await sendTelegram(cfg.telegram, buildMessage(named, data, fresh)); }
      catch (e) { st.telegramError = String(e.message || e).slice(0, 120); }
    }
    if (cfg.webhook) {
      try { await sendWebhook(cfg.webhook, buildPlain(named, data, fresh), heading); }
      catch (e) { st.webhookError = String(e.message || e).slice(0, 120); }
    }
    desktopNotify(show, data, fresh);
  }

  // Snoozing must not mark blocks as told-you-about, or they'd be swallowed
  // silently and never mentioned again once the snooze lapses. The one thing it
  // does record is availability vanishing, so a block that reopens still counts
  // as new.
  if (!snoozed) st.notified = qualifying.map(runKey);
  else if (!qualifying.length) st.notified = [];

  // A rolling record of free seats, so the popup can show inventory moving
  // rather than only its current value. Real timestamps, not check numbers:
  // the cadence tightens near showtime, and the bunching that causes on the
  // right of the chart is true and worth seeing.
  st.history = [...(st.history || []), { t: Date.now(), free: data.available }].slice(-40);
  st.showtimeTs = showtime ? showtime.getTime() : null;
  st.last = {
    at: Date.now(),
    title: data.title, subtitle: data.subtitle,
    available: data.available, total: data.total,
    blocks: qualifying.length, minsUntil, alerted: fresh.length,
    hits: qualifying.slice(0, 8).map(r => ({
      row: r.row, price: r.price, size: r.size,
      from: r.nums[0], to: r.nums[r.nums.length - 1], bestseller: r.bestseller,
    })),
    // The popup redraws the hall from this; marks are the blocks that passed
    // your filters, which are the ones worth lighting up.
    map: data.grid && {
      cols: data.grid.cols,
      rows: data.grid.rows,
      marks: qualifying
        .filter(r => r.gy != null)
        .map(r => [r.gy, r.gx0, r.gx1]),
    },
  };
  st.nextCheck = Date.now() + jitter(every) * 1000;
  cfg.state[show.url] = st;
  await setCfg({ state: cfg.state });
  return st;
}

/**
 * Drops shows that played long enough ago to have been looked at.
 *
 * Nothing else removes them. `checkShow` retires a show once its showtime is
 * past and `runDue` skips it from then on, which stops the polling but leaves
 * the row — and the rows accumulate, one per show ever watched, until the list
 * is mostly things that are over. Somebody who uses this every weekend would be
 * clearing it out by hand within a month.
 *
 * Mutates `cfg` as well as storage, so a sweep and the run that triggered it
 * agree on which shows exist.
 */
async function sweepRetired(cfg) {
  const cutoff = Date.now() - RETIRED_KEEP_HOURS * 3600 * 1000;
  // `last.at` is stamped at the moment of retirement and nothing overwrites it
  // afterwards, so it is the age of the retirement, not of the last reading.
  const done = (s) => {
    const st = cfg.state[s.url];
    return Boolean(st?.retired) && (st.last?.at ?? 0) < cutoff;
  };

  const keep = cfg.shows.filter((s) => !done(s));
  if (keep.length === cfg.shows.length) return 0;

  const state = { ...cfg.state };
  for (const s of cfg.shows) if (done(s)) delete state[s.url];
  const dropped = cfg.shows.length - keep.length;
  cfg.shows = keep;
  cfg.state = state;
  await setCfg({ shows: keep, state });
  return dropped;
}

async function runDue(force = false) {
  const cfg = await getCfg();
  if (!cfg.running && !force) return;
  await sweepRetired(cfg);
  const now = Date.now();
  for (const show of cfg.shows) {
    const st = cfg.state[show.url] || {};
    if (st.retired && !force) continue;
    if (!force && st.nextCheck && now < st.nextCheck) continue;
    await checkShow(show, cfg);
    await sleep(2000);
  }
  await refreshBadge();
}

async function refreshBadge() {
  const cfg = await getCfg();
  const live = cfg.shows.filter(s => !cfg.state[s.url]?.retired).length;
  // A snoozed show stays quiet on the badge too, or "snooze" would only mean
  // "stop making noise" while still shouting from the toolbar.
  const hits = cfg.shows.reduce((n, s) => {
    const st = cfg.state[s.url] || {};
    if ((st.snoozedUntil || 0) > Date.now()) return n;
    return n + (st.last?.blocks || 0);
  }, 0);
  await chrome.action.setBadgeBackgroundColor({ color: hits ? '#1FAD3E' : '#888888' });
  await chrome.action.setBadgeText({ text: !cfg.running ? '' : hits ? String(hits) : (live ? '·' : '') });
}

// ---------------------------------------------------------------- wiring

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
  refreshBadge();
  // Only on a genuine first install — not on every update, and not on a browser
  // restart, both of which also fire this listener.
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
  refreshBadge();
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'tick') runDue(); });

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (msg.type === 'checkNow')  { await runDue(true); respond({ ok: true }); }
    else if (msg.type === 'addShow') {
      const cfg = await getCfg();
      if (cfg.shows.some(s => s.url === msg.url)) return respond({ ok: true, already: true });
      await setCfg({ shows: [...cfg.shows, { url: msg.url, label: msg.label }] });
      await refreshBadge();
      respond({ ok: true });
    }
    else if (msg.type === 'removeShow') {
      const cfg = await getCfg();
      const state = { ...cfg.state };
      delete state[msg.url];
      await setCfg({ shows: cfg.shows.filter(s => s.url !== msg.url), state });
      await refreshBadge();
      respond({ ok: true });
    }
    else if (msg.type === 'openSeats') { openSeats(msg.url); respond({ ok: true }); }
    else if (msg.type === 'snooze') {
      msg.minutes ? await snooze(msg.url, msg.minutes) : await wake(msg.url);
      respond({ ok: true });
    }
    else if (msg.type === 'harvestSessions') {
      const tabId = sender.tab?.id;
      if (tabId == null) return respond({ ok: false, error: 'no tab' });
      try {
        const [r] = await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', func: harvestFromPage,
        });
        respond({ ok: true, sessions: r?.result || [] });
      } catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'ping') {
      const cfg = await getCfg();
      try {
        await sendTelegram(cfg.telegram, '✅ Seat Watch is wired up correctly.');
        respond({ ok: true });
      } catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'pingWebhook') {
      try {
        await sendWebhook(msg.url, 'Seat Watch is wired up correctly.', 'Test alert');
        respond({ ok: true });
      } catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'detectChat') {
      try { respond({ ok: true, chats: await detectChatIds(msg.token) }); }
      catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'toggle') {
      const cfg = await getCfg();
      await setCfg({ running: !cfg.running });
      await refreshBadge();
      respond({ ok: true, running: !cfg.running });
    }
    else if (msg.type === 'reset') {
      await setCfg({ state: {} });
      await refreshBadge();
      respond({ ok: true });
    }
    else respond({ ok: false, error: 'unknown message' });
  })();
  return true;   // keep the channel open for the async respond
});
