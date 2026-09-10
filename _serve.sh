#!/bin/sh
# Refresh the Playwright harness copy: same built index.html, with the two CDN
# <script src>s pointed at the local UMD builds so a bare static server can run
# it offline. Run after every `npm run build` before any headless test.
set -e
SP=/tmp/claude-0/-home-user-Tabula/537e3ac4-afd1-599e-ae71-ca11698c527f/scratchpad
mkdir -p "$SP/serve"; ln -sfn /home/user/Tabula/vendor "$SP/serve/vendor"; ln -sfn /home/user/Tabula/samples "$SP/serve/samples"
python3 - "$SP" <<'PY'
import sys
sp=sys.argv[1]
s=open('index.html').read()
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js','vendor/react.production.min.js')
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js','vendor/react-dom.production.min.js')
s=s.replace('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js','vendor/lame.min.js')
open(sp+'/serve/index.html','w').write(s)
PY
curl -s -o /dev/null http://localhost:8139/index.html 2>/dev/null || (cd "$SP/serve" && python3 -m http.server 8139 >/dev/null 2>&1 & sleep 1)
echo "harness: $(grep -o '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]Z' $SP/serve/index.html | head -1)"
