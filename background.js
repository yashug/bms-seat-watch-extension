/**
 * Seat Watch — MV3 service worker.
 *
 * Polls seat-layout pages in a reusable background tab, reads the Konva scene
 * graph via a MAIN-world injection, and alerts on Telegram + a desktop
 * notification when a contiguous block of free seats appears.
 */

import * as R from './release.js';

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
  //   screenRow  how many rows back from the screen, 0 = the row at the screen
  //
  // screenRow is what "skip the first 3 rows" is answered with. The fraction
  // cannot answer it: a fifth of a 9-row hall and a fifth of a 20-row hall are
  // different numbers of rows, and the person setting it is thinking of rows.
  //
  // fromScreen inverts the row index on purpose: BookMyShow draws the screen at
  // the BOTTOM of the layout, so the largest y is the row nearest it and index 0
  // is the back of the hall. Checked against a real hall on 2026-09-03 — ALUC
  // Kokapet, HYD — where "skip the first 3 rows" dropped the rows against the
  // screen. It was a guess until then, and an alert looks identical whichever
  // end is trimmed, so nothing else would ever have caught it being backwards.
  const xs = seats.map(s => s.x);
  const hallLeft = Math.min(...xs), hallRight = Math.max(...xs);
  const halfWidth = Math.max(1, (hallRight - hallLeft) / 2);
  const midX = (hallLeft + hallRight) / 2;
  const lastRow = Math.max(1, rowYs.length - 1);
  // Not lastRow: that is floored at 1 to keep the fraction from dividing by
  // zero, and a one-row hall's only row is row 0 of the count, not row 1.
  const lastIndex = rowYs.length - 1;

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
        screenRow: lastIndex - rowIndex.get(r[0].y),
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
    maxOffCentre: null, skipRows: null, minFromScreen: null, bestsellerOnly: false,
    rows: null,     // "F-K, M" — empty means every row
  },
  cadence: CADENCE,
  shows: [],
  state: {},      // url -> { nextCheck, notified: [], fails, retired, last }
  running: true,

  // Release watching keeps its own lists. Sharing `shows` would have meant
  // every consumer of it — the popup, the badge, the retirement sweep —
  // learning to skip a kind of row it cannot render or schedule.
  city: null,             // { slug, code, name }
  venueCache: {},         // citySlug -> { at, venues: [{code,name,dates}] }
  releases: [],           // [{ id, group, eventCode, slug, title, releaseDate,
                          //    citySlug, regionCode, venues: null | [code] }]
  releaseState: {},       // id -> { nextCheck, fails, seen: {}, last }
  release: R.RELEASE_DEFAULTS,
};

