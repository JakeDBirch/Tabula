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
//   node build.mjs              full build
//   node build.mjs --audit-only just run the CJS audit, no output

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SRC = "src/tabula.jsx";
const OUT = "index.html";
const auditOnly = process.argv.includes("--audit-only");

const tmp = mkdtempSync(join(tmpdir(), "tabula-build-"));
const srcStripped = join(tmp, "tabula.jsx");
const compiled = join(tmp, "tabula.js");

// 1. Prepare source — drop the React import line and the `export default`.
const raw = readFileSync(SRC, "utf8");
const prepped = raw
  .replace(/^import React.*$\n?/m, "")
  .replace(/^export default function Tabula/m, "function Tabula") +
  '\n\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Tabula));\n';
writeFileSync(srcStripped, prepped);

// 2. Babel compile.
const babel = "node_modules/.bin/babel";
try {
  execFileSync(babel, [srcStripped, "-o", compiled], { stdio: ["ignore", "pipe", "pipe"] });
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
  cjsOut = execFileSync(
    babel,
    [srcStripped, "--plugins=@babel/plugin-transform-modules-commonjs"],
    { stdio: ["ignore", "pipe", "pipe"] }
  ).toString();
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
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Tabula">
  <title>Tabula</title>
  <style>html,body,#root{margin:0;padding:0;height:100%;width:100%;background:#1a1814;overflow:hidden;}</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  <script>
const { useState, useEffect, useRef, useCallback, Fragment } = React;

${js}
  </script>
</body>
</html>
`;

writeFileSync(OUT, html);
const sizeKB = Math.round(html.length / 1024);
console.log(`Built ${OUT} (${sizeKB}KB)`);
