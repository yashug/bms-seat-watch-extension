/**
 * Offline verification for the extension. No browser, no network.
 *   node verify.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const here = (f) => new URL(`./${f}`, import.meta.url).pathname;

// ---------------------------------------------------------------- manifest
console.log('\nmanifest');
const mf = JSON.parse(readFileSync(here('manifest.json'), 'utf8'));
t('valid JSON, MV3', mf.manifest_version === 3);
t('declares service worker', mf.background?.service_worker === 'background.js');
for (const p of ['alarms', 'storage', 'scripting', 'notifications'])
  t(`permission: ${p}`, mf.permissions.includes(p));

// "tabs" is what Chrome renders at install as "Read your browsing history",
// and nothing here needs it: tabs.get/update/create are all available without
// it, and the extension never reads a tab's url, title or favicon.
t('does not ask for tabs — nothing reads tab URLs', !mf.permissions.includes('tabs'));
for (const f of ['background.js', 'popup.js', 'content.js']) {
  const calls = (readFileSync(here(f), 'utf8').match(/chrome\.tabs\.[a-zA-Z]+\([^;]*/g) || []).join(' ');
  t(`${f} never reads a tab's url, title or favicon`, !/\.(url|title|favIconUrl)\b/.test(calls));
}
t('host permission: bookmyshow',
  mf.host_permissions.some(h => h.includes('in.bookmyshow.com')));
t('host permission: telegram api',
  mf.host_permissions.some(h => h.includes('api.telegram.org')));

const referenced = [
  mf.background.service_worker, mf.options_page, mf.action.default_popup,
  ...Object.values(mf.icons || {}), ...Object.values(mf.action.default_icon || {}),
  'options.js', 'popup.js', 'ui.css', 'welcome.html', 'welcome.js', 'privacy.html',
  ...(mf.content_scripts || []).flatMap(c => [...(c.js || []), ...(c.css || [])]),
];
for (const f of [...new Set(referenced)])
  t(`file exists: ${f}`, existsSync(here(f)));

// ---------------------------------------------------------------- interface
console.log('\ninterface');
const popupHtml = readFileSync(here('popup.html'), 'utf8');
const optsHtml = readFileSync(here('options.html'), 'utf8');
const contentCss = readFileSync(here('content.css'), 'utf8');
const css = readFileSync(here('ui.css'), 'utf8');

t('popup loads shared tokens', /href="ui\.css"/.test(popupHtml));
t('settings loads shared tokens', /href="ui\.css"/.test(optsHtml));
const welcomeHtml = readFileSync(here('welcome.html'), 'utf8');
const privacyHtml = readFileSync(here('privacy.html'), 'utf8');
const allHtml = popupHtml + optsHtml + welcomeHtml + privacyHtml;

t('no inline event handlers (MV3 CSP blocks them)',
  !/\son(click|load|change|input)=/i.test(allHtml));
