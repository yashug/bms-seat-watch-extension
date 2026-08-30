/**
 * Checks the built .zip, not the working tree.
 *
 * verify.mjs tests the source. This tests the thing that actually gets
 * uploaded — which is a different question, and the one that has bounced
 * submissions before: a file the manifest needs but the zip excludes, a stray
 * development file, or a version that does not match what the listing says.
 *
 *   node store/preflight.mjs [path-to-zip]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const zip = process.argv[2] || `seat-watch-${JSON.parse(readFileSync('manifest.json', 'utf8')).version}.zip`;
let pass = 0, fail = 0;
const t = (n, c, extra = '') => { c ? (pass++, console.log('  ✓', n))
                                    : (fail++, console.log('  ✗', n, extra)); };

t(`package exists: ${zip}`, existsSync(zip));
if (!existsSync(zip)) process.exit(1);

const names = execSync(`unzip -Z1 ${zip}`, { encoding: 'utf8' }).trim().split('\n');
const read = (f) => execSync(`unzip -p ${zip} ${f}`, { encoding: 'utf8' });
const mf = JSON.parse(read('manifest.json'));

console.log('\nstructure');
t('manifest.json is at the archive root, not inside a folder', names.includes('manifest.json'));
t('no nested directory wrapper', !names.some((n) => /^[^/]+\/manifest\.json$/.test(n)));

console.log('\neverything the manifest needs is inside');
const need = new Set([
  mf.background.service_worker, mf.options_page, mf.action.default_popup,
  ...Object.values(mf.icons || {}), ...Object.values(mf.action.default_icon || {}),
  ...(mf.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  'options.js', 'popup.js', 'ui.css', 'welcome.html', 'welcome.js', 'privacy.html',
]);
for (const f of [...need].sort()) t(`present: ${f}`, names.includes(f));

// A module the worker imports is not named in the manifest, so nothing else
// would catch its absence — and a missing import is a dead worker, silently.
const imports = [...read('background.js').matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
for (const f of imports) t(`worker import present: ${f}`, names.includes(f));

console.log('\nnothing that should not ship');
for (const stray of ['package.json', 'verify.mjs', 'README.md'])
  t(`excluded: ${stray}`, !names.includes(stray));
for (const dir of ['probes/', 'promo/', 'store/', 'docs/', 'icons/'])
  t(`excluded: ${dir}`, !names.some((n) => n.startsWith(dir)));
t('no source maps or dotfiles', !names.some((n) => n.endsWith('.map') || n.split('/').pop().startsWith('.')));

console.log('\nagreement with the listing');
const listing = readFileSync('store/listing.md', 'utf8');
t('listing names this exact package', listing.includes(`seat-watch-${mf.version}.zip`));
t('version is not the one already published',
  mf.version !== '1.2.0', 'the store rejects a repeat version');

console.log('\nthe shipped copies are the current ones');
t('privacy policy covers release watches',
  /films you chose to watch for a release/.test(read('privacy.html')));
t('welcome page introduces the release half', /upcoming movies/i.test(read('welcome.html')));
t('the worker announces the update to existing users', /whatsNew/.test(read('background.js')));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
