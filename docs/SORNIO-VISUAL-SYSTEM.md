# Sornio visual refinement

This pass adds a coherent graphite, silver and blue-gray finish to the working
business admin. The approved ribbon artwork and existing theme choices remain
the source of the identity. Financial commands and access policy are unchanged.

The admin uses a graphite navigation rail, a layered home header, separate metric
surfaces, quieter table headers, consistent controls and deliberate depth. New
pages enter while the store and shell remain mounted. Navigation subsections
expand in place; collapsed links are inert and are not prefetched. Transitions
release their transforms when finished so payment overlays remain viewport based.
Print rendering retains the existing receipt styles.

The landing page has a CSS 3D workspace illustration, a layered brand tile,
pointer depth and bounded scroll parallax. Sample figures are explicitly labelled.
Feature cards reveal once as they enter view. Pricing, installation and the FAQ
keep their existing destinations and capability disclosures.

## Motion

- Page entry: 420 ms, small vertical movement and fade.
- Metric entry: 520 ms with a short stagger.
- Navigation expansion: 320 ms with a 220 ms fade.
- Preview depth: at most three/four degrees of pointer tilt and 28 px of scroll movement.
- Every duration follows the existing motion multiplier.
- Motion Off removes entry animations and preview motion; Calm removes pointer
  depth and parallax. System reduced motion disables the decorative movement.
- The preview runs only in response to pointer or scroll events, batches changes
  in requestAnimationFrame, and cleans up listeners on unmount. Coarse pointers
  receive the static layered composition. No 3D engine or animation dependency.

The visual pass covers the shared admin frame and controls, Home, and the public
landing page. Existing feature-specific forms keep their working structures.
