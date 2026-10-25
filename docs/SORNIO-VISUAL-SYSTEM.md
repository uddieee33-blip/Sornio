# Sornio visual system

The public site introduces everyday commerce through warm ivory, deep blue ink,
cobalt, mint and amber. The approved silver ribbon mark remains the brand asset.
Dawn and Dusk replace the previous default Light/Dark paints under their existing
Monsoon and Graphite IDs. Appearance preferences, system matching and the eight
additional paints continue to work.

The landing story moves from ambition to a choice of eight business examples,
an interactive sample billing/stock workspace, practical features, Windows
installation, catalogue-driven prices and capability questions. Sample figures
are labelled. The business selector changes only the marketing example.
Signup links preserve the existing onboarding flow and pricing selections.

CSS perspective gives the hero sample sales card and receipt depth. Hover moves
only the sales card, without a pointer/scroll listener or animation dependency.
All transition times use the motion multiplier. Off, Calm and system reduced
motion remove the hero movement. Feature reveals use the existing shared,
progressively enhanced observer. No continuous animation runs on the page.

Daily business records, access policy, subscription logic and onboarding are
outside this change. The shared theme tokens also colour the existing app.
The Windows preview still needs internet; fully offline Windows operation,
LAN synchronization and automatic message delivery remain separate work.

Validation limits: the managed preview launcher currently cannot resolve Next
from this repository's dependency mount. Browser visual acceptance is pending;
a production build and repository checks do not substitute for that review.
New marketing phrases use explicit English fallbacks in regional catalogues,
pending translation review. Existing translations are retained.

The existing navigation regression harness now awaits the provider’s real
ref-held audit promises before asserting a settled render. Twelve event-loop
turns did not reliably await Web Crypto workers in GitHub CI. The persistence
debounce remains unflushed, and a negative control still detects the original
same-owner stale-snapshot reload bug. Production store behavior is unchanged.


## Workspace shape and hierarchy

Daily work now shares a rounded surface system: 24px working panels (20px on
small screens), 14px controls, and 28px framing. Desktop navigation and search
sit in separate curved surfaces. Navigation uses the selected paint rather
than a permanently dark token override, with filled accent selection and a
readable submenu. Mobile navigation has a curved drawer and a centred dock
positioned above the safe-area inset.

Home uses a rounded heading, individual metric cards, tinted task icons and
consistent working panels. Account and owner setup use the same shape language.
The old global/console rules that reduced card curvature and duplicated input
styling are removed; controls own the common surface and form geometry.

These changes affect presentation and metric grouping only. No record source,
role/plan gate, route, posting command or authentication flow changes. Console
and control rules remain screen-only, preserving invoice print layout. Native
Windows acceptance and authenticated browser visual review remain pending.

## Bill creation workspace

The new-bill route uses the available console width. Customer and item entry stay
in the first panel; payment method, tax, totals and Save bill share a second panel.
At 860px of available editor width, the panels sit side by side. Below that width,
they follow their form order in one column. The summary stays in view on tall
desktop screens and returns to normal document flow on short windows.

The bill editor uses theme tokens and the shared card/control geometry. Its CSS
module is screen-only; receipt printing keeps its existing styles. It adds no
motion or JavaScript layout listeners, and keeps one form, existing field labels,
the live total announcement and focused validation errors. Saving still creates
an unpaid bill and uses the existing stock and collection commands.
