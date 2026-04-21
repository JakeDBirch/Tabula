#!/bin/bash
set -e

SRC="src/tabula.jsx"
OUT="index.html"
TMP_JSX="/tmp/tabula-src.jsx"
TMP_JS="/tmp/tabula-compiled.js"

if [ ! -f "node_modules/.bin/babel" ]; then
  echo "Installing babel..."
  npm install --save-dev @babel/core @babel/cli @babel/preset-react @babel/preset-env
fi

sed 's/^import React.*$//' "$SRC" | \
sed 's/^export default function Tabula/function Tabula/' > "$TMP_JSX"
echo '' >> "$TMP_JSX"
echo 'ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Tabula));' >> "$TMP_JSX"

./node_modules/.bin/babel "$TMP_JSX" -o "$TMP_JS"

cat > "$OUT" << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Tabula">
  <title>Tabula</title>
  <style>
    html,body,#root{margin:0;padding:0;height:100%;width:100%;background:#000;overflow:hidden;}
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  <script>
const { useState, useEffect, useRef, useCallback, Fragment } = React;

HTML

cat "$TMP_JS" >> "$OUT"
echo '  </script>' >> "$OUT"
echo '</body>' >> "$OUT"
echo '</html>' >> "$OUT"

SIZE=$(wc -c < "$OUT")
echo "Built $OUT ($(($SIZE / 1024))KB)"
