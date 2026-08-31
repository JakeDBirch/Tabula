#!/usr/bin/env node
// Loud Light build pipeline.
//   src/loudlight.jsx   →   index.html
//
// 1. Strip import / export-default boilerplate so the file becomes a plain
//    function declaration that mounts to <div id="root">.
// 2. Babel transform with preset-env + preset-react.
// 3. Wrap output in an HTML scaffold (React 18 UMD CDN + PWA meta).
// 4. Audit pass: re-run Babel with CJS modules transform and grep for the
//    'return_react2' artifact-viewer footgun. Fails build if found.
//
// Usage:
//   node build.mjs              full build
//   node build.mjs --audit-only just run the CJS audit, no output

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SRC = "src/loudlight.jsx";
const OUT = "index.html";
const auditOnly = process.argv.includes("--audit-only");

const tmp = mkdtempSync(join(tmpdir(), "loudlight-build-"));
const srcStripped = join(tmp, "loudlight.jsx");
const compiled = join(tmp, "loudlight.js");

// 1. Prepare source — drop the React import line and the `export default`.
const raw = readFileSync(SRC, "utf8");
// Stamp the build. BUILD_ID is rendered in the PROJECT menu, so when something
// misbehaves on a device we can't inspect, the first question — "are you even
// running the build I just pushed?" — has an answer on screen.
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const prepped = raw
  .replace(/^import React.*$\n?/m, "")
  .replace(/^export default function LoudLight/m, "function LoudLight")
  .replace(/__BUILD__/g, stamp) +
  '\n\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(LoudLight));\n';
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
// 4b. CSS audit. The stylesheet is one template literal, so a stray BACKTICK
// inside it (or a `${`) ends the literal early and the remainder parses as
// `tpl * tpl`, which evaluates to NaN. The app then renders <style>NaN</style>
// and every rule silently stops applying — no box-sizing, no container
// queries, no keyframes — while the build stays green. That cost three commits
// of confusion once. Check the outcome, not a guessed cause.
{
  const open = "const CSS=`";
  const a = raw.indexOf(open);
  const b = raw.indexOf("\n`;", a);
  if (a < 0 || b < 0) {
    console.error("!! AUDIT FAIL: couldn't delimit the CSS template literal.");
    process.exit(1);
  }
  const block = raw.slice(a + open.length, b);
  const bad = block.includes("`") ? "a backtick" : block.includes("${") ? "a ${ interpolation" : null;
  if (bad) {
    const line = block.split("\n").find((l) => l.includes("`") || l.includes("${"));
    console.error("!! AUDIT FAIL: " + bad + " inside the CSS block.");
    console.error("   It ends the template literal early and CSS becomes NaN,");
    console.error("   which silently disables the whole stylesheet at runtime.");
    console.error("   Offending line: " + line.trim());
    process.exit(1);
  }
  if (!block.includes("box-sizing:border-box")) {
    console.error("!! AUDIT FAIL: the CSS block lost its box-sizing reset.");
    process.exit(1);
  }
  console.log("CSS audit: clean");
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
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Loud Light">
  <meta name="theme-color" content="#0e1c2b">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon.png">
  <link rel="apple-touch-icon" href="icon.png">
  <title>Loud Light</title>
  <style>html,body,#root{margin:0;padding:0;height:100%;width:100%;background:#0e1c2b;overflow:hidden;}</style>
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