// Subresources only. A link out to BookMyShow is navigation, which the content
// security policy has no opinion about — it's the things the page *loads* that
// have to be local.
{
  const subresources = [
    ...allHtml.matchAll(/<(script|img|iframe|source|video|audio)\b[^>]*\bsrc="([^"]*)"/gi),
    ...allHtml.matchAll(/<link\b[^>]*\bhref="([^"]*)"/gi),
  ].map(m => m[m.length - 1]);
  t('no remote assets (MV3 CSP blocks them)',
    subresources.every(u => !/^(https?:)?\/\//i.test(u)), subresources.join(' '));
  t('no remote url() in inline styles',
    !/url\((['"]?)(https?:)?\/\//i.test(allHtml));
}

console.log('\nfirst run and privacy');
t('the welcome page opens only on a real install, not on updates',
  /if \(reason === 'install'\)/.test(readFileSync(here('background.js'), 'utf8')));
t('onboarding names the watcher window, the one surprising thing',
  /Leave it on screen/.test(welcomeHtml));
t('onboarding tells you to watch the sold-out shows', /sold-out/.test(welcomeHtml));
t('settings leads with the + on BookMyShow, not with pasting a URL',
  optsHtml.indexOf('Click the + on BookMyShow') < optsHtml.indexOf('Or paste a seat-map address'));
// Cinema first, film second, and the fallback stated where it will be needed.
t('the cinema route is presented before the film route',
  optsHtml.indexOf('start from the cinema') < optsHtml.indexOf('Searching by film works too'));
t('the film route is not hidden — it is what most people use',
  /Searching by film works too/.test(optsHtml));
t('a missing + sends you to the cinema listing',
  /open that cinema and add it from there/.test(optsHtml));
// A route change leaves no + until the page is reloaded, and reloading is the
// cheaper move, so it is the one offered first.
t('reloading is offered before switching route',
  optsHtml.indexOf('Reload the page') < optsHtml.indexOf('open that cinema'));
// The settings page shows a picture of the real control, so the two have to
// agree about which corner it sits in.
t('the pictured + sits where the real one does', (() => {
  const corner = (css, sel) => (css.match(new RegExp(sel + '[^}]*}', 's')) || [''])[0]
    .match(/\b(top|bottom):\s*-?7px/)?.[1];
  return corner(optsHtml, '\\.demo__plus') === corner(contentCss, '\\.bms-seat-watch-btn')
    && corner(optsHtml, '\\.demo__plus') === 'bottom';
})());
t('settings shows what the + looks like rather than only describing it',
  /class="demo__plus"/.test(optsHtml));
t('settings links out to find a cinema',
  /href="https:\/\/in\.bookmyshow\.com\/explore\/cinemas"/.test(optsHtml));
t('settings repeats that sold-out shows are the ones to watch',
  /Include the sold-out ones/.test(optsHtml));
t('the privacy page is reachable from settings', /href="privacy\.html"/.test(optsHtml));
t('…and from onboarding', /href="privacy\.html"/.test(welcomeHtml));
t('privacy states there is no server', /no backend|no server/i.test(privacyHtml));
t('privacy is honest that tokens are stored in the clear',
  /stored unencrypted/.test(privacyHtml));
t('privacy states no analytics or telemetry',
  /no analytics, no telemetry/.test(privacyHtml));
t('privacy notes the tabs permission is not requested',
  /tabs<\/b> permission is not requested/.test(privacyHtml));
// The map is drawn on a canvas, which can't read CSS variables — so the two
// definitions have to be kept in step by hand. Check that they are.
{
  const popupJs = readFileSync(here('popup.js'), 'utf8');
  const token = (n) => (css.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
  const constant = (n) => (popupJs.match(new RegExp(`${n}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`)) || [])[1];
  for (const [tok, con] of [['taken', 'SOLD_C'], ['free', 'FREE_C'], ['open', 'LIT_C']]) {
    const a = token(tok), b = constant(con);
    t(`canvas colour matches --${tok}`, !!a && a.toUpperCase() === b?.toUpperCase(), `${a} vs ${b}`);
  }
}
t('honours prefers-reduced-motion', /prefers-reduced-motion/.test(css));
t('keyboard focus stays visible', /:focus-visible/.test(css));
t('no CSS syntax leftovers', (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);

// ---------------------------------------------------------------- syntax
console.log('\nsyntax');
for (const f of ['background.js', 'options.js', 'popup.js', 'content.js']) {
  try { execSync(`node --check "${here(f)}"`, { stdio: 'pipe' }); t(`parses: ${f}`, true); }
  catch (e) { t(`parses: ${f}`, false, String(e.stderr || e).slice(0, 120)); }
}

const bg = readFileSync(here('background.js'), 'utf8');

// ---------------------------------------------------------------- contracts
console.log('\ninjection contract');
t("executeScript uses world:'MAIN'", /world:\s*'MAIN'/.test(bg));
t('injects extractFromPage by reference', /func:\s*extractFromPage/.test(bg));
t('passes SOLD + PITCH as args', /args:\s*\[\{\s*SOLD,\s*PITCH\s*\}\]/.test(bg));
t('onMessage returns true (async respond)', /return true;/.test(bg));
t('alarm period declared', /periodInMinutes:\s*TICK_MINUTES/.test(bg));
t('picks stage with most seats, not last',
  /if \(found\.length > nodes\.length\)/.test(bg));
t('adjacency uses x geometry, not seat numbers',
  /list\[i\]\.x - run\[run\.length - 1\]\.x <= threshold/.test(bg));
t('treats only status 2 as sold', /s\.status !== SOLD/.test(bg));

console.log('\nvisibility regression (seat map only mounts when the page is visible)');
t('uses a popup window, not a background tab', /type:\s*'popup'/.test(bg));
t('window created unfocused', /focused:\s*false/.test(bg));
t('watcher tab kept active within its window', /active:\s*true/.test(bg));
t('never creates an inactive tab', !/active:\s*false/.test(bg));
t('probes visibility on timeout', /visibilityState/.test(bg));
t('reports a hidden window distinctly', /watcher window is hidden/.test(bg));
t('derives adjacency threshold from geometry, not a constant', /medianW/.test(bg));
t('anchors on seat width, which aisles cannot skew', /seats\.map\(s => s\.w\)/.test(bg));

console.log('\nwindow bounds regression (Chrome enforces 50% on-screen)');
t('positions relative to a normal window', /getLastFocused\(\{ windowTypes: \['normal'\] \}\)/.test(bg));
t('has a no-bounds fallback', /chrome\.windows\.create\(\{ url, type: 'popup', focused: false \}\)/.test(bg));
t('clamps size to the host window', /Math\.min\(WANT_W/.test(bg) && /Math\.min\(WANT_H/.test(bg));
t('offsets are non-negative', /Math\.max\(0, cur\.width - width - MARGIN\)/.test(bg));

// Bounds arithmetic must keep the popup fully inside the host window for a
// range of realistic screen/window sizes.
{
  const place = (curW, curH, curL = 0, curT = 25) => {
    const WANT_W = 1100, WANT_H = 780, MARGIN = 20;
    const width = Math.min(WANT_W, Math.max(400, curW - MARGIN * 2));
    const height = Math.min(WANT_H, Math.max(400, curH - MARGIN * 2));
    return {
      width, height,
      left: Math.round(curL + Math.max(0, curW - width - MARGIN)),
      top: Math.round(curT + Math.max(0, curH - height - MARGIN)),
    };
  };
  const cases = [
    ['13" laptop maximised', 1440, 900],
    ['16" laptop maximised', 1728, 1080],
    ['4K external', 3840, 2160],
    ['half-width window', 720, 900],
    ['small window', 600, 500],
    ['offset window', 1200, 800, 300, 100],
  ];
  for (const [name, w, h, l = 0, t0 = 25] of cases) {
    const b = place(w, h, l, t0);
    const fitsX = b.left >= l && b.left + b.width <= l + w + 1;
    const fitsY = b.top >= t0 && b.top + b.height <= t0 + h + 1;
    t(`bounds stay inside host: ${name}`, fitsX && fitsY,
      JSON.stringify({ b, host: { l, t: t0, w, h } }));
  }
}

// ---------------------------------------------------------------- logic
console.log('\nlogic (extracted from background.js)');
const grab = (name) => {
  const i = bg.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let p = bg.indexOf('(', i), pd = 0, j = p;
  for (; j < bg.length; j++) {
    if (bg[j] === '(') pd++; else if (bg[j] === ')') { pd--; if (!pd) { j++; break; } }
  }
  let d = 0, started = false;
  for (; j < bg.length; j++) {
    if (bg[j] === '{') { d++; started = true; }
    else if (bg[j] === '}') { d--; if (started && !d) { j++; break; } }
  }
  return bg.slice(i, j);
};
const MONTHS = ['january','february','march','april','may','june','july',
                'august','september','october','november','december'];
const bgConst = (name) => {
  const m = bg.match(new RegExp(`^const ${name} = ([\\s\\S]*?);$`, 'm'));
  if (!m) throw new Error(`const ${name} not found in background.js`);
  return m[1];
};
const mk = (n) => new Function('MONTHS', `
  const CADENCE = ${bgConst('CADENCE')};
  const MIN_INTERVAL = ${bgConst('MIN_INTERVAL')};
  ${grab(n)}; return ${n};`)(MONTHS);

// Same trick against content.js, whose helpers take no closure but each other.
const cs = readFileSync(here('content.js'), 'utf8');
const TIME_LEAF_RE = new RegExp(cs.match(/const TIME_LEAF = \/(.*)\/i;/)[1], 'i');
const grabFrom = (src, name) => {
  // Either `function name(` or `const name = (…) => {`. Both get the same
  // brace-aware scan; only the opening differs. Matching an arrow by "the first
  // semicolon before a blank line" is what the previous version did, and adding
  // a blank line inside the body silently truncated it.
  //
  // `async` has to be part of the opening rather than something the scan starts
  // after: extracting an async function without it produces a body full of
  // `await` that will not parse, and the error names the await, not the cause.
  const i = src.search(new RegExp(
    `(async function ${name}\\(|function ${name}\\(|const ${name} = (async )?\\()`));
  if (i < 0) throw new Error(`${name} not found`);
  let p = src.indexOf('(', i), pd = 0, j = p;
  for (; j < src.length; j++) {
    if (src[j] === '(') pd++; else if (src[j] === ')') { pd--; if (!pd) { j++; break; } }
  }
  // Brace counting has to skip strings and comments, or a function containing
  // something like indexOf('{') swallows the rest of the file — silently, which
  // is worse than failing.
  let d = 0, started = false;
  for (; j < src.length; j++) {
    const c = src[j];
    // An escape swallows whatever follows. Without this, the `\//` that ends a
    // regex like /webhooks\// reads as the start of a line comment.
    if (c === '\\') { j++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (j++; j < src.length && src[j] !== quote; j++) if (src[j] === '\\') j++;
      continue;
    }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; if (j < 1) break; continue; }
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && !d) { j++; break; } }
  }
  return src.slice(i, j);
};
const csFns = new Function(`
  const SKIP = ${cs.match(/^const SKIP = (\/.*\/i);$/m)[1]};
  ${grabFrom(cs, 'timeKey')}
  ${grabFrom(cs, 'pageContext')}
  ${grabFrom(cs, 'harvest')}
  ${grabFrom(cs, 'bind')}
  ${grabFrom(cs, 'sliceBalanced')}
  ${grabFrom(cs, 'eventShowtimesApi')};
  ${grabFrom(cs, 'parseShowtimes')}
  ${grabFrom(cs, 'parseEventShowtimes')}
  ${grabFrom(cs, 'readSessionsFromState')}
  ${grabFrom(cs, 'requestArgs')}
  ${grabFrom(cs, 'observedRequest')}
  ${grabFrom(cs, 'connected')};
  const EVENT_SHOWTIMES = '/api/movies-data/v5/showtimes-by-event/primary-dynamic';
  ${grabFrom(cs, 'selectedDate')}
  const pageState = () => globalThis.__state;
  const narrow = ${cs.match(/const narrow = ([\s\S]*?);\n\n/)[1]};
  const showtimesApi = ${cs.match(/const showtimesApi = ([\s\S]*?);\n\n/)[1]};
  const seatLayoutUrl = ${cs.match(/const seatLayoutUrl = ([\s\S]*?);\n/)[1]};
  return { timeKey, pageContext, harvest, bind, seatLayoutUrl, sliceBalanced,
           parseShowtimes, showtimesApi, eventShowtimesApi, parseEventShowtimes,
           readSessionsFromState, selectedDate, requestArgs, observedRequest,
           connected };
`)();

// The extractor pulls functions out of source to run them here. When it
// overshoots it doesn't fail — it silently drags in the rest of the file and
// surfaces as an unrelated syntax error, so it gets its own tests.
console.log('\nthe test harness itself');
{
  const sample = [
    'function withBraceInString() {',
    "  const open = text.indexOf('{', at);",   // a brace inside a string
    '  return open;',
    '}',
    'const AFTER = 1;',
  ].join('\n');
  t('a brace inside a string does not extend the function',
    grabFrom(sample, 'withBraceInString').endsWith('return open;\n}'));

  const withRegex = [
    'function withRegex() {',
    '  return /webhooks\\//i.test(x);',        // \\/ then / looks like //
    '  // trailing',
    '}',
    'const AFTER = 2;',
  ].join('\n');
  t('a regex ending in an escaped slash is not read as a comment',
    !grabFrom(withRegex, 'withRegex').includes('AFTER'));

  const withComment = [
    'function withComment() {',
    '  // } this brace is commentary',
    '  return 1;',
    '}',
  ].join('\n');
  t('a brace in a comment does not close the function',
    grabFrom(withComment, 'withComment').includes('return 1;'));

  const withAsync = ['async function withAsync() {', '  await go();', '}'].join('\n');
  t('an async function keeps its async keyword',
    grabFrom(withAsync, 'withAsync').startsWith('async function'));
  t('an extracted async function parses on its own', (() => {
    try { new Function(grabFrom(withAsync, 'withAsync')); return true; } catch { return false; }
  })());

  // And the real thing: nothing extracted should have run past its own end.
  for (const [file, src] of [['content.js', cs], ['background.js', bg]]) {
    const names = [...src.matchAll(/^(?:async )?function ([a-zA-Z]\w*)\(/gm)].map((m) => m[1]);
    const runaway = names.filter((n) => grabFrom(src, n).length > src.length * 0.6);
    t(`${file}: no extracted function swallows the file`, !runaway.length, runaway.join(', '));
  }
}

const parseShowtime = mk('parseShowtime');
const intervalSeconds = mk('intervalSeconds');
const extractFromPage = mk('extractFromPage');

t('19:45 IST -> 14:15 UTC',
  parseShowtime('ALLU Cinemas: Kokapet | Fri, 07 August, 2026 | 07:45 PM', '')
    .toISOString() === '2026-08-07T14:15:00.000Z');
t('12:30 AM -> 00:30',
  parseShowtime('X | Thu, 06 August, 2026 | 12:30 AM', '')
    .toISOString() === '2026-08-05T19:00:00.000Z');
t('12:30 PM -> 12:30',
  parseShowtime('X | Thu, 06 August, 2026 | 12:30 PM', '')
    .toISOString() === '2026-08-06T07:00:00.000Z');
t('URL date fallback',
  parseShowtime(null, 'https://in.bookmyshow.com/x/seat-layout/E/V/3021/20260801') instanceof Date);
t('no showtime -> null', parseShowtime(null, 'https://example.com') === null);

t('2h out -> 90s', intervalSeconds(120) === 90);
t('5h out -> 5m', intervalSeconds(300) === 300);
t('12h out -> 15m', intervalSeconds(720) === 900);
t('3d out -> 30m', intervalSeconds(4320) === 1800);
t('unknown -> 10m', intervalSeconds(null) === 600);
t('20m past -> retire', intervalSeconds(-20) === null);
t('5m past -> still watching', intervalSeconds(-5) === 90);

console.log('\ncadence you can edit');
{
  const mine = { window: 120, soon: 240, day: 600, far: 3600, unknown: 900 };
  t('your last-hours interval is used', intervalSeconds(60, mine) === 120);
  t('your 3-6h interval is used', intervalSeconds(300, mine) === 240);
  t('your 6-24h interval is used', intervalSeconds(700, mine) === 600);
  t('your far interval is used', intervalSeconds(5000, mine) === 3600);
  t('your unknown-showtime interval is used', intervalSeconds(null, mine) === 900);
  t('retiring is not something you can retune', intervalSeconds(-20, mine) === null);

  // A floor no box can go under: every check is a real page load, and a tight
  // loop against a site with bot detection is what gets an extension blocked.
  t('5 seconds is floored to 60', intervalSeconds(60, { window: 5 }) === 60);
  t('zero is floored, not treated as instant', intervalSeconds(60, { window: 0 }) === 90);
  t('a negative interval falls back to the default', intervalSeconds(60, { window: -30 }) === 90);
  t('nonsense falls back to the default', intervalSeconds(60, { window: 'soon' }) === 90);

  // One bad field must not retune the bands around it.
  const partial = { window: 150 };
  t('an unset band keeps its own default', intervalSeconds(300, partial) === 300);
  t('…while the set one still applies', intervalSeconds(60, partial) === 150);
  t('no cadence at all behaves exactly as before', intervalSeconds(120) === intervalSeconds(120, null));
  t('the floor is declared once, in the service worker', bgConst('MIN_INTERVAL').trim() === '60');
}

function run(rows) {
  const nodes = [];
  rows.forEach((row, ri) => row.seats.forEach((s) => nodes.push({
    attrs: { seatObj: {
      rowNumber: row.row, displaySeatNumber: String(s.num).padStart(2, '0'),
      curPrice: String(s.price ?? 395), seatStatus: s.status } },
    children: [],
    getClientRect: () => ({ x: 91 + s.col * 28, y: 204 + ri * 27, width: 23, height: 23 }),
  })));
  const real = { attrs: {}, children: nodes };
  const decoy = { attrs: {}, children: [] };
  global.window = { Konva: { stages: [real, decoy] } };
  global.Konva = global.window.Konva;
  global.document = { querySelector: () => ({ textContent: 'T' }), querySelectorAll: () => [] };
  return extractFromPage({ SOLD: 2, PITCH: 32 });
}

{
  const d = run([{ row: 'R', seats: [
    { num: 8, col: 0, status: 1 }, { num: 7, col: 1, status: 1 },
    { num: 6, col: 2, status: 1 }, { num: 5, col: 3, status: 1 },
    { num: 4, col: 4, status: 2 },
    { num: 3, col: 5, status: 1 }, { num: 2, col: 6, status: 1 }, { num: 1, col: 7, status: 1 } ]}]);
  t('ignores the decoy stage', d && d.total === 8);
  t('7 of 8 free', d.available === 7);
  t('sold seat splits the run', d.runs.length === 2);
  t('sizes 4 and 3', d.runs.map(r => r.size).sort().join() === '3,4');
}
{
  const d = run([{ row: 'K', seats: [
    { num: 5, col: 0, status: 1 }, { num: 4, col: 4, status: 1 } ]}]);
  t('consecutive numbers across an aisle stay split', d.runs.length === 2);
}
{
  const d = run([{ row: 'L', seats: [
    { num: 32, col: 0, status: 4 }, { num: 31, col: 1, status: 1 } ]}]);
  t('bestseller (status 4) is bookable', d.available === 2 && d.runs[0].bestseller === true);
}
{
  const d = run([
    { row: 'R', seats: [{ num: 2, col: 0, status: 1 }, { num: 1, col: 1, status: 1 }] },
    { row: 'S', seats: [{ num: 2, col: 0, status: 1 }, { num: 1, col: 1, status: 1 }] }]);
  t('rows never merge', d.runs.length === 2);
}
{
  const d = run([{ row: 'A', seats: [{ num: 2, col: 0, status: 2 }] }]);
  t('all sold -> no runs', d.available === 0 && d.runs.length === 0);
}

// Adaptive pitch: the same seat map rendered at a different scale must yield
// identical blocks. mkRun lets us squash the grid and re-check.
function runScaled(rows, step) {
  const nodes = [];
  rows.forEach((row, ri) => row.seats.forEach((s) => nodes.push({
    attrs: { seatObj: {
      rowNumber: row.row, displaySeatNumber: String(s.num).padStart(2, '0'),
      curPrice: '395', seatStatus: s.status } },
    children: [],
    // real ratio: 23px seat on a 28px step
    getClientRect: () => ({ x: 50 + s.col * step, y: 100 + ri * step,
                            width: Math.round(step * 0.82), height: Math.round(step * 0.82) }),
  })));
  global.window = { Konva: { stages: [{ attrs: {}, children: nodes }] } };
  global.Konva = global.window.Konva;
  global.document = { querySelector: () => ({ textContent: 'T' }), querySelectorAll: () => [] };
  return extractFromPage({ SOLD: 2, PITCH: 32 });
}
{
  // cols 0,1,2 then an aisle then 6,7 — must be 2 blocks at ANY scale
  const layout = [{ row: 'R', seats: [
    { num: 5, col: 0, status: 1 }, { num: 4, col: 1, status: 1 }, { num: 3, col: 2, status: 1 },
    { num: 2, col: 6, status: 1 }, { num: 1, col: 7, status: 1 } ]}];
  const big = runScaled(layout, 28);    // desktop scale
  const small = runScaled(layout, 12);  // narrow window
  const huge = runScaled(layout, 60);   // zoomed in
  t('pitch 28 -> 2 blocks (3,2)', big.runs.map(r => r.size).sort().join() === '2,3');
  t('pitch 12 -> same 2 blocks', small.runs.map(r => r.size).sort().join() === '2,3');
  t('pitch 60 -> same 2 blocks', huge.runs.map(r => r.size).sort().join() === '2,3');
  t('scale-invariant (hardcoded 32px would break at 60)',
    JSON.stringify(big.runs.map(r => r.nums)) === JSON.stringify(huge.runs.map(r => r.nums)));
}

// ---------------------------------------------------------------- hall map
console.log('\nhall map (what the popup draws)');
t('persists the map for the popup', /map: data\.grid && \{/.test(bg));
t('marks only blocks that passed the filters', /marks: qualifying/.test(bg));
t('persists showtime for a live countdown', /st\.showtimeTs = showtime/.test(bg));

{
  const layout = [{ row: 'R', seats: [
    { num: 5, col: 0, status: 1 }, { num: 4, col: 1, status: 2 }, { num: 3, col: 2, status: 1 },
    { num: 2, col: 6, status: 1 }, { num: 1, col: 7, status: 1 } ]}];
  const d = run(layout);
  t('one line per seat row', d.grid.rows.length === 1);
  t('aisle survives as a gap, seats as o/#', d.grid.rows[0].cells === 'o#o...oo',
    JSON.stringify(d.grid.rows[0].cells));
  t('column count spans the widest row', d.grid.cols === 8);
  t('keeps the row letter', d.grid.rows[0].row === 'R');

  const coords = d.runs.map(r => [r.gy, r.gx0, r.gx1]);
  t('run coordinates land on the grid', JSON.stringify(coords) === '[[0,0,0],[0,2,2],[0,6,7]]',
    JSON.stringify(coords));

  // Marked cells must be free ones, never a booked seat or an aisle.
  const ok = d.runs.every(r => {
    for (let x = r.gx0; x <= r.gx1; x++) if (d.grid.rows[r.gy].cells[x] !== 'o') return false;
    return true;
  });
  t('every marked cell is a free seat', ok);
}
{
  // The grid must describe the same hall regardless of render scale.
  const layout = [{ row: 'R', seats: [
    { num: 3, col: 0, status: 1 }, { num: 2, col: 1, status: 2 },
    { num: 1, col: 5, status: 1 } ]}];
  const a = runScaled(layout, 28).grid;
  const b = runScaled(layout, 12).grid;
  const c = runScaled(layout, 60).grid;
  t('grid is scale-invariant',
    JSON.stringify(a.rows) === JSON.stringify(b.rows) &&
    JSON.stringify(a.rows) === JSON.stringify(c.rows),
    JSON.stringify([a.rows, b.rows, c.rows]));
}
{
  const d = run([
    { row: 'A', seats: [{ num: 2, col: 0, status: 1 }, { num: 1, col: 1, status: 2 }] },
    { row: 'B', seats: [{ num: 2, col: 0, status: 2 }, { num: 1, col: 3, status: 1 }] }]);
  t('rows keep their own line', d.grid.rows.length === 2);
  t('short rows pad to the full width',
    d.grid.rows.every(r => r.cells.length === d.grid.cols));
  t('second row placed correctly', d.grid.rows[1].cells === '#..o', d.grid.rows[1].cells);
}

// ---------------------------------------------------------------- position
console.log('\nwhere a block sits in the hall');
{
  const wanted = mk('wanted');

  // 9 columns wide, 5 rows deep. Row index 0 is the BACK — BookMyShow draws the
  // screen at the bottom of the layout, so the largest y is nearest to it.
  const hall = (row, cols) => ({
    row, seats: cols.map((col) => ({ num: col + 1, col, status: 1 })),
  });
  const seatsAt = (rows) => {
    const nodes = [];
    rows.forEach((r, ri) => r.seats.forEach((s) => nodes.push({
      attrs: { seatObj: { rowNumber: r.row, displaySeatNumber: String(s.num),
                          curPrice: '300', seatStatus: s.status } },
      children: [],
      getClientRect: () => ({ x: 50 + s.col * 28, y: 100 + ri * 28, width: 23, height: 23 }),
    })));
    global.window = { Konva: { stages: [{ attrs: {}, children: nodes }] } };
    global.Konva = global.window.Konva;
    global.document = { querySelector: () => ({ textContent: 'T' }), querySelectorAll: () => [] };
    return extractFromPage({ SOLD: 2, PITCH: 32 });
  };

  // Back row spans the full width; the other rows hold one block each.
  const d = seatsAt([
    hall('A', [0, 1, 2, 3, 4, 5, 6, 7, 8]),   // index 0 — back
    hall('B', [0, 1]),                        // hard left
    hall('C', [3, 4, 5]),                     // centre
    hall('D', [7, 8]),                        // hard right
    hall('E', [3, 4]),                        // index 4 — front, at the screen
  ]);
  const at = (row) => d.runs.find(r => r.row === row);

  t('the back row reads as farthest from the screen', at('A').fromScreen === 1);
  t('the front row reads as nearest the screen', at('E').fromScreen === 0);
  t('a centre block reads as centred', at('C').offCentre < 0.05);
  t('a left-wall block reads as off-centre', at('B').offCentre > 0.7);
  t('a right-wall block reads as off-centre too', at('D').offCentre > 0.7);
  t('off-centre is a magnitude, not a side',
    Math.abs(at('B').offCentre - at('D').offCentre) < 0.15);

  const keep = (want) => wanted(d.runs, want).map(r => r.row).sort().join('');
  t('no filters keeps every block', keep({ minAdjacent: 2 }) === 'ABCDE');
  t('the middle half drops both walls', keep({ minAdjacent: 2, maxOffCentre: 0.5 }) === 'ACE');
  t('dead centre is stricter still', keep({ minAdjacent: 2, maxOffCentre: 0.22 }) === 'ACE');
  t('skipping the front half drops the screen-side rows',
    keep({ minAdjacent: 2, minFromScreen: 0.5 }) === 'ABC');
  t('position and size combine', keep({ minAdjacent: 3, maxOffCentre: 0.5 }) === 'AC');
  t('a reading with no geometry is never excluded by position',
    wanted([{ size: 4, price: 300 }], { minAdjacent: 2, maxOffCentre: 0.1, minFromScreen: 0.9 })
      .length === 1);
  t('bestseller-only keeps nothing when none are marked',
    wanted(d.runs, { minAdjacent: 2, bestsellerOnly: true }).length === 0);
  t('an unknown filter key is ignored rather than excluding everything',
    wanted(d.runs, { minAdjacent: 2, maxPrice: 100 }).length === d.runs.length);
}

// ---------------------------------------------------------------- trend
console.log('\nfree seats over time');
{
  const pj = readFileSync(here('popup.js'), 'utf8');
  t('every check is recorded, capped so storage cannot grow forever',
    /st\.history = \[\.\.\.\(st\.history \|\| \[\]\), \{ t: Date\.now\(\), free: data\.available \}\]\.slice\(-40\)/.test(bg));
  t('the chart waits for a shape worth reading', /\.length >= 4 \? st\.history : null/.test(pj));
  t('one series, so no legend is drawn', !/legend/i.test(pj.slice(pj.indexOf('function drawTrend'), pj.indexOf('function animateHall'))));
  t('the line is the same blue free seats are everywhere else',
    /g\.strokeStyle = FREE_C;/.test(pj));
  t('the last point turns amber only when a block was found',
    /g\.fillStyle = hit \? LIT_C : FREE_C;/.test(pj));
  t('x is elapsed time, not the check number', /\(p\.t - t0\) \/ span/.test(pj));
  t('a flat series sits mid-height rather than on the floor',
    /hi === lo \? h \/ 2 :/.test(pj));
  t('the chart carries a text description for screen readers',
    /role="img" aria-label=/.test(pj));
  t('2px line, per the mark spec', /g\.lineWidth = 2;/.test(pj));

  // The description has to survive a flat series and a single-minute span.
  const span = new Function(`const span = ${
    pj.match(/const span = ([\s\S]*?\n\});\n/)[1]}; return span(arguments[0]);`);
  const at = (mins) => [{ t: 0, free: 1 }, { t: mins * 60000, free: 2 }];
  t('a short span reads in minutes', span(at(12)) === '12 minutes');
  t('a zero span never reads as "0 minutes"', span(at(0)) === '1 minutes');
  t('an hour-plus span reads in hours', span(at(150)) === '3 hours');
  t('a multi-day span reads in days', span(at(60 * 50)) === '2 days');
}

// ---------------------------------------------------------------- alerts
console.log('\nborrowing a tab you already have open');
t('an open tab is preferred over opening a window',
  /const borrowed = await borrowOpenTab\(show\.url\);\s*\n\s*const tabId = borrowed \?\? await ensureWatcherTab/.test(bg));
t('only the exact seat map is borrowed', /chrome\.tabs\.query\(\{ url, status: 'complete' \}\)/.test(bg));
t('an inactive tab is not borrowed — its canvas never mounts',
  /if \(!tab\.active \|\| tab\.id == null\) continue;/.test(bg));
t('a minimised window is not borrowed either',
  /if \(win\.state === 'minimized'\) continue;/.test(bg));
t('a failed lookup falls back rather than throwing',
  /catch \{ \/\* no host permission for that URL, or it closed mid-query \*\/ \}[\s\S]{0,40}return null;/.test(bg));
t('querying by URL is covered by the bookmyshow host permission, not "tabs"',
  mf.host_permissions.includes('https://in.bookmyshow.com/*') && !mf.permissions.includes('tabs'));
t('the popup says when a check came from your own tab',
  /st\.borrowed \? ' · your own tab' : ''/.test(readFileSync(here('popup.js'), 'utf8')));

console.log('\nwebhooks');
{
  const shape = new Function(`${grabFrom(bg, 'webhookRequest')}; return webhookRequest;`)();
  const of = (url) => JSON.parse(shape(url, 'body text', 'Seats open').body || '{}');

  t('a Discord webhook gets Discord\'s shape',
    of('https://discord.com/api/webhooks/123/abc').content === '**Seats open**\nbody text');
  t('the discordapp.com alias is recognised too',
    of('https://discordapp.com/api/webhooks/123/abc').content !== undefined);
  t('ntfy gets the plain body with the title in a header',
    shape('https://ntfy.sh/my-topic', 'body text', 'Seats open').body === 'body text' &&
    shape('https://ntfy.sh/my-topic', 'body text', 'Seats open').headers.Title === 'Seats open');
  t('a self-hosted ntfy is recognised by its host, not the exact domain',
    shape('https://ntfy.example.org/topic', 'x', 'y').headers['Content-Type'] === 'text/plain');
  t('anything else gets title and text kept apart',
    of('https://hooks.zapier.com/abc').title === 'Seats open' &&
    of('https://hooks.zapier.com/abc').text === 'body text');
  t('a Discord URL is never mistaken for ntfy',
    shape('https://discord.com/api/webhooks/1/2', 'x', 'y').headers['Content-Type'] === 'application/json');

  t('the plain build carries the link', /lines\.push\(show\.url\)/.test(bg));
  t('each channel is attempted separately',
    /catch \(e\) \{ st\.telegramError =/.test(bg) && /catch \(e\) \{ st\.webhookError =/.test(bg));
  t('stale channel errors are cleared before each attempt',
    /delete st\.telegramError;\s*\n\s*delete st\.webhookError;/.test(bg));
  t('Telegram is skipped when it is not configured',
    /if \(cfg\.telegram\?\.botToken && cfg\.telegram\?\.chatId\)/.test(bg));
  t('the desktop notification fires whatever the remote channels do',
    /desktopNotify\(show, data, fresh\);\s*\n\s*\}/.test(bg));

  const optional = mf.optional_host_permissions || [];
  t('arbitrary hosts are optional, not demanded at install', optional.includes('https://*/*'));
  t('no wildcard host sits in the required list',
    !(mf.host_permissions || []).some(h => /^\*|\/\/\*\//.test(h)));
  const oj = readFileSync(here('options.js'), 'utf8');
  t('permission is asked for one origin, not all of them',
    /new URL\(url\)\.origin \+ '\/\*'/.test(oj) && /permissions\.request\(\{ origins: \[origin\] \}\)/.test(oj));
  t('http addresses are refused', /The address has to start with https:\/\//.test(oj));
  t('a declined prompt saves nothing', /Chrome declined access to that address — nothing saved/.test(oj));
}

console.log('\nalerts lead somewhere');
t('the notification is clickable', /notifications\.onClicked\.addListener/.test(bg));
t('it carries action buttons', /buttons: \[\{ title: 'Open seats' \}/.test(bg));
t('buttons are wired', /notifications\.onButtonClicked\.addListener/.test(bg));
t('the show URL is the notification id, so it survives a worker restart',
  /notifications\.create\(show\.url,/.test(bg));
t('the alert waits for you rather than fading', /requireInteraction: true/.test(bg));
t('clicking opens the seat map', /function openSeats\(url\)[\s\S]{0,140}tabs\.create/.test(bg));

console.log('\nwebhooks');
{
  const shape = new Function(`${grabFrom(bg, 'webhookRequest')}; return webhookRequest;`)();
  const of = (url) => JSON.parse(shape(url, 'body text', 'Seats open').body || '{}');

  t('a Discord webhook gets Discord\'s shape',
    of('https://discord.com/api/webhooks/123/abc').content === '**Seats open**\nbody text');
  t('the discordapp.com alias is recognised too',
    of('https://discordapp.com/api/webhooks/123/abc').content !== undefined);
  t('ntfy gets the plain body with the title in a header',
    shape('https://ntfy.sh/my-topic', 'body text', 'Seats open').body === 'body text' &&
    shape('https://ntfy.sh/my-topic', 'body text', 'Seats open').headers.Title === 'Seats open');
  t('a self-hosted ntfy is recognised by its host, not the exact domain',
    shape('https://ntfy.example.org/topic', 'x', 'y').headers['Content-Type'] === 'text/plain');
  t('anything else gets title and text kept apart',
    of('https://hooks.zapier.com/abc').title === 'Seats open' &&
    of('https://hooks.zapier.com/abc').text === 'body text');
  t('a Discord URL is never mistaken for ntfy',
    shape('https://discord.com/api/webhooks/1/2', 'x', 'y').headers['Content-Type'] === 'application/json');

  t('the plain build carries the link', /lines\.push\(show\.url\)/.test(bg));
  t('each channel is attempted separately',
    /catch \(e\) \{ st\.telegramError =/.test(bg) && /catch \(e\) \{ st\.webhookError =/.test(bg));
  t('stale channel errors are cleared before each attempt',
    /delete st\.telegramError;\s*\n\s*delete st\.webhookError;/.test(bg));
  t('Telegram is skipped when it is not configured',
    /if \(cfg\.telegram\?\.botToken && cfg\.telegram\?\.chatId\)/.test(bg));
  t('the desktop notification fires whatever the remote channels do',
    /desktopNotify\(show, data, fresh\);\s*\n\s*\}/.test(bg));

  const optional = mf.optional_host_permissions || [];
  t('arbitrary hosts are optional, not demanded at install', optional.includes('https://*/*'));
  t('no wildcard host sits in the required list',
    !(mf.host_permissions || []).some(h => /^\*|\/\/\*\//.test(h)));
  const oj = readFileSync(here('options.js'), 'utf8');
  t('permission is asked for one origin, not all of them',
    /new URL\(url\)\.origin \+ '\/\*'/.test(oj) && /permissions\.request\(\{ origins: \[origin\] \}\)/.test(oj));
  t('http addresses are refused', /The address has to start with https:\/\//.test(oj));
  t('a declined prompt saves nothing', /Chrome declined access to that address — nothing saved/.test(oj));
}

console.log('\nalerts lead somewhere');
t('the notification is clickable', /notifications\.onClicked\.addListener/.test(bg));
t('it carries action buttons', /buttons: \[\{ title: 'Open seats' \}/.test(bg));
t('buttons are wired', /notifications\.onButtonClicked\.addListener/.test(bg));
t('the show URL is the notification id, so it survives a worker restart',
  /notifications\.create\(show\.url,/.test(bg));
t('the alert waits for you rather than fading', /requireInteraction: true/.test(bg));
t('clicking opens the seat map', /function openSeats\(url\)[\s\S]{0,140}tabs\.create/.test(bg));

t('snoozing does not mark blocks as already told',
  /if \(!snoozed\) st\.notified = qualifying\.map\(runKey\);/.test(bg));
t('…but availability vanishing still clears them',
  /else if \(!qualifying\.length\) st\.notified = \[\];/.test(bg));
t('a snoozed show is quiet on the badge too', /if \(\(st\.snoozedUntil \|\| 0\) > Date\.now\(\)\) return n;/.test(bg));
t('a lapsed snooze clears itself', /if \(st\.snoozedUntil && st\.snoozedUntil <= Date\.now\(\)\) delete st\.snoozedUntil/.test(bg));
t('snoozing never stops the checks',
  !/snoozedUntil[\s\S]{0,200}(return st;|continue;)/.test(bg.slice(bg.indexOf('async function runDue'))));

// ---------------------------------------------------------------- watch button
console.log('\nwatch this show (listing pages)');
{
  const { timeKey, pageContext, harvest, bind, seatLayoutUrl, sliceBalanced,
          parseShowtimes, showtimesApi, eventShowtimesApi, parseEventShowtimes,
          readSessionsFromState, selectedDate, requestArgs, observedRequest } = csFns;

  // Chrome match patterns: '*' in the path matches any characters, '/' included.
  {
    const toRe = (p) => new RegExp('^' + p.split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const injected = (url) => (mf.content_scripts?.[0]?.matches || []).some((p) => toRe(p).test(url));

    t('runs on a cinema listing',
      injected('https://in.bookmyshow.com/cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260802'));
    t('runs on a film listing',
      injected('https://in.bookmyshow.com/movies/hyderabad/spider-man-brand-new-day/buytickets/ET00505581/20260802?etCodes=*'));
    // The one that actually mattered. BookMyShow routes from a film's page to
    // its showtimes client-side, with no document load — so the script has to
    // already be running on the film page or it never gets a chance to inject.
    t('…and on the film page it routes there from',
      injected('https://in.bookmyshow.com/movies/hyderabad/spider-man-brand-new-day/ET00505581'));
    t('re-scans when the route changes without a load',
      /addEventListener\('popstate', queue\)/.test(cs) && /new MutationObserver\(queue\)/.test(cs));
    t('does not run on unrelated pages',
      !injected('https://in.bookmyshow.com/explore/home/hyderabad') &&
      !injected('https://in.bookmyshow.com/offers'));
  }
  t('runs after the listing has rendered', mf.content_scripts?.[0]?.run_at === 'document_idle');
  // Injected into someone else's document, so every selector has to be ours.
  {
    const selectors = readFileSync(here('content.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.trim())
      .filter(l => /[{,]$/.test(l) && !l.startsWith('@'));
    t('every selector is namespaced', selectors.length > 0 &&
      selectors.every(l => l.includes('.bms-seat-watch')), selectors.join(' | '));
  }
  t('service worker answers addShow', /msg\.type === 'addShow'/.test(bg));
  t('service worker answers removeShow', /msg\.type === 'removeShow'/.test(bg));
  t('harvest runs in the MAIN world', /func: harvestFromPage/.test(bg));
  t('removing a show drops its state too', /delete state\[msg\.url\]/.test(bg));

  // --- the address it builds ------------------------------------------
  const ctx = pageContext(
    'https://in.bookmyshow.com/cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260801');
  t('reads region from the listing URL', ctx.region === 'HYD');
  t('reads venue from the listing URL', ctx.venueCode === 'ALUC');
  t('reads date from the listing URL', ctx.date === '20260801');
  t('ignores an unrelated page', pageContext('https://in.bookmyshow.com/explore/home/hyderabad') === null);
  t('seat-layout URL matches the real format',
    seatLayoutUrl({ ...ctx, eventCode: 'ET00492098', sessionId: '3521' }) ===
    'https://in.bookmyshow.com/movies/HYD/seat-layout/ET00492098/ALUC/3521/20260801');
  t('built URLs pass the Settings validator',
    /^https:\/\/in\.bookmyshow\.com\/.*\/seat-layout\//.test(
      seatLayoutUrl({ ...ctx, eventCode: 'ET00492098', sessionId: '3521' })));

  // --- times ------------------------------------------------------------
  t('07:40 PM -> 1940', timeKey('07:40 PM') === '1940');
  t('10:00 AM -> 1000', timeKey('10:00 AM') === '1000');
  t('12:30 AM -> 0030', timeKey('12:30 AM') === '0030');
  t('12:30 PM -> 1230', timeKey('12:30 PM') === '1230');
  t('24-hour 19:40 -> 1940', timeKey('19:40') === '1940');
  t('11:20 PM survives the chip’s second line',
    timeKey('11:20 PM\nBARCO LASER 4K') === '2320');
  // A film listing appends the subtitle acronym to the time itself, so the
  // chip finder must accept a leading time rather than an exact one. Requiring
  // an exact match found every chip on a venue page and none on a film page.
  {
    const leaf = TIME_LEAF_RE;
    t('a bare time is a chip', leaf.test('11:15 PM'));
    t('a time with a subtitle acronym is still a chip', leaf.test('07:50 PM ENG'));
    t('the acronym does not disturb the time itself', timeKey('07:50 PM ENG') === '1950');
    t('prose that merely opens with a time is not a chip',
      cs.includes('text.length > 28'));
    t('a format line alone is not a chip', !leaf.test('BARCO LASER 4K ATMOS'));
  }
  t('no time -> null', timeKey('BARCO LASER 4K') === null);

  // --- harvesting -------------------------------------------------------
  const page = { pageData: { movies: [
    { eventCode: 'ET00492098', eventName: 'Spider-Man: Brand New Day',
      showtimes: [{ sessionId: '3521', showTime: '07:40 PM' },
                  { sessionId: '3522', showTime: '10:50 PM' }] },
    { eventCode: 'ET00500001', eventName: 'The Odyssey',
      showtimes: [{ sessionId: '4010', showTime: '07:40 PM' }] },
  ] } };
  const found = harvest(page);
  t('finds every showtime', found.length === 3);
  t('carries the movie down to its showtimes',
    found.filter(s => s.eventCode === 'ET00492098').length === 2);
  t('keeps the movie name for tie-breaking',
    found[0].eventName === 'Spider-Man: Brand New Day');
  t('drops sessions with no movie attached', harvest({ sessionId: '1', showTime: '1:00 PM' }).length === 0);
  t('survives junk without throwing',
    harvest({ a: null, b: [undefined, { c: 1 }], d: 'x' }).length === 0);

  // --- the showtimes endpoint ------------------------------------------
  // Values below are lifted verbatim from a real byvenue response for
  // ALUC / HYD / 20260802, trimmed to the fields this code reads.
  const st = (SessionId, ShowTime, ShowTimeCode, AvailStatus, ScreenName, MinPrice) =>
    ({ SessionId, ShowTime, ShowTimeCode, AvailStatus, ScreenName, MinPrice });
  const api = { ShowDetails: [{
    Date: '20260802',
    Venues: { VenueCode: 'ALUC', VenueName: 'ALLU Cinemas: Kokapet' },
    Event: [
      { EventTitle: 'Chennai Love Story', ChildEvents: [{
        EventCode: 'ET00448417', EventName: 'Chennai Love Story - Telugu',
        EventLanguage: 'Telugu', EventDimension: '2D', ShowTimes: [
          st('3501', '10:00 AM', '1000', '3', 'SCREEN 4', '295.00'),
          st('3504', '07:40 PM', '1940', '3', 'SCREEN 4', '295.00'),
          st('3510', '11:20 PM', '2320', '3', 'SCREEN 4', '295.00')] }] },
      { EventTitle: 'Spider-Man: Brand New Day', ChildEvents: [
        { EventCode: 'ET00502689', EventName: 'Spider-Man: Brand New Day (Dolby Cinema 3D) - English',
          EventLanguage: 'English', EventDimension: 'DOLBY CINEMA 3D', ShowTimes: [
            st('3022', '10:00 AM', '1000', '0', 'SCREEN 1', '395.00'),
            st('3397', '11:15 PM', '2315', '1', 'SCREEN 1', '395.00')] },
        { EventCode: 'ET00502600', EventName: 'Spider-Man: Brand New Day (3D) - English',
          EventLanguage: 'English', EventDimension: '3D', ShowTimes: [
            st('3506', '10:40 AM', '1040', '1', 'SCREEN 2', '335.00'),
            st('3509', '07:40 PM', '1940', '1', 'SCREEN 2', '335.00')] },
        { EventCode: 'ET00492098', EventName: 'Spider-Man: Brand New Day (Telugu) - Telugu',
          EventLanguage: 'Telugu', EventDimension: '2D', ShowTimes: [
            st('3522', '01:45 PM', '1345', '1', 'SCREEN 4', '295.00')] }] },
      { EventTitle: 'The Odyssey', ChildEvents: [{
        EventCode: 'ET00452034', EventName: 'The Odyssey - English',
        EventLanguage: 'English', EventDimension: '2D', ShowTimes: [
          st('3472', '10:00 AM', '1000', '2', 'SCREEN 3', '295.00')] }] },
    ],
  }] };

  t('endpoint URL is built from the page URL alone',
    showtimesApi({ region: 'HYD', venueCode: 'ALUC', date: '20260802' }) ===
    '/api/v3/mobile/showtimes/byvenue?dateCode=20260802&venueCode=ALUC&regionCode=HYD');
  t('the request is same-origin by construction, not by hostname',
    showtimesApi({ region: 'HYD', venueCode: 'ALUC', date: '20260802' }).startsWith('/'));

  const api1 = parseShowtimes(api, {});
  t('flattens every showtime', api1.length === 9);
  t('reads the session ID verbatim', api1.find(s => s.sessionId === '3022') !== undefined);
  t('takes the event code from the child, not the film',
    api1.find(s => s.sessionId === '3022').eventCode === 'ET00502689');
  t('the same film in another format is a different event code',
    api1.find(s => s.sessionId === '3509').eventCode === 'ET00502600');
  t('venue and date come from the response', api1[0].venueCode === 'ALUC' && api1[0].date === '20260802');
  // AvailStatus is a label, never a decision. Observed on the live site: a show
  // reporting 0 can have free seats on its layout page — which is exactly what a
  // late release of blocked inventory looks like, and the only event this
  // extension exists to catch. Anything that skipped a check on that basis would
  // go quiet at precisely the wrong moment.
  t('AvailStatus 0 is recorded as a listing claim, not a fact',
    api1.find(s => s.sessionId === '3022').listedSoldOut === true);
  t('other statuses are not claimed sold out',
    ['3501', '3397', '3472'].every(id => api1.find(s => s.sessionId === id).listedSoldOut === false));
  t('a show listed sold out is still watchable',
    api1.some(s => s.listedSoldOut) &&
    api1.filter(s => s.listedSoldOut).every(s => s.eventCode && s.sessionId && s.timeKey));
  t('AvailStatus never changes how many showtimes are offered',
    parseShowtimes(JSON.parse(JSON.stringify(api).replaceAll('"AvailStatus":"0"', '"AvailStatus":"1"')), {})
      .length === api1.length);
  t('the watcher decides availability from the seat map alone',
    !/AvailStatus/.test(bg), 'background.js must never consult AvailStatus');
  // Each parser sets it; exactly one place reads it, and that place only picks
  // wording. Counting reads rather than mentions keeps this honest as parsers
  // are added.
  t('every parser records it', (cs.match(/listedSoldOut:/g) || []).length >= 2);
  t('exactly one place reads it', (cs.match(/\??\.listedSoldOut\b/g) || []).length === 1);
  t('…and that place only chooses wording',
    /session\?\.listedSoldOut\s*\n?\s*\? 'Listed as sold out/.test(cs));
  t('keeps the screen and price for the label',
    api1.find(s => s.sessionId === '3022').screen === 'SCREEN 1' &&
    api1.find(s => s.sessionId === '3022').price === 395);
  t('a showtime missing its session is skipped',
    parseShowtimes({ ShowDetails: [{ Event: [{ ChildEvents: [{ EventCode: 'ET1',
      ShowTimes: [{ ShowTime: '10:00 AM' }] }] }] }] }, {}).length === 0);
  t('an empty response yields nothing, without throwing', parseShowtimes({}, {}).length === 0);
  t('ShowTimeCode alone is enough', timeKey('1940') === '1940' && timeKey('0930') === '0930');
  t('a bogus code is rejected, not accepted as a time', timeKey('9999') === null);

  // Three films start at 10:00 AM and two at 07:40 PM on this very day.
  {
    const row = (text) => ({ textContent: '10:00 AM', parentElement: { textContent: text, parentElement: null } });
    t('10:00 AM: the film’s name picks Chennai',
      bind(row('Chennai Love Story (UA13+) Telugu, 2D'), api1).sessionId === '3501');
    t('10:00 AM: …and picks The Odyssey',
      bind(row('The Odyssey (A) English, 2D'), api1).sessionId === '3472');
    t('10:00 AM: …and the sold-out Dolby show',
      bind(row('Spider-Man: Brand New Day (UA13+) English, DOLBY CINEMA 3D'), api1).sessionId === '3022');

    const at = (time, text) => ({ textContent: time, parentElement: { textContent: text, parentElement: null } });
    t('07:40 PM: two films, resolved by name',
      bind(at('07:40 PM', 'Chennai Love Story (UA13+) Telugu, 2D'), api1).sessionId === '3504' &&
      bind(at('07:40 PM', 'Spider-Man: Brand New Day (UA13+) English, 3D'), api1).sessionId === '3509');

    // "DOLBY CINEMA 3D" contains "3D": the longest format match has to win, or
    // the Dolby row stays ambiguous with the plain 3D row forever.
    const both = parseShowtimes({ ShowDetails: [{ Date: '20260802',
      Venues: { VenueCode: 'ALUC' },
      Event: [{ EventTitle: 'Spider-Man: Brand New Day', ChildEvents: [
        { EventCode: 'ET00502689', EventLanguage: 'English', EventDimension: 'DOLBY CINEMA 3D',
          ShowTimes: [st('3022', '08:00 PM', '2000', '0', 'SCREEN 1', '395.00')] },
        { EventCode: 'ET00502600', EventLanguage: 'English', EventDimension: '3D',
          ShowTimes: [st('3509', '08:00 PM', '2000', '1', 'SCREEN 2', '335.00')] }] }] }] }, {});
    t('the Dolby row wins on the longer format string',
      bind(at('08:00 PM', 'Spider-Man: Brand New Day (UA13+) English, DOLBY CINEMA 3D'), both)
        .sessionId === '3022');
    t('the plain 3D row is not stolen by the Dolby one',
      bind(at('08:00 PM', 'Spider-Man: Brand New Day (UA13+) English, 3D'), both)
        .sessionId === '3509');
    t('an unresolvable chip still binds to nothing',
      bind(at('08:00 PM', 'no useful text here'), both) === null);
  }

  // --- the film-first listing ------------------------------------------
  // /movies/hyderabad/spider-man-brand-new-day/buytickets/ET00505091/20260802
  {
    const href = 'https://in.bookmyshow.com/movies/hyderabad/spider-man-brand-new-day'
               + '/buytickets/ET00505091/20260802?etCodes=*&language=english&refEventCode=ET00505091';
    const ctx = pageContext(href);
    t('a film listing is recognised', ctx?.kind === 'movie');
    t('the two listing kinds are told apart',
      pageContext('https://in.bookmyshow.com/cinemas/HYD/x/buytickets/ALUC/20260801').kind === 'venue');
    t('region comes through as the slug the URL uses', ctx.region === 'hyderabad');
    t('the film code and date are read', ctx.eventCode === 'ET00505091' && ctx.date === '20260802');
    t('the venue is left for the data — a film listing has many',
      ctx.venueCode === null);
    t('the page’s own query is kept', ctx.search.includes('refEventCode=ET00505091'));

    // The slug in the URL is not the code the endpoint wants.
    const url = eventShowtimesApi({ ...ctx, region: 'HYD' });
    t('the film endpoint is called with the region code, not the slug',
      url.includes('regionCode=HYD') && !url.includes('regionCode=hyderabad'));
    t('date is passed as the date code', url.includes('dateCode=20260802'));
    t('format and language are carried over from the page',
      url.includes('etCodes=*') && url.includes('language=english') &&
      url.includes('refEventCode=ET00505091'));
    t('it is host-relative, like the venue endpoint', url.startsWith('/api/movies-data/v5/'));
    t('a page with no query still asks for every format',
      eventShowtimesApi({ date: '20260802', region: 'HYD', search: '' }).includes('etCodes=*'));

    // --- the real envelope --------------------------------------------
    // Structure and values lifted from a live primary-dynamic response.
    // venueCode and eventCode sit in `additionalData` objects that are SIBLINGS
    // of the showtimes, so a context-carrying walk can never reach them.
    const show = (sessionId, showTime, showTimeCode, availStatus, attributes) => ({
      title: showTime, screenAttr: attributes,
      cta: { analytics: { show_session_id: sessionId, company_code: 'ALCC' } },
      additionalData: { sessionId, availStatus, showDateCode: '20260802',
                        showTimeCode, showTime, attributes },
    });
    const card = (venueCode, venueName, sections) => ({
      type: 'venue-card', id: venueCode,
      additionalData: { venueCode, venueName },
      analytics: { venue_code: venueCode, event_name: 'showtime_card_viewed' },
      showtimesSections: sections,
    });
    const section = (eventCode, label, showtimes) => ({
      text: [{ components: [{ type: 'text', text: label }] }],
      showtimes, additionalData: { eventCode },
    });

    const live = { data: {
      header: { title: { text: 'Spider-Man: Brand New Day' } },
      bottomSheetData: { 'format-selector': { widgets: [{ data: [{ cta: {
        analytics: { event_code: 'ET00447840' },
        additionalData: { eventCode: 'ET00447840' } } }] }] } },
      showtimeWidgets: [
        { type: 'adtech', data: [{ id: 'AD_MOVIE_SHOWTIMES_CARD', aspectRatio: 5 }] },
        { type: 'groupList', id: 'List_1', data: [{ type: 'venueGroup', data: [
          card('ALUC', 'ALLU Cinemas: Kokapet', [
            section('ET00502689', 'English DOLBY CINEMA 3D',
              [show('3397', '11:15 PM', '2315', '1', 'DOLBY CINEMA')]),
            section('ET00502600', 'English 3D',
              [show('3513', '10:50 PM', '2250', '1', 'BARCO LASER 4K ATMOS')]),
          ]),
          card('AACN', 'Aparna Cinemas: Nallagandla', [
            section('ET00447840', 'English 2D', [
              // The same film, cinema, minute and format on two screens.
              show('30751', '11:10 PM', '2310', '2', '4K LASER ATMOS'),
              show('30946', '11:10 PM', '2310', '2', '4K LASER ATMOS'),
              show('30944', '11:15 PM', '2315', '0', 'VIP SCREEN'),
              show('30949', '11:15 PM', '2315', '3', '4K DOLBY 7.1'),
            ]),
          ]),
        ] }] },
        { type: 'info', id: 'changeLocation', data: [{ text: 'Unable to find…' }] },
      ],
    } };

    const ev = parseEventShowtimes(live);
    t('every showtime is found across cinemas', ev.length === 6);
    t('the venue comes from the card, not the showtime',
      ev.find(s => s.sessionId === '3397').venueCode === 'ALUC');
    t('the film comes from the section, not the showtime',
      ev.find(s => s.sessionId === '3397').eventCode === 'ET00502689');
    t('two formats at one cinema keep their own event codes',
      ev.find(s => s.sessionId === '3513').eventCode === 'ET00502600');
    t('the cinema’s name is carried for tie-breaking',
      ev.find(s => s.sessionId === '30751').venueName === 'Aparna Cinemas: Nallagandla');
    t('the date comes from the showing itself',
      ev.every(s => s.date === '20260802'));
    t('the film’s name comes from the header',
      ev[0].title === 'Spider-Man: Brand New Day');
    t('sold out is recorded but still watchable',
      ev.find(s => s.sessionId === '30944').listedSoldOut === true);
    t('ad slots and the location card are not mistaken for cinemas',
      ev.every(s => s.venueCode === 'ALUC' || s.venueCode === 'AACN'));
    t('the format picker’s event codes never become showtimes',
      !ev.some(s => s.eventCode === 'ET00447840' && s.venueCode === 'ALUC'));
    t('a generic walk cannot do this — hence the hand-written parser',
      harvest(live).length === 0);

    // A second real page: one film, one format, so BookMyShow prints no section
    // label at all, and a couple of cinemas run screens with no format line.
    // Neither is optional-looking in the JSON — both are simply absent.
    {
      const bare = (sid, t, code, attrs) => ({
        title: t, ...(attrs ? { screenAttr: attrs } : {}),
        additionalData: { sessionId: sid, availStatus: '1', showTimeCode: code, showTime: t,
                          ...(attrs ? { attributes: attrs } : {}) },
      });
      const plain = { data: {
        header: { title: { text: "Newton's 3rd Law" } },
        additionalData: { dateCode: '20260802', language: 'telugu' },
        showtimeWidgets: [{ type: 'groupList', data: [{ type: 'venueGroup', data: [
          { additionalData: { venueCode: 'ASHN', venueName: 'Asian Cinemart: RC Puram' },
            showtimesSections: [{ additionalData: { eventCode: 'ET00509245' }, showtimes: [
              bare('104', '07:30 PM', '1930', '4K DOLBY 7.1'),
              bare('103', '04:50 PM', '1650', '4K DOLBY 7.1')] }] },
          { additionalData: { venueCode: 'AMBH', venueName: 'AMB Cinemas: Gachibowli' },
            showtimesSections: [{ additionalData: { eventCode: 'ET00509245' }, showtimes: [
              bare('202', '07:30 PM', '1930', 'BARCO FLAGSHIP LASER')] }] },
          { additionalData: { venueCode: 'CPMH', venueName: 'Cinepolis: Lulu Mall, Hyderabad' },
            showtimesSections: [{ additionalData: { eventCode: 'ET00509245' },
              showtimes: [bare('501', '04:50 PM', '1650')] }] },
        ] }] }],
      } };
      const p = parseEventShowtimes(plain);
      t('a listing with no section labels still parses', p.length === 4);
      t('a missing section label is empty, not fatal', p.every(s => s.format === ''));
      t('a showtime with no format line still parses',
        p.find(s => s.sessionId === '501').screen === '');
      t('the date falls back to the one the response answered for',
        p.every(s => s.date === '20260802'));

      const row = (time, venue) => ({ textContent: time,
        parentElement: { textContent: venue, parentElement: null } });
      t('the same minute at two cinemas splits on the cinema',
        bind(row('07:30 PM', 'Asian Cinemart: RC Puram'), p).sessionId === '104' &&
        bind(row('07:30 PM', 'AMB Cinemas: Gachibowli'), p).sessionId === '202');
      t('…even when one of them has no format line',
        bind(row('04:50 PM', 'Cinepolis: Lulu Mall, Hyderabad'), p).sessionId === '501');
    }

    // --- a subtitle badge inside the time ----------------------------
    // A show with subtitles puts an ENG badge *inside* the time element. That
    // child made the whole chip invisible to a "must be a leaf" test, so those
    // shows silently got no button.
    {
      const el = (text, children = []) => {
        const node = { textContent: text, children, dataset: {},
                       contains: (o) => children.includes(o) || children.some(c => c.contains?.(o)) };
        return node;
      };
      const badge = el('ENG');
      const timeWithBadge = el('10:50 PM ENG', [badge]);
      const plainTime = el('10:30 PM');

      const leafTest = (n) => n.children.length === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(n.textContent);
      t('the old leaf test missed a time with a subtitle badge', !leafTest(timeWithBadge));
      t('…and that is exactly what the fix removes', !/if \(el\.children\.length\) continue;/.test(cs));
      t('the finder now keeps the innermost match',
        /hits\.some\(\(other\) => other !== el && el\.contains\(other\)\)/.test(cs));

      // The badge itself must not be mistaken for a chip.
      t('a bare ENG badge is not a showtime', !TIME_LEAF_RE.test('ENG'));
      // The gap you see before ENG is CSS margin. In the DOM the badge abuts the
      // time, so requiring a word boundary after PM found none of these chips.
      t('the badge abuts the time with no space', TIME_LEAF_RE.test('10:50 PMENG'));
      t('a spaced badge works too', TIME_LEAF_RE.test('10:50 PM ENG'));
      t('the badge does not disturb the time', timeKey('10:50 PMENG') === '2250');
      t('the whole chip text still reads as a time',
        TIME_LEAF_RE.test('10:00 PMENGATMOS'));
      t('no word boundary is required after the meridiem',
        !/\\b/.test(cs.match(/const TIME_LEAF = (\/.*\/i);/)[1]));
      t('a time range is rejected as a filter control, not a chip',
        cs.includes('.length > 1) continue;'));
      void plainTime;
    }

    // --- switching dates ---------------------------------------------
    {
      const scanSrc = grabFrom(cs, 'scan');
      t('chips are found after the listing is read, not before',
        scanSrc.indexOf('await readSessions') < scanSrc.lastIndexOf('findChips()'));
      t('a chip detached while waiting is skipped', /c\.isConnected/.test(scanSrc));
      t('a button from another day counts as work to redo',
        /c\.dataset\.bmsDate !== ctx\.date/.test(scanSrc));
      t('rebinding replaces the old button rather than adding a second',
        /querySelector\(`\.\$\{BADGE\}-btn`\)\?\.remove\(\)/.test(cs));
      t('the claimed set ignores chips left over from another day',
        /filter\(\(el\) => el\.dataset\.bmsDate === ctx\.date\)/.test(cs));
      t('the date is recorded on the chip when the button goes on',
        /chip\.dataset\.bmsDate = session\.date/.test(cs));
    }

    // --- a cached request for a listing nobody is looking at ----------
    // Observed live: the address bar said ET00502689 on 20260802 while the
    // state still held fetchPrimaryDynamic-*-ET00502630-english-20260805-HYD
    // from an earlier navigation. Asking with the cached format and letting it
    // override the address bar got HTTP 400, and no chip got a button.
    {
      const onScreen = '?etCodes=*&language=english&refEventCode=ET00502689';
      const stale = { etCodes: '*', dateCode: '20260805', isDesktop: true,
                      regionCode: 'HYD', xLocationShared: false,
                      memberId: '14779233', lsId: 'abc', subCode: '', appCode: 'WEB',
                      language: 'english', refEventCode: 'ET00502630' };
      const url = eventShowtimesApi({ date: '20260802', search: onScreen,
                                      region: 'HYD', template: stale });

      t('the format on screen wins over the cached one',
        url.includes('refEventCode=ET00502689') && !url.includes('ET00502630'), url);
      t('the date on screen wins over the cached one',
        url.includes('dateCode=20260802') && !url.includes('20260805'));
      t('…while the ids a URL cannot carry still come from the cached request',
        url.includes('memberId=14779233') && url.includes('lsId=abc'));

      // Same hazard through the other source.
      const observed = new URL('https://in.bookmyshow.com'
        + '/api/movies-data/v5/showtimes-by-event/primary-dynamic'
        + '?etCodes=*&dateCode=20260805&isDesktop=true&regionCode=HYD'
        + '&xLocationShared=false&memberId=14779233&lsId=abc&subCode=&appCode=WEB'
        + '&language=english&refEventCode=ET00502630');
      const merged = eventShowtimesApi({ date: '20260802', search: onScreen,
                                         region: 'HYD', observed });
      t('a stale recorded request cannot override the address bar either',
        merged.includes('refEventCode=ET00502689') && merged.includes('dateCode=20260802'));
      t('…and still supplies the member and session ids',
        merged.includes('memberId=14779233'));
    }

    // --- arriving by clicking "Book tickets" --------------------------
    // A route change, not a load: no fresh page state, and the new URL need not
    // carry the language or format the endpoint is keyed on. The app's own
    // request does, and resource timing has already recorded it.
    {
      const asked = '/api/movies-data/v5/showtimes-by-event/primary-dynamic'
        + '?etCodes=*&dateCode=20260802&isDesktop=true&regionCode=HYD'
        + '&xLocationShared=false&memberId=&lsId=&subCode=&appCode=WEB'
        + '&language=english&refEventCode=ET00505581';
      global.location = { href: 'https://in.bookmyshow.com/movies/hyderabad/x/buytickets/ET00447840/20260802',
                          origin: 'https://in.bookmyshow.com' };
      global.performance = { getEntriesByType: () => [
        { name: 'https://in.bookmyshow.com/chunks/js/app.js' },
        { name: 'https://in.bookmyshow.com' + asked },
        { name: 'https://assets-in.bmscdn.com/poster.png' },
      ] };

      t('the page’s own listing request is found', observedRequest()?.pathname
        === '/api/movies-data/v5/showtimes-by-event/primary-dynamic');
      t('a refetch reuses it verbatim',
        eventShowtimesApi({ date: '20260802', observed: observedRequest() }) === asked);
      t('only the date changes when the day does',
        eventShowtimesApi({ date: '20260805', observed: observedRequest() })
          === asked.replace('dateCode=20260802', 'dateCode=20260805'));

      // The page URL after a route change may carry nothing useful, which is
      // exactly when reconstructing one from it produces the wrong question.
      t('it is preferred over anything rebuilt from the page URL',
        eventShowtimesApi({ date: '20260802', observed: observedRequest(), search: '' })
          .includes('refEventCode=ET00505581'));
      t('…and over the state, which a route change never refreshes',
        eventShowtimesApi({ date: '20260802', observed: observedRequest(),
          template: { etCodes: 'STALE', dateCode: '20260101' } }).includes('etCodes=*'));

      global.performance = { getEntriesByType: () => [
        { name: 'https://evil.example.com/api/movies-data/v5/showtimes-by-event/primary-dynamic?x=1' },
      ] };
      t('a request to another host is never reused', observedRequest() === null);

      global.performance = { getEntriesByType: () => [] };
      t('no recorded request falls through rather than throwing', observedRequest() === null);
      t('the fallbacks still work when nothing was recorded',
        eventShowtimesApi({ date: '20260805', region: 'HYD', search: '?etCodes=Y' })
          .includes('etCodes=Y&dateCode=20260805'));
    }

    // --- reusing the page's own request ------------------------------
    // While signed in the page sends a member and session id. It also records
    // exactly what it sent, so a refetch can reuse that instead of going near
    // the cookie those values live in.
    {
      const args = { etCodes: 'ET00485650', dateCode: '20260802', isDesktop: true,
                     regionCode: 'HYD', xLocationShared: false, memberId: '14779233',
                     lsId: 'd3ac6ddee92c410aa275a873bcc4898e', subCode: '', appCode: 'WEB',
                     language: 'telugu', refEventCode: 'ET00485650' };
      globalThis.__state = { showtimesFunctionalApi: { queries: {
        'fetchPrimaryDynamic-ET00485650-ET00485650-telugu-20260802-HYD': {
          status: 'fulfilled', originalArgs: args, data: {} } } } };

      t('the page’s own arguments are found', requestArgs()?.memberId === '14779233');
      const rebuilt = eventShowtimesApi({ date: '20260805', template: requestArgs() });
      t('a refetch for another date reuses them verbatim',
        rebuilt === '/api/movies-data/v5/showtimes-by-event/primary-dynamic'
          + '?etCodes=ET00485650&dateCode=20260805&isDesktop=true&regionCode=HYD'
          + '&xLocationShared=false&memberId=14779233&lsId=d3ac6ddee92c410aa275a873bcc4898e'
          + '&subCode=&appCode=WEB&language=telugu&refEventCode=ET00485650', rebuilt);
      t('only the date changes', rebuilt.includes('dateCode=20260805')
        && !rebuilt.includes('dateCode=20260802'));
      t('the member id comes from the request record, not the user cookie',
        !/\bud\b/.test(grabFrom(cs, 'requestArgs')));

      globalThis.__state = null;
      t('a page with no record still builds a usable request',
        eventShowtimesApi({ date: '20260805', region: 'HYD', search: '?etCodes=X' })
          .includes('etCodes=X&dateCode=20260805'));
    }

    // --- the listing the server already sent -------------------------
    // A film page carries the primary-dynamic response inline, so the first
    // scan needs no request at all. Shape and key names are from a live page.
    {
      const inline = (dateCode, sessionId) => ({
        showtimesFunctionalApi: { queries: {
          fetchStaticShowtimes: { status: 'fulfilled', data: { data: { styles: {} } } },
          [`fetchPrimaryDynamic-ET00509245-ET00509245-telugu-${dateCode}-HYD`]: {
            status: 'fulfilled',
            originalArgs: { etCodes: 'ET00509245', dateCode, regionCode: 'HYD',
                            memberId: '14779233', language: 'telugu' },
            data: { data: {
              header: { title: { text: "Newton's 3rd Law" } },
              additionalData: { dateCode },
              showtimeWidgets: [{ type: 'groupList', data: [{ type: 'venueGroup', data: [
                { additionalData: { venueCode: 'ASHN', venueName: 'Asian Cinemart: RC Puram' },
                  showtimesSections: [{ additionalData: { eventCode: 'ET00509245' }, showtimes: [
                    { title: '10:35 PM', screenAttr: '4K DOLBY 7.1',
                      additionalData: { sessionId, availStatus: '3', showDateCode: dateCode,
                                        showTimeCode: '2235', showTime: '10:35 PM' } }] }] },
              ] }] }],
            } },
          },
        } },
        // Present on every page, and never touched.
        cookies: { ud: { MEMBEREMAIL: 'someone@example.com', LSID: 'secret' } },
      });

      globalThis.__state = inline('20260802', '29606');
      const fromState = readSessionsFromState('20260802');
      t('the page ships its listing, so the first scan needs no request',
        fromState.length === 1 && fromState[0].sessionId === '29606');
      t('the venue and film survive the trip through the state',
        fromState[0].venueCode === 'ASHN' && fromState[0].eventCode === 'ET00509245');

      t('a cached entry for another date is not used for this one',
        readSessionsFromState('20260803').length === 0);
      t('…and asking for that date finds it',
        (globalThis.__state = inline('20260803', '30646'),
         readSessionsFromState('20260803')[0].sessionId === '30646'));

      globalThis.__state = { showtimesFunctionalApi: { queries: {
        'fetchPrimaryDynamic-x': { status: 'pending', originalArgs: { dateCode: '20260802' } } } } };
      t('an unfinished request is not read as an answer',
        readSessionsFromState('20260802').length === 0);

      globalThis.__state = null;
      t('a page with no state falls through rather than throwing',
        readSessionsFromState('20260802').length === 0);

      t('the state is reached by key path, never walked',
        /showtimesFunctionalApi\?\.queries/.test(cs) && !/harvest\(pageState/.test(cs));
      // Compare the call sites inside readSessions, not the definitions.
      {
        const order = grabFrom(cs, 'readSessions');
        t('the inline listing is tried before the endpoint',
          order.indexOf('readSessionsFromState') < order.indexOf('readSessionsFromApi'));
        t('the endpoint still covers a date the page was not rendered for',
          order.includes('readSessionsFromApi'));
      }
    }

    // --- which date is actually on screen -----------------------------
    // Date pills carry their own code as an id; only the selected one is filled.
    {
      const pill = (id, bg) => ({ id, __bg: bg });
      const pills = [pill('20260802', 'rgb(255, 255, 255)'),
                     pill('20260803', 'rgb(235, 78, 98)'),      // selected
                     pill('20260804', 'rgb(255, 255, 255)')];
      global.document = { querySelectorAll: () => [...pills, { id: 'main-content' }] };
      global.getComputedStyle = (el) => ({ backgroundColor: el.__bg || 'rgba(0, 0, 0, 0)' });

      t('the filled pill is the selected date', selectedDate() === '20260803');
      t('a non-date id is ignored', selectedDate() !== 'main-content');

      global.document = { querySelectorAll: () => [pill('20260802', 'rgb(255, 255, 255)')] };
      t('no highlighted pill means no answer, not a wrong one', selectedDate() === null);

      t('the screen beats the address bar when they disagree',
        /if \(shown && shown !== ctx\.date\) ctx = \{ \.\.\.ctx, date: shown \}/.test(cs));
    }

    // --- binding on a film listing ------------------------------------
    const at = (time, row) => ({ textContent: time,
      parentElement: { textContent: row, parentElement: null } });
    t('the cinema’s name picks between two cinemas at one time',
      bind(at('11:15 PM', 'ALLU Cinemas: Kokapet Narsingi'), ev).sessionId === '3397');
    t('…and the other cinema at the same minute',
      bind(at('11:15 PM', 'Aparna Cinemas: Nallagandla VIP SCREEN'), ev).sessionId === '30944');
    t('the screen breaks a tie inside one cinema',
      bind(at('11:15 PM', 'Aparna Cinemas: Nallagandla 4K DOLBY 7.1'), ev).sessionId === '30949');
    t('an unrecognisable row binds to nothing',
      bind(at('11:15 PM', 'some other cinema'), ev) === null);

    // One cinema, one film, one minute, one format, two screens. Nothing on the
    // page separates them, so order does — and the claimed set moves the second
    // chip onto the second showing.
    {
      const row = 'Aparna Cinemas: Nallagandla 4K LASER ATMOS';
      const used = new Set();
      const first = bind(at('11:10 PM', row), ev, used);
      used.add(first.sessionId);
      const second = bind(at('11:10 PM', row), ev, used);
      t('identical twins bind in order, not both to the first',
        first.sessionId === '30751' && second.sessionId === '30946');
      t('…and a third chip has nothing left to claim',
        bind(at('11:10 PM', row), ev, new Set(['30751', '30946'])) === null);
    }
  }

  // --- pulling the state out of an inline script -----------------------
  {
    const script = 'window.__INITIAL_STATE__ = {"a":1,"b":{"c":2}};\nwindow.other = 3;';
    const at = script.indexOf('{', script.search(/__INITIAL_STATE__\s*=/));
    t('slices the assigned object out of a script body',
      sliceBalanced(script, at) === '{"a":1,"b":{"c":2}}');
    t('a brace inside a movie title does not end the slice',
      sliceBalanced('x = {"t":"Wait { What (A)","n":1} rest', 4) === '{"t":"Wait { What (A)","n":1}');
    t('an escaped quote does not end the string',
      sliceBalanced('x = {"t":"5\\" reel","n":1};', 4) === '{"t":"5\\" reel","n":1}');
    t('an unbalanced body yields nothing', sliceBalanced('x = {"a":1', 4) === null);
  }

  // The shape BookMyShow actually ships, as seen on the venue page.
  {
    const real = { pages: { venueShowtimes: { showtimes: { data: {
      venueCode: 'ALUC', regionCode: 'HYD',
      events: [{
        eventCode: 'ET00492098', eventName: 'Spider-Man: Brand New Day (UA13+)',
        showTimes: [{ sessionId: '3524', showTime: '08:00 PM', availabilityStatus: 'SOLD_OUT' }],
      }],
    } } } } };
    const got = harvest(real);
    t('reads the venue page’s own state shape', got.length === 1);
    t('sold-out showtimes are watchable too — that’s the point',
      got[0].sessionId === '3524' && got[0].eventCode === 'ET00492098');
    t('assembles the address the seat map lives at',
      seatLayoutUrl({ region: 'HYD', venueCode: 'ALUC', date: '20260801',
                      eventCode: got[0].eventCode, sessionId: got[0].sessionId }) ===
      'https://in.bookmyshow.com/movies/HYD/seat-layout/ET00492098/ALUC/3524/20260801');
  }

  // --- what the walk refuses to touch ----------------------------------
  // Taken from the real page state: a signed-in listing carries the member's
  // identity and session token alongside the showtimes.
  {
    let touched = false;
    const trip = { get NAME() { touched = true; return 'Yaswanth'; } };
    const state = {
      cookies: { ud: trip, userDetails: trip, mrs: ['ALUC'] },
      seo: { queries: { '/cinemas/HYD/…': { data: { header: { title: 'ALLU Cinemas: Kokapet | …' },
        footer: { links: [{ heading: 'Movies Now Showing',
          items: [{ label: 'The Odyssey', link: '/movies/the-odyssey/ET00452034' }] }] } } } } },
      appConfig: { userAgent: 'Mozilla/5.0', trueClientIp: '103.172.202.106' },
      pages: { venueShowtimes: { showtimes: { data: { venueCode: 'ALUC', regionCode: 'HYD',
        events: [{ eventCode: 'ET00492098', eventName: 'Spider-Man: Brand New Day (UA13+)',
          showTimes: [{ sessionId: '3524', showTime: '08:00 PM' }] }] } } } },
    };
    const got = harvest(state);
    t('never reads the signed-in member’s details', touched === false);
    t('finds the showtimes past all of that', got.length === 1 && got[0].sessionId === '3524');
    t('SEO footer links are not mistaken for showtimes',
      got.every(s => s.eventCode === 'ET00492098'));
    t('a page title is not mistaken for a movie name',
      got[0].eventName === 'Spider-Man: Brand New Day (UA13+)');
  }
  t('the service worker skips the same branches',
    /const SKIP = \/\^\(cookies\|seo\|appConfig/.test(bg));
  t('the diagnostic reports key names, not values',
    /keys\.slice\(0, 12\)\.join/.test(cs) && !/JSON\.stringify\(near/.test(cs));

  // --- binding a chip to a session -------------------------------------
  const chip = (text, rowText) => {
    const row = { textContent: rowText, parentElement: null };
    return { textContent: text, parentElement: row };
  };
  t('unique start time binds on time alone',
    bind(chip('10:50 PM', ''), found)?.sessionId === '3522');
  t('a shared start time is broken by the movie name',
    bind(chip('07:40 PM', 'The Odyssey English, 2D'), found)?.sessionId === '4010');
  t('the other movie at the same time binds correctly',
    bind(chip('07:40 PM', 'Spider-Man: Brand New Day English, 3D'), found)?.sessionId === '3521');
  t('an ambiguous chip binds to nothing rather than guessing',
    bind(chip('07:40 PM', 'unrelated text'), found) === null);
  t('an unknown time binds to nothing', bind(chip('03:15 AM', ''), found) === null);
}

// ---------------------------------------------------------------- severed
// Reloading or updating an extension does not reload the pages it is already
// running on. The script keeps going, the buttons stay on the listing, and
// chrome.runtime disappears out from under them. Everything below is about
// that moment: the page should say what happened, not throw.
{
  const { connected } = csFns;
  const set = (v) => { if (v === undefined) delete globalThis.chrome; else globalThis.chrome = v; };
  const before = globalThis.chrome;

  set({ runtime: { id: 'abcdefghijklmnop' } });
  t('a live extension reads as connected', connected() === true);

  set({ runtime: {} });
  t('a runtime without an id reads as severed', connected() === false);

  set({});
  t('a chrome without a runtime reads as severed', connected() === false);

  set(undefined);
  t('no chrome at all reads as severed rather than throwing', connected() === false);

  set(before);

  // The click is the one that bites: it is async, so an unguarded throw becomes
  // an uncaught rejection with nothing on screen to explain it.
  const from = cs.indexOf("btn.addEventListener('click'");
  const click = cs.slice(from, cs.indexOf('getComputedStyle(chip)', from));
  t('the click handler sends inside a try', /try \{[\s\S]*sendMessage/.test(click));
  t('the click handler catches what the send throws', /\} catch \{/.test(click));
  t('a severed click says the page needs reloading',
    click.includes('connected() ?') && click.includes('RELOAD_NEEDED'));
  t('the reload message names the action the user wanted',
    /RELOAD_NEEDED = '[^']*reload the page[^']*'/.test(cs));

  // And the same hazard everywhere else the script crosses the boundary, so a
  // call site added later cannot quietly reintroduce it.
  const lines = cs.split('\n');
  const unguarded = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (!/\bchrome\.(runtime|storage|scripting|alarms|notifications)\b/.test(code)) return;
    const window = lines.slice(Math.max(0, i - 12), i).join('\n');
    if (!/connected\(\)|try \{/.test(window)) unguarded.push(i + 1);
  });
  t('every call into the extension is guarded or caught',
    unguarded.length === 0, `unguarded at line ${unguarded.join(', ')}`);
  t('the guard is actually load-bearing somewhere',
    (cs.match(/connected\(\)/g) || []).length >= 4);

  // Finding out on click is better than an uncaught throw, but the buttons
  // still look usable until you try one.
  // A chip that gets no button: four different problems, one symptom. The
  // counts are what turn "130 of 132" into something actionable.
  const why = new Function(`
    ${grabFrom(cs, 'timeKey')}
    ${grabFrom(cs, 'whyUnbound')}
    return whyUnbound;
  `)();
  const el = (text) => ({ textContent: text });
  const sess = [{ timeKey: '1900', sessionId: 'a' }, { timeKey: '1900', sessionId: 'b' },
                { timeKey: '2130', sessionId: 'c' }];

  t('an element with no clock time is counted as not a chip',
    why(el('Book tickets'), sess, new Set()) === 'noTime');
  t('a time the listing never returned is counted separately',
    why(el('08:15 PM'), sess, new Set()) === 'noSession');
  t('a time whose showings are all spoken for is counted separately',
    why(el('07:00 PM'), sess, new Set(['a', 'b'])) === 'taken');
  t('a time with two indistinguishable showings is counted as ambiguous',
    why(el('07:00 PM'), sess, new Set()) === 'ambiguous');
  t('one showing left over is ambiguous, not taken',
    why(el('07:00 PM'), sess, new Set(['a'])) === 'ambiguous');
  t('the tally carries counts only, never page text',
    /missed: \{ noTime: 0, noSession: 0, taken: 0, ambiguous: 0 \}/.test(cs));

  const scanFn = grabFrom(cs, 'scan');
  t('every unbound chip is accounted for',
    /if \(!session\) \{ trace\.missed\[whyUnbound\(chip, sessions, used\)\]\+\+; continue; \}/
      .test(scanFn));
  t('scan bails out before doing anything when severed',
    /^\s*(\/\/[^\n]*\n\s*)*if \(!connected\(\)\) return markOrphaned\(\);/m
      .test(scanFn.slice(scanFn.indexOf('{'))));

  const mark = grabFrom(cs, 'markOrphaned');
  t('the severed buttons are marked, not left looking live',
    mark.includes('is-stale') && mark.includes('RELOAD_NEEDED'));
  t('marking happens once rather than on every mutation',
    /if \(orphaned\) return;/.test(mark));
  t('the stale look is defined in the stylesheet',
    /\.bms-seat-watch-btn\.is-stale\s*\{/.test(contentCss));
  t('a stale button still takes a click, so the click can explain itself',
    !/\.is-stale[^{]*\{[^}]*pointer-events:\s*none/.test(contentCss));
}

// ---------------------------------------------------------------- sweeping
// A show that has played can never report anything again, so keeping it is
// keeping a record. These check that the record has an end.
{
  const keepHours = Number(bg.match(/const RETIRED_KEEP_HOURS = (\d+);/)[1]);
  t('the retention window is a stated number of hours', keepHours > 0);

  const saved = [];
  const sweepRetired = new Function('setCfg', `
    const RETIRED_KEEP_HOURS = ${keepHours};
    ${grabFrom(bg, 'sweepRetired')}
    return sweepRetired;
  `)(async (patch) => { saved.push(patch); });

  const ago = (h) => Date.now() - h * 3600 * 1000;
  const cfg = () => ({
    shows: [
      { url: 'a', label: 'played last night' },
      { url: 'b', label: 'played an hour ago' },
      { url: 'c', label: 'tonight' },
      { url: 'd', label: 'retired, no timestamp' },
    ],
    state: {
      a: { retired: true, last: { at: ago(keepHours + 1) } },
      b: { retired: true, last: { at: ago(1) } },
      c: { nextCheck: Date.now() + 60000, last: { at: ago(48) } },
      d: { retired: true },
    },
  });

  const c1 = cfg();
  const dropped = await sweepRetired(c1);
  const urls = c1.shows.map((s) => s.url).join(',');

  t('a show retired past the window is dropped', !urls.includes('a'));
  t('a show retired inside the window is kept', urls.includes('b'));
  t('a show that has not played is kept however old its last reading',
    urls.includes('c'));
  t('a retirement with no timestamp is treated as old, not as new',
    !urls.includes('d'));
  t('the count returned is the number dropped', dropped === 2);
  t('the dropped shows take their state with them',
    !('a' in c1.state) && !('d' in c1.state));
  t('the kept shows keep their state', 'b' in c1.state && 'c' in c1.state);

  // The caller keeps using cfg.shows after the sweep, so an unmutated cfg would
  // check a show that has just been deleted from storage.
  t('the sweep mutates the config it was handed, not just storage',
    c1.shows.length === 2);
  t('the sweep writes shows and state together',
    saved.length === 1 && 'shows' in saved[0] && 'state' in saved[0]);
  t('what was written matches what was kept',
    saved[0].shows.length === 2 && Object.keys(saved[0].state).length === 2);

  // Writing on every tick would be a storage write every thirty seconds for
  // the whole life of a watch.
  const c2 = { shows: [{ url: 'c' }], state: { c: {} } };
  t('nothing to drop means no write',
    (await sweepRetired(c2)) === 0 && saved.length === 1);

  const due = grabFrom(bg, 'runDue');
  t('runDue sweeps before it iterates',
    due.indexOf('sweepRetired') > 0 &&
    due.indexOf('sweepRetired') < due.indexOf('for (const show'));
  t('a paused extension is not swept behind the user\'s back',
    due.indexOf('if (!cfg.running') < due.indexOf('sweepRetired'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
