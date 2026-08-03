const $ = (id) => document.getElementById(id);

const SOLD_C = '#D2DAE7';   // --taken
const FREE_C = '#6E86AF';   // --free
const LIT_C  = '#17915C';   // --open
const LIT_BG = '#E7F4ED';   // --open-2

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ format

/** Tabular countdown, so the digits don't shuffle as it ticks. */
function untilShow(ts) {
  if (!ts) return { v: '—:—', l: 'showtime unknown' };
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return { v: 'started', l: 'showtime' };
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  if (s < 3600) return { v: `${m}:${pad(s % 60)}`, l: 'min to showtime' };
  if (s < 12 * 3600) return { v: `${h}:${pad(m)}`, l: 'hrs to showtime' };
  if (s < 24 * 3600) return { v: `${h}h`, l: 'to showtime' };
  return { v: `${Math.floor(h / 24)}d ${h % 24}h`, l: 'to showtime' };
}

/** How much wall-clock time a series covers, for the chart's description. */
const span = (series) => {
  const mins = Math.round((series[series.length - 1].t - series[0].t) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minutes`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hour${h > 1 ? 's' : ''}` : `${Math.round(h / 24)} days`;
};

const ago = (ts) => {
  if (!ts) return 'not checked yet';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `checked ${s}s ago`;
  if (s < 3600) return `checked ${Math.round(s / 60)}m ago`;
  return `checked ${Math.round(s / 3600)}h ago`;
};

const nextIn = (ts) => {
  if (!ts) return { v: '—', l: 'next check' };
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return { v: 'now', l: 'checking' };
  return s < 90
    ? { v: `${s}s`, l: 'to next check' }
    : { v: `${Math.round(s / 60)}m`, l: 'to next check' };
};

// ------------------------------------------------------------------ the hall

/**
 * Draws the seat map the extension actually read.
 *
 * A qualifying run gets a rounded band drawn behind it, joining its seats into
 * one shape. That band is the point of the whole product made visible: "four
 * together" is a single object, not four green dots that happen to be near each
 * other, and the eye reads the difference instantly. `t` runs 0→1 once per
 * popup open and grows the band out from its centre.
 */
function drawHall(canvas, map, t = 1) {
  const rows = map.rows, cols = map.cols;
  if (!rows.length || !cols) return;

  const avail = 356;
  let cell = avail / cols;
  // Capped so a card with blocks still fits Chrome's 600px popup with the
  // Book now button above the fold — the map is the point, but acting on it
  // is more the point. The trend line below it costs some of this budget.
  const maxH = 100;
  if (rows.length * cell > maxH) cell = maxH / rows.length;
  cell = Math.max(cell, 2);

  const w = Math.round(cell * cols), h = Math.round(cell * rows.length);
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const s = Math.max(1.5, cell * 0.68);
  const r = Math.min(1.6, s / 3);
  const lit = map.litSet;

  // The bands go down first, so the seats sit on top of their own highlight.
  const pad = Math.max(1, cell * 0.16);
  for (const [gy, gx0, gx1] of map.marks || []) {
    const x0 = gx0 * cell + (cell - s) / 2;
    const x1 = gx1 * cell + (cell - s) / 2 + s;
    const mid = (x0 + x1) / 2;
    const grow = 0.35 + 0.65 * t;                 // opens out from the middle
    const w2 = ((x1 - x0) / 2 + pad) * grow;
    const y = gy * cell + (cell - s) / 2 - pad;
    const h2 = s + pad * 2;

    g.globalAlpha = t;
    g.beginPath();
    g.roundRect(mid - w2, y, w2 * 2, h2, Math.min(h2 / 2, 6));
    g.fillStyle = LIT_BG;
    g.fill();
    g.strokeStyle = LIT_C;
    g.globalAlpha = t * 0.35;
    g.lineWidth = 1;
    g.stroke();
  }
  g.globalAlpha = 1;

  for (let ry = 0; ry < rows.length; ry++) {
    const cells = rows[ry].cells;
    for (let cx = 0; cx < cells.length; cx++) {
      const ch = cells[cx];
      if (ch === '.') continue;
      const x = cx * cell + (cell - s) / 2;
      const y = ry * cell + (cell - s) / 2;
      const on = ch === 'o' && lit.has(ry + ':' + cx);

      g.beginPath();
      g.roundRect(x, y, s, s, r);
      g.fillStyle = on ? LIT_C : ch === '#' ? SOLD_C : FREE_C;
      g.globalAlpha = 1;
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

/**
 * Free seats over time. One series, so no legend — the row of counts directly
 * above it names the quantity, and blue is what free seats are everywhere else
 * in this interface.
 *
 * x is real elapsed time rather than the check number. The cadence tightens as
 * showtime approaches, so the points bunch to the right; that bunching is true
 * and worth seeing. The final point is marked, and turns amber when the latest
 * reading found a block — which is the moment the line is trying to show you.
 */
function drawTrend(canvas, series, hit) {
  const w = 356, h = 26, pad = 3;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const t0 = series[0].t, span = Math.max(1, series[series.length - 1].t - t0);
  const lo = Math.min(...series.map(p => p.free));
  const hi = Math.max(...series.map(p => p.free));
  const range = Math.max(1, hi - lo);
  const x = (p) => pad + ((p.t - t0) / span) * (w - pad * 2);
  // A flat line sits mid-height rather than pinned to the floor, so "nothing is
  // changing" reads as steady instead of as zero.
  const y = (p) => hi === lo ? h / 2 : h - pad - ((p.free - lo) / range) * (h - pad * 2);

  const trace = () => {
    g.beginPath();
    g.moveTo(x(series[0]), y(series[0]));
    for (const p of series.slice(1)) g.lineTo(x(p), y(p));
  };

  // Fill first, so the line sits on top of its own shading.
  trace();
  g.lineTo(x(series[series.length - 1]), h);
  g.lineTo(x(series[0]), h);
  g.closePath();
  g.fillStyle = 'rgba(110, 134, 175, .16)';
  g.fill();

  trace();
  g.strokeStyle = FREE_C;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();

  const last = series[series.length - 1];
  g.beginPath();
  g.arc(x(last), y(last), 3, 0, Math.PI * 2);
  g.fillStyle = hit ? LIT_C : FREE_C;
  g.fill();
}

function animateHall(canvas, map) {
  if (reduced) return drawHall(canvas, map, 1);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 520);
    drawHall(canvas, map, t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ render

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let snapshot = null;
const canvases = new Map();   // url -> canvas, so we animate once, not every tick

/**
 * Dropping a show throws away everything it has learned, and a mis-click during
 * the last hour before a showtime is expensive, so it asks once. The deadline
 * lives here rather than in the markup because paint() rebuilds every card each
 * second for the countdown — state held in the DOM would be wiped before you
 * could answer. It also means the question lapses on its own, with no timer.
 */
const confirming = new Map();   // url -> when the question lapses
const CONFIRM_MS = 4000;

function paint() {
  const s = snapshot;
  if (!s) return;

  const running = s.running !== false;
  $('pip').className = 'pip' + (running ? '' : ' paused');
  $('mode').textContent = running ? 'Watching' : 'Paused';
  $('toggle').textContent = running ? 'Pause' : 'Resume';

  const shows = s.shows || [];
  const live = shows.filter(x => !(s.state || {})[x.url]?.retired);
  $('tally').textContent = shows.length
    ? `${live.length}/${shows.length} live`
    : '';

  const host = $('shows');

  // Nothing to check and nothing to pause until there's a show on the list.
  $('check').disabled = !shows.length;
  $('toggle').disabled = !shows.length;

  if (!shows.length) {
    if (!host.querySelector('.empty')) {
      host.innerHTML = '';
      const e = el('div', 'empty');
      // Bare light bar, no label: "Screen" names a real thing on a real map,
      // and there's no map here to sit under.
      e.innerHTML = `
        <div class="beam"><div class="beam__bar"></div></div>
        <h2>Nothing on watch yet</h2>
        <p>Open a cinema's showtimes on BookMyShow and click the
           <b>+</b> on any time — sold-out ones included. You'll get a ping the
           moment seats open up next to each other.</p>
        <button class="go" id="empty-opts">Show me how</button>`;
      host.appendChild(e);
      $('empty-opts').onclick = () => chrome.runtime.openOptionsPage();
    }
    return;
  }

  host.querySelector('.empty')?.remove();

  for (const show of shows) {
    const st = (s.state || {})[show.url] || {};
    const last = st.last || {};
    const key = show.url;

    let card = host.querySelector(`[data-url="${CSS.escape(key)}"]`);
    const fresh = !card;
    if (fresh) {
      card = el('article', 'show');
      card.dataset.url = key;
      host.appendChild(card);
    }

    const name = show.label || last.title || key.split('/').slice(-3).join(' / ');
    const asking = (confirming.get(key) || 0) > Date.now();
    const napping = (st.snoozedUntil || 0) > Date.now();
    // Two points is a line, not a trend — wait until there's a shape to read.
    const trend = (st.history || []).length >= 4 ? st.history : null;
    const clock = untilShow(st.showtimeTs);
    const next = nextIn(st.nextCheck);
    const hits = last.hits || [];

    // Progress between the last check and the next one.
    let pct = 0;
    if (last.at && st.nextCheck && st.nextCheck > last.at) {
      pct = Math.max(0, Math.min(1, (Date.now() - last.at) / (st.nextCheck - last.at)));
    }

    let body = '';
    if (st.retired) {
      body = `<div class="quiet-line">Retired — showtime has passed.</div>`;
    } else if (last.error) {
      body = `<div class="err">${esc(last.error)}</div>`;
    } else if (!last.at) {
      body = `<div class="quiet-line">Waiting for the first check.</div>`;
    } else if (hits.length) {
      body = `<ul class="blocks">${hits.map(b => `
        <li><span class="rowid">${esc(b.row)}</span>
            <span>${esc(b.from)}${b.to !== b.from ? '–' + esc(b.to) : ''} · ${b.size} together</span>
            <span class="star">${b.bestseller ? '★' : ''}</span>
            <span class="price">₹${esc(b.price)}</span></li>`).join('')}</ul>`;
      if ((last.blocks || 0) > hits.length) {
        body += `<div class="quiet-line">and ${last.blocks - hits.length} more</div>`;
      }
    } else {
      body = `<div class="quiet-line">Nothing big enough is free yet.</div>`;
    }

    const showMap = !!last.map && !st.retired;

    card.innerHTML = `
      <div class="head">
        <h2 class="name" title="${esc(name)}">${esc(name)}</h2>
        <button class="open ${hits.length ? 'go' : ''}" data-open="${esc(show.url)}">Book now</button>
      </div>
      <div class="venue">${esc(last.subtitle || show.url.replace('https://in.bookmyshow.com', ''))}</div>

      ${showMap ? `
      <div class="hall">
        <canvas class="map"></canvas>
        <div class="beam beam--bottom">
          <div class="beam__bar"></div>
          <span class="eyebrow beam__label">Screen</span>
        </div>
        <div class="caption eyebrow">
          <span${last.blocks ? '' : ' class="off"'}>
            <i style="background:${LIT_C}"></i>${last.blocks || 0} for you</span>
          <span><i style="background:${FREE_C};opacity:.8"></i>${last.available} free</span>
          <span><i style="background:${SOLD_C}"></i>${last.total - last.available} taken</span>
        </div>
        ${trend ? `<canvas class="trend" role="img" aria-label="${
          esc(`Free seats over the last ${span(trend)}: from ${trend[0].free} to ${
            trend[trend.length - 1].free}, low ${Math.min(...trend.map(p => p.free))}, high ${
            Math.max(...trend.map(p => p.free))}`)}"></canvas>` : ''}
      </div>` : '<div style="height:14px"></div>'}

      <div class="clockline">
        <div class="clock">
          <span class="num">${clock.v}</span><span class="eyebrow">${clock.l}</span>
        </div>
        <div class="next">
          <span class="num">${next.v}</span><span class="eyebrow">${next.l}</span>
        </div>
      </div>
      <div class="track"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>

      ${napping ? `<div class="napping">Snoozed — still checking, alerts resume in ${
        Math.max(1, Math.round((st.snoozedUntil - Date.now()) / 60000))}m</div>` : ''}
      ${body}

      <div class="tail">
        <span class="eyebrow stamp">${ago(last.at)}${
          st.borrowed ? ' · your own tab' : ''}${
          last.alerted ? ` · ${last.alerted} new block${last.alerted > 1 ? 's' : ''}` : ''}</span>
        <button class="quiet hush" data-snooze="${esc(show.url)}"
                data-minutes="${napping ? 0 : 15}"
                title="${napping ? 'Resume alerts now' : 'Stay quiet for 15 minutes'}"
                >${napping ? 'Alert me' : 'Snooze'}</button>
        <button class="quiet danger drop ${asking ? 'is-confirm' : ''}"
                data-drop="${esc(show.url)}">Stop watching${asking ? '?' : ''}</button>
      </div>`;

    if (showMap) {
      const canvas = card.querySelector('.map');
      const map = {
        cols: last.map.cols,
        rows: last.map.rows,
        marks: last.map.marks || [],
        litSet: new Set((last.map.marks || []).flatMap(([gy, gx0, gx1]) => {
          const out = [];
          for (let x = gx0; x <= gx1; x++) out.push(gy + ':' + x);
          return out;
        })),
      };
      // Animate only when this card first appears; later repaints redraw flat.
      if (canvases.get(key) !== last.at) {
        canvases.set(key, last.at);
        animateHall(canvas, map);
      } else {
        drawHall(canvas, map, 1);
      }
    }

    if (trend) drawTrend(card.querySelector('.trend'), trend, Boolean(last.blocks));
  }

  // Drop cards for shows removed in Settings.
  const urls = new Set(shows.map(x => x.url));
  for (const card of host.querySelectorAll('.show')) {
    if (!urls.has(card.dataset.url)) card.remove();
  }
}

async function reload() {
  snapshot = await chrome.storage.local.get(null);
  paint();
}

// ------------------------------------------------------------------ wiring

$('check').onclick = async () => {
  const b = $('check');
  b.textContent = 'Checking…';
  b.disabled = true;
  await chrome.runtime.sendMessage({ type: 'checkNow' });
  b.textContent = 'Check now';
  b.disabled = false;
  reload();
};

$('toggle').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'toggle' });
  reload();
};
$('opts').onclick = () => chrome.runtime.openOptionsPage();

// Delegated, because paint() rebuilds the cards on every tick.
$('shows').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open) {
    // Handed to the service worker rather than opened here, so it can ring the
    // blocks once the canvas mounts — which happens long after this popup shuts.
    chrome.runtime.sendMessage({ type: 'openSeats', url: open });
    return window.close();
  }

  const hush = e.target.closest('[data-snooze]');
  if (hush) {
    await chrome.runtime.sendMessage({
      type: 'snooze', url: hush.dataset.snooze, minutes: Number(hush.dataset.minutes),
    });
    return reload();
  }

  const drop = e.target.closest('[data-drop]')?.dataset.drop;
  if (!drop) return;

  if ((confirming.get(drop) || 0) > Date.now()) {
    confirming.delete(drop);
    await chrome.runtime.sendMessage({ type: 'removeShow', url: drop });
    return reload();
  }
  confirming.set(drop, Date.now() + CONFIRM_MS);
  paint();
});

chrome.storage.onChanged.addListener(reload);
setInterval(paint, 1000);   // the countdown and the progress bar tick locally
reload();
