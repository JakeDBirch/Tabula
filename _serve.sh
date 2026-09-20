#!/bin/sh
# Refresh the Playwright harness copy: same built index.html, with the CDN
# <script src>s pointed at the local UMD builds so a bare static server can run
# it offline. Run after every `npm run build` before any headless test.
#
# The copy lands in .build/serve — inside the repo and gitignored — rather than
# in a session scratchpad, because a hardcoded scratchpad path is dead the next
# time anyone opens the project.
#
# EVERY CDN reference has to be rewritten, not just React's: the sandbox has no
# network, so a lamejs left pointing at jsdelivr makes the MP3 bounce produce a
# null blob and _core_bounce fail in a way that looks exactly like an engine
# regression. The substitutions are asserted below for that reason.
set -e
SP="$(cd "$(dirname "$0")" && pwd)/.build"
mkdir -p "$SP/serve"; ln -sfn /home/user/Tabula/vendor "$SP/serve/vendor"; ln -sfn /home/user/Tabula/samples "$SP/serve/samples"
python3 - "$SP" <<'PY'
import sys
sp=sys.argv[1]
s=open('index.html').read()
subs=[('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js','vendor/react.production.min.js'),
      ('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js','vendor/react-dom.production.min.js'),
      ('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js','vendor/lame.min.js')]
for a,b in subs:
    if a not in s: sys.exit('_serve.sh: substitution missed — '+a)
    s=s.replace(a,b)
open(sp+'/serve/index.html','w').write(s)
PY
curl -s -o /dev/null http://localhost:8139/index.html 2>/dev/null || (cd "$SP/serve" && python3 -m http.server 8139 >/dev/null 2>&1 & sleep 1)
echo "harness: $(grep -o '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]Z' $SP/serve/index.html | head -1)"