async function getCfg() {
  const s = await chrome.storage.local.get(null);
  return {
    ...DEFAULTS, ...s,
    state: s.state || {},
    // Merged per key, not replaced: a config saved before a band existed must
    // still get that band's default rather than undefined.
    cadence: { ...CADENCE, ...(s.cadence || {}) },
    releases: s.releases || [],
    releaseState: s.releaseState || {},
    venueCache: s.venueCache || {},
    release: { ...R.RELEASE_DEFAULTS, ...(s.release || {}) },
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

/**
 * The destinations one alert goes to.
 *
 * A Telegram chat id is a group as readily as it is a person — that is how a
 * whole group of friends gets told at once, with one machine doing the
 * watching. The field holds a list so an alert can reach the group *and* your
 * own chat, and the stored shape is unchanged: a single id parses to a list of
 * one, so a config written before this reads exactly as it did.
 */
const chatList = (tg) => String(tg?.chatId ?? '')
  .split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

/**
 * Sends to every destination, independently.
 *
 * One dead id must not silence the others: a group somebody removed the bot
 * from would otherwise take the alert down for everyone still in it. Each
 * failure is collected and reported; the send only counts as failed if nothing
 * arrived anywhere.
 */
async function sendTelegram(tg, html, { button, buttons } = {}) {
  const chats = chatList(tg);
  if (!tg?.botToken || !chats.length) throw new Error('Telegram not configured');

  const failed = [];
  let sent = 0;
  for (const chatId of chats) {
    try {
      await sendTelegramTo(tg.botToken, chatId, html, buttons?.length ? buttons : button);
      sent++;
    } catch (e) {
      failed.push(`${chatId}: ${String(e.message || e)}`);
    }
  }
  if (!sent) throw new Error(failed.join('; ') || 'Telegram not configured');
  return { sent, failed };
}

async function sendTelegramTo(botToken, chatId, html, button) {
  const payload = {
    chat_id: chatId, text: html,
    parse_mode: 'HTML', disable_web_page_preview: true,
  };
  // A tappable button rather than a link buried in the text. On a phone, in a
  // group, the difference between one tap and hunting for a link is the
  // difference between getting the seats and reading about them.
  //
  // A row of them when a film has several listings: the Telugu showing and the
  // Malayalam one are different pages, and a single button can only be one of
  // them. Telegram stacks each on its own line, which is also how they read.
  const row = (Array.isArray(button) ? button : [button]).filter((b) => b?.url);
  if (row.length) {
    payload.reply_markup = {
      inline_keyboard: row.map((b) => [{ text: b.text || 'Book now', url: b.url }]),
    };
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

/**
 * Two kinds of alert now share one notification surface, and the id is the only
 * thing that travels from firing to click — the service worker may well have
 * been torn down in between. Seat alerts use the show's URL as their id, so a
 * prefix that cannot appear in one keeps the two apart without a lookup table
 * that would not survive the teardown.
 */
const RELEASE_NOTIF = 'release:';
const isReleaseNotif = (id) => String(id).startsWith(RELEASE_NOTIF);

chrome.notifications.onClicked.addListener((id) => {
  isReleaseNotif(id) ? openRelease(id) : openSeats(id);
});
chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (isReleaseNotif(id)) return openRelease(id);
  index === 1 ? snooze(id) : openSeats(id);
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
 *   skipRows     rows to drop counting from the screen; 3 skips the first three
 *   minFromScreen 0-1; 0.25 skips the front quarter of the rows. What skipRows
 *                replaced — still honoured, so a config saved by an older
 *                version keeps filtering as it did until it is saved again.
 *   bestsellerOnly  only blocks BookMyShow marks as its best seats
 *   rowMatch     a predicate over row labels, from a spec like "F-K, M"
 */
/**
 * Turns "F-K, M" into a test over row labels.
 *
 * Ranges are resolved against the hall's own row order when both ends name rows
 * it actually has. That matters more than it sounds: BookMyShow's halls skip I,
 * some number their rows instead of lettering them, and some start at the back.
 * Counting letters would quietly include a row that does not exist and exclude
 * one that does; walking the hall's own list cannot. Letters are the fallback,
 * for a spec typed before the hall has ever been read.
 *
 * A spec that yields no usable test is treated as no filter at all, and says so.
 * The alternative — a filter that matches nothing — is a watch that runs
 * forever and never fires, which looks exactly like a watch that is working.
 */
function rowMatcher(spec, order = []) {
  const text = String(spec || '').trim();
  if (!text) return { match: null, problems: [] };

  const norm = (s) => String(s ?? '').trim().toUpperCase();
  const idx = new Map();
  for (const [i, label] of order.entries()) {
    const n = norm(label);
    if (n && !idx.has(n)) idx.set(n, i);
  }

  // "AA" sorts after "Z", which is how halls that run past 26 rows label them.
  const ordinal = (label) => {
    const n = norm(label);
    if (/^[A-Z]+$/.test(n)) {
      let v = 0;
      for (const ch of n) v = v * 26 + (ch.charCodeAt(0) - 64);
      return { kind: 'alpha', n: v };
    }
    if (/^\d+$/.test(n)) return { kind: 'num', n: Number(n) };
    return null;
  };

  const tests = [];
  const problems = [];
  for (const term of text.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)) {
    const range = /^(.+?)\s*[-–—]\s*(.+)$/.exec(term);
    if (!range) {
      const n = norm(term);
      tests.push((label) => norm(label) === n);
      continue;
    }
    const a = norm(range[1]);
    const b = norm(range[2]);
    if (idx.has(a) && idx.has(b)) {
      const lo = Math.min(idx.get(a), idx.get(b));
      const hi = Math.max(idx.get(a), idx.get(b));
      tests.push((label) => {
        const i = idx.get(norm(label));
        return i != null && i >= lo && i <= hi;
      });
      continue;
    }
    const oa = ordinal(a);
    const ob = ordinal(b);
    if (!oa || !ob || oa.kind !== ob.kind) { problems.push(term); continue; }
    const lo = Math.min(oa.n, ob.n);
    const hi = Math.max(oa.n, ob.n);
    tests.push((label) => {
      const o = ordinal(label);
      return Boolean(o) && o.kind === oa.kind && o.n >= lo && o.n <= hi;
    });
  }

  if (!tests.length) return { match: null, problems };
  return { match: (label) => tests.some((t) => t(label)), problems };
}

function wanted(runs, want) {
  return runs.filter((r) => {
    if (r.size < (want.minAdjacent ?? 2)) return false;
    if (want.bestsellerOnly && !r.bestseller) return false;
    // A named row is the one filter that is about *your* seat rather than the
    // geometry — "we always sit in H or J". A run with no label read cannot be
    // excluded by it, same as the two fractions below: missing data is not
    // evidence against.
    if (want.rowMatch && r.row != null && r.row !== '' && !want.rowMatch(r.row)) return false;
    // Older readings predate the geometry, so a missing value can't exclude.
    if (want.maxOffCentre != null && r.offCentre != null &&
        r.offCentre > want.maxOffCentre) return false;
    if (want.skipRows && r.screenRow != null && r.screenRow < want.skipRows) return false;
    if (want.minFromScreen != null && r.fromScreen != null &&
        r.fromScreen < want.minFromScreen) return false;
    return true;
  });
}

/**
 * What to say about a row filter that did not do what was typed.
 *
 * Three things go wrong and only the last is harmless: a term that could not be
 * read at all, a spec where nothing was readable (so no filter ran), and a row
 * named that this hall does not have — which is not an error, but is the
 * difference between "no seats yet" and "you are watching a row that isn't
 * there".
 */
function rowWarning(spec, parsed, order) {
  if (!spec) return undefined;
  if (!parsed.match) {
    return `Couldn’t read “${spec}” as rows, so every row is being watched.`;
  }
  if (parsed.problems.length) {
    return `Ignored ${parsed.problems.map((p) => `“${p}”`).join(', ')} — ` +
           'a range needs two row names of the same kind, like F-K.';
  }
  if (!order.length) return undefined;
  const have = new Set(order.map((r) => String(r).trim().toUpperCase()));
  const missing = [...new Set(String(spec).split(/[,;]+/)
    .flatMap((t) => t.split(/[-–—]/))
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t && !have.has(t)))];
  return missing.length
    ? `This hall has no row ${missing.join(', ')} — its rows are ${order.join(', ')}.`
    : undefined;
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
  // The hall's own row labels, in the order it draws them. Ranges are resolved
  // against this rather than against the alphabet, so a hall that skips I or
  // numbers its rows still means what you meant.
  const rowOrder = (data.grid?.rows || []).map((r) => r.row).filter(Boolean);
  const rows = pick('rows');
  const rowSpec = rowMatcher(rows, rowOrder);
  const want = {
    minAdjacent: pick('minAdjacent') ?? 2,
    maxOffCentre: pick('maxOffCentre'),
    skipRows: pick('skipRows'),
    minFromScreen: pick('minFromScreen'),
    bestsellerOnly: pick('bestsellerOnly') === true,
    rowMatch: rowSpec.match,
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
      try {
        const out = await sendTelegram(cfg.telegram, buildMessage(named, data, fresh),
          { button: { text: 'Open seats', url: show.url } });
        // Partial delivery is not success. Somebody is not being told, and the
        // only place that can surface is here.
        if (out.failed.length) st.telegramError = out.failed.join('; ').slice(0, 160);
      } catch (e) { st.telegramError = String(e.message || e).slice(0, 120); }
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
    // What the row filter did, if there was one. A spec that named a row this
    // hall does not have is the failure worth surfacing: it silently narrows
    // the watch, and nothing else on screen would ever say so.
    rows: rows || undefined,
    rowWarn: rowWarning(rows, rowSpec, rowOrder),
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

// ------------------------------------------------------- release watching

/**
 * Adds a film to the release list, learning what it needs on the way in.
 *
 * The group code and the release date are both fetched here, once, rather than
 * on every check. That is the difference between a watch costing one request an
 * hour and costing one request per check for a fact that changes at most once.
 * If the fetch fails the watch is still created — an unscheduled watch that
 * polls from now is a far better outcome than refusing to watch a film at all.
 */
async function addRelease(entry) {
  const cfg = await getCfg();
  const city = cfg.city || entry.city;
  if (!city?.slug || !city?.code) throw new Error('no city set');

  const id = `${city.code}:${entry.group || entry.eventCode}`;
  if (cfg.releases.some((w) => w.id === id)) return { already: true, id };
  // A second language of a film already watched is not a second film. Once a
  // watch has adopted the Telugu listing, the bell on that listing belongs to
  // it — clicking it must not create a rival watch that alerts about the same
  // showing.
  const covering = watchCovering(cfg.releases, entry);
  if (covering) return { already: true, id: covering.id };

  const watch = {
    id,
    eventCode: entry.eventCode || null,
    group: entry.group || null,
    slug: entry.slug || null,
    title: entry.title || '',
    language: entry.language || '',
    releaseDate: entry.releaseDate || null,
    // The other languages the same film is listed under, learned while
    // checking. A film is added from one language's page — the original's,
    // usually — and the dub that goes on sale first is frequently a different
    // event code under a different group entirely.
    variants: [],
    citySlug: city.slug,
    regionCode: city.code,
    // A bell clicked on BookMyShow carries no theatres — the page has no idea
    // which cinemas you care about. The picker in settings is where that lives,
    // so a new watch inherits the ones chosen for this city. Empty there
    // genuinely means "any theatre".
    venues: entry.venues?.length ? entry.venues
      : (defaultVenuesFor(cfg, city.code) || null),
    addedAt: Date.now(),
  };

  if (watch.slug && watch.eventCode) {
    try {
      const page = R.parseFilmPage(
        await R.fetchText(R.filmUrl(city.slug, watch.slug, watch.eventCode)), watch.slug);
      watch.group = watch.group || page.group;
      watch.releaseDate = watch.releaseDate || page.releaseDate;
      watch.title = watch.title || page.title || '';
      // The page links to the film's other languages often enough to be worth
      // reading here: a watch that knows them on the day it is created does not
      // have to wait for one to turn up at a cinema before it can announce it.
      adoptListings(watch, page.listings);
    } catch (e) {
      watch.lookupError = String(e.message || e).slice(0, 120);
    }
  }
  // Still nameless — the page had no title for it and the lookup did not run or
  // did not answer. The slug is the film's name with the hyphens in, which
  // beats showing an event code.
  if (!watch.title) watch.title = R.titleFromSlug(watch.slug) || watch.eventCode || '';
  // Whatever the source — the card's analytics, the film page, the slug — the
  // stored name is the shown name, so it is cleaned once, here.
  watch.title = R.cleanTitle(watch.title);

  // A film that is already out has nothing left to announce, and the retirement
  // sweep would drop this watch on the very next tick. Creating it anyway meant
  // the bell went ✓ and the watch quietly disappeared — the worst of both, since
  // it looks like it worked. Say so instead, and point at the control that does
  // help once a film is playing.
  if (watch.releaseDate && R.isExpired(watch, Date.now())) {
    return { alreadyOut: true, title: watch.title || watch.eventCode };
  }

  await setCfg({
    releases: [...cfg.releases, watch],
    releaseState: { ...cfg.releaseState, [id]: { seen: {}, fails: 0, nextCheck: 0 } },
  });
  return { id, watch };
}

/**
 * The alert. Names the theatres, because "bookings are open" without them sends
 * you to look through a list you have already told this extension about.
 */
function notifyRelease(watch, opened, cfg) {
  // Grouped by day, because a premiere and release day are two different things
  // to decide about and a flat list of cinemas would not say which opened.
  const langs = knownLanguages(watch);
  const where = opened.venues?.length ? describeOpened(opened.venues)
    // A listing check knows how many cinemas took it, which is the difference
    // between a wide release and two screens across town — worth deciding on.
    : opened.cinemas ? `Now selling at ${opened.cinemas} cinema${opened.cinemas === 1 ? '' : 's'}`
    // Neither: the film page said the film went on sale without saying for
    // which listing. Naming the languages it has is the difference between an
    // alert you can act on and one that sends you to find the Telugu showing
    // yourself.
    : langs.length > 1 ? `Booking is open · listed in ${langs.join(', ')}`
    : 'Booking is open';
  const premiere = opened.venues?.some((v) => v.premiere);
  // The language belongs in the heading, not buried in the body. A film out in
  // three languages opens three times, and "Booking open — I'm Game" sent
  // twelve hours apart twice is indistinguishable noise; "(Telugu)" is the
  // whole content of the second alert.
  const named = `${watch.title || watch.eventCode}${opened.language ? ` (${opened.language})` : ''}`;
  const heading = premiere
    ? `Premiere booking open — ${named}`
    : `Booking open — ${named}`;

  chrome.notifications.create(RELEASE_NOTIF + notifKey(watch, opened), {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: heading,
    message: where,
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: 'Open BookMyShow' }],
  }, () => void chrome.runtime.lastError);

  const link = releaseLink(watch, opened);
  // Where a language of its own could not be established, every listing the
  // watch knows of gets a button. That is the any-theatre case: the film's page
  // says booking opened but not for which listing, so the alert offers them all
  // rather than silently picking the one the watch was created from.
  const buttons = opened.language ? [{ text: 'Book now', url: link }] : listingButtons(watch);
  const plain = [heading, where, ...buttons.map((b) => `${b.text}: ${b.url}`)].join('\n');
  if (cfg.telegram?.botToken && cfg.telegram?.chatId) {
    sendTelegram(cfg.telegram, `<b>${esc(heading)}</b>\n${esc(where)}`, { buttons })
      .catch(() => { /* the desktop notification already fired */ });
  }
  if (cfg.webhook) sendWebhook(cfg.webhook, plain, heading).catch(() => { /* ditto */ });
}

/**
 * A button per listing, for an alert that could not say which one opened.
 *
 * Each goes to that listing's own address — `im-game-telugu/ET00511702` rather
 * than the watch's slug with someone else's code. Measured, BookMyShow serves
 * both: the slug is decoration and the code decides what you get. The right one
 * is still used, because a link a person reads should say what it opens.
 * Capped, because Telegram stacks them and a film in eight languages would be
 * a wall.
 */
const MAX_BUTTONS = 4;

/**
 * How many listings one any-theatre check will ask about. Each is a request
 * every cadence, so a film dubbed into a dozen languages must not quietly
 * become a dozen requests every ten minutes.
 */
const MAX_LISTINGS = 6;

function listingButtons(watch) {
  const codes = R.knownCodes(watch).slice(0, MAX_BUTTONS);
  const buttons = codes.map((code) => {
    const v = R.variantFor(watch, code);
    return {
      text: v.language ? `Book ${v.language}` : 'Book now',
      url: releaseLink(watch, { eventCode: code, slug: v.slug }),
    };
  });
  // One listing, or none identified: the ordinary single button.
  return buttons.length > 1 ? buttons : [{ text: 'Book now', url: releaseLink(watch) }];
}

/**
 * "Premiere · Thu, 27 Aug — ALLU Cinemas: Kokapet", one line per day.
 *
 * The day leads because it is the thing that decides whether you act tonight or
 * on Friday; the cinema answers where. Earliest day first, which puts the
 * premiere above release day on its own.
 */
function describeOpened(venues) {
  const byDay = new Map();
  for (const v of venues) {
    const key = v.when || '';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(v.name || v.code);
  }
  return [...byDay].map(([when, names]) => {
    const shown = names.slice(0, 3).join(', ') +
      (names.length > 3 ? ` +${names.length - 3} more` : '');
    return when ? `${when} — ${shown}` : shown;
  }).join('\n');
}

/**
 * Where a release alert leads. The buytickets listing for release day, because
 * that is the page carrying the + buttons — the alert hands you straight to the
 * thing that starts a seat watch.
 */
function releaseLink(watch, opened) {
  // The earliest day that opened, not release day: an alert about a premiere
  // that lands you on Friday's listing has sent you to the wrong page.
  const day = openedDay(opened);
  const date = day || watch.releaseDate || R.toDateCode(new Date());
  // And the code that opened, not the one the watch was created from. Sending a
  // Telugu alert to the Malayalam listing is the same class of mistake as
  // sending a premiere alert to Friday — the page opens, it just isn't the
  // showing being announced.
  const code = opened?.eventCode || watch.eventCode;
  const slug = opened?.slug || R.variantFor(watch, code).slug || watch.slug;
  return slug && code
    ? R.buyTicketsUrl(watch.citySlug, slug, code, date)
    : R.upcomingUrl(watch.citySlug);
}

/** The earliest day an alert covers. */
function openedDay(opened) {
  return opened?.venues?.map((v) => v.date).filter(Boolean).sort()[0] || null;
}

/**
 * What makes two alerts for one film distinct.
 *
 * Notifications replace each other by id, and a watch that fires once per
 * language would otherwise overwrite its own Malayalam alert with the Telugu
 * one — the first would vanish before it was read. The code and day ride along
 * so a click can reopen the exact listing that fired without going back to
 * storage for it.
 */
function notifKey(watch, opened) {
  return `${watch.id}#${opened?.eventCode || ''}|${openedDay(opened) || ''}`;
}

async function openRelease(notifId) {
  const raw = String(notifId).slice(RELEASE_NOTIF.length);
  const hash = raw.indexOf('#');
  const id = hash === -1 ? raw : raw.slice(0, hash);
  const [code, day] = hash === -1 ? [] : raw.slice(hash + 1).split('|');
  chrome.notifications.clear(notifId);
  const cfg = await getCfg();
  const watch = cfg.releases.find((w) => w.id === id);
  if (!watch) {
    chrome.tabs.create({ url: R.upcomingUrl(cfg.city?.slug || 'hyderabad'), active: true });
    return;
  }
  // The alert says which language and which day it was about, so the click
  // reopens exactly that. Older notifications carry neither: for those the day
  // is recovered from what has been seen — the earliest date recorded is the
  // premiere if there was one, and release day otherwise.
  let opened;
  if (code || day) {
    opened = { eventCode: code || null, venues: day ? [{ date: day }] : [] };
  } else {
    const days = Object.keys(cfg.releaseState[id]?.seen || {})
      .map((k) => k.split('|')[2]).filter(Boolean).sort();
    opened = days.length ? { venues: [{ date: days[0] }] } : undefined;
  }
  chrome.tabs.create({ url: releaseLink(watch, opened), active: true });
}

/**
 * One check.
 *
 * Two paths, and they are not equally trustworthy. A watch naming theatres asks
 * byvenue about exactly those, and matches on the group code — exact, and it
 * reports which cinema opened. A watch naming none has no such call available
 * (the film-wide endpoint answers 400 to everything, see probes/FINDINGS.md), so
 * it falls back to reading the film's own page, which distinguishes the two
 * states only by wording. That path can go stale silently, so it is the one
 * place `unknown` is recorded and surfaced rather than treated as "no".
 */
/**
 * Fills in what a watch could not learn when it was created.
 *
 * The bell reads the group code out of the listing page's own state, and on the
 * real site that state holds only the first server-rendered batch — a film
 * further down the list arrives with no group at all. `addRelease` covers that
 * by reading the film's page, but if that one request fails the watch is stored
 * knowing only a single event code.
 *
 * That is the exact thing the group exists to avoid: a film has several event
 * codes (Irumudi has three), and the one that goes on sale need not be the one
 * the card showed. So a watch missing its group is repaired on later checks
 * rather than left half-built for good.
 *
 * Bounded, because a slug that 404s will never resolve and retrying it on every
 * check forever is just noise. What it gives up on, it says.
 */
const LOOKUP_TRIES = 5;

async function backfillWatch(watch, st, cfg) {
  if (watch.group && watch.releaseDate) return false;
  if (!watch.slug || !watch.eventCode) return false;
  if ((st.lookupTries || 0) >= LOOKUP_TRIES) return false;

  st.lookupTries = (st.lookupTries || 0) + 1;
  try {
    const page = R.parseFilmPage(
      await R.fetchText(R.filmUrl(watch.citySlug, watch.slug, watch.eventCode)), watch.slug);
    const before = `${watch.group}|${watch.releaseDate}|${watch.title}`;
    const learned = adoptListings(watch, page.listings);
    // Mutated in place: this is the same object the caller is checking, so the
    // group learned here applies to this check rather than only the next one.
    if (!watch.group && page.group) watch.group = page.group;
    if (!watch.releaseDate && page.releaseDate) watch.releaseDate = page.releaseDate;
    if (!watch.title && page.title) watch.title = R.cleanTitle(page.title);
    if (!learned && `${watch.group}|${watch.releaseDate}|${watch.title}` === before) return false;

    st.lookupTries = 0;
    delete st.lookupError;
    await setCfg({ releases: cfg.releases });
    return true;
  } catch (e) {
    st.lookupError = String(e.message || e).slice(0, 120);
    return false;
  }
}

async function checkRelease(watch, cfg) {
  const st = cfg.releaseState[watch.id] || { seen: {}, fails: 0 };
  const now = Date.now();

  await backfillWatch(watch, st, cfg);
  const dates = R.datesFor(watch, cfg.release.premiereDays);

  try {
    if (watch.venues?.length) {
      const names = venueNames(cfg, watch.citySlug);
      const opened = [];
      for (const venueCode of watch.venues) {
        for (const date of dates) {
          const body = await R.fetchJson(R.byVenueApi(venueCode, date, watch.regionCode));
          const rows = R.parseByVenue(body, venueCode);
          // Before matching, learn. A dub listed under its own group is not a
          // match yet and never becomes one on its own — this is the step that
          // turns it into part of the watch, and it has to run against the same
          // response the match reads or the language is missed for one whole
          // cycle at the venue that had it first.
          await learnVariants(rows, watch, cfg);
          const mine = rows.filter((c) => R.matchesFilm(c, watch));
          for (const child of mine) {
            const key = R.seenKey(venueCode, child.eventCode, date);
            if (st.seen[key]) continue;
            st.seen[key] = now;
            opened.push({ code: venueCode, name: names.get(venueCode) || venueCode,
                          shows: child.shows.length, language: R.languageLabel(child),
                          eventCode: child.eventCode, slug: child.slug || watch.slug,
                          date, premiere: R.isPremiere(date, watch),
                          when: R.dateLabel(date, watch) });
          }
          await sleep(700);
        }
      }
      st.last = { at: now, mode: 'venues', checked: watch.venues.length,
                  dates: dates.length,
                  open: Object.keys(st.seen).length, fired: opened.length,
                  languages: knownLanguages(watch),
                  // Worth surfacing on its own: a premiere opening is a
                  // different decision from release day opening.
                  premiere: opened.some((o) => o.premiere) || undefined };
      if (!watch.group && (st.lookupTries || 0) >= LOOKUP_TRIES) {
        st.last.warn = 'Couldn’t read this film’s group code, so it is matched on ' +
                       'one event code only — a different language or format may be missed.';
      }
      // One alert per language, not one per watch. They are separate decisions
      // — the Telugu show at your cinema and the Malayalam one are different
      // bookings — and a single merged alert can only carry one link.
      for (const group of byLanguage(opened)) notifyRelease(watch, group, cfg);
    } else if (!watch.slug || !watch.eventCode) {
      // The any-theatre check reads the film's own page, and that address needs
      // both halves. Without them there is no check to make — say so plainly
      // rather than fetching /movies/city/null/… and reporting a 404 forever.
      st.last = { at: now, mode: 'any', signal: 'unknown',
                  warn: 'This watch has no film page to read. Pick theatres for it instead.' };
      st.signal = 'unknown';
    } else {
      // With no theatres named there is no byvenue feed to spot a dub in, so
      // the film's own page supplies the languages — it carries a switcher
      // naming each one and the code that books it — and the city's upcoming
      // list fills in for a layout that does not.
      await discoverFromUpcoming(watch, st, cfg);

      const page = R.parseFilmPage(
        await R.fetchText(R.filmUrl(watch.citySlug, watch.slug, watch.eventCode)), watch.slug);
      if (adoptListings(watch, page.listings)) await setCfg({ releases: cfg.releases });

      const codes = R.knownCodes(watch).slice(0, MAX_LISTINGS);
      // One listing, or none identified: the film page is the only thing to
      // read, and it speaks for the film rather than for a language.
      if (codes.length < 2) {
        const signal = page.booking;
        st.last = { at: now, mode: 'any', signal, languages: knownLanguages(watch) };
        if (signal === 'open' && st.signal !== 'open') notifyRelease(watch, {}, cfg);
        if (signal === 'unknown') {
          st.last.warn = 'BookMyShow page no longer says either "Book tickets" or ' +
                         '"Releasing on" — this watch cannot tell if booking opened.';
        }
        st.signal = signal;
      } else {
        // Several languages: ask each listing's own buytickets page, which was
        // measured answering per event code — 17 cinemas for Malayalam, 54 for
        // Telugu, 2 for Hindi, the same film on the same day. That is the
        // per-language signal, and it costs one request per language.
        st.signals = st.signals || {};
        const fired = [];
        let read = 0;
        let lastError = null;
        for (const code of codes) {
          const v = R.variantFor(watch, code);
          let now_;
          try {
            now_ = R.listingSignal(await R.fetchText(R.buyTicketsUrl(
              watch.citySlug, v.slug || watch.slug, code,
              watch.releaseDate || R.toDateCode(new Date()))), code);
          } catch (e) { lastError = e; continue; }
          if (now_.signal !== 'unknown') read++;
          const before = st.signals[code];
          // Only a transition fires, and only into a state this is sure of.
          if (now_.signal === 'open' && before !== 'open') {
            fired.push({ language: v.language || '', eventCode: code, slug: v.slug || watch.slug,
                         cinemas: now_.venues });
          }
          st.signals[code] = now_.signal;
          await sleep(700);
        }

        const open = codes.filter((c) => st.signals[c] === 'open');
        st.last = { at: now, mode: 'any', signal: open.length ? 'open' : read ? 'closed' : 'unknown',
                    languages: knownLanguages(watch), checked: read, listings: codes.length,
                    fired: fired.length };
        if (!read) {
          // Every listing unreadable. Rather than sit silent, fall back to the
          // film page — it cannot name a language, but it can still say the
          // film went on sale.
          st.last.signal = page.booking;
          st.last.warn = 'Couldn’t read any listing page, so this watch is back to ' +
                         'the film’s own page and cannot tell the languages apart.';
          if (page.booking === 'open' && st.signal !== 'open') notifyRelease(watch, {}, cfg);
          if (lastError) st.last.error = String(lastError.message || lastError).slice(0, 120);
        }
        st.signal = st.last.signal;
        for (const f of fired) notifyRelease(watch, f, cfg);
      }
    }
    st.fails = 0;
  } catch (e) {
    st.fails = (st.fails || 0) + 1;
    st.last = { at: now, error: String(e.message || e).slice(0, 160) };
    // Back off on repeated failure, but never past the configured cadence by
    // more than a few multiples — a watch that has given up is worse than one
    // that is merely slow.
    st.nextCheck = now + jitter(Math.min(60 * st.fails, 900)) * 1000;
    cfg.releaseState[watch.id] = st;
    await setCfg({ releaseState: cfg.releaseState });
    return st;
  }

  st.nextCheck = R.nextCheckAt(now, cfg.release.intervalMinutes);
  cfg.releaseState[watch.id] = st;
  await setCfg({ releaseState: cfg.releaseState });
  return st;
}

/** The languages a watch currently knows it covers, for the settings row. */
function knownLanguages(watch) {
  const all = [watch.language, ...(watch.variants || []).map((v) => v.language)]
    .map((x) => String(x || '').trim()).filter(Boolean);
  return [...new Set(all)];
}

/**
 * Splits what opened into one alert per language.
 *
 * Each group carries the event code of its earliest day, because that is where
 * its link has to point: the premiere if there was one, release day otherwise.
 */
function byLanguage(opened) {
  const out = new Map();
  for (const o of opened) {
    const key = o.language || o.eventCode || '';
    if (!out.has(key)) out.set(key, { language: o.language || '', venues: [] });
    out.get(key).venues.push(o);
  }
  for (const g of out.values()) {
    const first = [...g.venues].sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')))[0];
    g.eventCode = first?.eventCode || null;
    g.slug = first?.slug || null;
  }
  return [...out.values()];
}

/**
 * Teaches a watch the other languages of its film, from a byvenue response it
 * was already going to fetch.
 *
 * Two rules, both exact, neither costing a request. A listing under a group the
 * watch already knows is the same film by definition — that is the ordinary
 * case, since BookMyShow files every language of I'm Game under EG00470725. A
 * listing whose slug reduces to the same stem is the same film by address,
 * which is the net for a watch whose group could not be read.
 *
 * Recording them is not what makes them ring — the group already did that. It
 * is what lets an alert say *Telugu* and link to `im-game-telugu`, which the
 * codes alone could not.
 */
async function learnVariants(rows, watch, cfg) {
  let changed = false;
  for (const child of rows) {
    if (!R.matchesFilm(child, watch) && !R.variantCandidate(child, watch)) continue;
    if (R.addVariant(watch, child)) changed = true;
  }
  if (changed) await setCfg({ releases: cfg.releases });
  return changed;
}

/**
 * Records the listings a film page linked to.
 *
 * No confirming step: the slug stem in each address is the film, so these are
 * the same film by construction — and unlike a byvenue row, a linked address
 * arrives with the language already spelled out in it.
 */
function adoptListings(watch, listings) {
  let changed = false;
  for (const l of listings || []) {
    // The page names the language of the listing you are already on, too. A
    // watch made before languages were tracked has none, and one alert saying
    // "(Telugu)" beside another saying nothing reads as a bug.
    if (String(l.eventCode) === String(watch.eventCode).toUpperCase()) {
      if (!watch.language && l.language) { watch.language = l.language; changed = true; }
      continue;
    }
    if (R.addVariant(watch, { ...l, via: 'link' })) changed = true;
  }
  return changed;
}

/**
 * The same discovery for a watch that names no theatres.
 *
 * It has no byvenue response to read, so the city's upcoming list stands in:
 * every language of an unreleased film has its own card there, carrying the
 * event code, the group and the language. Cards are matched on title, which is
 * the only handle that page offers, and confirmed the same way a title match
 * from byvenue is.
 *
 * Run at most a few times a day and cached per city, because it answers a
 * question that changes when BookMyShow adds a listing — not every ten minutes.
 */
const VARIANT_SCAN_MS = 6 * 3600 * 1000;
const upcomingCache = new Map();
const UPCOMING_TTL = 30 * 60000;

async function upcomingCards(citySlug) {
  const hit = upcomingCache.get(citySlug);
  if (hit && Date.now() - hit.at < UPCOMING_TTL) return hit.cards;
  const cards = R.parseUpcoming(await R.fetchText(R.upcomingUrl(citySlug)));
  upcomingCache.set(citySlug, { at: Date.now(), cards });
  return cards;
}

async function discoverFromUpcoming(watch, st, cfg) {
  if (!watch.title || !watch.citySlug) return false;
  if (Date.now() - (st.variantsAt || 0) < VARIANT_SCAN_MS) return false;

  let cards;
  // Stamped only on an answer. A listing that could not be fetched has taught
  // the watch nothing, and sleeping six hours on it would hide a language for
  // the rest of the day over one bad request.
  try { cards = await upcomingCards(watch.citySlug); }
  catch { return false; }
  st.variantsAt = Date.now();

  return learnVariants(cards, watch, cfg);
}

/**
 * The watch that already covers a listing, if any.
 *
 * Matched against everything a watch has learned, not just the pair it was
 * created from: a film's other languages are adopted as they are discovered,
 * and from that moment their cards and pages belong to the same watch.
 */
function watchCovering(releases, film) {
  const group = String(film?.group || '').toUpperCase();
  const code = String(film?.eventCode || '').toUpperCase();
  if (!group && !code) return null;
  return (releases || []).find((w) =>
    (group && R.knownGroups(w).includes(group)) ||
    (code && R.knownCodes(w).includes(code))) || null;
}

/** The picker's choices for one city, or null when it named none. */
function defaultVenuesFor(cfg, cityCode) {
  const picked = R.venuesForCity(cfg.release.defaultVenues, cityCode, cfg.city?.code);
  return picked.length ? picked : null;
}

/** Venue codes to names, for alerts, out of whatever the picker last cached. */
function venueNames(cfg, citySlug) {
  const list = cfg.venueCache?.[citySlug]?.venues || [];
  return new Map(list.map((v) => [v.code, v.name]));
}

/**
 * Drops watches whose film is out. Nothing else removes them, and a list that
 * only grows is a list nobody keeps.
 */
async function sweepReleases(cfg) {
  const now = Date.now();
  const keep = cfg.releases.filter((w) => !R.isExpired(w, now));
  if (keep.length === cfg.releases.length) return 0;
  const state = { ...cfg.releaseState };
  for (const w of cfg.releases) if (R.isExpired(w, now)) delete state[w.id];
  const dropped = cfg.releases.length - keep.length;
  cfg.releases = keep;
  cfg.releaseState = state;
  await setCfg({ releases: keep, releaseState: state });
  return dropped;
}

/**
 * Tidies titles that were stored before they were cleaned properly.
 *
 * Safe to run over anything, which is why it runs at all: decoding an entity
 * and dropping a trailing year are deterministic, and doing either to an
 * already-clean title changes nothing. That is the difference between this and
 * guessing which stored titles were scraped rubbish — a guess would eventually
 * eat a real name, so that one is left to the person who added the watch.
 */
async function repairTitles(cfg) {
  let changed = 0;
  const releases = cfg.releases.map((w) => {
    const title = R.cleanTitle(w.title || '');
    if (!title || title === w.title) return w;
    changed++;
    return { ...w, title };
  });
  if (!changed) return 0;
  cfg.releases = releases;
  await setCfg({ releases });
  return changed;
}

async function runDueReleases(force = false) {
  const cfg = await getCfg();
  if (!cfg.running && !force) return;
  if (!cfg.release.enabled && !force) return;
  await sweepReleases(cfg);
  await repairTitles(cfg);
  const now = Date.now();
  for (const watch of cfg.releases) {
    // Measured against the earliest date the watch asks about, not release day.
    // With a short dormancy and a premiere the night before, waking on release
    // day would mean the premiere had already been and gone unwatched.
    if (!force && now < R.wakesAtWithPremieres(watch, cfg.release.dormancyDays,
                                               cfg.release.premiereDays)) continue;
    const st = cfg.releaseState[watch.id] || {};
    if (!force && st.nextCheck && now < st.nextCheck) continue;
    await checkRelease(watch, cfg);
    await sleep(1200);
  }
}

/** The city's cinema list, cached — it is a picker's contents, not a signal. */
const VENUE_CACHE_HOURS = 24 * 7;

async function venuesFor(citySlug, { refresh = false } = {}) {
  const cfg = await getCfg();
  const hit = cfg.venueCache[citySlug];
  const fresh = hit && (Date.now() - hit.at) < VENUE_CACHE_HOURS * 3600 * 1000;
  if (hit && fresh && !refresh) return hit.venues;

  const venues = R.parseCinemas(await R.fetchText(R.cinemasUrl(citySlug)));
  // An empty result is a failure, not an answer. Caching it pinned the picker
  // empty for a week and made a transient fetch problem look permanent — and
  // "refresh the cinema list" would have been the one thing that did not help.
  if (!venues.length) return hit?.venues || [];
  await setCfg({ venueCache: { ...cfg.venueCache, [citySlug]: { at: Date.now(), venues } } });
  return venues;
}

// ---------------------------------------------------------------- wiring

/**
 * Is this an update from before a feature existed?
 *
 * Compared as numbers rather than strings, because "1.10" sorts before "1.9"
 * as text and would then never announce anything again.
 */
function olderThan(version, target) {
  const a = String(version || '').split('.').map(Number);
  const b = String(target).split('.').map(Number);
  for (let i = 0; i < b.length; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
  refreshBadge();
  // Only on a genuine first install — not on every update, and not on a browser
  // restart, both of which also fire this listener.
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  } else if (reason === 'update' && olderThan(previousVersion, '1.4.0')) {
    // Not a tab. Opening one on every update is the kind of thing that gets an
    // extension uninstalled, and this is a feature worth mentioning once rather
    // than insisting on. The popup shows a line until it is dismissed — and the
    // popup is somewhere the user goes anyway.
    //
    // Which line depends on how far back they were. Somebody coming from 1.2
    // has never seen release watching at all and should be told about that, not
    // about a refinement to it they have no context for.
    chrome.storage.local.set({
      whatsNew: olderThan(previousVersion, '1.3.0') ? '1.3' : '1.4',
    });
  }
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
  refreshBadge();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== 'tick') return;
  // Seats first: they are time-critical in a way a release date is not.
  runDue().then(runDueReleases);
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (msg.type === 'checkNow')  { await runDue(true); await runDueReleases(true); respond({ ok: true }); }

    // ---- release watching ------------------------------------------------
    else if (msg.type === 'addRelease') {
      try { respond({ ok: true, ...(await addRelease(msg.entry || {})) }); }
      catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'removeRelease') {
      const cfg = await getCfg();
      const state = { ...cfg.releaseState };
      delete state[msg.id];
      await setCfg({ releases: cfg.releases.filter((w) => w.id !== msg.id), releaseState: state });
      respond({ ok: true });
    }
    else if (msg.type === 'listReleases') {
      const cfg = await getCfg();
      respond({
        ok: true, city: cfg.city, settings: cfg.release,
        releases: cfg.releases.map((w) => ({
          ...w,
          state: cfg.releaseState[w.id] || {},
          dormantUntil: R.wakesAtWithPremieres(w, cfg.release.dormancyDays, cfg.release.premiereDays),
        })),
      });
    }
    // Answers "is this film already watched" for the button on a BookMyShow
    // page, by group rather than by event code — the code on the page may be
    // one of several for the film, and all of them are the same watch.
    else if (msg.type === 'releaseWatched') {
      const cfg = await getCfg();
      const w = watchCovering(cfg.releases, msg);
      respond({ ok: true, watched: Boolean(w), id: w?.id || null });
    }
    else if (msg.type === 'venues') {
      try { respond({ ok: true, venues: await venuesFor(msg.citySlug, { refresh: msg.refresh }) }); }
      catch (e) { respond({ ok: false, error: String(e.message || e) }); }
    }
    else if (msg.type === 'regions') {
      // The fallback rides along on both answers, so the settings page never
      // has to render a city control that cannot be used.
      try {
        const regions = R.parseRegions(await R.fetchJson(R.regionsApi()));
        respond({ ok: true, regions, fallback: R.FALLBACK_REGIONS });
      } catch (e) {
        respond({ ok: false, error: String(e.message || e), fallback: R.FALLBACK_REGIONS });
      }
    }
    else if (msg.type === 'setCity') {
      await setCfg({ city: msg.city });
      respond({ ok: true });
    }
    // Per-film theatres. Read-modify-write inside the worker rather than letting
    // the settings page write `releases` itself: a check running at the same
    // moment updates state on the same object, and a blind overwrite from the
    // page would undo it.
    else if (msg.type === 'setReleaseVenues') {
      const cfg = await getCfg();
      const wanted = msg.venues || {};
      const releases = cfg.releases.map((w) => {
        if (!(w.id in wanted)) return w;
        const list = wanted[w.id];
        // Empty means "any theatre", which is a real choice and stored as null
        // so nothing downstream has to tell an empty array from an absent one.
        return { ...w, venues: Array.isArray(list) && list.length ? [...list] : null };
      });
      await setCfg({ releases });
      respond({ ok: true, changed: releases.filter((w, i) => w !== cfg.releases[i]).length });
    }
    else if (msg.type === 'setReleaseSettings') {
      const cfg = await getCfg();
      await setCfg({ release: { ...cfg.release, ...msg.settings } });
      respond({ ok: true });
    }
    // The city the browser is already set to, so nothing has to be asked twice.
    else if (msg.type === 'cityHint') {
      const cfg = await getCfg();
      if (!cfg.city && msg.city?.slug && msg.city?.code) await setCfg({ city: msg.city });
      respond({ ok: true, city: cfg.city || msg.city || null });
    }
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
        const out = await sendTelegram(cfg.telegram, '✅ Seat Watch is wired up correctly.');
        respond({ ok: true, sent: out.sent, failed: out.failed });
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
