# Prototype font notes

- Static PNG previews were generated with system **DejaVu Sans / DejaVu Sans Mono** (permissive Bitstream Vera / DejaVu licence) and a temporary TTF conversion of the repository's bundled **Noto Sans Gurmukhi** subset.
- The bundled subset `assets/fonts/noto-sans-gurmukhi.woff2` is copied unchanged from `apps/desktop/public/fonts/` on `origin/main` @ `1cc5c79`; its **SIL Open Font License 1.1** text is included as `NotoSansGurmukhi-OFL.txt`.
- No new font is introduced into production. The HTML browser-render snapshot adjusts only the relative `@font-face` path.
- Pillow's basic layout engine does not perform full Gurmukhi complex shaping; the browser HTML uses the original WOFF2 where shaping is available. Gurmukhi print correctness remains a physical-hardware gate.
