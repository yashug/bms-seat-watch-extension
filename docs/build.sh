#!/bin/sh
# Produces docs/privacy.html — a single self-contained file for hosting.
#
# The Chrome Web Store needs the privacy policy at a public URL. The copy that
# ships inside the extension pulls in ui.css, which a host would 404 on, so the
# stylesheet is inlined here rather than the page being maintained twice: there
# is one privacy policy, and it is ../privacy.html.
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
css = open('../ui.css').read()
page = open('../privacy.html').read()
assert '<link rel="stylesheet" href="ui.css">' in page, 'stylesheet link moved'
page = page.replace('<link rel="stylesheet" href="ui.css">',
                    '<style>\n/* inlined from ui.css by docs/build.sh */\n' + css + '</style>')
page = page.replace('<head>',
    '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1">')
open('privacy.html', 'w').write(page)
print('docs/privacy.html', len(page), 'bytes')
PY
