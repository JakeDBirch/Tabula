#!/usr/bin/env node
// Tabula build pipeline.
//   src/tabula.jsx   →   index.html
//
// 1. Strip import / export-default boilerplate so the file becomes a plain
//    function declaration that mounts to <div id="root">.
// 2. Babel transform with preset-env + preset-react.
// 3. Wrap output in an HTML scaffold (React 18 UMD CDN + PWA meta).
// 4. Audit pass: re-run Babel with CJS modules transform and grep for the
//    'return_react2' artifact-viewer footgun. Fails build if found.
//
// Usage:
//   node build.mjs              full build (index.html, CDN scaffold)
//   node build.mjs --ios        also emit ios/www/ — offline, self-contained
//   node build.mjs --audit-only just run the CJS audit, no output

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SRC = "src/tabula.jsx";
const OUT = "index.html";
const auditOnly = process.argv.includes("--audit-only");
// --ios additionally emits ios/www/ — the same app, but self-contained: every
// CDN dependency vendored from vendor/, no service worker (WKWebView serves
// the bundle from a custom scheme, where SW registration isn't available and
// isn't needed), and the native flag set. A TestFlight build that white-screens
// on a plane is not a shippable music tool, so nothing may reach the network
// at launch. See docs/ios-testflight.md.
const ios = process.argv.includes("--ios");

const tmp = mkdtempSync(join(tmpdir(), "tabula-build-"));
const srcStripped = join(tmp, "tabula.jsx");
const compiled = join(tmp, "tabula.js");

// 1. Prepare source — drop the React import line and the `export default`.
const raw = readFileSync(SRC, "utf8");
// Stamp the build. BUILD_ID is rendered in the PROJECT menu, so when something
// misbehaves on a device we can't inspect, the first question — "are you even
// running the build I just pushed?" — has an answer on screen.
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const prepped = raw
  .replace(/^import React.*$\n?/m, "")
  .replace(/^export default function Tabula/m, "function Tabula")
  .replace(/__BUILD__/g, stamp) +
  '\n\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Tabula));\n';
writeFileSync(srcStripped, prepped);

// 2. Babel compile.
// Invoke the Babel CLI JS entry directly via node, instead of the
// node_modules/.bin/babel shim. The shim is an extensionless shell script
// that Windows CreateProcess can't exec (execFileSync doesn't use a shell),
// so going through node here works identically on all platforms.
const babelJs = "node_modules/@babel/cli/bin/babel.js";
// Bump V8's old-space heap so Babel can transform the JSX without OOMing.
// At ~6.5k LOC the default 4GB heap was failing the CJS audit pass; 8GB has
// margin for further growth.
const runBabel = (args) => execFileSync(
  process.execPath,
  ["--max-old-space-size=8192", babelJs, ...args],
  { stdio: ["ignore", "pipe", "pipe"] }
);
try {
  // Force compact output so the bundle size doesn't oscillate around Babel's
  // 500KB auto-compact threshold (which produced huge, noisy index.html diffs
  // as the source crossed it). Always-minified = smaller deploy + stable diffs.
  runBabel([srcStripped, "--compact", "true", "-o", compiled]);
} catch (err) {
  console.error("Babel compile failed:");
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}

// 4. Audit. Re-run Babel with the modules-commonjs transform — that's the
// configuration the old artifact viewer used, which generates the bogus
// `return_react2` identifier when there's a module-level arrow returning JSX.
// We don't ship this output; we just grep it for the footgun.
let cjsOut;
try {
  cjsOut = runBabel([srcStripped, "--plugins=@babel/plugin-transform-modules-commonjs"]).toString();
} catch (err) {
  console.error("CJS audit Babel pass failed:");
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}
if (cjsOut.includes("return_react2")) {
  console.error("!! AUDIT FAIL: 'return_react2' found in CJS output.");
  console.error("   This means there's a module-level arrow function returning JSX.");
  console.error("   Inline it directly into the component to fix.");
  process.exit(1);
}
console.log("CJS audit: clean");

if (auditOnly) {
  console.log("Audit-only run; skipping HTML output.");
  process.exit(0);
}

// 3. Wrap in HTML scaffold.
const js = readFileSync(compiled, "utf8");

