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

// ------------------------------------------------------- the store listing
//
// The listing drifted from the manifest once already: it justified permissions
// for an extension that had since grown a second half. It is prose, so nothing
// makes it true except checking it.
console.log('\nstore listing');
{
  const listing = readFileSync(here('store/listing.md'), 'utf8');

  for (const perm of mf.permissions)
    t(`listing justifies permission: ${perm}`, listing.includes(`\`${perm}\``));
  // The form has ONE box for host permissions, not one per host, and the
  // 1000-character cap applies to all of them together. Written as separate
  // fields they totalled 1307 and would have been rejected at submission.
  {
    const sec = listing.slice(listing.indexOf('## Permission justifications'),
                              listing.indexOf('## Privacy practices'));
    const hostBlocks = sec.split('\n**').slice(1)
      .filter((p) => /^Host permission/i.test(p));
    t('host permissions are justified in one field, not one per host',
      hostBlocks.length === 1, `${hostBlocks.length} blocks`);

    const body = (/```\n([\s\S]*?)```/.exec(hostBlocks[0] || '') || [, ''])[1];
    for (const host of mf.host_permissions) {
      const bare = host.replace(/^https:\/\//, '').replace(/\/\*$/, '');
      t(`the host field covers ${bare}`, body.includes(bare));
    }
    for (const opt of mf.optional_host_permissions || [])
      t(`the host field covers optional ${opt}`, body.includes(opt));
    t(`the combined host field fits 1000 chars (${body.replace(/\n$/, '').length})`,
      body.replace(/\n$/, '').length <= 1000);
  }

  // A justification for something no longer requested is worse than a missing
  // one — it invites a question about a permission that isn't there.
  const claimed = [...listing.matchAll(/\*\*`([a-z]+)`\*\*/g)].map((m) => m[1]);
  t('listing justifies nothing the manifest does not ask for',
    claimed.every((c) => mf.permissions.includes(c)), claimed.join());

  // The packaging step names a filename; a stale one silently ships the wrong build.
  t('the build command names the current version',
    listing.includes(`seat-watch-${mf.version}.zip`));

  // Host-wide content scripts are the thing a reviewer will ask about.
  const hostWide = (mf.content_scripts || [])
    .some((c) => c.matches.includes('https://in.bookmyshow.com/*'));
  t('listing explains host-wide content scripts if that is what ships',
    !hostWide || /single-page app/.test(listing));

  // Two claims in the privacy table that the code decides, not the copy.
  t('listing does not claim the city is unstored',
    !/city[^|]*never stored/i.test(listing));
  t('listing states the single purpose in the singular',
    /Watches BookMyShow listings the user has chosen/.test(listing));

  // The store's own field limits. Prose grows when it is edited, and an
  // over-long justification is rejected at submission — after the wait, not
  // during it.
  {
    const fenced = (heading) => {
      const at = listing.indexOf(heading);
      const m = /```\n([\s\S]*?)```/.exec(listing.slice(at));
      return m ? m[1].replace(/\n$/, '') : '';
    };
    t(`summary within 132 chars (${fenced('## Summary').length})`,
      fenced('## Summary').length <= 132);
    t(`single purpose within 1000 chars (${fenced('## Single purpose').length})`,
      fenced('## Single purpose').length <= 1000);

    const sec = listing.slice(listing.indexOf('## Permission justifications'),
                              listing.indexOf('## Privacy practices'));
    for (const part of sec.split('\n**').slice(1)) {
      const label = part.split('**')[0];
      const m = /```\n([\s\S]*?)```/.exec(part);
      if (!m) continue;
      const n = m[1].replace(/\n$/, '').length;
      t(`justification within 1000 chars: ${label} (${n})`, n <= 1000);
    }
  }
}

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
// The welcome page fires on fresh install only, so a page describing half the
// extension is a page every future user learns half from.
t('welcome introduces the release half too',
  /upcoming movies/i.test(welcomeHtml) && /Release watch/.test(welcomeHtml));
t('welcome says the release half needs no window',
  /needs no window and no display/i.test(welcomeHtml));
t('the watcher-window warning says it is about seat maps',
  /Watching a seat map only/i.test(welcomeHtml));

t('privacy states there is no server', /no backend|no server/i.test(privacyHtml));
// The policy is checkable against the code, so check it. Release fetches try
// anonymously and fall back to the session; a policy claiming cookies are simply
// switched off would be an overclaim, and an overclaiming privacy policy is worse
// than a vague one.
{
  const rel = readFileSync(here('release.js'), 'utf8');
  const hasFallback = /\['omit', 'include'\]/.test(rel);
  t('the policy describes the anonymous-first fetch as it actually behaves',
    !hasFallback || (/tried first with cookies\s*\n?\s*switched off/.test(privacyHtml) &&
                     /retried with your\s*\n?\s*session/.test(privacyHtml)));
}
t('privacy lists what a release watch stores',
  /films you chose to watch for a release/i.test(privacyHtml) &&
  /list of cinemas/i.test(privacyHtml));
t('privacy says a Telegram group means everyone sees it',
  /everyone in that group sees the alert/i.test(privacyHtml));
// The hosted copy is generated, and a stale one is the copy the store reviewer reads.
{
  const hosted = readFileSync(here('docs/privacy.html'), 'utf8');
  for (const claim of ['films you chose to watch for a release',
                       'everyone in that group sees the alert',
                       'tried first with cookies'])
    t(`hosted policy carries: "${claim.slice(0, 34)}…"`, hosted.includes(claim));
}
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
  t('a fraction saved by an older version still filters',
    keep({ minAdjacent: 2, minFromScreen: 0.5 }) === 'ABC');

  // Counting rows is what people actually asked for: nobody thinks in fifths of
  // a hall, and a fifth of a 9-row hall is not a fifth of a 20-row one.
  t('every block knows how many rows back from the screen it is',
    at('E').screenRow === 0 && at('D').screenRow === 1 && at('A').screenRow === 4);
  t('skipping the first row drops only the row at the screen',
    keep({ minAdjacent: 2, skipRows: 1 }) === 'ABCD');
  t('skipping the first three drops three',
    keep({ minAdjacent: 2, skipRows: 3 }) === 'AB');
  t('asking for more rows than the hall has keeps nothing',
    keep({ minAdjacent: 2, skipRows: 9 }) === '');
  t('no count and no fraction keeps every row',
    keep({ minAdjacent: 2, skipRows: null }) === 'ABCDE');
  t('a reading from before the count existed is never excluded by it',
    wanted([{ size: 4, price: 300, fromScreen: 1 }], { minAdjacent: 2, skipRows: 3 }).length === 1);
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
  /notify\(show\.url,/.test(bg));
t('the alert waits for you rather than fading', /requireInteraction: true/.test(bg));
t('clicking opens the seat map', /function openSeats\(url\)[\s\S]{0,140}tabs\.create/.test(bg));

// Both notification calls used to read chrome.runtime.lastError only to throw
// it away — which is what stops Chrome logging it, and also what made "Telegram
// arrived, the desktop stayed silent" impossible to diagnose from outside.
{
  const src = grabFrom(bg, 'notify');
  t('a refused notification is recorded, not swallowed',
    /notifyError/.test(src) && /lastError/.test(src));
  t('and a successful one clears the last failure', /notifyError: null/.test(src));
  // One call site, so there is nowhere left for an error to be swallowed —
  // asserted on the calls rather than on the prose, which mentions the old form.
  t('every desktop alert goes through the one place that checks for a failure',
    (bg.match(/chrome\.notifications\.create\(/g) || []).length === 1);
  t('both alerts go through it',
    /notify\(show\.url,/.test(bg) && /notify\(RELEASE_NOTIF \+ notifKey/.test(bg));
  t('a throw from notifications.create is recorded too, not lost',
    /catch \(e\) \{[\s\S]{0,220}notifyError/.test(src));
  t('the settings page can fire one on demand', /msg\.type === 'testNotify'/.test(bg));
  {
    const oh = readFileSync(here('options.html'), 'utf8');
    const oj = readFileSync(here('options.js'), 'utf8');
    t('and has a button to do it', /id="notifyTest"/.test(oh) && /\$\('notifyTest'\)\.onclick/.test(oj));
    // Chrome accepting a notification is not the same as the person seeing it.
    t('which claims only what it actually knows',
      /holding it back, not Chrome/.test(oj));
    t('and names Chrome\'s own switch when that is what is off',
      /getPermissionLevel/.test(bg) && /chrome:\/\/settings\/content\/notifications/.test(oj));
    t('and says where the OS keeps that permission',
      /System Settings → Notifications/.test(oh));
  }
}

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
    // This used to assert the opposite — that unrelated pages were not matched —
    // and that narrowness was the bug. Injection happens once, against the URL
    // the document loaded with; every click after that is a pushState with no
    // load. A script not matched on arrival never gets a second chance, so
    // landing on the home page and clicking through to a listing produced no
    // buttons at all until you reloaded.
    //
    // The guarantee is therefore no longer "does not run" but "does not act":
    // matched everywhere on the host, inert on anything it does not recognise.
    // It grants nothing new — host_permissions already covers the whole host,
    // so the install-time warning is unchanged.
    t('runs on the pages a listing is reached from',
      injected('https://in.bookmyshow.com/explore/home/hyderabad') &&
      injected('https://in.bookmyshow.com/explore/upcoming-movies-hyderabad'));
    t('and does nothing on a page it does not recognise',
      /const ctx = pageContext\(location\.href\);/.test(cs.replace(/let ctx/, 'const ctx')) &&
      /if \(!ctx\) return;/.test(cs));
    const bell = readFileSync(here('content-release.js'), 'utf8');

    // Both scripts are injected into the same page, and content scripts from
    // one extension share a single isolated world — so a top-level `const
    // watched` in one and a top-level `let watched` in the other are the same
    // declaration twice, and the page dies before either runs. They also both
    // want `toast`, `pending`, `queue` and `loadWatched`. content.js declares
    // at the top level, so the newer script is the one that has to enclose
    // itself.
    {
      const bare = bell
        .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
        .replace(/^\s*\/\/[^\n]*$/gm, '')        // line comments
        .split('\n').map((l) => l.trim()).filter(Boolean);
      t('the bell script declares nothing globally',
        bare[0] === '(() => {' && bare[bare.length - 1] === '})();');
    }
    // Reloading the extension leaves open tabs running a script with nothing
  // behind it. Touching chrome.runtime then throws rather than rejecting, and
  // inside an async function that becomes a rejection nobody awaits.
  t('the bell notices when the extension has gone',
    /const connected = \(\) => \{/.test(bell) && /function markStale/.test(bell));
  t('it stands down before touching a dead runtime',
    /if \(!connected\(\)\) return markStale\(\);/.test(bell));
  t('the city hint is guarded against a throw, not only a rejection',
    /try \{ chrome\.runtime\.sendMessage\(\{ type: 'cityHint'/.test(bell));
  t('run() started from a timer cannot reject unhandled',
    !/\brun\(\);/.test(bell) && /run\(\)\.catch\(markStale\)/.test(bell));
  t('a dead extension stops the timers', /if \(orphaned\) return;/.test(bell) &&
    /if \(orphaned \|\| retries >= 4\)/.test(bell));
  t('the severed bell says so instead of looking live',
    /is-stale/.test(bell) &&
    /\.bms-seat-watch-bell-btn\.is-stale/.test(readFileSync(here('content.css'), 'utf8')));

  t('the bell is inert on pages it does not recognise',
      /const kind = pageKind\(\);\s*\n\s*if \(!kind\) return;/.test(bell));
    t('both scripts are injected the same way',
      (mf.content_scripts || []).every((c) =>
        c.matches.length === 1 && c.matches[0] === 'https://in.bookmyshow.com/*'));
    t('the bell re-scans when the route changes without a load',
      /addEventListener\('popstate', queue\)/.test(bell) && /function queue\(\)/.test(bell));
    t('a route change drops what was remembered about the old page',
      /function routeChanged/.test(bell) && /groupIndex\.cached = undefined/.test(bell));
    // The film page's bell floats from <body>, outside the markup BookMyShow
    // swaps — so nothing removes it, and it followed you everywhere after.
    t('the floating bell does not survive the page it belongs to',
      /querySelectorAll\(`\.\$\{BELL\}-btn\.is-floating`\)/.test(bell) &&
      /\.remove\(\)/.test(bell));
    // And the quieter half: it is bound to one film, and decorateFilm repaints
    // rather than rebuilds, so left in place it would keep film A's identity on
    // film B's page.
    t('and is rebuilt for the film actually on screen',
      (() => { const rc = bell.slice(bell.indexOf('function routeChanged'));
               return rc.indexOf('is-floating') < rc.indexOf('return true;'); })());
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

// ------------------------------------------------------- telegram to a group
//
// A chat id is a group as readily as a person, which is how one machine tells a
// whole group of friends at once.
console.log('\ntelegram destinations');
{
  const oj = readFileSync(here('options.js'), 'utf8');
  const oh = readFileSync(here('options.html'), 'utf8');

  t('destinations are a list, however they were typed',
    /const chatList = \(tg\) => String\(tg\?\.chatId \?\? ''\)\s*\n?\s*\.split\(\/\[\\s,;\]\+\//.test(bg));
  t('the stored shape did not change, so old configs still work',
    /chatId/.test(bg) && !/chatIds:/.test(bg));
  t('every destination is sent to independently',
    /for \(const chatId of chats\)/.test(bg));
  t('one dead destination cannot silence the others',
    /failed\.push\(/.test(bg) && /if \(!sent\) throw/.test(bg));
  t('partial delivery is surfaced, not treated as success',
    /if \(out\.failed\.length\) st\.telegramError/.test(bg));

  // On a phone, in a group, one tap beats hunting for a link in a paragraph.
  t('alerts carry a tappable button', /inline_keyboard/.test(bg));
  t('the seat alert points at the seat map',
    /button: \{ text: 'Open seats', url: show\.url \}/.test(bg));
  t('the release alert points at the booking page',
    /\{ text: 'Book now', url: link \}/.test(bg));
  // An any-theatre alert cannot say which language opened — the film page never
  // distinguished them — so instead of quietly linking to the one the watch was
  // created from, it offers each listing its own button.
  t('and offers every listing when it cannot name one',
    /const buttons = opened\.language \? \[\{ text: 'Book now', url: link \}\] : listingButtons\(watch\)/
      .test(bg) && /function listingButtons/.test(bg));
  t('each button goes to that listing’s own address',
    /url: releaseLink\(watch, \{ eventCode: code, slug: v\.slug \}\)/.test(bg));
  t('and telegram stacks them one per row',
    /inline_keyboard: row\.map\(\(b\) => \[\{ text: b\.text \|\| 'Book now', url: b\.url \}\]\)/.test(bg));
  // An alert about Thursday's premiere that opens Friday's listing is the wrong
  // page, so the link follows the day that actually opened.
  t('and at the day that actually opened',
    /function openedDay\(opened\)/.test(bg) &&
    /opened\?\.venues\?\.map\(\(v\) => v\.date\)/.test(bg));
  // The film is one thing; the language that went on sale is another, and the
  // Malayalam listing is the wrong page for a Telugu alert.
  t('and at the language that actually opened',
    /const code = opened\?\.eventCode \|\| watch\.eventCode/.test(bg));
  t('clicking the notification recovers that day too',
    /k\.split\('\|'\)\[2\]/.test(bg));
  t('the alert says when a premiere is what opened',
    /Premiere booking open/.test(bg) && /function describeOpened/.test(bg));
  t('no button means no keyboard', /if \(row\.length\)/.test(bg) &&
    /\.filter\(\(b\) => b\?\.url\)/.test(bg));

  t('picking a chat adds rather than replaces',
    /ids\.includes\(c\.id\) \? ids\.filter/.test(oj));
  t('a picked destination looks picked', /\.chats button\.is-on/.test(oh));
  t('the test message says how many places it reached', /Test message sent to \$\{res\.sent\}/.test(oj));
  t('and names a destination that failed', /failed for \$\{res\.failed\.length\}/.test(oj));

  // The step everyone misses: a bot cannot see ordinary group chatter.
  t('the group instructions mention addressing the bot',
    /\/start@yourbotname/.test(oh));
  t('and that group ids are negative', /-1001234567890/.test(oh));
  t('the field no longer claims to hold one id',
    /Who gets told/.test(oh) && !/<label for="chat">Chat ID<\/label>/.test(oh));
}

// ------------------------------------------------------- release watching
//
// release.js is a real module rather than functions scraped out of a service
// worker, so these run the shipped code directly. The fixtures are the shapes
// the probes actually returned from BookMyShow, not invented ones — a parser
// that passes against imagined JSON has been tested against nothing.
console.log('\nrelease watching');
{
  const R = await import('./release.js');

  const byVenueFixture = {
    ShowDetails: [{
      Date: '20260826',
      Venues: { VenueCode: 'ALUC' },
      Event: [{
        EventTitle: 'Toxic: A Fairy Tale for Grown-ups',
        EventGroup: 'EG00377461',
        ChildEvents: [
          { EventCode: 'ET00379307', EventGroup: 'EG00377461', EventLanguage: 'Telugu',
            EventDimension: '2D', EventUrl: 'toxic', ShowTimes: [
              { SessionId: '1', ShowTime: '10:00 AM', ScreenName: 'S1' },
              { SessionId: '2', ShowTime: '02:00 PM', ScreenName: 'S1' }] },
          { EventCode: 'ET00514059', EventGroup: 'EG00377461', EventLanguage: 'Telugu',
            EventDimension: '2D', EventUrl: 'toxic', ShowTimes: [
              { SessionId: '3', ShowTime: '07:00 PM', ScreenName: 'S2' }] },
        ],
      }],
    }],
  };

  const parsed = R.parseByVenue(byVenueFixture, 'ALUC');
  t('byvenue yields one record per child event', parsed.length === 2);
  t('byvenue carries the group code', parsed.every(c => c.group === 'EG00377461'));
  t('byvenue carries the venue', parsed.every(c => c.venueCode === 'ALUC'));
  t('byvenue keeps the sessions', parsed[0].shows.length === 2 && parsed[0].shows[0].sessionId === '1');
  t('a child event with no code is dropped',
    R.parseByVenue({ ShowDetails: [{ Event: [{ ChildEvents: [{ ShowTimes: [] }] }] }] }).length === 0);

  // The whole reason the group exists. A watch created from a listing that
  // showed ET00379307 must still fire on ET00514059 — same film, and the code
  // that goes on sale is not knowable in advance.
  const watch = { group: 'EG00377461', eventCode: 'ET00379307' };
  t('a sibling event code still matches on the group',
    R.matchesFilm(parsed[1], watch) === true);
  t('a different group does not match, whatever the code',
    R.matchesFilm({ group: 'EG00000001', eventCode: 'ET00379307' }, watch) === false);
  t('with no group known, the event code is the fallback',
    R.matchesFilm({ group: null, eventCode: 'ET00379307' }, { eventCode: 'ET00379307' }) === true);
  t('a groupless watch does not match an unrelated code',
    R.matchesFilm({ group: null, eventCode: 'ET00999999' }, { eventCode: 'ET00379307' }) === false);

  // A date with no zone read through Date() lands on the previous evening for
  // anyone west of UTC, which would wake a watch a day late.
  t('an ISO release date keeps its day', R.dateCodeFromIso('2026-08-21T00:00:00') === '20260821');
  t('a bare ISO date works too', R.dateCodeFromIso('2026-08-21') === '20260821');
  t('a missing date is null, not a guess', R.dateCodeFromIso(null) === null);
  t('a date code round-trips through local midnight',
    R.toDateCode(new Date(R.dateCodeToTs('20260821'))) === '20260821');

  const release = { releaseDate: '20260828' };
  const releaseTs = R.dateCodeToTs('20260828');
  t('a watch sleeps until seven days before release',
    R.wakesAt(release, 7) === releaseTs - 7 * 86400000);
  t('it is dormant eight days out',
    R.isDormant(release, releaseTs - 8 * 86400000, 7) === true);
  t('it is awake six days out',
    R.isDormant(release, releaseTs - 6 * 86400000, 7) === false);
  // Not knowing when a film opens is a reason to watch sooner, never later.
  t('a watch with no release date is never dormant',
    R.isDormant({ releaseDate: null }, Date.now(), 7) === false);
  t('the dormancy window is configurable',
    R.wakesAt(release, 1) === releaseTs - 86400000);

  t('a watch expires a day after release',
    R.isExpired(release, releaseTs + 2 * 86400000) === true);
  t('a watch is live on release day', R.isExpired(release, releaseTs) === false);
  t('a watch with no date never expires', R.isExpired({ releaseDate: null }, Date.now()) === false);

  // Premieres run the night before release — benefit shows, 1am shows, paid
  // previews. They are often the FIRST thing on sale and the thing fans most
  // want, so release day alone missed the booking that mattered most.
  t('the premiere night is asked about too',
    JSON.stringify(R.datesFor(release)) === JSON.stringify(['20260827', '20260828']));
  t('oldest first, so an alert reads in the order the days happen',
    R.datesFor(release, 2)[0] === '20260826');
  t('premieres can be turned off',
    JSON.stringify(R.datesFor(release, 0)) === JSON.stringify(['20260828']));
  t('the window is capped, so it cannot become a scrape',
    R.datesFor(release, 99).length === 8);
  t('with no release date it asks about today',
    R.datesFor({ releaseDate: null })[0] === R.toDateCode(new Date()));

  t('a date before release is a premiere', R.isPremiere('20260827', release) === true);
  t('release day itself is not', R.isPremiere('20260828', release) === false);
  t('an unknown date is not guessed at', R.isPremiere('20260827', {}) === false);
  t('a premiere is labelled as one', /^Premiere · /.test(R.dateLabel('20260827', release)));
  t('release day is labelled by its date alone',
    !/Premiere/.test(R.dateLabel('20260828', release)) && /Aug/.test(R.dateLabel('20260828', release)));

  // A one-day dormancy with a premiere the night before would otherwise wake on
  // release day, after the premiere had been and gone.
  t('a watch wakes before its earliest premiere, not before release day',
    R.wakesAtWithPremieres(release, 0, 1) === releaseTs - 86400000);
  t('a longer dormancy still wins when it is earlier',
    R.wakesAtWithPremieres(release, 7, 1) === releaseTs - 7 * 86400000);

  // Three values, not two: a reworded page must not read as "not open".
  t('"Book tickets" means open', R.bookingSignal('<a>Book tickets</a>') === 'open');
  t('"Releasing on" means not yet', R.bookingSignal('<p>Releasing on 28 Aug</p>') === 'closed');
  t('neither phrase is unknown, not closed', R.bookingSignal('<p>something else</p>') === 'unknown');
  t('open wins when both appear', R.bookingSignal('Releasing on 28 Aug. Book tickets') === 'open');

  // A "you might also like" rail can mention another film's group once. Taking
  // the first EG code on the page would bind the watch to the wrong film, and
  // it would look exactly like a film that never went on sale.
  const film = R.parseFilmPage(
    '<title>Irumudi - Telugu | BookMyShow</title>' +
    'EG00485290 EG00485290 EG00485290 EG00999999 ' +
    '"releaseDate":"2026-08-21T00:00:00" <span>Book tickets</span>');
  t('the film page group is the commonest, not the first', film.group === 'EG00485290');
  t('the film page release date is read', film.releaseDate === '20260821');
  t('the film page title drops the site suffix', film.title === 'Irumudi');
  t('the film page reports its booking state', film.booking === 'open');

  const nextTag = (obj) =>
    `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(obj)}</script></html>`;

  const venues = R.parseCinemas(nextTag({ p: { v: [
    { VenueCode: 'ALUC', VenueName: 'ALLU Cinemas: Kokapet', SubRegionCode: 'HYD',
      arrDates: [{ ShowDateCode: '20260826' }, { ShowDateCode: '20260827' }] },
    { VenueCode: 'AMBH', VenueName: 'AMB Cinemas: Gachibowli', arrDates: [] },
    { VenueCode: 'nope', VenueName: 'not a code' },
  ] } }));
  t('the cinemas page yields venues', venues.length === 2);
  t('venues come back sorted by name', venues[0].code === 'ALUC' && venues[1].code === 'AMBH');
  t('arrDates is flattened to date codes',
    JSON.stringify(venues[0].dates) === JSON.stringify(['20260826', '20260827']));
  t('a malformed venue code is skipped', !venues.some(v => v.code === 'nope'));

  // The regions response has been seen using each spelling of the key.
  const regions = R.parseRegions({ a: [{ RegionCode: 'HYD', RegionName: 'Hyderabad' }],
                                   b: [{ regionCode: 'MUMBAI', regionName: 'Mumbai' }] });
  t('regions parse in either key casing', regions.length === 2);
  t('a region slug is derived when absent',
    regions.find(r => r.code === 'HYD').slug === 'hyderabad');

  const upcoming = R.parseUpcoming(nextTag({ listings: [{ cards: [
    { analytics: { event_code: 'ET00505635', event_group: 'EG00502597', title: 'Tom & Cherry',
                   language: 'gujarati' } },
    { analytics: { event_code: 'ET00505635', event_group: 'EG00502597', title: 'dupe' } },
    { analytics: { event_code: 'nonsense' } },
  ] }] }));
  t('the upcoming list yields one row per film', upcoming.length === 1);
  t('the upcoming list carries the group', upcoming[0].group === 'EG00502597');
  t('a non-code is not treated as a film', !upcoming.some(u => u.eventCode === 'nonsense'));
  t('a page with no state yields nothing', R.parseUpcoming('<html></html>').length === 0);
  t('nextData survives a page without the tag', R.nextData('<html></html>') === null);

  // Jitter has to stay inside the band, or a "10 minute" setting could mean
  // anything and the cadence stops being a setting at all.
  {
    const now = 1_000_000;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) {
      const d = R.nextCheckAt(now, 10) - now;
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    t('the interval jitters within ±15%', lo >= 10 * 60000 * 0.85 && hi <= 10 * 60000 * 1.15);
    t('a nonsense interval falls back to the default',
      R.nextCheckAt(now, 0) - now >= R.RELEASE_DEFAULTS.intervalMinutes * 60000 * 0.85);
  }

  t('the seen key names film, venue and date',
    R.seenKey('ALUC', 'ET1', '20260828') === 'ALUC|ET1|20260828');
  // Titles come out of raw markup, where entities live and a worker has no DOM.
  t('an entity in a title is decoded', R.cleanTitle('I&#x27;m Game') === "I'm Game");
  t('a named entity is decoded too', R.cleanTitle('Tom &amp; Cherry') === 'Tom & Cherry');
  t('the disambiguating year is dropped', R.cleanTitle('Once More (2026)') === 'Once More');
  t('a year inside the name is kept',
    R.cleanTitle('K.G.F (2018) Chapter 2 (2022)') === 'K.G.F (2018) Chapter 2');
  t('an unparseable reference is left alone, not guessed at',
    R.cleanTitle('&#9999999999;x') === '&#9999999999;x');
  t('cleaning a clean title changes nothing',
    R.cleanTitle('Ramba Oorvasi Menaka') === 'Ramba Oorvasi Menaka');
  t('cleaning is safe to repeat', R.cleanTitle(R.cleanTitle('I&#x27;m Game (2026)')) === "I'm Game");

  t('a slug becomes a readable name',
    R.titleFromSlug('ramba-oorvasi-menaka') === 'Ramba Oorvasi Menaka');
  t('an absent slug yields nothing, not "undefined"', R.titleFromSlug(null) === '');

  t('the defaults are the agreed ones',
    R.RELEASE_DEFAULTS.intervalMinutes === 10 && R.RELEASE_DEFAULTS.dormancyDays === 7);

  // The city picker went dead because parseRegions insisted on a name field
  // that the probe had never actually verified existed. Either half of the
  // name/slug pair has to be enough.
  t('a region with only a slug is still usable',
    R.parseRegions({ x: [{ RegionCode: 'HYD', regionNameSlug: 'hyderabad' }] })[0]?.name === 'Hyderabad');
  t('a region with only a name is still usable',
    R.parseRegions({ x: [{ regionCode: 'MUMBAI', name: 'Mumbai' }] })[0]?.slug === 'mumbai');
  t('a bare code names nothing and is dropped',
    R.parseRegions({ x: [{ RegionCode: 'HYD' }] }).length === 0);
  // BookMyShow's own picker leads with a short row of big cities. The endpoint
  // was observed returning them in that order; sorting it away buried them.
  {
    const regions = [
      { code: 'ZZZ', name: 'Aaa Town', slug: 'a' }, { code: 'HYD', name: 'Hyderabad', slug: 'h' },
      { code: 'MUMBAI', name: 'Mumbai', slug: 'm' }, { code: 'YYY', name: 'Bbb City', slug: 'b' },
      { code: 'NCR', name: 'Delhi-NCR', slug: 'n' },
    ];
    const g = R.groupRegions(regions);
    t('the big cities are lifted out',
      g.popular.map(r => r.code).join() === 'MUMBAI,NCR,HYD');
    t('and keep BookMyShow’s order, not alphabetical order',
      g.popular[0].name === 'Mumbai' && g.popular[2].name === 'Hyderabad');
    t('everything else stays alphabetical',
      g.rest.map(r => r.name).join() === 'Aaa Town,Bbb City');
    t('no city is lost in the split', g.popular.length + g.rest.length === regions.length);
    // A code spelled differently should cost a city its place at the top, not
    // drop it from the list.
    t('an unknown code still lands in the list',
      R.groupRegions([{ code: 'WAT', name: 'Somewhere', slug: 's' }]).rest.length === 1);
    t('a popular city is recognised by name when its code is not',
      R.groupRegions([{ code: 'XX', name: 'Kolkata', slug: 'k' }]).popular.length === 1);
  }
  {
    const optionsJs = readFileSync(here('options.js'), 'utf8');
    t('the settings page groups the cities too',
      /<optgroup label="Popular cities">/.test(optionsJs));
    t('no group headings when there is nothing to separate',
      /!popular\.length \|\| !rest\.length/.test(optionsJs));
  }
  t('the fallback list leads with the same cities',
    R.FALLBACK_REGIONS[0].code === 'MUMBAI' && R.FALLBACK_REGIONS[3].code === 'HYD');

  // The stored shape changed from a flat list to one keyed by city, and a
  // config written before that still has the old one.
  t('theatres are read for the city asked about',
    R.venuesForCity({ HYD: ['ALUC'], MUMBAI: ['XYZ'] }, 'HYD').join() === 'ALUC');
  t('a city with nothing chosen gets nothing',
    R.venuesForCity({ HYD: ['ALUC'] }, 'MUMBAI').length === 0);
  t('an old flat list still applies to the city it was saved under',
    R.venuesForCity(['ALUC'], 'HYD', 'HYD').join() === 'ALUC');
  t('an old flat list is not carried into another city',
    R.venuesForCity(['ALUC'], 'MUMBAI', 'HYD').length === 0);
  t('a missing selection is an empty list, never undefined',
    Array.isArray(R.venuesForCity(undefined, 'HYD')));
  t('the default selection is keyed by city',
    !Array.isArray(R.RELEASE_DEFAULTS.defaultVenues));

  t('there is a fallback city list', R.FALLBACK_REGIONS.length > 3 &&
    R.FALLBACK_REGIONS.every(r => r.code && r.name && r.slug));

  // The venue records were measured present in the raw text of the same fetch,
  // so an unrecognised state shape must not mean "no cinemas".
  t('cinemas fall back to the raw document',
    R.parseCinemas('x {"VenueCode":"ALUC","VenueName":"ALLU Cinemas: Kokapet"} y')[0]?.code === 'ALUC');
  t('the fallback will not invent a nameless venue',
    R.parseCinemas('x {"VenueCode":"ALUC"} y').length === 0);

  // A walk over a cyclic object must terminate rather than blow the stack.
  {
    const a = { name: 'a' }; a.self = a;
    let n = 0;
    R.walk(a, () => n++);
    t('the walk survives a cycle', n === 1);
  }
}

// ---------------------------------------------- release wiring in background
console.log('\nrelease wiring');
{
  // Read once at the top of the block; assertions below all use them.
  const oh = readFileSync(here('options.html'), 'utf8');
  const oj = readFileSync(here('options.js'), 'utf8');
  const cr = readFileSync(here('content-release.js'), 'utf8');

  t('the worker imports the release module', /import \* as R from '\.\/release\.js'/.test(bg));
  for (const m of ['addRelease', 'removeRelease', 'listReleases', 'venues', 'regions', 'setCity'])
    t(`service worker answers ${m}`, new RegExp(`msg\\.type === '${m}'`).test(bg));
  t('removing a release drops its state too', /delete state\[msg\.id\]/.test(bg));
  t('the tick drives release checks too', /runDue\(\)\.then\(runDueReleases\)/.test(bg));

  const rel = grabFrom(bg, 'runDueReleases');
  t('dormant watches are skipped', rel.includes('wakesAtWithPremieres'));
  t('and the popup agrees with the worker about when that is',
    /premiereDays \* 86400000/.test(readFileSync(here('popup.js'), 'utf8')));
  t('releases are swept before they are iterated',
    rel.indexOf('sweepReleases') > 0 && rel.indexOf('sweepReleases') < rel.indexOf('for (const watch'));
  t('a paused extension does not poll releases',
    rel.indexOf('cfg.running') < rel.indexOf('sweepReleases'));

  // The bell reads the group from the listing's page state, which on the real
  // site holds only the first rendered batch — so a watch can arrive knowing
  // one event code and nothing else. That is the case the group exists to
  // prevent, so it is repaired later rather than left half-built.
  const back = grabFrom(bg, 'backfillWatch');
  t('a watch missing its group is repaired on a later check',
    /if \(watch\.group && watch\.releaseDate\) return false;/.test(back));
  t('the repair applies to the check it happens on, not just the next',
    /watch\.group = page\.group/.test(back) && !/const next = \{ \.\.\.watch \}/.test(back));
  t('the repaired watch is persisted', /setCfg\(\{ releases: cfg\.releases \}\)/.test(back));
  t('a hopeless lookup is not retried forever', />= LOOKUP_TRIES/.test(back));
  t('the counter resets once it worked', /st\.lookupTries = 0;/.test(back));
  t('checkRelease repairs before it matches',
    /await backfillWatch\(watch, st, cfg\)/.test(grabFrom(bg, 'checkRelease')));
  t('matching on one code only is said out loud, not left silent',
    /matched on \+?\s*'?\s*'one event code only/.test(bg.replace(/\s+/g, ' ')) ||
    /one event code only/.test(bg));

  const chk = grabFrom(bg, 'checkRelease');
  t('a theatre-scoped check uses byvenue', chk.includes('byVenueApi'));
  t('a theatre-scoped check matches on the film', chk.includes('matchesFilm'));
  t('an any-theatre check reads the film page', chk.includes('R.parseFilmPage'));
  // The page it already fetched also links to the film's other languages, and
  // once a film leaves the upcoming list that is the only place left to find
  // them — which is exactly when the second language goes on sale.
  t('and learns the other languages from it',
    /adoptListings\(watch, page\.listings\)/.test(chk) &&
    /function linkedListings/.test(readFileSync(here('release.js'), 'utf8')));
  t('an unknown signal never fires an alert',
    /signal === 'open' && st\.signal !== 'open'/.test(chk));
  t('an unknown signal is recorded as a warning', /signal === 'unknown'/.test(chk));
  // Measured: all three of I'm Game's language pages carry identical
  // "Book tickets" / "Releasing on" wording, so a page per language would be
  // three times the requests for one signal — and an alert claiming a language
  // the page never distinguished.
  t('an any-theatre check reads one page, not one per language',
    (chk.match(/R\.fetchText\(R\.filmUrl/g) || []).length === 1);
  t('and does not claim a language it cannot tell apart',
    /notifyRelease\(watch, \{\}, cfg\)/.test(chk));

  // Two kinds of alert share one surface; the id is all that survives a worker
  // teardown, so it has to be the thing that tells them apart.
  t('release notifications are prefixed', /const RELEASE_NOTIF = 'release:'/.test(bg));
  t('a click routes by that prefix', /isReleaseNotif\(id\) \? openRelease\(id\) : openSeats\(id\)/.test(bg));

  const add = grabFrom(bg, 'addRelease');
  t('the group and date are fetched once, on add', add.includes('parseFilmPage'));
  // The retirement sweep would drop it on the next tick, so creating it at all
  // just makes the bell lie.
  t('a film already in cinemas is refused, not created and swept',
    /alreadyOut: true/.test(add) &&
    add.indexOf('alreadyOut') < add.indexOf('releases: [...cfg.releases, watch]'));
  t('and the bell explains why instead of showing a tick',
    /res\.alreadyOut/.test(cr) && /Already in cinemas/.test(cr));

  t('a failed lookup still creates the watch',
    add.indexOf('lookupError') > 0 && add.indexOf('lookupError') < add.indexOf('setCfg'));

  // The bell's group came from the listing page's own state, which no longer
  // carries one for any film (probes/FINDINGS.md, 2026-09-05). Whatever reaches
  // addRelease now comes from counting EG codes on a rendered film page, rails
  // included; the page fetched here is checked to be the film's own first.
  t('the verified page decides the group, not the bell', /watch\.group = page\.group \|\| watch\.group/.test(add));
  t('and a page that is not this film decides nothing at all',
    /if \(!page\.isFor\) throw/.test(add));

  // A bell clicked on BookMyShow carries no theatres; the picker in settings is
  // the only place they exist, so a new watch has to inherit them or the picker
  // is decorative.
  t('a new watch inherits the chosen theatres', /defaultVenuesFor\(cfg, city\.code\)/.test(add));
  t('the settings page saves every city’s theatres, not just the visible one',
    /defaultVenues: Object\.fromEntries/.test(oj));
  // Read from the model, not from the DOM: the list is filtered as you type,
  // and a checked box scrolled out of the filter must not be silently dropped.
  t('the picker keeps its selection outside the DOM',
    /let venueChoices = new Map\(\)/.test(oj));
  // Venue codes only mean anything inside one city, so the selection is keyed
  // by city — changing city used to clear it and lose the lot.
  t('the selection is kept per city', /venueChoices\.set\(/.test(oj) &&
    /const cityKey = \(\) => chosenCity\(\)\?\.code/.test(oj));
  t('changing city no longer clears the picker',
    !/venueChoice = new Set\(\);\s*\/\/ codes are per city/.test(oj) &&
    /Deliberately not cleared/.test(oj));
  t('empty cities are not written back', /set\.size\)/.test(oj));

  // Per-film theatres: one picker, pointed somewhere explicit.
  t('the picker has a target, not a hidden mode', /id="venueTarget"/.test(oh) &&
    /function paintTargets/.test(oj));
  t('the target is hidden until a film is watched here', /row\.hidden = !mine\.length/.test(oj));
  t('only films in the city on screen can be edited',
    /watches\.filter\(\(w\) => w\.regionCode === code\)/.test(oj));
  t('editing one film does not touch the default',
    /if \(editing\) \{/.test(oj) && /watchChoices\.get\(editing\)/.test(oj));
  t('changing city drops back to the default target',
    /editing = null;\s*\n\s*paintTargets\(\);/.test(oj));
  t('per-film theatres are saved through the worker, not written past it',
    /type: 'setReleaseVenues'/.test(oj) && /msg\.type === 'setReleaseVenues'/.test(bg));
  t('an empty per-film list means any theatre, stored as null',
    /Array\.isArray\(list\) && list\.length \? \[\.\.\.list\] : null/.test(bg));
  t('the worker rereads before writing, so a running check is not clobbered',
    (() => { const h = bg.slice(bg.indexOf("msg.type === 'setReleaseVenues'"));
             return h.indexOf('await getCfg()') < h.indexOf('setCfg('); })());

  t('a watch with no film page says so instead of fetching a bad address',
    /!watch\.slug \|\| !watch\.eventCode/.test(chk) &&
    chk.indexOf('!watch.slug') < chk.indexOf('R.fetchText(R.filmUrl'));

  t('the bell keys watches on the group first',
    /const keysFor = \(film\) => \[film\.group, film\.eventCode\]/.test(cr));
  t('the bell reads the group from the page state', /event_group/.test(cr));
  // A crossed-out bell means "muted" everywhere else; it must not be the thing
  // you click to start being told about something.
  t('the bell is never shown crossed out', !/🔕/.test(cr));
  t('the bell confirms with a tick, like the + button does', /on \? '✓'/.test(cr));
  // Reloading a page lost the tick: the worker is asleep when a page loads, the
  // first message to it is refused, and a bell painted blank was then skipped
  // by every later pass.
  t('a refused watch list is reported, not swallowed',
    /return false;/.test(cr) && /const ok = await loadWatched\(\)/.test(cr));
  t('and asked for again', /function retryLoad/.test(cr) && /if \(!ok\) retryLoad\(\)/.test(cr));
  t('the retry gives up rather than hammering', /retries >= 4/.test(cr));
  t('an existing bell is repainted, never skipped',
    /paint\(existing, isWatched\(/.test(cr) &&
    !/if \(card\.querySelector\(`\.\$\{BELL\}-btn`\)\) continue;/.test(cr));
  t('the keys live on the element so a later load can find them',
    /btn\.dataset\.bellKeys = keys\.join/.test(cr));

  // The two sides used to key on `group || eventCode` independently, and
  // addRelease fills the group in from the film page AFTER the bell sent none.
  // A page that could only produce the event code then found nothing under it
  // and drew an unwatched bell for a film that was being watched.
  t('a watch is registered under every identifier it has',
    /const keysOf = \(w\) => \[w\.group, w\.eventCode,/.test(cr) &&
    (cr.match(/for \(const k of keysOf\(w\)\) watched\.set\(k, w\.id\)/g) || []).length === 2);
  // Including the languages adopted after it was created — otherwise the Telugu
  // card shows an unwatched bell for a film that is very much being watched,
  // and clicking it makes a rival watch for the same showing.
  t('and that includes every language it has adopted',
    /\(w\.variants \|\| \[\]\)\.flatMap\(\(v\) => \[v\.group, v\.eventCode\]\)/.test(cr) &&
    /function watchCovering/.test(bg) &&
    /const covering = watchCovering\(cfg\.releases, entry\)/.test(bg));
  t('a bell carries every identifier it could be matched by',
    /btn\.dataset\.bellKeys = keys\.join\(','\)/.test(cr));
  t('matching tries each identifier in turn',
    /function watchIdFor/.test(cr) && /for \(const k of keys\) if \(watched\.has\(k\)\)/.test(cr));
  t('no single-key lookup survives', !/dataset\.bellKey\b/.test(cr) &&
    !/watched\.has\(key\)/.test(cr));
  t('unwatching clears every identifier, not just the one clicked',
    /for \(const k of keys\) watched\.delete\(k\)/.test(cr));

  // Removing a watch needs its id, which used to exist only if you had clicked
  // to create it in this same page view.
  t('the watch id comes from the list, not from an earlier click',
    /watched = new Map\(\)/.test(cr) && /watchIdFor\(keys\) \|\| film\.watchId/.test(cr));
  t('the list is stored as key to id', /watched\.set\(k, w\.id\)/.test(cr));

  // Repainting writes textContent, which is a childList mutation, which wakes
  // the observer, which schedules the repaint again — a message to the worker
  // every 400ms for as long as the tab is open.
  t('painting the state it already has touches nothing',
    /if \(btn\.textContent === glyph && btn\.classList\.contains\('is-on'\) === on\) return;/.test(cr));
  t('the observer ignores mutations targeting our own elements',
    /isOurs\(r\.target\)/.test(cr));

  t('the bell does not hijack the card it sits on',
    /e\.preventDefault\(\)/.test(cr) && /e\.stopPropagation\(\)/.test(cr));
  // The card's text is the whole card — genre, like count, the name twice — and
  // storing it as the film's name is what "Once MoreDrama/Romantic 15.6K+ Likes"
  // in the popup was.
  // Removing a watch happens in the popup, which writes storage. A page that
  // only learns the list on load kept showing a tick for a film that was gone.
  t('the bell follows changes made elsewhere',
    /chrome\.storage\.onChanged\.addListener/.test(cr) && /changes\.releases/.test(cr));
  t('and repaints rather than waiting for a reload',
    (() => { const h = cr.slice(cr.indexOf('chrome.storage.onChanged'));
             const paint = h.indexOf('repaintAll()');
             const start = h.search(/\brun\(\)(\.catch)?/);
             return paint > 0 && start > 0 && paint < start; })());
  t('only local storage changes count', /area !== 'local'/.test(cr));
  // The + buttons have done this since the beginning; the two now behave alike.
  t('the + buttons still do the same', /chrome\.storage\.onChanged/.test(cs) &&
    /if \(!changes\.shows\) return;/.test(cs));

  t('the bell never scrapes a title out of the card',
    !/a\.textContent/.test(cr));
  t('a nameless watch falls back to the slug, not the event code',
    /R\.titleFromSlug\(watch\.slug\)/.test(bg));
  t('a title is cleaned once, wherever it came from',
    /watch\.title = R\.cleanTitle\(watch\.title\)/.test(bg));
  // Deterministic, so it can be applied to what is already stored — unlike a
  // guess at which titles are rubbish.
  t('already-stored titles are repaired', /async function repairTitles/.test(bg) &&
    /await repairTitles\(cfg\)/.test(bg));
  t('the repair writes only when something changed', /if \(!changed\) return 0;/.test(bg));
  // ago() is the whole phrase, so prefixing it repeats the word.
  {
    const pj = readFileSync(here('popup.js'), 'utf8');
    const ph = readFileSync(here('popup.html'), 'utf8');
    // "Watching" used to mean only "not paused", so an empty extension claimed
    // to be watching directly above "Nothing on watch yet".
    t('the header tells watching apart from merely switched on',
      /const onWatch = live\.length \+ \(s\.releases \|\| \[\]\)\.length/.test(pj) &&
      /mode === 'watching' \? 'Watching' : 'Ready'/.test(pj));
    t('a release watch counts as watching', /s\.releases \|\| \[\]/.test(pj));

  // The welcome page opens on first install only, so an existing user has no
  // in-product path to a new feature without this.
  t('an update from before the feature flags a notice',
    /reason === 'update' && olderThan\(previousVersion, '1\.4\.0'\)/.test(bg));
  // A line about per-language alerts means nothing to somebody who has never
  // seen release watching at all.
  t('and the line matches how far back they were',
    /olderThan\(previousVersion, '1\.3\.0'\) \? '1\.3' : '1\.4'/.test(bg) &&
    /const WHATS_NEW = \{/.test(readFileSync(here('popup.js'), 'utf8')));
  t('the notice is a line in the popup, not a tab forced open',
    /chrome\.storage\.local\.set\(\{\s*whatsNew/.test(bg) &&
    !/reason === 'update'[\s\S]{0,200}tabs\.create/.test(bg));
  t('versions are compared as numbers, so 1.10 is not older than 1.9',
    /String\(version \|\| ''\)\.split\('\.'\)\.map\(Number\)/.test(bg));
  t('the popup shows it and clears it once acted on',
    /function paintWhatsNew/.test(pj) && /remove\('whatsNew'\)/.test(pj));

    // Clearing a film's theatres stores venues: null — "any theatre" — while the
    // previous check's mode is still recorded as 'venues'. Keying the row on the
    // stale mode read .length off null and took the whole popup down.
    t('the row describes the watch as it is now, not what the last check did',
      /else if \(w\.venues\?\.length\)/.test(pj) && !/st\.last\?\.mode === 'venues'/.test(pj));
    t('a theatre count with no check yet still reads sensibly',
      /ago\(st\.last\?\.at\)/.test(pj));
    t('the idle pip is not filled in', /\.pip\.ready \{ background: transparent/.test(ph));
    t('idle and paused do not look the same',
      /\.pip\.paused \{ background: var\(--free\)/.test(ph));
  }

  t('the popup does not say "checked" twice',
    !/checked \$\{ago\(/.test(readFileSync(here('popup.js'), 'utf8')));

  t('the bell stays off buytickets pages, where + already lives',
    /!p\.includes\('\/buytickets\/'\)/.test(cr));
  t('a city hint never overrides a chosen city', /if \(!cfg\.city &&/.test(bg));

  // The two modes are kept on separate panels; the seat-watch sections must
  // still be exactly where they were, just wrapped.
  t('the settings page has three panels', (oh.match(/role="tabpanel"/g) || []).length === 3);
  t('every tab controls a panel that exists',
    [...oh.matchAll(/aria-controls="(panel-[a-z]+)"/g)].every(m => oh.includes(`id="${m[1]}"`)));
  t('two panels start hidden', (oh.match(/role="tabpanel"[^>]*hidden/g) || []).length === 2);
  t('the seat-watch sections are still there',
    oh.includes('>Shows<') && oh.includes('>How often it checks<') &&
    oh.includes('>What counts as worth telling you about<'));
  t('release settings live on their own panel',
    oh.indexOf('id="panel-release"') < oh.indexOf('>Upcoming films<') &&
    oh.indexOf('>Upcoming films<') < oh.indexOf('id="panel-alerts"'));
  // Save writes every field on the page, so it must not sit inside one panel.
  t('save stays outside the panels',
    oh.lastIndexOf('</div>') < oh.indexOf('id="save"') ||
    oh.indexOf('id="save"') > oh.lastIndexOf('role="tabpanel"'));
  t('tabs are a real tablist', /role="tablist"/.test(oh) && /aria-selected/.test(oh));
  t('arrow keys move between tabs', /ArrowRight/.test(oj) && /ArrowLeft/.test(oj));
  t('the chosen tab survives a reopen', /localStorage\.setItem\(TAB_KEY/.test(oj));
  t('a private window does not break the tabs', /catch \{ \/\* private window/.test(oj));
  // Only the two modes carry a meaning-colour; alerts is plumbing, not a state.
  t('the alerts tab claims no state colour', /data-panel="alerts"\]\s*\{ --lit: var\(--edge-2\)/.test(oh));

  // Four bugs put the theatre picker in a state that told you to fix the one
  // thing you had already done. Each gets a test.
  t('an empty cinema list is never cached',
    /if \(!venues\.length\) return hit\?\.venues \|\| \[\]/.test(bg));
  // Comments talk about the bug, so they have to come out before looking for it.
  // One empty value is legitimate — the picker's target select uses it for "the
  // default for new films" — so the check is that it is the ONLY one, not that
  // there are none.
  {
    const code = oj.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const empties = code.match(/<option value=""[^>]*>/g) || [];
    t('the city control never renders an option that cannot be chosen',
      empties.length === 1 && /<option value="">New films/.test(code));
  }
  t('a rejected regions message cannot strand the placeholder',
    /sendMessage\(\{ type: 'regions' \}\)\s*\n?\s*\.catch/.test(oj));
  t('a failed city lookup still offers cities', /res\?\.fallback/.test(oj) &&
    /fallback: R\.FALLBACK_REGIONS/.test(bg));
  t('the selected city is adopted when none was saved',
    /s\.city\?\.slug \? s\.city : chosenCity\(\)/.test(oj));
  t('"pick a city" is only said when no city is picked',
    /!chosenCity\(\)\s*\n?\s*\? '<div class="none">Pick a city first/.test(oj));
  t('an empty cinema list explains itself and offers a way on',
    /No cinemas came back for that city/.test(oj));

  // The refresh used to be a .quiet button — transparent, borderless, flush
  // under a bordered box, which read as a stray line of grey text.
  t('the refresh is a real button, not a quiet one',
    /<button id="venueRefresh"/.test(oh) && !/class="quiet" id="venueRefresh"/.test(oh));
  t('it sits in the picker frame rather than loose beneath it',
    oh.indexOf('class="venuefoot"') > oh.indexOf('id="venues"') &&
    oh.indexOf('class="venuefoot"') < oh.indexOf('</div>', oh.indexOf('class="venuefoot"')));
  t('the rail says how many cinemas there are', /id="venueCount"/.test(oh) &&
    /function venueTally/.test(oj));
  t('nothing picked is said with silence, not "0 picked"',
    /if \(picked\) parts\.push/.test(oj));
  t('the button reports its own progress', /Refreshing…/.test(oj));
  t('the button is restored even if the refresh throws', /finally \{/.test(oj));
  // The empty-state tells you to press a control; it has to use that control's
  // actual name.
  t('the empty state names the button as the button is named',
    /<b>Refresh<\/b>/.test(oj) && !/Refresh the cinema list<\/b>/.test(oj));

  const rl = readFileSync(here('release.js'), 'utf8');
  t('release fetches try anonymously first', /for \(const credentials of \['omit', 'include'\]\)/.test(rl));
  t('release.js never reads a cookie', !/document\.cookie/.test(rl));
}


// ------------------------------------------------------------ rows you want
//
// The position filters answer "is this block worth going for" in the abstract —
// centred, far enough back, big enough. This one answers the question people
// actually ask: we sit in H or J, tell me about those.
console.log('\nrows you want');
{
  const rowMatcher = new Function(`${grabFrom(bg, 'rowMatcher')}\nreturn rowMatcher;`)();
  const wanted = new Function(`${grabFrom(bg, 'wanted')}\nreturn wanted;`)();
  const rowWarning = new Function(`${grabFrom(bg, 'rowWarning')}\nreturn rowWarning;`)();

  // A real hall: BookMyShow skips I, as most of them do.
  const hall = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L'];

  t('no spec is no filter', rowMatcher('', hall).match === null);
  t('one row is that row', (() => {
    const { match } = rowMatcher('H', hall);
    return match('H') && !match('G');
  })());
  t('a list is any of them', (() => {
    const { match } = rowMatcher('H, J', hall);
    return match('H') && match('J') && !match('K');
  })());
  t('case and spacing do not matter', (() => {
    const { match } = rowMatcher(' h ;j ', hall);
    return match('H') && match('j');
  })());

  // The whole reason ranges walk the hall's list: counting letters would put I
  // inside F-K and leave K out of H-K by one.
  t('a range follows the hall’s own order, not the alphabet', (() => {
    const { match } = rowMatcher('F-K', hall);
    return match('F') && match('H') && match('J') && match('K') &&
           !match('E') && !match('L') && !match('I');
  })());
  t('a range reads the same written backwards', (() => {
    const { match } = rowMatcher('K-F', hall);
    return match('H') && !match('E');
  })());
  t('a list and a range together', (() => {
    const { match } = rowMatcher('F-G, L', hall);
    return match('F') && match('G') && match('L') && !match('H');
  })());

  // Before a hall has ever been read there is no order to walk, so letters are
  // the fallback — and a hall that numbers its rows works the same way.
  t('with no hall known, letters carry the range', (() => {
    const { match } = rowMatcher('F-K', []);
    return match('F') && match('H') && match('K') && !match('E');
  })());
  t('and numbered rows compare as numbers, not as text', (() => {
    const { match } = rowMatcher('2-10', []);
    return match('9') && match('10') && !match('11') && !match('1');
  })());
  t('a range across two kinds is refused, not guessed at',
    rowMatcher('F-3', []).problems.length === 1);

  // A filter that matches nothing is a watch that runs forever and never fires,
  // which looks exactly like a watch that is working.
  t('an unreadable spec filters nothing rather than everything', (() => {
    const r = rowMatcher('F-3', []);
    return r.match === null && r.problems.length === 1;
  })());

  const run = (row, over = {}) => ({ row, size: 3, ...over });
  t('the filter actually excludes a block', (() => {
    const { match } = rowMatcher('H, J', hall);
    const kept = wanted([run('H'), run('K'), run('J')], { minAdjacent: 2, rowMatch: match });
    return kept.length === 2 && kept.every((r) => r.row !== 'K');
  })());
  // Same rule as the two geometry fractions: missing data is not evidence
  // against. A reading that produced no row label cannot be excluded by row.
  t('a block with no row label is not excluded by it', (() => {
    const { match } = rowMatcher('H', hall);
    return wanted([run(''), run(null), run('H')], { minAdjacent: 2, rowMatch: match }).length === 3;
  })());
  t('and the other filters still apply alongside it', (() => {
    const { match } = rowMatcher('H', hall);
    return wanted([run('H', { size: 1 })], { minAdjacent: 2, rowMatch: match }).length === 0;
  })());

  t('a row this hall does not have is said out loud',
    /no row/.test(rowWarning('Z', rowMatcher('Z', hall), hall) || ''));
  t('a row it does have says nothing',
    rowWarning('H', rowMatcher('H', hall), hall) === undefined);
  t('an unreadable spec says that instead',
    /every row is being watched/.test(rowWarning('F-3', rowMatcher('F-3', []), hall) || ''));
  t('no spec, nothing to say', rowWarning('', rowMatcher('', hall), hall) === undefined);

  // Wiring: the field has to reach the check, and the check has to reach you.
  t('the filter is per show, falling back to the default',
    /const rows = pick\('rows'\)/.test(bg));
  t('ranges are resolved against the hall that was read',
    /const rowOrder = \(data\.grid\?\.rows \|\| \[\]\)\.map\(\(r\) => r\.row\)/.test(bg));
  {
    const oh = readFileSync(here('options.html'), 'utf8');
    const oj = readFileSync(here('options.js'), 'utf8');
    const pj = readFileSync(here('popup.js'), 'utf8');
    t('settings has a rows field', /id="rows"/.test(oh) && /\$\('rows'\)\.value/.test(oj));
    t('and each show can override it', /class="rows"/.test(oj) &&
      /rows: el\.querySelector\('\.rows'\)\.value\.trim\(\)/.test(oj));
    // Typing row names blind is guesswork — F might be the fifth row or the
    // fifteenth, and some halls number rather than letter.
    t('a show whose hall has been read names its rows',
      /seatState\?\.\[show\.url\]\?\.last\?\.map\?\.rows/.test(oj) &&
      /This hall: /.test(oj));
    t('the popup says which rows it is waiting on', /in \$\{esc\(last\.rows\)\}/.test(pj));
    t('and flags a row that is not there', /last\.rowWarn/.test(pj));
  }
}

// --------------------------------------------- "skip the front rows" in words
//
// It used to be a fraction of the hall — nearest fifth, nearest third, front
// half. Nobody thinks in fifths of a hall, and the same fraction is a different
// number of rows in every screen. It is a row count now, and a fraction saved
// by an older build still has to open on something sensible.
console.log('\nrows to skip at the front');
{
  const oj = readFileSync(here('options.js'), 'utf8');
  const oh = readFileSync(here('options.html'), 'utf8');

  t('the dropdown counts rows rather than naming fractions',
    /<option value="3">The first 3 rows<\/option>/.test(oh) &&
    !/Nearest fifth|Nearest third|The front half/.test(oh));
  t('and the hint says what they are counted from',
    /Counted from the screen/.test(oh));

  const typical = Number(/const TYPICAL_ROWS = (\d+)/.exec(oj)?.[1]);
  t('the fraction converts against an ordinary multiplex screen', typical === 12);
  const from = new Function(
    `const TYPICAL_ROWS = ${typical}; ${grabFrom(oj, 'skipRowsFrom')}; return skipRowsFrom;`)();
  t('a count is used as it stands', from({ skipRows: 3 }) === 3);
  t('nothing set means nothing skipped', from({}) === 0 && from({ minFromScreen: null }) === 0);
  t('an old fraction becomes the row count it meant in an ordinary hall',
    from({ minFromScreen: 0.2 }) === 2 && from({ minFromScreen: 0.5 }) === 6);
  t('a count wins over the fraction it replaced',
    from({ skipRows: 2, minFromScreen: 0.5 }) === 2);
  t('a fraction never converts to zero, which would read as “keep them all”',
    from({ minFromScreen: 0.01 }) === 1);

  // Assigning a value a <select> has no option for selects nothing, and the
  // next save would then quietly turn the filter off.
  const fakeSelect = (values) => {
    const options = values.map((v) => ({ value: v, text: v }));
    return { options, value: '',
             add(opt, before) { options.splice(before ? options.indexOf(before) : options.length, 0, opt); } };
  };
  const setOn = (sel, n) => {
    new Function('$', 'Option', `${grabFrom(oj, 'setSkipRows')}; setSkipRows(${n});`)(
      () => sel, function (text, value) { return { text, value }; });
    return sel;
  };
  t('a count the dropdown offers is simply selected',
    setOn(fakeSelect(['', '2', '3', '5']), 3).value === '3');
  t('zero means keep them all', setOn(fakeSelect(['', '2', '3', '5']), 0).value === '');
  t('a converted fraction the dropdown lacks gets an option of its own',
    setOn(fakeSelect(['', '2', '3', '5']), 6).value === '6');
  t('and it lands in row order, not tacked on the end',
    setOn(fakeSelect(['', '2', '3', '5']), 4).options.map((o) => o.value).join(',') === ',2,3,4,5');
  t('the option reads as a row count',
    setOn(fakeSelect(['', '2', '3', '5']), 4).options.find((o) => o.value === '4').text
      === 'The first 4 rows');

  t('saving writes the count', /skipRows: \$\('skipfront'\)\.value === '' \? null : Number/.test(oj));
  t('and clears the fraction, so the two cannot both apply',
    /minFromScreen: null/.test(oj));

  const bgSrc = readFileSync(here('background.js'), 'utf8');
  t('the worker reads the count per show, then from the defaults',
    /skipRows: pick\('skipRows'\)/.test(bgSrc));
  t('and still honours a fraction from a config saved before the change',
    /minFromScreen: pick\('minFromScreen'\)/.test(bgSrc));
}

// ------------------------------------------------- saving settings keeps shows
//
// The bug: the settings page reads its cards once, at load, and the save wrote
// them back over `shows` wholesale. Anything added since — from the popup, from
// the "Watch this show" button, by the worker — was deleted by a save that only
// meant to change a cadence. Opening settings before adding any show was the
// worst case: the page held one blank card, so the save emptied the list.
console.log('\nsettings saves merge, they do not overwrite');
{
  const oj = readFileSync(here('options.js'), 'utf8');
  const merge = new Function(
    'removed',
    `${grabFrom(oj, 'mergeShows')}; return mergeShows;`);
  const S = (url, extra = {}) => ({ url, ...extra });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const run = (edited, current, gone = []) => merge(new Set(gone))(edited, current);

  t('a show added elsewhere survives a save from a page that never saw it',
    same(run([{ orig: 'A', url: 'A', label: 'mine' }], [S('A'), S('B')]),
         [{ url: 'A', label: 'mine' }, S('B')]));
  t('and a settings page opened while the list was empty does not empty it',
    same(run([], [S('B')]), [S('B')]));
  t('the card that was edited still wins for its own show',
    same(run([{ orig: 'A', url: 'A', minAdjacent: 4 }], [S('A', { minAdjacent: 2 })]),
         [{ url: 'A', minAdjacent: 4 }]));
  t('Remove still removes',
    same(run([], [S('A'), S('B')], ['A']), [S('B')]));
  t('changing an address leaves no ghost of the old one',
    same(run([{ orig: 'A', url: 'C' }], [S('A'), S('B')]), [S('C'), S('B')]));
  t('a show removed elsewhere is not resurrected by the card that outlived it',
    same(run([{ orig: 'A', url: 'A' }], [S('B')]), [S('B')]));
  t('typing an address that was also added elsewhere leaves one show, not two',
    same(run([{ url: 'B', label: 'mine' }], [S('B')]), [{ url: 'B', label: 'mine' }]));
  t('the card identity never reaches storage',
    !JSON.stringify(run([{ orig: 'A', url: 'A' }], [S('A')])).includes('orig'));

  // The merge is only as good as what it merges against: reading storage before
  // the webhook prompt would reopen the same window it exists to close.
  t('storage is read at save time, not at load time',
    /const now = await chrome\.storage\.local\.get\(\['shows', 'release'\]\)/.test(oj) &&
    oj.indexOf('const now = await chrome.storage.local.get') > oj.indexOf('allowWebhook(hook)'));
  t('a card remembers which stored show it stands for', /wrap\.dataset\.orig = show\.url/.test(oj));
  t('a deletion is remembered rather than inferred from a missing card',
    /removed\.add\(wrap\.dataset\.orig\)/.test(oj) && /removed\.add\(el\.dataset\.orig\)/.test(oj));
  t('a show added elsewhere appears without a reload',
    /storage\.onChanged\.addListener/.test(oj) && /if \(!known\.has\(show\.url\) && !removed\.has\(show\.url\)\) showRow\(show\)/.test(oj));
  t('and the page repaints itself from what was actually stored',
    /renderShows\(shows\);/.test(oj));
  t('release settings this page has no field for are carried through',
    /\.\.\.\(now\.release \|\| \{\}\)/.test(oj));
}

// ------------------------------------------------- languages of one film
//
// The bug: I'm Game opened in three languages — Malayalam ET00473215, Telugu
// ET00511702, Hindi ET00511704 — and one alert arrived, for the original, with
// a link to the original's listing.
//
// probe-lang.js measured why, and it was not the matching. All three codes sit
// under ONE group, EG00470725, so byvenue's Telugu row matched the watch and
// was folded into the same alert as the Malayalam one: same notification id, so
// the second replaced the first, one merged body naming neither language, and a
// link built from `watch.eventCode` whatever had opened.
//
// What byvenue does split per language is the address: `im-game` for Malayalam,
// `im-game-telugu` for Telugu. So a link has to follow the listing's own slug,
// not the watch's.
//
// The fixtures below are that probe's response, not invented shapes.
console.log('\nlanguages of one film');
{
  const R = await import('./release.js');

  const watchOf = (over = {}) => ({
    id: 'HYD:EG00470725', eventCode: 'ET00473215', group: 'EG00470725',
    slug: 'im-game', title: "I'm Game", language: 'Malayalam',
    releaseDate: '20260903', citySlug: 'hyderabad', regionCode: 'HYD',
    variants: [], ...over,
  });
  // As byvenue returned it: same group, its own slug, its own language.
  const telugu = { eventCode: 'ET00511702', group: 'EG00470725', title: "I'm Game",
                   language: 'Telugu', dimension: '2D', slug: 'im-game-telugu' };

  // -- what the probe settled -------------------------------------------
  t('a dub under the shared group matches on the group',
    R.matchesFilm(telugu, watchOf()) === true);
  // The net for a watch whose group could not be read — the one most likely to
  // miss a language.
  t('and on the slug stem when no group is known',
    R.variantCandidate(telugu, watchOf({ group: null })) === 'slug');
  t('the stem is reached from either language',
    R.filmStem('im-game-telugu') === 'im-game' && R.filmStem('im-game') === 'im-game');
  t('a sequel is not a language', R.filmStem('im-game-2') === 'im-game-2');
  t('a slug names the language it spells out',
    R.slugLanguage('im-game-telugu') === 'Telugu' && R.slugLanguage('im-game') === '');
  t('an unrelated film is never a candidate',
    R.variantCandidate({ eventCode: 'ET00888888', slug: 'other-film', title: 'Other' },
                       watchOf({ group: null })) === null);
  // Titles are shared by remakes and re-releases in a way addresses are not.
  t('a same-titled film with its own stem is not adopted',
    R.variantCandidate({ eventCode: 'ET00999999', slug: 'im-game-2019', title: "I'm Game" },
                       watchOf({ group: null })) === null);
  t('the film’s own code is never re-adopted',
    R.variantCandidate({ eventCode: 'ET00473215', slug: 'im-game' }, watchOf()) === null);

  t('a recorded variant joins the identity of the watch', (() => {
    const w = watchOf();
    return R.addVariant(w, telugu) && R.knownCodes(w).includes('ET00511702') &&
           R.matchesFilm(telugu, w);
  })());
  t('recording the same variant twice changes nothing', (() => {
    const w = watchOf();
    R.addVariant(w, telugu);
    return R.addVariant(w, telugu) === false && w.variants.length === 1;
  })());
  t('a variant remembers the slug its own listing lives under',
    R.variantFor(watchOf({ variants: [telugu] }), 'ET00511702').slug === 'im-game-telugu');
  t('the format rides along when it is not the ordinary one',
    R.languageLabel({ language: 'Telugu', dimension: 'IMAX 3D' }) === 'Telugu · IMAX 3D' &&
    R.languageLabel({ language: 'Telugu', dimension: '2D' }) === 'Telugu');

  // -- the film page's own links ----------------------------------------
  {
    const html =
      `<a href="/movies/hyderabad/im-game-telugu/buytickets/ET00511702/20260903?language=Telugu">T</a>` +
      `<a href="/movies/hyderabad/im-game-hindi/ET00511704">H</a>` +
      `<a href="/movies/hyderabad/im-game-2/ET00777777">sequel</a>` +
      `<a href="/movies/hyderabad/some-other-film/ET00888888">also liked</a>`;
    const got = R.linkedListings(html, 'im-game');
    t('the film page yields the languages it links to',
      got.length === 2 && got[0].language === 'Telugu' && got[1].language === 'Hindi');
    t('and each one’s own address', got[0].slug === 'im-game-telugu');
    t('a sequel sharing the stem is not one of them',
      !got.some((x) => x.eventCode === 'ET00777777'));
    t('nor is the recommendation rail',
      !got.some((x) => x.eventCode === 'ET00888888'));
    t('it reads the same from any language’s page',
      R.linkedListings(html, 'im-game-telugu').length === 2);
    t('a missing slug reads nothing rather than everything',
      R.linkedListings(html, '').length === 0);
  }

  // -- the link and the notification id ----------------------------------
  {
    const releaseLink = new Function('R',
      `${grabFrom(bg, 'releaseLink')}\n${grabFrom(bg, 'openedDay')}\nreturn releaseLink;`)(R);
    const notifKey = new Function(
      `${grabFrom(bg, 'notifKey')}\n${grabFrom(bg, 'openedDay')}\nreturn notifKey;`)();
    const w = watchOf({ variants: [telugu] });

    // The bug in the screenshot: a Telugu opening, linked to /im-game/ET00473215.
    t('a Telugu alert links to the Telugu listing, under its own slug',
      releaseLink(w, { eventCode: 'ET00511702', slug: 'im-game-telugu',
                       venues: [{ date: '20260903' }] }) ===
      'https://in.bookmyshow.com/movies/hyderabad/im-game-telugu/buytickets/ET00511702/20260903');
    t('and the slug is recovered from the watch when the alert omits it',
      releaseLink(w, { eventCode: 'ET00511702', venues: [{ date: '20260903' }] })
        .includes('/im-game-telugu/'));
    t('an alert with no language still links to the film',
      releaseLink(w, {}) ===
      'https://in.bookmyshow.com/movies/hyderabad/im-game/buytickets/ET00473215/20260903');
    // Notifications replace each other by id: one id per watch is why the
    // Malayalam alert and the Telugu one could not both be read.
    t('two languages are two notifications, not one overwriting the other',
      notifKey(w, { eventCode: 'ET00511702', venues: [{ date: '20260903' }] }) !==
      notifKey(w, { eventCode: 'ET00473215', venues: [{ date: '20260903' }] }));
    t('and a click can recover the language from the id',
      notifKey(w, { eventCode: 'ET00511702', venues: [{ date: '20260903' }] })
        .endsWith('#ET00511702|20260903'));
  }

  // -- the any-theatre alert ---------------------------------------------
  //
  // No theatres named means no byvenue feed, and the film page says the film
  // went on sale without saying which listing did. The alert that used to come
  // out of that named no language and linked to the code the watch was created
  // from — which is the alert that arrived for I'm Game.
  {
    const listingButtons = new Function('R',
      `${grabFrom(bg, 'listingButtons')}\n${grabFrom(bg, 'releaseLink')}\n` +
      `${grabFrom(bg, 'openedDay')}\nconst MAX_BUTTONS = 4;\nreturn listingButtons;`)(R);

    const w = watchOf({ variants: [
      telugu,
      { eventCode: 'ET00511704', group: 'EG00470725', language: 'Hindi', slug: 'im-game-hindi' },
    ] });
    const buttons = listingButtons(w);

    t('an alert that cannot name a language offers all of them',
      buttons.length === 3 && buttons.map((b) => b.text).join('|') ===
        'Book Malayalam|Book Telugu|Book Hindi');
    t('and each button goes to its own listing',
      buttons[1].url.endsWith('/im-game-telugu/buytickets/ET00511702/20260903') &&
      buttons[2].url.endsWith('/im-game-hindi/buytickets/ET00511704/20260903'));
    // A film in one language must not sprout a language button.
    t('a single-listing film keeps its one button',
      listingButtons(watchOf()).length === 1);
    // Telegram stacks them; eight languages would be a wall.
    t('the row is capped',
      listingButtons(watchOf({ variants: Array.from({ length: 9 }, (_, i) => (
        { eventCode: `ET0060000${i}`, language: `L${i}`, slug: `im-game-l${i}` })) })).length === 4);
  }

  // -- the switcher data, and the per-listing signal ---------------------
  //
  // Both measured on the live film page and its buytickets pages: the film page
  // carries a language → formats[] → eventCode structure, and a buytickets page
  // is scoped to its event code (17 cinemas Malayalam, 54 Telugu, 2 Hindi, same
  // film, same day). The film page ships no __NEXT_DATA__ at all, which is why
  // these are read out of text.
  {
    const switcher =
      '{"language":"Telugu","formats":[{"dimension":"2D","eventCode":"ET00511702",' +
      '"analytics":{"event_code":"ET00473215","format":"2D"},' +
      '"refEventCode":"ET00511702","language":"Telugu"}]},' +
      '{"language":"Hindi","formats":[{"dimension":"2D","eventCode":"ET00511704",' +
      '"analytics":{},"refEventCode":"ET00511704","language":"Hindi"}]},' +
      '{"language":"Malayalam","formats":[{"dimension":"2D","eventCode":"ET00473215"}]}';

    const langs = R.parseLanguages(switcher);
    t('the film page names every language and its code', langs.length === 3);
    t('and pairs each with the right one',
      langs.find((l) => l.eventCode === 'ET00511702').language === 'Telugu' &&
      langs.find((l) => l.eventCode === 'ET00511704').language === 'Hindi' &&
      langs.find((l) => l.eventCode === 'ET00473215').language === 'Malayalam');
    t('and carries the format', langs[0].dimension === '2D');
    t('a page with no switcher yields nothing, not a guess',
      R.parseLanguages('<html>nothing here</html>').length === 0);
    // The rails at the foot of a film page link nationally, with no city
    // segment — requiring one found none of them.
    t('a city-less address is still an address',
      R.linkedListings('<a href="/movies/im-game-telugu/ET00511702">x</a>', 'im-game')
        .length === 1);
    t('the two readings merge rather than compete', (() => {
      const merged = R.mergeListings(
        [{ eventCode: 'ET00511702', language: 'Telugu' }],
        [{ eventCode: 'ET00511702', slug: 'im-game-telugu' }]);
      return merged.length === 1 && merged[0].language === 'Telugu' &&
             merged[0].slug === 'im-game-telugu';
    })());

    const page = (body) => 'x'.repeat(2400) + body;
    t('a listing selling tickets reads open',
      R.listingSignal(page('"venueCode":"ALUC" "sessionId":"1"'), 'ET00511702').signal === 'open');
    t('and says how many cinemas took it',
      R.listingSignal(page('"venueCode":"ALUC" "venueCode":"ASHN" "sessionId":"1"'),
                      'ET1').venues === 2);
    t('its own page with nothing on it reads closed',
      R.listingSignal(page('ET00511702 and no shows at all'), 'ET00511702').signal === 'closed');
    // The failure this guards against is a reshaped page reading as "nothing on
    // sale" forever while looking like it is working.
    t('a page that is not this listing’s reads unknown, never closed',
      R.listingSignal(page('some other page entirely'), 'ET00511702').signal === 'unknown');
    t('and so does a page too small to be one',
      R.listingSignal('ET00511702', 'ET00511702').signal === 'unknown');
  }

  // -- a real any-theatre check ------------------------------------------
  {
    const filmPage = 'y'.repeat(3000) +
      '"language":"Telugu","formats":[{"dimension":"2D","eventCode":"ET00511702",' +
      '"refEventCode":"ET00511702","language":"Telugu"}]' +
      ',"language":"Malayalam","formats":[{"dimension":"2D","eventCode":"ET00473215"}]' +
      '"releaseDate":"2026-09-03T00:00:00" EG00470725 Book tickets';
    // Telugu is selling; Malayalam is not yet.
    const selling = 'z'.repeat(2400) + ' ET00511702 "venueCode":"ALUC" "venueCode":"ASHN" "sessionId":"1"';
    const quiet = 'z'.repeat(2400) + ' ET00473215 nothing scheduled';

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('/buytickets/ET00511702/') ? selling
        : u.includes('/buytickets/ET00473215/') ? quiet
        : u.includes('/buytickets/') ? null
        : u.includes('/explore/upcoming-movies-') ? '<html></html>'
        : filmPage;
      return body === null
        ? { ok: false, status: 404, text: async () => '' }
        : { ok: true, status: 200, text: async () => body };
    };

    const fired = [];
    const make = new Function(
      'R', 'setCfg', 'sleep', 'jitter', 'notifyRelease', 'LOOKUP_TRIES', 'MAX_LISTINGS',
      'VARIANT_SCAN_MS', 'UPCOMING_TTL', 'upcomingCache',
      ['checkRelease', 'backfillWatch', 'learnVariants', 'discoverFromUpcoming',
       'upcomingCards', 'byLanguage', 'knownLanguages', 'venueNames', 'adoptListings',
       'recordAlert']
        .map((n) => grabFrom(bg, n)).join('\n') + '\nreturn checkRelease;');
    const checkRelease = make(
      R, async () => {}, async () => {}, (x) => x,
      (watch, opened) => fired.push(opened), 5, 6, 6 * 3600e3, 30 * 60e3, new Map());

    const watch = watchOf({ venues: null });
    const cfg = { releases: [watch], releaseState: {},
                  release: { premiereDays: 0, intervalMinutes: 10, dormancyDays: 7 },
                  venueCache: {} };

    const st = await checkRelease(watch, cfg);

    t('an any-theatre watch learns its languages from the film page',
      R.knownCodes(watch).includes('ET00511702') &&
      R.variantFor(watch, 'ET00511702').language === 'Telugu');
    // The whole point: without theatres, only the language actually selling
    // rings — the film page would have said "open" for all of them.
    t('only the language actually selling rings',
      fired.length === 1 && fired[0].language === 'Telugu');
    t('and the alert says how many cinemas took it', fired[0].cinemas === 2);
    t('the one not selling is recorded as closed, not fired',
      st.signals.ET00473215 === 'closed');

    // When Malayalam opens later, it rings then — and only then.
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('/buytickets/') ? selling
        : u.includes('/explore/upcoming-movies-') ? '<html></html>' : filmPage;
      return { ok: true, status: 200, text: async () => body };
    };
    await checkRelease(watch, cfg);
    t('the second language rings when it opens, not before',
      fired.length === 2 && fired[1].language === 'Malayalam');
    t('and the first does not ring twice',
      fired.filter((f) => f.language === 'Telugu').length === 1);

    globalThis.fetch = realFetch;
  }

  // -- a real check, against the response the probe captured -------------
  {
    const child = (code, language, url, shows) => ({
      EventCode: code, EventGroup: 'EG00470725', EventLanguage: language,
      EventDimension: '2D', EventUrl: url, EventName: `I'm Game - ${language}`,
      ShowTimes: Array.from({ length: shows }, (_, i) => (
        { SessionId: `${code}-${i}`, ShowTime: '10:00 AM', ScreenName: 'S1' })),
    });
    const byVenue = JSON.stringify({
      ShowDetails: [{
        Date: '20260903', Venues: { VenueCode: 'ALUC' },
        Event: [
          { EventTitle: "I'm Game", EventGroup: 'EG00470725', ChildEvents: [
            child('ET00511702', 'Telugu', 'im-game-telugu', 2),
            child('ET00473215', 'Malayalam', 'im-game', 1),
          ] },
          { EventTitle: 'Something Else', EventGroup: 'EG00111111', ChildEvents: [
            { EventCode: 'ET00111111', EventGroup: 'EG00111111', EventLanguage: 'Telugu',
              EventUrl: 'something-else', ShowTimes: [{ SessionId: 'x', ShowTime: '1 PM' }] },
          ] },
        ],
      }],
    });

    const seenUrls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      seenUrls.push(String(url));
      return String(url).includes('/api/v3/mobile/showtimes/byvenue')
        ? { ok: true, status: 200, text: async () => byVenue }
        : { ok: false, status: 404, text: async () => '' };
    };

    const fired = [];
    const make = new Function(
      'R', 'setCfg', 'sleep', 'jitter', 'notifyRelease', 'LOOKUP_TRIES',
      'VARIANT_SCAN_MS', 'UPCOMING_TTL', 'upcomingCache',
      ['checkRelease', 'backfillWatch', 'learnVariants', 'discoverFromUpcoming',
       'upcomingCards', 'byLanguage', 'knownLanguages', 'venueNames', 'adoptListings',
       'recordAlert']
        .map((n) => grabFrom(bg, n)).join('\n') + '\nreturn checkRelease;');
    const checkRelease = make(
      R, async () => {}, async () => {}, (x) => x,
      (watch, opened) => fired.push(opened), 5, 6 * 3600e3, 30 * 60e3, new Map());

    const watch = watchOf({ venues: ['ALUC'] });
    const cfg = { releases: [watch], releaseState: {},
                  release: { premiereDays: 0, intervalMinutes: 10, dormancyDays: 7 },
                  venueCache: { hyderabad: { venues: [{ code: 'ALUC', name: 'ALLU Cinemas' }] } } };

    const st = await checkRelease(watch, cfg);

    // This is the whole bug, in one assertion.
    t('both languages ring, separately', fired.length === 2);
    t('and each alert names its own language',
      fired.some((f) => f.language === 'Malayalam') &&
      fired.some((f) => f.language === 'Telugu'));
    t('each alert carries the code and slug its link needs',
      fired.some((f) => f.eventCode === 'ET00511702' && f.slug === 'im-game-telugu') &&
      fired.some((f) => f.eventCode === 'ET00473215' && f.slug === 'im-game'));
    t('the Telugu alert names the cinema it opened at',
      fired.every((f) => f.venues[0].name === 'ALLU Cinemas'));
    t('the dub is recorded on the watch',
      watch.variants.some((v) => v.eventCode === 'ET00511702' &&
                                 v.slug === 'im-game-telugu' && v.language === 'Telugu'));
    t('the check reports the languages it now covers',
      (st.last.languages || []).includes('Telugu') &&
      (st.last.languages || []).includes('Malayalam'));
    t('nothing unrelated was adopted', !R.knownCodes(watch).includes('ET00111111'));

    // A wrong alert is a one-shot: `seen` stops it repeating, and pulling the
    // bell to stop it deletes the state that would explain it. So what was sent
    // is recorded where the next reading of the watch can still find it.
    t('every alert sent is recorded on the watch', (st.alerts || []).length === 2);
    t('and records which rule matched the listing',
      (st.alerts || []).every((a) => a.why === 'group' || a.why === 'code'));
    t('and both groups, so a row filed under the wrong film is visible',
      (st.alerts || []).every((a) => a.watchGroup === watch.group && a.rowGroup));
    t('and the listing it linked to',
      (st.alerts || []).some((a) => a.eventCode === 'ET00511702' && a.slug === 'im-game-telugu'));
    t('and the cinema and day it fired for',
      (st.alerts || []).every((a) => /^ALUC\|\d{8}$/.test(a.venues[0] || '')));
    t('only the last few are kept, not every alert forever',
      String(grabFrom(bg, 'recordAlert')).includes('slice(-5)'));
    // Discovery costs no request of its own: it reads the response the check
    // was already making.
    t('and learning them cost no extra fetch',
      seenUrls.every((u) => u.includes('/api/v3/mobile/showtimes/byvenue')));

    // A watch that re-announces what it announced ten minutes ago is one you
    // learn to ignore.
    const before = fired.length;
    await checkRelease(watch, cfg);
    t('a second check announces nothing new', fired.length === before);

    globalThis.fetch = realFetch;
  }

  // -- the date byvenue answers for is not the date it was asked ---------
  //
  // Measured 2026-09-05 against ALUC: a request for 20260909 — a premiere date
  // with no showtimes yet — returned four films, every row dated 20260905.
  // BookMyShow does not refuse a date it has nothing for; it answers with the
  // day it does have. Read as if it were the day requested, tonight's listings
  // become "Premiere booking open" for a film that has not opened at all.
  {
    const wrongDay = JSON.stringify({
      ShowDetails: [{
        Date: '20260905', Venues: { VenueCode: 'ALUC' },
        Event: [
          { EventTitle: "I'm Game", EventGroup: 'EG00470725', ChildEvents: [
            { EventCode: 'ET00511702', EventGroup: 'EG00470725', EventLanguage: 'Telugu',
              EventUrl: 'im-game-telugu',
              ShowTimes: [{ SessionId: 's1', ShowTime: '10:00 AM' }] },
          ] },
        ],
      }],
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => (String(url).includes('byvenue')
      ? { ok: true, status: 200, text: async () => wrongDay }
      : { ok: false, status: 404, text: async () => '' });

    const fired = [];
    const make = new Function(
      'R', 'setCfg', 'sleep', 'jitter', 'notifyRelease', 'LOOKUP_TRIES',
      'VARIANT_SCAN_MS', 'UPCOMING_TTL', 'upcomingCache',
      ['checkRelease', 'backfillWatch', 'learnVariants', 'discoverFromUpcoming',
       'upcomingCards', 'byLanguage', 'knownLanguages', 'venueNames', 'adoptListings',
       'recordAlert']
        .map((n) => grabFrom(bg, n)).join('\n') + '\nreturn checkRelease;');
    const checkRelease = make(
      R, async () => {}, async () => {}, (x) => x,
      (watch, opened) => fired.push(opened), 5, 6 * 3600e3, 30 * 60e3, new Map());

    const watch = watchOf({ venues: ['ALUC'] });
    const cfg = { releases: [watch], releaseState: {},
                  release: { premiereDays: 0, intervalMinutes: 10, dormancyDays: 7 },
                  venueCache: { hyderabad: { venues: [{ code: 'ALUC', name: 'ALLU Cinemas' }] } } };
    const st = await checkRelease(watch, cfg);

    t('a row answered for another day announces nothing', fired.length === 0);
    t('and is not recorded as seen, so the real day can still ring',
      Object.keys(st.seen || {}).length === 0);
    t('the check says it was answered about a different day', st.last.offDate === 1);
    t('"nothing opened" and "answered about another day" stay distinguishable',
      st.last.fired === 0 && st.last.offDate > 0);

    globalThis.fetch = realFetch;
  }

  // -- a group that belongs to another film ------------------------------
  //
  // Measured 2026-09-05: a Sardar 2 watch carrying EG00415918 — Mirzapur's —
  // alerted twice, for Mirzapur's Hindi and Telugu listings, at both cinemas
  // that were showing it, under the name "Sardar 2". The title comes from the
  // film page and the slug, never from the group, so nothing about the alert
  // looked wrong until its link was followed.
  //
  // The bell sends no group for that film (the upcoming list carries none), so
  // it came from the film page, whose EG count is only meaningful if the page
  // is the film's own.
  {
    t('a page that does not name the listing is not believed',
      R.parseFilmPage('<html>EG00415918 EG00415918 ET00417686</html>',
                      'sardar-2', 'ET00440190').isFor === false);
    t('and yields no group, date or title rather than another film\'s',
      R.parseFilmPage('<title>Mirzapur</title>EG00415918 EG00415918',
                      'sardar-2', 'ET00440190').group === null);
    t('a page that does name it is read as before',
      R.parseFilmPage('<title>Sardar 2</title>ET00440190 EG00438177 EG00438177',
                      'sardar-2', 'ET00440190').group === 'EG00438177');
    t('and a caller that asks for no code still gets an answer',
      R.parseFilmPage('EG00438177', 'sardar-2').group === 'EG00438177');

    // The backstop, for a watch whose group is already wrong.
    const watch = { slug: 'sardar-2', group: 'EG00415918', eventCode: 'ET00440190' };
    const mirzapur = { eventCode: 'ET00417686', group: 'EG00415918',
                       slug: 'mirzapur-the-movie', language: 'Hindi' };
    const mirzapurTelugu = { ...mirzapur, eventCode: 'ET00510304',
                             slug: 'mirzapur-the-movie-telugu', language: 'Telugu' };
    t('the wrong film matches on the wrong group, as it did', R.matchesFilm(mirzapur, watch));
    t('but its address does not agree with the watch\'s', !R.sameFilmSlug(mirzapur, watch));
    t('nor does the dub of the wrong film', !R.sameFilmSlug(mirzapurTelugu, watch));
    t('a real dub does agree, which is the whole point of the stem',
      R.sameFilmSlug({ slug: 'im-game-telugu' }, { slug: 'im-game' }));
    t('a row with no address of its own is not excluded by it',
      R.sameFilmSlug({ eventCode: 'ET1' }, { slug: 'im-game' }));
    t('and neither is a watch that has no slug',
      R.sameFilmSlug({ slug: 'anything' }, { eventCode: 'ET1' }));

    const bgSrc = readFileSync(here('background.js'), 'utf8');
    t('the check refuses to alert for a listing at another film\'s address',
      /const mine = claimed\.filter\(\(c\) => R\.sameFilmSlug\(c, watch\)\)/.test(bgSrc));
    t('and says so on the watch rather than staying silent',
      /wrongFilm: wrongFilm\.length/.test(bgSrc) &&
      /belonging to another film/.test(bgSrc));
    t('a wrong group is not allowed to grow by adopting the wrong film\'s codes',
      /if \(!R\.sameFilmSlug\(child, watch\)\) continue;/.test(bgSrc));
    t('and a watch is not built from a page that answered for something else',
      (bgSrc.match(/did not answer with this film/g) || []).length === 2);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
