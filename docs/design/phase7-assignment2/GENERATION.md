# Prototype generation

All PNG previews in this directory were produced by `tools/generate-prototypes.py`. The script is isolated to this nonproduction review package: it writes only files under `assets/`, `index.html`, `prototype.css`, `prototype.js`, `README.md`, `FONT-LICENSES.md` and `manifest.json` in this directory. It does not import, execute or modify `apps/desktop`, `apps/mobile`, packages, workflows or financial code.

Generation used system DejaVu Sans / DejaVu Sans Mono, the repository's bundled Noto Sans Gurmukhi WOFF2 (OFL 1.1), and isolated Python packages Pillow, fontTools and Brotli. No dependency was added to the repository. To regenerate in an environment with those packages available:

```
PYTHONPATH=<isolated-site-packages> python3 docs/design/phase7-assignment2/tools/generate-prototypes.py
```

`fontTools` converts the committed WOFF2 to a temporary TTF for Pillow. Pillow's basic layout engine is used for static PNG previews; full Gurmukhi complex shaping is exercised by the browser HTML and remains a physical Windows print gate. See `FONT-LICENSES.md`.
