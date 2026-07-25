#!/usr/bin/env bash
# Regenerates ficha-medidas-e-calculo.docx from bom.js (single source of truth,
# shared with the site) plus the pre-flattened reference illustrations in
# assets/print/. Requires: node, and python3 with `python-docx` installed
# (pip3 install python-docx).
#
# The flattened illustrations (assets/print/*-flat.png) are print.html's
# annotated images baked into single PNGs; regenerate them only if the
# dimension callouts in print.html change (see git history for the
# Playwright element-screenshot recipe used to produce them).
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

node -e "
import('./bom.js').then(({ MATERIALS, BOM, DIM_INFO }) => {
  const fs = require('fs');
  fs.writeFileSync('$TMP/bom.json', JSON.stringify({ MATERIALS, BOM: BOM.map(({length, ...r}) => r), DIM_INFO }, null, 2));
});
"

python3 tools/generate-docx.py \
  "$TMP/bom.json" \
  assets/print/iso-referencia-flat.png \
  assets/print/topo-referencia-flat.png \
  ficha-medidas-e-calculo.docx

echo "Wrote ficha-medidas-e-calculo.docx"