// Shared <head> bits. VIEWPORT/RESET are identical across both targets so the
// two builds can't drift on layout — only the asset sourcing differs.
const VIEWPORT = `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`;
const RESET = `<style>html,body,#root{margin:0;padding:0;height:100%;width:100%;background:#1a1814;overflow:hidden;}</style>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  ${VIEWPORT}
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Tabula">
  <meta name="theme-color" content="#1a1814">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon.svg">
  <link rel="apple-touch-icon" href="icon.svg">
  <title>Tabula</title>
  ${RESET}
</head>
<body>
  <div id="root"></div>
  <script>
    // Register the offline service worker so the installed PWA runs with no network.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  </script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  <script>
const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;

${js}
  </script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log("Build stamp: " + stamp);
const sizeKB = Math.round(html.length / 1024);
console.log(`Built ${OUT} (${sizeKB}KB)`);

// 5. Native iOS payload (--ios).
if (ios) {
  // Rewrite the two runtime CDN references in the compiled bundle. Both are
  // asserted rather than best-effort: a silently-missed replacement ships a
  // TestFlight build that reaches for a CDN, which is exactly the failure this
  // target exists to prevent, and it would only show up on a device with no
  // signal. Same spirit as the return_react2 audit above — fail the build, not
  // the flight.
  const subs = [
    // The webfont @import. Replaced by local @font-face in the scaffold below.
    [/@import url\('https:\/\/fonts\.googleapis\.com\/[^']*'\);/, "", "webfont @import"],
    // lamejs, loaded on demand for MP3 bounce.
    ["https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js", "lame.min.js", "lamejs script src"],
  ];
  let nativeJs = js;
  for (const [from, to, label] of subs) {
    const before = nativeJs;
    nativeJs = nativeJs.replace(from, to);
    if (nativeJs === before) {
      console.error(`!! iOS BUILD FAIL: could not rewrite ${label}.`);
      console.error("   The reference in src/tabula.jsx changed. Update the subs table in build.mjs");
      console.error("   — leaving it would ship an offline app that fetches from a CDN at runtime.");
      process.exit(1);
    }
  }

  const WEIGHTS = [["normal", 300], ["normal", 400], ["normal", 500], ["italic", 300]];
  const fontFace = WEIGHTS.map(([style, w]) =>
    `@font-face{font-family:'DM Sans';font-style:${style};font-weight:${w};font-display:swap;` +
    `src:url('fonts/dm-sans-latin-${w}-${style}.woff2') format('woff2');}`
  ).join("\n    ");

  const nativeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  ${VIEWPORT}
  <title>Tabula</title>
  <style>
    ${fontFace}
  </style>
  ${RESET}
</head>
<body>
  <div id="root"></div>
  <script>
    // Read by the install hint, which must not fire inside the app it is
    // telling you to install. Set here rather than injected by the shell so
    // the payload is self-describing and testable in a plain browser.
    window.__TABULA_NATIVE__ = true;
  </script>
  <script src="react.production.min.js"></script>
  <script src="react-dom.production.min.js"></script>
  <script>
const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;

${nativeJs}
  </script>
</body>
</html>
`;

  const WWW = "ios/www";
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });
  writeFileSync(join(WWW, "index.html"), nativeHtml);
  for (const f of ["react.production.min.js", "react-dom.production.min.js", "lame.min.js"]) {
    cpSync(join("vendor", f), join(WWW, f));
  }
  cpSync("vendor/fonts", join(WWW, "fonts"), { recursive: true });
  cpSync("samples", join(WWW, "samples"), { recursive: true });
  cpSync("kits.json", join(WWW, "kits.json"));
  cpSync("icon.svg", join(WWW, "icon.svg"));

  // Guard the whole payload, not just the HTML: a stray CDN URL in a vendored
  // file or a sample path would fail the same way, at the same altitude.
  const stray = [];
  for (const [f, body] of [["index.html", nativeHtml]]) {
    for (const m of body.matchAll(/https?:\/\/[^"'\s)]+/g)) {
      // Three knowingly-inert cases. Supabase is the cloud-sync backend —
      // network by design, and only after the user signs in. The w3.org SVG
      // namespace is an identifier, never fetched. The babel/babel link is a
      // license pointer Babel injects as a comment into its own helpers.
      // Everything else is a bug.
      if (/supabase\.co|www\.w3\.org|github\.com\/babel\/babel\//.test(m[0])) continue;
      stray.push(`${f}: ${m[0]}`);
    }
  }
  if (stray.length) {
    console.error("!! iOS BUILD FAIL: remote references left in the offline payload:");
    for (const s2 of stray) console.error("   " + s2);
    process.exit(1);
  }

  const wwwKB = Math.round(nativeHtml.length / 1024);
  console.log(`Built ${WWW}/ (index.html ${wwwKB}KB + vendored libs, fonts, samples)`);
}
