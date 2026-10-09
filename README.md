# DukaanOS

An operating system for small Indian businesses — kirana stores, cafes, gyms, salons, boutiques, electronics shops and service studios. DukaanOS gives each of them **their own console**: the same engine underneath, shaped by the business type on top, built around a transaction-driven financial engine where every number is derived from recorded activity.

A gym owner never sees a stock shelf. A kirana owner is never asked to chase memberships. A cafe owner never meets a stylist day-book. That is the whole point of a portal.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**, twice: the 6.x JavaScript API that the lint rules and the build read, and the 7.x native compiler run beside it — [why](#two-type-checks-not-one), below
- **Tailwind CSS 4**, still driven by `tailwind.config.ts` through `@config` so paints and motion tokens keep one source of truth
- **Supabase** (Postgres + Auth) for persistence and multi-tenant row-level security

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase credentials
npm run dev                  # http://localhost:3000
```

Apply the database schema to your Supabase project with `supabase/schema.sql`.

## Portals — one engine, one console per business type

A **portal** is not a theme. It is a decision about what a specific kind of business actually needs, made once in `lib/portals/blueprints.ts` and then enforced everywhere:

| Portal | Console carries | Deliberately left out |
| --- | --- | --- |
| **Gym & Fitness** | Plans, members, check-ins, renewals, collections, marketing | Inventory, stock shelves, counter billing, suppliers |
| **Cafe & Restaurant** | Menu, counter, pantry, vendors, covers | Memberships, renewal chasing, appointment book |
| **Kirana & Grocery** | Counter billing, stock, udhaar khata, vendors | Memberships, appointments, service bookings |
| **Salon & Spa** | Services, day book, stylists, prepaid packages, follow-ups | Pantry stock, supplier chain |
| **Electronics & Mobiles** | Catalogue, serial stock, warranty, formal billing | Memberships, day book |
| **Boutique & Fashion** | Collections, sizes, stock turn, festive campaigns | Memberships, appointment book (switchable) |
| **Services & Studio** | Service menu, bookings, invoices, follow-ups | Stock shelves, membership plans |
| **General Business** | Everything, on | Nothing hidden — the honest default |

Each blueprint defines six things, and every screen reads them through `usePortal()`:

1. **Modules** — which of the 27 modules exist at all.
2. **Navigation** — sections and labels in the trade's own words (`Plans & Members`, `Udhaar Khata`, `Day Book`).
3. **Vocabulary** — `Members` / `Guests` / `Clients` / `Khata`, `Stock` / `Pantry`, `Counter` / `Front desk`.
4. **Cockpit** — the headline question, the four figures that answer it, the quick actions, and the one live list that needs attention today (renewals, day book, reorder, udhaar, check-ins).
5. **Accent** — the console's colour, applied through CSS custom properties.
6. **`excluded`** — a plain statement of what was left out and how to get it back. Shown in the UI, next to the modules that were dropped.

**How it is enforced (security).** The portal is stored in an `httpOnly`, `SameSite=Lax` cookie (`dukaan.portal`) that only `POST /api/portal` can write. That endpoint accepts a template id from the shipped list (never a portal id), is CSRF-protected by the edge proxy's double-submit token, rate-limited on its own tight bucket, and requires an owner/manager role when a real session exists. The edge proxy (`proxy.ts`, step 5) refuses any safe request for a module the portal does not carry and redirects it to `/home?locked=<module>`, where the cockpit explains what happened; a client gate covers the same rule for the moment before a cookie is re-issued. A portal value can therefore only ever *hide* a module — it can never unlock one.

### Everything On — seeing the rest of the console

A portal hides modules because a kirana does not want a renewals screen. Some
owners want them anyway: a gym that started selling protein, a café that took
on a retail shelf, or simply somebody who wants to look before they decide.

**Settings → Everything On** reveals all 27 modules regardless of the portal.
The extras appear as their own nav section, *Everything else*, marked with a
sparkle so it is always obvious which part of the console is the trade's and
which part was switched on by hand.

Four rules make it safe:

1. **It is read in the portal check, never the plan check.** Edge proxy step 6
   consults it; step 7 does not, and never will. Everything On un-hides what
   the trade hid; it does not pay for anything. On the free plan the
   memberships screen becomes *visible* and still redirects to `/subscription`.
2. **It is signed.** `dukaan.everything` carries an HMAC over
   `resolveSessionSecret()`, unlike the portal cookie, which is deliberately
   unsigned. The asymmetry is the point: a forged portal cookie can only ever
   hide more, while a forged reveal cookie would *widen* a console — so it has
   to be unforgeable. A tampered payload with a real signature, or a real
   payload with a forged one, both fall back to "off".
3. **It expires.** Ninety days, derived from `until` rather than from cookie
   lifetime, so a tab left open on a shared till does not keep a console wide
   open forever.
4. **Every flip is audited.** On and off both write a `recordConsoleEvent`
   entry into the hash-chained history, with the actor resolved server-side
   from `business_members` — never from the request body.

`POST /api/master` is the only place it can change: CSRF-protected, its own
six-a-minute bucket, body is a lone boolean, and turning it off *clears* the
cookie rather than storing `false`.


## Product map

Every business gets a subset of these, labelled in its own words — see *Portals* above.

| Route | Purpose |
| --- | --- |
| `/` | Landing — tagline, live charts, direct "start your business" flow |
| `/auth` → `/onboarding` | Sign in → 3-step setup: owner details, business + template, bank/UPI → owner's own collection QR |
| `/home` | **Owner Cockpit** — portal-specific: headline, four live figures, the list that needs action today, quick actions |
| `/check-ins` | Front desk attendance for gyms and studios — one tap per visit, tied to the member record |
| `/appointments` | The day book for salons, clinics and service studios; completing a slot records the revenue once |
| `/dashboard` | Business reality dashboard with alerts |
| `/business` | Business setup with type-specific templates |
| `/scan` | **Scan Station** — counter scan, goods-inward scan, unmatched-code triage, printable labels (only for trades that scan) |
| `/products`, `/inventory`, `/suppliers` | Full catalog CRUD, barcode capture, stock and supply chain; bulk CSV import for another app’s catalogue, with row preview and opening-stock ledger entries |
| `/sales`, `/billing`, `/payments`, `/expenses` | Money in and money out (Cash/UPI/Card/Bank Transfer/Other) |
| `/cashflow`, `/profitability` | Cash movements by account · margins & per-product profit |
| `/transactions`, `/reports`, `/comparisons` | Ledger traceability and analysis |
| `/memberships` | Plans, subscriptions, renewal reminders |
| `/reminders` | Personalized SMS & WhatsApp renewal drafts (deep links, no proxy needed) |
| `/customers` | Profiles, opening balances, receivables, unique UPI QR per customer; bulk CSV import |
| `/marketing` | Campaign tracking; spend is booked as a real expense |
| `/team` | Roles & permissions matrix |
| `/audit` | Real, timestamped audit history of every financial change |
| `/insights` | AI business health score, insights, growth tips |
| `/alerts`, `/settings` | Notifications, interactive preferences, audit trail |
| `/subscription` | **Your Plan** — what this console costs, what it has used, what a lapsed plan does, and the UPI path to switch it on |

### Move an existing catalogue across

Products and customers can be imported from a CSV on their own pages. The header matcher understands common exports (`Item Name`, `MRP`, `Sale Price`, `Purchase Rate`, `EAN`, `Qty`, `GST`, `Party Name`, `Mobile`, and opening-balance variants), and the downloadable templates round-trip DukaanOS's own CSV headers. Every row is previewed before confirmation; duplicate barcodes, SKUs and customer phone numbers are skipped, and product opening stock becomes a stock-ledger movement. CSV/TSV/semicolon files up to 2 MB and 5,000 rows are read in the browser — nothing is uploaded. Excel workbooks must first be saved as CSV; this import does not migrate historical sales, expenses or messages from another system.

## Scanning & capture — barcodes at the counter, fingers at the desk

Scanning is not a feature bolted onto billing; it is how a counter is *meant* to
work. So it is declared per trade in the same blueprint that decides everything
else, and it is enforced the same way: the **Scan Station** is a module, so a
trade that does not scan cannot reach it (edge proxy → `/home?locked=scan`).

| Trade | Capture at the desk | Prints labels for |
| --- | --- | --- |
| **Kirana & Grocery** | Barcode scanner, typed code | Shelf and loose-item labels |
| **Cafe & Restaurant** | Barcode scanner, typed code | Packaged and loose items |
| **Electronics & Mobiles** | Barcode scanner, typed code | Serial / IMEI and shelf labels |
| **Boutique & Fashion** | Barcode scanner, typed code | Size and shelf labels |
| **General Business** | Barcode, fingerprint, typed code | Everything |
| **Gym & Fitness** | **Fingerprint pad**, typed lookup | — a gym's desk reads fingers, not packets |
| **Salon & Spa** | Typed lookup | — services are billed, not scanned |
| **Services & Studio** | QR / job tags, typed lookup | Job tags |

### At the counter

A code gets in one of three ways, and all three end in the same resolver
(`lib/scanning/match.ts`), so a scanned bill and a typed bill are the same bill:

1. **Handheld scanner (keyboard wedge)** — the channel most Indian shops already
   own. A USB or Bluetooth scanner *is* a keyboard that types very fast, so
   there is nothing to pair, no driver, and no browser permission to grant. The
   scanner bar detects the typing burst and commits on `Enter`.
2. **Camera** — decoded **on the device** by the browser's own `BarcodeDetector`.
   No frame is ever uploaded: DukaanOS has no server-side image pipeline.
3. **Typed** — the fallback that always works, and it is validated exactly like a
   scan. A GTIN whose check digit fails is refused with the reason shown, so a
   mistyped code never becomes a wrong bill.

A read resolves to exactly one of four answers, and the counter never guesses:

- **matched** — one item claims the code; it is added, and scanning the same
  packet again stacks the line (`3 ×`) instead of making a second line.
- **ambiguous** — two items claim the same code. Both are named and the bill
  waits for the catalogue to be fixed; the wrong item would move the wrong stock.
- **unmatched** — nobody claims it yet. This is the most useful outcome in the
  feature: the shop is telling the owner which packet still needs a code on
  file, and the Scan Station turns that into one tap ("attach this code").
- **invalid** — a check digit failed, so it is a misread.

### Loose goods, house brands, and labels you can print

Anything that will never carry a manufacturer barcode — loose grain, a house
brand, stitched stock, spare parts — gets a **DukaanOS internal code**
(`DK` + 8 digits + a Luhn check, printed as Code 128), minted on the device.
A weigh-scale item also gets a **scale number**, and the label the shop prints
for it is a real **in-store EAN-13** (`2` + unit + item + weight/price + check
digit), which means an ordinary retail scanner reads it — no proprietary scale
protocol, no cloud, no font, no image. Labels render as pure SVG (`BarcodeSvg`),
so printing works offline.

Weight labels bill weight, price labels bill exactly the amount the scale
printed (`₹ ÷ selling price`), and neither can be edited into the wrong figure at
the counter. Repeat scans of a weighed packet never merge — two weighings are
two weights.

### Fingerprint check-in at the gym

The gym desk uses the sensor the device already has, through **WebAuthn
(platform authenticator)**. The sensor matches the finger in hardware and returns
a **credential id**; that id is the only thing DukaanOS stores. No fingerprint
image, no template, no hash of one, nothing to leak — and a finger can only ever
record a visit, never move money. Enrolment is per member and per device, a
member can be un-enrolled from the same screen, and if the device has no reader
the kiosk says so plainly and the front desk keeps working on phone lookup.

### Camera permission is scoped, not global

Barcode scanning needs the camera and fingerprint check-in needs the WebAuthn
API, but neither is a reason to hand the whole console those capabilities.
`lib/security/policy.json` grants them **per route**: `camera=(self)` only on
`/scan`, `/sales` and `/products`; `publickey-credentials-create/get=(self)` only
on `/check-ins`; everything else in the app keeps `camera=()` and the rest of the
deny-by-default list. The edge proxy (`buildPermissionsPolicy(pathname)`) and
`next.config.js` both read that one file, so the two layers cannot disagree.

### The Devices tab — proving it works on *your* counter

`/scan → Devices` exists because "the scanner is not working" is almost always
one of six things, and all six are answerable on the device in front of the
owner instead of over a support call:

1. **Test box.** Scan or type into it and DukaanOS times every keystroke, so it
   can say whether the read came from a machine or a person
   (`classifyKeystrokes` in `lib/scanning/device.ts` — a wedge emits a whole code
   under 40 ms per character; a human never beats 60 ms for thirteen of them).
   The readout gives the raw code, the guessed symbology and whether a retail
   check digit validates.
2. **Embedded frame.** A page inside another app's frame only gets the camera if
   the parent delegated it — preview panes and social webviews usually do not.
   That case is named, with an "open in its own tab" button, instead of being
   reported as a broken scanner.
3. **Camera blocked in browser settings.** Detected through
   `Permissions.query` where the browser supports it, with the fix in the
   sentence.
4. **No decoder in this browser.** Safari and Firefox ship no `BarcodeDetector`;
   the tab says so and points at the wedge and the keypad rather than pretending.
5. **No on-device sensor** for fingerprints — with the way out below.
6. **Nothing plugged in** — which the test box shows, because nothing arrives.

The live scanner field stays mounted in every mode, including the test: opening
diagnostics mid-bill never loses the counter's input.

### Plugged-in readers, not just built-in sensors

A front desk should use the sensor in the tablet, and enrolment defaults to the
**platform authenticator** for exactly that reason. Shops also buy USB readers
and security keys, and a browser can reach those through WebAuthn's
**cross-platform** attachment — so `enrollFingerprint({ attachment })` accepts
`'platform'` (default), `'cross-platform'` or `'any'`. Refusing to talk to a
reader the shop already owns would be a limitation of ours, not of their
hardware. Enrolment also refuses to run inside a frame, because WebAuthn binds a
credential to an origin and an origin inside a preview frame is not the counter.

### Verified, not claimed

`npm run verify:scanning` compiles the pure scanning modules with the project's
own TypeScript and checks them against published examples — GTIN check digits for
known EAN-13/EAN-8/UPC-A/ITF-14 codes, an EAN-13 round-trip decode, Code 128
start/switch/stop patterns and the specification's worked check-symbol example,
Luhn internal codes, the in-store label round trip, the scan → ticket path
(matched, ambiguous, unmatched, invalid; stacking; weighed lines), and the
wedge-vs-human timing the Devices tab reports. Nothing in that script talks to
the network, and nothing is mocked: it runs the same code the counter runs.

## Inventory — every unit that moved, and why

An owner who is told "the computer says 105" will go and count the shelf. If the
number is right but unexplained, they stop trusting it; if it is wrong, they
stop using the software. So stock is never a column that gets overwritten — every
change writes a **movement**, and `product.stock` is simply the latest balance on
that ledger (`lib/inventory`):

| Reason | Written by | What it says |
| --- | --- | --- |
| `opening` | adding an item, creating one from a scan | the count the owner typed |
| `sale` | `recordSale` — typed *or* scanned, one path | "Sold — 3 × Kidney beans", and 108 → 105 |
| `goods-inward` | Scan Station → Goods inward | the delivery, the supplier and the purchase price |
| `count` | the owner correcting a stock figure | the old number, the new one, and the difference |
| `return` | a returned or cancelled sale | stock coming back to the shelf |

The arithmetic is pure and unit-safe (`balanceAfter` clamps at zero, weighed
goods keep three decimals without float dust, a zero change writes no line at
all), the ledger is capped at 20,000 lines and ordered by time rather than by
arrival, and **the counter says what changed** the moment a sale is recorded —
"Kidney beans: 108 → 105 packets" lands in the same sentence as the total, on
both `/sales` and the Scan Station. `/inventory` shows each item's full history,
a shop-wide movement list, and a reconciliation badge: for every item, the last
ledger balance is compared with the on-hand figure, and any disagreement is named
per item. Items written before the ledger shipped are listed as *unchecked*
rather than quietly assumed to be fine.

The ledger syncs to `inventory_movements` (see `supabase/schema.sql`), keyed by
the movement id the device minted, so a re-sync updates a line instead of writing
a contradictory second one.

`npm run verify:inventory` runs the exact scenario an owner describes when they
are deciding whether to trust it: **108 packets of kidney beans, three sold,
becomes 105** — then a delivery, a re-count, an oversell clamp, a tampered
figure and the ledger cap.

## Languages — the whole product, not one tagline

DukaanOS ships in **English plus all 22 languages in the Eighth Schedule of the
Constitution of India**: Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi,
Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri (Meitei), Marathi,
Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, and Urdu.

The language picker is available on the public site, sign-in, onboarding, and
every console screen. A selection persists on the device and updates visible
copy, dynamic status/error messages, form placeholders, tooltips, accessibility
labels, browser titles, dates, times, numbers, and rupee amounts. Urdu, Kashmiri,
and Sindhi also switch the document to right-to-left direction. Locale files
are static same-origin assets, so the running app never sends shop copy or
customer data to a translation service.

The catalogue workflow is deliberately testable:

```bash
npm run i18n:extract                # rebuild English from every TS/TSX screen
npm run i18n:prune                  # drop phrases the product no longer contains from all 22
npm run i18n:check                  # fail if en.json has drifted from the source tree
npm run i18n:generate               # fill in what is new across the 20 Google-supported catalogues
npm run i18n:generate:low-resource  # fill in what is new for Bodo + Kashmiri with IndicTrans2
npm run verify:i18n                 # drift, key, slot, and coverage checks for all 22
```

`i18n:prune` is the other half of that pair. Extracting only ever *adds* to the
22 catalogues, so deleting a screen leaves its copy behind in every one of them
and `verify:i18n` fails on phrases the product no longer contains; the prune
drops exactly those lines and translates nothing.

Both generators are **incremental**: a phrase already translated on disk is
reused, a reviewed phrase in `locales/curated.json` always wins, and only
genuinely new copy is sent to a translation model, so a release that adds
twelve lines costs twelve translations instead of forty-four thousand. Retired
phrases are dropped in the same pass. `I18N_FORCE=1` rebuilds a locale from
scratch, and `I18N_TARGETS=hi,ta` limits a run to named locales.

`lib/i18n.tsx` applies those catalogues to authored copy while preserving live
values such as customer names, amounts, and product codes. New UI copy is picked
up by the syntax-tree extractor — and `verify:i18n` now re-runs that extractor
before anything else, so copy added to a screen without a catalogue regeneration
fails the build instead of silently shipping English to 22 languages. CI runs
the full `npm run verify` suite on every push and pull request.

## Appearance — ten paints, one source file

The console does not have a dark mode bolted onto a light one. It has a
**paint**: a complete set of colour tokens that every Tailwind class resolves
through, so switching `data-theme` on `<html>` repaints the entire product —
including screens nobody remembered to update.

| | Light | Dark |
| --- | --- | --- |
| Everyday | **Warm Daylight** (default), **Paper**, **Monsoon**, **Saffron** | **Midnight**, **Graphite**, **Night Market**, **Indigo** |
| High contrast | **Clarity** | **Nocturne** |

Plus **Match my device**, which follows `prefers-color-scheme` live.

**Where it is chosen.** Appearance is offered before sign-in as well as inside
the console: the sign-in screen, the setup screens and the landing page all carry
the same control, so a new owner can pick a paint before they have an account.
A first visit opens in **Warm Daylight** — a chosen paint, not `system` — so the
first screen reads the same on every device. `system` stays one tap away.

**Why the paints were not painting.** `html` and `:root` are the same element,
so a plain `:root { --c-page: … }` block ties `[data-theme]` on specificity and
wins by source order. The fallbacks in `app/globals.css` therefore repainted every
dark paint with the Warm Daylight values: a light page, light cards and light text
on light buttons. The fallbacks now live in `:root:not([data-theme])`, which can
only match when no paint is set. `npm run verify:theme` now fails on any palette
token declared on a bare `:root` block, because the per-paint checks read the
generated variables and could not see the cascade. The login wordmark is now drawn
inline so its lettering follows the paint instead of staying near-black.

**Performance rule.** Blur is for short-lived overlays only (menus, modals,
toasts). A `backdrop-filter` on something that stays on screen — the top bar, the
sidebar, the bottom navigation, or the base card every page is built from — makes
the browser composite that surface on every scroll frame, and it was the single
largest cost on the console. Persistent surfaces use a solid, slightly translucent
fill instead.

**One source of truth.** All ten are authored in `lib/theme/palettes.json` as
OKLCH hue/chroma/lightness, not as hex. `npm run theme:build` generates
`app/themes.css` and `lib/theme/paints.generated.json`; both are committed and
neither is ever hand-edited. OKLCH is what makes ten very different colours
carry the same *weight* at the same step, instead of the greens going muddy
while the blues stay bright. Where a colour falls outside sRGB, the generator
reduces chroma until it fits rather than clipping the channels — clipping is
what turns a careful ramp into a flat block at the dark end.

**The ramps are semantic, not monotonic.** `bg-stone-50` is always the raised
surface and `text-stone-900` is always the body text — in a dark paint that
means 50 is near-black and 900 is near-white. Components never need to know
which paint is on, which is why there is no `dark:` variant anywhere in the
codebase.

**In the menu, not buried in Settings.** Repainting the console is something an
owner does in the middle of a shift, from wherever they happen to be standing,
so every dial opens from the console frame itself:

- the **top bar** — the sun/moon half flips between this device's last light
  paint and its last dark one in one tap; the arrow next to it opens everything.
- the **sidebar footer** (desktop) and the **navigation drawer** (phone), both
  of which show the paint currently on screen.

All four dials live behind that one control, because a counter is not a desk:

- **Density** — comfortable, or compact for a 1366×768 shop PC.
- **Motion** — Full, Calm, or Off. One multiplier, `--motion-scale`, which
  every duration in the product is wrapped in.
- **Text size** — four steps, scaling the root rather than overriding sizes.
- **Privacy screen** — blurs every figure until hovered, and re-blurs the
  instant the window loses focus. For a till that faces the shop.

**No flash on load.** The choice is written to both `localStorage` (the
device's memory) and `dukaan.look` (the server's). The cookie is read in
`app/layout.tsx`, so the correct paint is in the HTML of the first byte — no
inline blocking script, no white flash before a dark console. When the two
disagree, the device wins, because it is the one the person in front of the
screen actually chose.

**Checked, not eyeballed.** `npm run verify:theme` measures every paint: body
and muted text against page, card and panel (WCAG AA, and AAA for the two
contrast paints), the label on a filled accent button, focus-ring visibility at
WCAG 1.4.11's 3:1 — composited, because the ring is drawn at 85% opacity —
hairline visibility, ramp direction, and whether the committed CSS still
matches `palettes.json`. It has already caught one real regression: Nocturne's
primary button label at 4.46:1.

## Motion — why things move

Motion in a shop console is not decoration. It is the only cue that a tap was
received and that the thing which just appeared came from somewhere. The rules
are in `lib/motion/tokens.ts`:

- Feedback the finger caused is **instant** (90 ms). Slower and the owner taps
  twice.
- Things arriving take **base** (220 ms); things leaving take **quick**
  (150 ms) and accelerate away, because nobody waits on an exit.
- Nothing animates a property that forces layout. Transform and opacity only,
  so a ₹6,000 counter PC composites instead of re-laying-out at 60 fps.

What that buys, concretely: route changes cross-fade through the View
Transitions API where the browser has it and fall back to the Web Animations
API where it does not; lists stagger in at 45 ms per item, capped at twelve so
a hundred-row ledger does not take four seconds to arrive; sparklines draw
themselves left to right because that is what a time series means; cockpit
figures count up to their value; the mobile drawer now slides back out the way
it came in instead of being deleted mid-frame (`usePresence`).

All of it is multiplied by `--motion-scale`, so **Motion: Off** is a real zero
— not a shorter animation, no animation — and `prefers-reduced-motion` is
honoured without a second code path to keep in sync.

## Architecture

- **`lib/portals/`** — the portal system, pure data first so the edge proxy can enforce what the UI renders:
  - `types.ts` — `PortalBlueprint`, `ModuleKey`, `MetricKey`, vocabulary, nav, cockpit shapes
  - `catalogue.ts` — the 27 canonical modules (route, label, icon, keywords, core flag)
  - `blueprints.ts` — the eight business types: modules, words, navigation, cockpit, accent, what was left out
  - `registry.ts` — resolution and validation (`portalById`, `portalForTemplate`, `portalHasModule`, `isKnownTemplateId`, …)
  - `routes.ts` — route policy used by the edge proxy and the client gate (`PORTAL_COOKIE`, `checkPortalAccess`, `routeHrefsFor`)
  - `icons.ts`, `nav.ts` — icon name → component, blueprint → labelled navigation
  - `portal-provider.tsx` — `PortalProvider` / `usePortal()`; server-resolved first paint, cookie reconciliation
  - `metrics.ts` — the cockpit figures, computed only from recorded activity
  - `sync.ts` — publishes the chosen type to `/api/portal` with the CSRF double-submit token
- **`app/api/portal/route.ts`** — the single narrowly-scoped server write: validates the template id, re-derives the portal, re-issues the httpOnly cookie.
- **`lib/plans/`** — the paid product, pure data first so the edge can enforce it:
  - `catalogue.ts` — the four plans, their prices, limits, and exactly which modules each unlocks
  - `lifecycle.ts` — `trialing → active → grace → expired → free`, resolved from dates only
  - `routes.ts` — route policy used by the edge proxy and the console (`checkPlanAccess`, `lockedModulesFor`)
  - `usage.ts` — the free monthly allowance, counted from the ledger (UPI money in; cash never)
  - `cookie.ts` — the signed, httpOnly `dukaan.plan` cookie the server issues and verifies
  - `activation.ts` — `DKS1-…` codes: plan, months, reference and expiry inside one HMAC
  - `active.ts`, `client.ts` — what the console believes, and the one endpoint that changes it
- **`app/api/subscription/route.ts`** — the only place a plan can change: CSRF + origin checked, its own tight rate-limit bucket, owner/manager role required when a real session exists, and *nothing* grantable except the free plan or a signature-verified code.
- **`lib/models/`** — universal domain models shared across the product:
  - `business.ts` — business profile, settings, templates (derived from the portal blueprints), audit events, snapshot adapter
  - `billing.ts` — invoices, line items, payment records, collection summaries
  - `membership.ts` — plans, members, subscriptions, reminder templates, expiry derivation
  - `insights.ts` — insights, AI tips, and business health scoring shapes
- **`lib/services/ai-insights.ts`** — `AiInsightsEngine` computes the health score, live insights, and growth tips from snapshots, invoices, and subscriptions.
- **`lib/scanning/`** — the capture layer, pure data first so the counter logic is testable without a browser:
  - `types.ts` — `CaptureChannel`, `ScanSource`, `ScanContext`, `ScanOutcome`, `ScanEvent`, `BiometricCredential`, `CaptureReadiness`
  - `barcodes.ts` — reading: GTIN check digits, internal codes (Luhn), in-store weigh/price labels, symbology guessing, plain-language profiling
  - `encoder.ts` — printing: EAN-13 / EAN-8 / UPC-A / Code 128 (automatic set C), module geometry, quiet zones, captions
  - `match.ts` — code → catalogue resolution (`matched` / `ambiguous` / `unmatched` / `invalid`) with weigh-label quantities
  - `counter.ts` — the scan ticket: stacking rules, weighed lines, totals
  - `device.ts`, `fingerprint.ts` — what this device can do, and WebAuthn enrol/verify (credential ids only)
  - `components/scanning/` — the wedge/camera/typed scanner, the printable label sheet, the SVG barcode, the fingerprint pad, the readiness card
- **`lib/theme/`** — the paint engine, generated from one file:
  - `palettes.json` — the ten paints in OKLCH. The only file a designer edits
  - `paints.generated.json`, `../app/themes.css` — built by `scripts/build-themes.mjs`; committed, never hand-edited
  - `palettes.ts` — `PAINTS`, `normalizeAppearance`, `encode`/`decodeAppearance`, `appearanceAttributes`, `themeColorFor`
  - `appearance-provider.tsx` — `useAppearance()` / `useMotionScale()`; `prefers-color-scheme` and the stored choice both as external stores, so there is no mount-effect repaint and two tabs on one till stay in sync
- **`components/theme/`** — the appearance menu (`appearance-menu.tsx`, one control in two shapes for the top bar and the navigation drawer; portalled to `<body>` and viewport-clamped so it can never be clipped by the sticky, blurred header) and `paint-preview.tsx` (a live miniature of the console, painted by `themes.css` itself)
- **`lib/motion/`** — `tokens.ts` (durations, easings, the 45 ms stagger contract) and `presence.ts` (`usePresence`, so a sheet can animate out instead of being deleted)
- **`components/motion/`** — `reveal.tsx` (one shared, refcounted `IntersectionObserver` for the whole page) and `animated-number.tsx` (figures that count, and simply *are* when motion is off)
- **`lib/security/posture.ts`** + **`components/security/security-score.tsx`** — the self-audit behind the Trust Centre score
- **`lib/security/passkey.ts`** — platform passkey enrolment and unlock; stores a credential id and nothing else
- **`lib/perf/clock.ts`** — the wall clock as an external store (`useSyncExternalStore`), so plan countdowns never read time during render and hydration stays identical.
- **`lib/business-data.ts`** — the financial engine: financial snapshots are calculated **only** from recorded transactions (revenue, COGS, operating expenses, cash flow, inventory value). No values are fabricated.
- **`lib/store.tsx`** — the live store (`DukaanStoreProvider` + `useDukaanStore`). Owners can record sales and expenses, add products/customers/plans/members, enroll and renew subscriptions, raise/collect invoices, check members in and out, and run a booking day book; every action writes transactions into the ledger and the whole console recalculates. State persists locally (reset from Settings) and — when Supabase is configured — syncs to Postgres in the background.
- **`lib/sync/supabase-sync.ts`** — the persistence adapter bridging the live store to the multi-tenant schema. It provisions the owner's `businesses` + `business_members` row, then pushes products, ledger entries, customers, campaigns, audit, and settings, all scoped by `business_id`.
- **`lib/supabase/`** — Supabase client + config guard (`isSupabaseConfigured`). With placeholder credentials the app stays fully local-first; with real credentials the same code paths sync to the database.
- **`supabase/schema.sql`** — multi-tenant Postgres schema. Every tenant table carries `business_id` and is protected by row-level security policies scoped to `business_members`.

## Principles

**Paid, and honest about it.** The free plan is free forever and cannot lapse; the paid plan is enforced at the edge and cannot be talked around. What a business is never asked to accept: cash metered, records held hostage, an auto-debit mandate, a cut of its collections, or a landing page full of proof we made up. The prices, the limits and the locks are all in one file, and the lock is on the *paid* path only.

1. **Start at zero → record reality → calculate reality** — a new business opens with every balance at ₹0 (cash, bank, UPI, receivables, revenue, COGS, profit, inventory, payables). Nothing is fabricated; every figure moves only when real activity is recorded.
2. **Real data only** — metrics come from the transaction ledger, never hardcoded dashboards.
3. **Demo data is separated** — the sample business is opt-in and clearly flagged (`demoMode`); it never mixes with a real business's records.
4. **Universal models** — one business/billing/membership/insight model serves gyms, cafes, salons, and retail alike.
5. **Traceability** — every invoice, payment, stock movement, and setting change lands in the audit trail.
6. **No sensitive credentials** — payment methods are recorded without ever requesting or storing UPI PINs, bank passwords, OTPs, or card numbers.
7. **One engine, every business** — business-type templates (`lib/models/business.ts`) configure modules for gyms, cafés, groceries, salons, electronics, and any other business.
8. **Direct UPI, no middleman** — each owner's own bank UPI ID generates their collection QR; receipts print as physical bills, and membership renewals get personalized SMS/WhatsApp drafts.

## Pricing & entitlements — what is paid, and how it is enforced

DukaanOS is sold, and the sale is enforced like every other decision in this
product: once, as data, at the edge, before a page renders.

### The plans

| Plan | Price | Opens | Limits |
| --- | --- | --- | --- |
| **Starter** | ₹0 forever | The whole counter: billing, receipts, stock, suppliers, udhaar khata, Scan Station, UPI QR, ledger, reports, audit chain, Trust Centre, your plan | 25 UPI collections/month · 200 items · 2 seats · 1 branch |
| **Full trial** | ₹0, 7 days | Every module, no card, no mandate — it simply ends | — |
| **Growth** | ₹499/month · ₹999/quarter · ₹4,990/year | Everything in Starter, unlimited, **plus** the automations: memberships & renewals, reminders, check-ins, day book, marketing, margins, comparisons | 10 seats · 1 branch |
| **Scale** | ₹1,999/quarter · ₹6,999/year | Everything in Growth, unlimited | Multi-branch · unlimited seats · priority support |

Every price, limit and module list on both surfaces comes from one place —
`lib/plans/catalogue.ts`. The landing page renders it, the console sells from
it, and the edge proxy enforces it, so a promise cannot drift from a product.

### The lifecycle — derived from dates, never stored as a flag

```
record ──┬─ trialing ───── trial ends ─┐
         ├─ active ── period ends ─► grace ── 7 days ──► expired
         └─ free ───────────────────────────────► free  (cannot lapse)
```

`resolveEntitlement(record, now)` (`lib/plans/lifecycle.ts`) is pure: it takes
the record and a timestamp and returns what a business may do. Nothing is
stored as "active", so a stale cookie, a rolled-back device clock, or a
forgotten database row cannot extend a plan. Grace exists because a shop should
never be cut off mid-Saturday over a payment that clears on Monday — a paid plan
whose period ended keeps every module for seven days while the owner renews.

### Where it is enforced

| Layer | Module | What it does |
| --- | --- | --- |
| Edge | `proxy.ts` (step 6) + `lib/plans/routes.ts` | A module this plan does not carry is never served: a 307 to `/subscription?locked=<module>`, with `x-dukaan-plan-blocked` and `x-dukaan-plan-state` headers. Read-only navigation only — a write is never redirected. |
| Recording | `lib/plans/usage.ts` + `lib/store.tsx` | The free plan's one real limit — 25 UPI collections a month — is checked where money is recorded, before a single line is written. |
| Surface | `components/billing/plan-{provider,badge,banner}.tsx` | The owner is told exactly what is paused, in the console's own trade words, and where to fix it. |
| Server | `app/api/subscription/route.ts` | The only place a plan can change. |

### What a lapsed plan does — and refuses to do

Expiry drops a business to the free plan. **Nothing is deleted, nothing is
locked away, and the shop never stops working**: billing, cash entries, the
collection QR, stock, reports, exports and the audit chain all continue, on any
plan. Only the paid automations pause, and they return the moment a plan is
active. Locking a business out of its own ledger would be extortion, not
pricing, so the always-open list (`cockpit`, `business`, `team`, `audit`,
`security`, `settings`, `subscription`) is added on top of whatever a plan
carries — a plan may only ever *remove* a module, never grant one.

**Cash is never metered.** A shop at its free allowance can still bill in cash,
record the sale, print the bill and keep the books. The limit is on the paid
path only, and the count comes from the ledger itself — the same transactions
the owner is looking at, reset by the calendar rather than by a job we run.

### The plan cookie, and what tampering buys

The chosen plan reaches the edge as `dukaan.plan`: `base64url(payload).base64url(hmacSha256(payload))`,
signed with `DUKAANOS_SESSION_SECRET`, `httpOnly`, `SameSite=Lax`. Anything that
does not verify is treated as *no record*, which resolves to the free plan.
Tampering therefore cannot unlock a paid module — the worst it can do is drop a
paying business to the free plan, which is why the server re-issues a verified
record on every successful call.

### Turning a payment into a plan

DukaanOS collects its own price the way it asks every business to collect: a
direct UPI payment, with a reference in the note. There is no gateway, no
mandate and no card on file.

1. The owner taps **Continue with Growth** → the server returns a reference, the
   amount, a `upi://pay` intent and a WhatsApp link. Nothing is granted.
2. They pay. The operator mints a code tied to that payment:
   `npm run mint:activation -- --plan growth --months 3 --reference UPI-482910`.
3. They paste the code into **Your Plan**. The server verifies the HMAC — plan,
   months, reference and expiry are all inside the signature — and only then
   issues the paid cookie. Renewals on the same plan stack; an upgrade starts
   from today; the price locks for 12 months from activation.

Nobody can grant a plan by asking: `choose-plan` accepts only the free plan, a
trial can be started once, and `activate` needs a signature that only a holder
of `DUKAANOS_ACTIVATION_SECRET` (server-only) can produce. With that secret
unset, activation is **off**, not open.

### Verify it, don't believe it

`npm run verify:billing` compiles the pure plan modules with the project's own
TypeScript and asserts the things a business would be furious to discover we got
wrong: that a lapsed plan never locks a shop out of its own records, that no
plan can name a module the catalogue does not contain, that expiry is derived
from dates so a rolled-back clock extends nothing, that tampered cookies and
activation codes are worth nothing, that the allowance counts UPI money and
never cash, and that renewals stack, upgrades start today and the price lock is
really twelve months.

## Database foundation (Supabase Postgres)

`supabase/schema.sql` defines a multi-tenant relational schema — 29 tables, every business-owned record carrying `business_id`, with primary keys, foreign keys, indexes, constraints, and `created_at`/`updated_at` timestamps. Highlights: `businesses`, `business_members`, `customers`, `suppliers`, `categories`, `products`, `sales`, `sale_items`, `payment_methods`, `payments`, `expenses`, `inventory_movements`, `transactions`, `audit_logs`, `invoices`, `membership_plans`, `members`, `membership_subscriptions`, `marketing_campaigns`, and more.

**Capture records** (Increment 8 of the schema) extend the same multi-tenant model: `products` gains `barcode`, `internal_code`, `loose_mode`, and `scale_number` with per-business uniqueness on both codes, and two new tables record how a counter works — `scan_events` (what was read, where, and what came of it) and `biometric_credentials` (a member's WebAuthn credential id and use count — never a fingerprint).

**Platform billing** (Increment 9) is kept out of the tenant's own books, because mixing our revenue into a business's ledger would corrupt both: `platform_subscriptions` (which plan a business is on, when its period ends, how it was granted, and the payment reference it came from) and `platform_payment_requests` (what an owner asked to buy, and its UPI reference). A business may read its own plan and *request* a payment — RLS gives members `select` plus `insert`-as-`requested` and nothing else, so **activation is not reachable from a browser**, only from the operator side.

**Row Level Security** is enabled on every tenant table with policies scoped to `business_members` — one business can never read or write another business's rows.

## Persistence & sync (local-first)

The store is **local-first by design**, so the console works fully even before a Supabase project is connected:

- **No Supabase credentials** → all data lives in `localStorage`; Settings shows **"Local demo mode"**, and `/auth` runs a clearly-labelled demo sign-in. Nothing touches the network.
- **Real Supabase credentials + a signed-in owner** → the adapter in `lib/sync/supabase-sync.ts` provisions the tenant and **debounced-pushes** products (with their barcodes and internal codes), ledger transactions, customers, marketing campaigns, the audit trail, settings, the scan log, and fingerprint enrolments to Postgres. Settings shows the live sync status and a **Sync now** action, and `/auth` performs real Supabase sign-in / sign-up.

Every failure is reported as a status, never as a crash — the app always keeps working on the local copy.

## Environment variables

Browser-safe:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only (never shipped to the browser):
- `SUPABASE_SERVICE_ROLE_KEY` (if used for admin operations)
- `NEXT_PUBLIC_APP_URL`
- `DUKAANOS_SESSION_SECRET` — signs session tokens **and the plan cookie**
- `DUKAANOS_ACTIVATION_SECRET` — signs activation codes; with it unset, activation is disabled rather than guessable

Selling DukaanOS to owners — **this is how the platform gets paid**:
- `NEXT_PUBLIC_PLANS_UPI_ID` — the platform's own UPI id (VPA, e.g.
  `dukaanos@okhdfcbank`). It is read **server-side** and validated with the same
  NPCI VPA check the customer QRs use; if it is missing or malformed, the API
  reports `payment.configured: false` with the exact reason and `/subscription`
  says so out loud instead of asking an owner to pay an address that cannot
  receive.
- `NEXT_PUBLIC_PLANS_PAYEE_NAME` — the name shown in the payer's UPI app
- `NEXT_PUBLIC_SUPPORT_WHATSAPP` — the number that answers "I have paid"

With a valid VPA set, `/subscription` renders a **scannable UPI QR** built from
the same `upi://pay?...` intent as the deep link, carrying the amount and the
payment reference — so a second device scans it and the payer types nothing. The
reference (`DKG-…`) is what support quotes when minting the activation code:

```bash
npm run mint:activation -- --plan growth --months 3 --reference DKG-XXXXXX
```

Never commit real credentials; `.env*` is gitignored.

### Finding these settings without a support call

Because every one of the above is a **server-side** variable — deliberately, since
a value a browser can rewrite is a value anybody can rewrite — the console has a
section that shows the owner where they are and what state they are in:

**Settings → Environment setup** reads `GET /api/health` and lists each variable
with its real condition for *this* deployment: set, missing, or **set and
malformed** (the failure that actually wastes an afternoon — a UPI id without an
`@bank`, a secret under 32 characters). It also gives the one-file, line-by-line
recipe (`cp .env.example .env.local`, `openssl rand -hex 32`, paste, restart) and
says plainly what stops working without each one: no plan UPI means Your Plan
refuses to show a QR, no activation secret means an owner can pay but nothing can
switch their plan on.

The endpoint never returns a secret's value — only whether it is set and how long
it is — and it reports the same verdicts the runtime enforces, because it calls
the same validators (`isValidUpiId`, `isSupabaseConfigured`,
`isActivationConfigured`). One of its lines is not a fault but a fact worth
stating: *"Supabase is not configured, so this console is running local-first:
records stay on this device only, and there is no server-side backup."*

## Run it

```bash
npm install
cp .env.example .env.local   # add your Supabase URL + anon key
npm run dev                  # http://localhost:3000

npm run typecheck            # no type errors — JavaScript-API compiler (TypeScript 6.x)
npm run typecheck:native     # no type errors — native compiler (TypeScript 7.x, tsgo)
npm run lint                 # no lint problems
npm run verify               # all eleven verification suites, below
npm run verify:scanning      # the barcode engine, checked against published examples
npm run verify:billing       # the plan lifecycle, the locks, and the money
npm run verify:inventory     # 108 packets minus three really is 105
npm run verify:lock          # the counter PIN: hashing, lockout, storage
npm run verify:theme         # contrast on all ten paints, and that the CSS is not stale
npm run verify:motion        # the reveal contract, and that nothing escapes --motion-scale
npm run verify:security      # 48 invariants the security layer is not allowed to lose
npm run verify:auth          # the session lifecycle, the gate, and the public paths
npm run verify:pwa           # the install manifest, its icons, and the gate in front of them
npm run verify:i18n          # key, slot and coverage parity across 22 languages
npm run verify:render        # the two rendering rules a browser can see, and React cannot forgive

npm run theme:build          # regenerate app/themes.css from lib/theme/palettes.json

# sell a plan by hand — the exact command that turns a UPI payment into access
DUKAANOS_ACTIVATION_SECRET=… npm run mint:activation -- --plan growth --months 3 --reference UPI-482910
```

Apply `supabase/schema.sql` in the Supabase SQL editor, enable Auth, then deploy to Vercel with the same environment variables.

### Two type checks, not one

TypeScript 7 is the native compiler: fast, and where the language is going. It
also ships **no JavaScript API at all** — `require('typescript')` under 7.x
returns a version string and nothing else. Three things in this repository read
that API rather than a command line: `typescript-eslint` (every typed lint rule,
through `eslint-config-next`), `scripts/extract-i18n.mjs` (which walks the tree
with `ts.createSourceFile`), and Next's own build-time type check.

So the two compilers live side by side, and CI runs both:

| Script | Compiler | Slot | Why |
| --- | --- | --- | --- |
| `npm run typecheck` | TypeScript 6.x | `typescript` | The API the linter, the i18n extractor and the build read |
| `npm run typecheck:native` | TypeScript 7.x (`tsgo`) | `typescript-native` | The compiler the tree is being proven clean against |

Both are resolved by package path, never from `node_modules/.bin`: the two
packages both ship an executable named `tsc`, and npm links whichever it installs
last. `scripts/compilers.mjs` carries the reasoning and the invariant that fails
if a slot stops holding a compiler of the right kind. When typescript-eslint can
consume the native API ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940))
the slots collapse and that file is the one place to change.

**One deliberate pin, for the same reason.** `npm run lint` stays on ESLint 9:
`eslint-config-next` brings `eslint-plugin-react`, whose latest release still
calls `context.getFilename()` — an API ESLint 10 removed — so linting on 10
crashes before it reads a file. The alternative, dropping the React rules, would
trade a version number for coverage; the pin is the honest option until the
plugin supports 10. `npm audit`'s suggested "fix" is a downgrade to
`eslint-config-next` 14, which would break the flat config outright.

**Scanning needs nothing installed.** A handheld USB/Bluetooth scanner works on any device because it types like a keyboard; camera scanning uses the browser's own decoder where it exists (Chrome/Android); the fingerprint pad uses the device's sensor through WebAuthn. On an older browser the counter still works on the wedge and typed entry — the app says which channels this device has in **Settings → How this counter captures**.

## Assumptions

- The live demo runs the full domain model client-side (`lib/store.tsx`) so every flow is exercisable without a live Supabase project; the schema is ready for server-side wiring.
- Accounting is a general-purpose calculation layer, not jurisdiction-specific tax/legal advice.
- DukaanOS's own billing is **shipped**, not deferred: a free plan that cannot lapse, a 7-day full trial, three paid plans, a signed plan cookie enforced at the edge, and activation codes minted from a verified payment. What is deliberately *not* built is an auto-debit mandate — there is no card on file anywhere in this product, by design.
- On a local-first install (no Supabase), the console runs on the owner's own device, so the entitlement gate there is a commitment encoded in software, not DRM. That is said plainly rather than dressed up; the hosted path enforces it server-side, where it can be.

## Security architecture

DukaanOS is local-first, which means the shop's ledger lives on the shop's
device. That promise is only worth making if the data is actually protected, so
security is a first-class layer rather than a header or two.

### Layers

| Layer | Module | What it does |
| --- | --- | --- |
| Identity | `lib/security/session.ts` | HMAC-signed, expiring, rotating session claims |
| Tenancy | `lib/security/tenant.ts` | One business per scope; every record carries a tenant id |
| Authorisation | `lib/security/rbac.ts` | Owner / manager / cashier / auditor, 18 permissions |
| Transport | `lib/security/headers.ts` | Nonce + `strict-dynamic` CSP, Trusted Types, HSTS, framing, and a `Permissions-Policy` granted per route (camera only where scanning happens, passkey enrolment only in the Trust Centre) |
| Edge | `lib/security/rate-limit.ts` | Sliding-window throttling with a per-endpoint bucket, plus a penalty box for clients that keep earning 429s |
| Reveal scope | `lib/portals/master.ts` + `app/api/master/route.ts` | Everything On: signed, expiring, audited, and read only by the portal check — never the paywall |
| Portal scoping | `lib/portals/routes.ts` + `proxy.ts` | A business type never reaches a module it does not carry |
| Entitlement | `lib/plans/` + `proxy.ts` | A plan that is not being paid for never reaches the paid automations — and expiry still never locks a business out of its own books |
| Request | `lib/security/csrf.ts` | Fetch-metadata + origin allow-list + double-submit token |
| Input | `lib/security/validation.ts` | Structural validation, clamps, password strength |
| Output | `lib/security/sanitize.ts` | HTML/CSV/URL escaping for receipts and exports |
| Storage | `lib/security/vault.ts` | AES-GCM-256 at rest, integrity envelope, rollback snapshot |
| Device | `lib/security/lock.ts` + `components/security/counter-lock.tsx` | The counter lock: a PIN hashed with PBKDF2-SHA256 (120k rounds, per-install salt), idle auto-lock, growing lockout after five wrong tries |
| Device (passkey) | `lib/security/passkey.ts` | Unlock with the device's own sensor. Stores a credential id and nothing else |
| Self-audit | `lib/security/posture.ts` + `components/security/security-score.tsx` | A weighted score measured from live browser state — collected *after* mount and handed to the builder, so the first client render matches the server's HTML — with unanswerable checks excluded rather than counted green |
| Violation intake | `app/api/report/route.ts` | Bounded, redacted CSP reports. Counts them; stores nothing |
| Evidence | `lib/security/audit.ts` | SHA-256 hash-chained, tamper-evident history |
| Privacy | `lib/security/redact.ts` | PII/secret scrubbing before anything is logged |
| Observability | `lib/security/monitor.ts` | Bounded, redacted error + Web Vitals telemetry |
| Server | `lib/security/guard.ts` | Session helpers that never make a dead network call |

### Edge pipeline (every request)

Nine ordered steps in `proxy.ts`. The order is part of the defence, not an
implementation detail.

1. **Static assets** — short-circuited before anything else runs.
2. **Probe rejection** — `/.env`, `/.git`, `/wp-admin`, and 40 others return a
   blank 404 with no detail. `verify:security` fails the build if one of them
   ever collides with a real route.
3. **Penalty box** — a client that has already earned four throttles inside
   five minutes is refused for two minutes, doubling per trip, capped at
   thirty. It runs *before* the rate limiter deliberately: a banned
   fingerprint should cost one map read, not a full sliding-window
   evaluation. Only a write or a credential attempt earns a strike, so an
   owner reading their own books cannot reach the box that locks them out of
   their own console.
4. **Rate limiting** — a per-client sliding window per scope (auth, api,
   apiRead, prefetch, reports, portal, plan, master, report, page) plus a
   short burst guard. Reads are budgeted above writes, and speculative
   prefetches get their own pair of buckets: the console warms its own sidebar
   on idle, so charging that traffic to the navigation budget meant an owner
   clicking through their own screens reached the ceiling and the next page
   they opened was answered with "Too many requests". The ceilings are set
   from what the app spends on the owner's behalf — one console page view
   costs about thirteen page-bucket requests and forty prefetches — so they
   sit past any person clicking and still bound a script. Only a write or a
   credential attempt records a strike against step 3.
5. **CSRF** — `Sec-Fetch-Site`, an `Origin`/`Referer` allow-list, and a
   double-submit token for `/api/*`. Exactly one path is exempt —
   `/api/report`, because the browser posts violation reports itself with no
   token it could carry — and the exemption list is a named constant that
   `verify:security` refuses to let grow.
6. **Portal policy** — the portal cookie, widened by Everything On if it is
   on, decides which modules this business runs. A request for a module
   outside it is answered with a 307 to `/home?locked=<module>` and an
   `x-dukaan-portal-blocked` header. Only read-only navigation is redirected,
   so the check can never mask a failed action or loop.
7. **Plan policy** — the signed plan cookie decides whether this route is
   served. A module the plan does not carry is answered with a 307 to
   `/subscription?locked=<module>` and an `x-dukaan-plan-blocked` header.
   Everything On is **not** consulted here.
8. **Session refresh** — Supabase only when real credentials exist, lazily
   imported, never blocking a page load.
9. **Headers** — a freshly minted per-request nonce, the posture-aware CSP,
   HSTS, framing, `Permissions-Policy`, `Reporting-Endpoints`, and `no-store`
   on console routes.

### The Content-Security-Policy

In `strict` posture the policy is `script-src 'nonce-<16 random bytes>'
'strict-dynamic' 'self'`. The nonce is minted per request in the edge proxy and
set on the *request* headers too, so Next stamps it onto its own script tags.
With `strict-dynamic`, host allow-lists stop mattering and an injected script
cannot learn the nonce — the header that carried it is gone by the time any
page JavaScript runs.

`next.config.js` ships a deliberately *weaker* static policy with
`'unsafe-inline'`, and is overwritten by the edge proxy on every HTML response. It
has to be weaker: a header written once at build time cannot carry a nonce, and
a reused nonce is worse than none because it looks like protection.
`verify:security` fails the build if a nonce ever appears in the static config.

Also on: `require-trusted-types-for 'script'` with a named policy allow-list
(production only — dev's own DOM writes violate it, and a console full of
ignorable violations teaches everyone to ignore violations),
`script-src-attr 'none'` so an injected `onclick=` cannot run, `object-src`,
`base-uri`, `frame-src` and `child-src` all `'none'`, and
`Cross-Origin-Embedder-Policy: credentialless` rather than `require-corp` —
same isolation, without breaking the first owner who pastes in a logo URL.

Trusted Types decide the bundler, which is why `npm run build` is
`next build --webpack`. The policy allow-list names `nextjs#bundler` — a policy
webpack's client runtime creates and uses. Turbopack's runtime is not
policy-aware: it assigns `script.src` as a plain string, so under
`require-trusted-types-for` the browser blocks every client chunk, the console
paints its server HTML, and then nothing hydrates. Measured, not assumed: the
Turbopack production build reported `trusted-types-sink` violations on every
route and hydrated zero components; the webpack build reported none and
hydrated all of them. Dev keeps Turbopack — it is faster, and dev is where the
directives are dropped anyway.

That is also why a host must run the *script*, not its own idea of a Next
build: `vercel.json` pins `buildCommand` to `npm run build`, because a host that
runs bare `next build` gets Turbopack, and the deployment then reports success
while serving a page that never hydrates. `verify:security` reads both files and
fails the build if either drifts.

`upgrade-insecure-requests` rides with the posture, not with production. It is
emitted in `strict` posture only: on a production build served over plain HTTP
— a local `next start`, or a hosted preview — it rewrites every same-origin
fetch to `https`, and half the console dies with `ERR_SSL_PROTOCOL_ERROR`.

Violations go to `/api/report`, which **stores nothing**: 16 KB body cap, ten
reports per request, forty distinct directives, blocked URIs coarsened to an
origin or a scheme, always a 204. `GET` returns counts only, which is what lets
the Trust Centre state "no policy violations since start-up" as a fact rather
than a promise.

`public/.well-known/security.txt` (and `/security.txt`) carries the contact
address and a list of known non-findings, so a researcher does not spend a week
reporting that the counter PIN is device-level only or that `dukaan.look` is
unsigned — both are deliberate, and both are written down.

### Two postures

`strict` and `embed` are resolved from the environment, not hard-coded:

- **strict** — a real domain is configured (`NEXT_PUBLIC_APP_URL`): `frame-ancestors 'self'`, `X-Frame-Options: DENY`, HSTS with a two-year max-age and preload.
- **embed** — local development and preview hosts: framing is allowed for the preview origins, HSTS is off, and `X-Frame-Options` is omitted entirely so it cannot override CSP and blank the preview.

### Cookies, and the frame the preview lives in

Every cookie this app sets — session, CSRF, plan, portal, Everything On — takes
its shape from one decision, made per request in `lib/security/cookies.ts`:

| Where it is running | Shape | Why |
| --- | --- | --- |
| A real deployment | `Secure; SameSite=Lax` | Nothing frames it (`frame-ancestors 'self'`), so `Lax` is the tighter answer |
| The preview, over HTTPS | `Secure; SameSite=None; Partitioned` | It *is* framed cross-site, where `Lax` is refused outright |
| Localhost, plain HTTP | `SameSite=Lax` | `Secure` and `None` are both refused over `http://` |

The middle row is not a preference. Measured in a cross-site frame over HTTPS:
`SameSite=Lax` is refused, `SameSite=None` without `Secure` is refused, and only
the `Secure` shapes are stored. A preview that set `Lax` therefore had **no CSRF
cookie at all**, so its sign-in POST carried no token and the owner was told
"Missing CSRF cookie" — while the same build worked perfectly in a top-level
tab. `Partitioned` (CHIPS) is used rather than a bare `SameSite=None` because it
keys the cookie to the site that framed us and survives the browsers that block
third-party cookies outright.

One subtlety worth keeping: the host decides HTTPS before `x-forwarded-proto`
does. Next.js fills that header in as `http` when the proxy in front of it stays
silent, so "the header says http" cannot be told apart from "nobody said
anything" — and trusting it put `Lax` cookies behind a TLS terminator, which is
the same outage wearing a different hat. `verify:security` pins all three rows.

Deploying it is therefore two decisions. Build with `npm run build` — the
Trusted Types note above explains why a host that runs bare `next build` builds
a page that never hydrates — and set `NEXT_PUBLIC_APP_URL` to the public https
origin. Without that variable the app stays in embed posture: it works, but it
makes no claim of HSTS, `X-Frame-Options` or `upgrade-insecure-requests` on your
domain's behalf, and it keeps allowing the preview origins to frame it.

### What is never collected

No PINs, OTPs, card numbers, or bank passwords — the app has no field for them
and no code path that could store them. A customer's UPI ID is used solely to
draw their collection QR; DukaanOS is not a payment gateway and never touches
the money. Diagnostics are scrubbed through `redact()` first, so phone numbers,
emails, UPI ids, tokens, and 13–19 digit sequences are masked before anything
leaves a module.

### The counter lock

Local-first means the shop's ledger is on the shop's device, which means the
biggest hole in a shop is not a server — it is the tablet sitting on the counter
while the owner serves a customer. So the console carries its own lock:

- **A 6-digit PIN**, refused if it is a run of digits, a repeated digit, or one
  of the usual suspects (`123456`, `112233`) — with the reason given, not just a
  red box.
- **PBKDF2-SHA256, 120,000 rounds, per-install random salt.** The PIN itself is
  never stored, never logged, never sent anywhere, and the comparison is
  constant-time.
- **Five wrong tries pause the keypad** — 30 seconds, doubling to a 15-minute
  ceiling — and the pause is enforced *before* the hash is computed, so the
  correct PIN cannot be used to walk around it. Waits are computed from the
  clock, so closing the tab does not clear one.
- **Auto-lock on idleness**, at 1 / 5 / 15 / 60 minutes or never, configurable
  from the Trust Centre; leaving the tab in the background past the limit locks
  on return. `Lock` in the top bar locks it immediately.
- **The lock replaces the console, it does not cover it.** While locked the
  shell renders the keypad *instead of* the sidebar, top bar and page, so the
  day's takings are not sitting in the DOM behind a blur.
- **Stated limits.** This stops a passer-by, not somebody who takes the device
  home and opens developer tools. The card says so, and points at the real
  answer for that threat: a Supabase account, which lives on the server and
  cannot be rewritten on the device. A forgotten PIN is not a dead end either —
  the honest way back in is to clear the lock on that device and say so, which
  the UI charges one typed word for.

`npm run verify:lock` runs the real PBKDF2 in Node and asserts the things a
feel-test cannot see: the PIN never appears in what is written to disk, two
installs with the same PIN produce different hashes, five wrong tries pause the
keypad *including for the correct PIN*, the pause clears only with time, corrupt
storage reads as "no lock" rather than crashing, and a device that cannot store
the lock is told rather than deceived.

### Fingerprints and camera frames

The fingerprint pad is the one place where it is worth being unusually precise:

- The finger is matched **inside the device's sensor**. DukaanOS calls the
  browser's WebAuthn API and receives a credential id; it never receives an
  image, a template, or a hash of one, and there is no code path that could
  store any of them.
- An enrolment is a single row keyed to one member and one credential id.
  Deleting it forgets the finger completely.
- A fingerprint can only ever **record a visit**. It cannot bill, cannot move
  money, and cannot be used as a password anywhere else in the app.
- Camera scanning is decoded by the browser on the device. Frames are not
  uploaded, and there is no server endpoint that accepts an image.

Settings shows the same facts against the real device: **How this counter
captures** asks the browser what it can do (wedge, camera, on-device decoder,
fingerprint sensor) and says which channels are ready here, which are not, and
what the fallback is.

### The Trust Centre, and the score on it

Open **Trust Centre** (`/security`). The first thing on it is a number out of
100, and it is measured rather than claimed. Each check reads the live thing:
`window.isSecureContext` for the transport claim, `document.cookie` for the
"authority cookies are out of reach of scripts" claim, `crossOriginIsolated`
for isolation, the hash chain re-verified on mount for the audit claim.

Two deliberate choices keep it honest:

- **Unanswerable questions are excluded, not passed.** A check this browser
  cannot run returns `unknown` and leaves the denominator. Scoring an
  unanswerable question as green is how a dashboard reaches 100% on a broken
  deployment.
- **Weight follows consequence.** Losing the audit chain costs five; an
  unblurred figure costs one. A score where every item is worth the same is a
  progress bar, not an audit.

Gaps are pulled to the top with the fix in one line; the passes collapse
behind a disclosure, because on a healthy day the useful information is
"nothing to do", not nine paragraphs of green.

### Passkey unlock

A PIN on a counter is not broken by cryptography. It is broken by being typed
forty times a day in front of whoever is standing at the till. **Trust Centre
→ Unlock with this device** enrols a platform passkey, after which the
tablet's own sensor opens the counter lock.

DukaanOS stores one thing: a credential id. Not a fingerprint, not a face, not
a template of either — the match happens inside the device, exactly as it does
for gym check-in. Three limits, stated in the UI as well as here:

- The PIN keeps working, deliberately. A passkey bound to a tablet that falls
  in a bucket of water must never be the only way into a business's books.
- It is bound to this origin and this device. Enrolling on the till does not
  enrol the owner's phone.
- It protects the device, not the data from somebody who already owns the
  device — the same honest limit the PIN has.

The sensor is offered *during* a PIN lockout. The lockout exists because six
digits are guessable; a passkey is not, and holding the one person who can
prove they are the owner out of their own till for fifteen minutes costs them
an afternoon and costs an intruder nothing.

### Verify it yourself

`npm run verify` runs all eleven suites and exits non-zero on the first
disagreement:

| Suite | What it refuses to let regress |
| --- | --- |
| `verify:scanning` | Barcode maths against published examples, scan → ticket, wedge-vs-human timing |
| `verify:billing` | The plan lifecycle and the paywall |
| `verify:inventory` | 108 packets − 3 = 105, and everything that could quietly break it |
| `verify:lock` | The PIN, its hashing, and its lockout |
| `verify:theme` | Contrast on all ten paints; staleness of the generated CSS |
| `verify:motion` | The reveal contract, that every `animate-*` class exists, and that nothing escapes `--motion-scale` |
| `verify:security` | 48 invariants: no `'unsafe-inline'`, no build-time nonce, penalty box before rate limiter, a bucket per mutating endpoint with reads budgeted above writes, prefetches budgeted apart from navigation, no strike earned by a read, every cookie shape decided from the request and the framed shape `Secure; SameSite=None; Partitioned`, the host trusted over `x-forwarded-proto`, the production build toolchain is one that can honour Trusted Types — and that the deployment host runs it — `upgrade-insecure-requests` only in strict posture, the console never prefetches a module the plan does not open, one CSRF exemption, no probe shadowing a real route, security.txt unexpired, the report endpoint still storing nothing |
| `verify:auth` | The session lifecycle, the auth gate kept ahead of the portal and plan policies, and every public path still public |
| `verify:pwa` | The install manifest parses, its icons match their declared sizes, the flattened ones carry no transparency, the splash colours track the default paint, and the gate leaves the manifest public |
| `verify:i18n` | Exact key, slot, and coverage parity across all 22 languages |
| `verify:render` | That no component answers a browser-only question while rendering, and that untranslated text keeps the exact bytes the server sent |

Three of these are worth explaining, for the same underlying reason: they cover
failures that are completely silent.

**`verify:security`** exists because security regressions do not look like
bugs. Nobody files a ticket saying the CSP quietly gained `'unsafe-inline'`
three weeks ago, because the app works perfectly either way. Every check in it
exists because of a specific way this layer could stop protecting anyone
without a single test going red.

**`verify:motion`** exists because of a bug it would have caught. A stat card
was given `data-reveal-item` so it would arrive with the rest of its row — but
that attribute is half a contract, and the other half is registering with the
shared `IntersectionObserver` that eventually reveals the element. The card
never registered. Types passed, lint passed, the build was clean, and every
headline figure on four screens was `opacity: 0` forever. The CSS now requires
both halves, so forgetting one yields a card that does not *animate* rather
than one that does not *exist* — and the verifier fails the build either way.

**`verify:render`** exists because two hydration mismatches shipped, and both
were found by driving a real browser through the console rather than by any
test. The Trust Centre scored `isSecureContext`, `crossOriginIsolated`,
WebAuthn support and `document.cookie` *while rendering*, so the server's HTML
carried a score of 37 and the client's first frame a score of 58 — the ring
changed colour under React's error, and the whole subtree was thrown away. The
i18n walker, separately, looked a phrase up by its normalised form and wrote
that normalised form back into the DOM when no catalogue had it, collapsing
every newline the app had not translated; the `<pre>` env template on Settings
was the visible one. Types cannot see either: both are valid TypeScript that
render a page which is *almost* right. So the suite reads the source back —
browser state is collected in one function and handed in after mount, a phrase
with no translation is returned untouched, and a `<pre>` or `<textarea>` is
content rather than copy.

### Performance notes

The same layer is built to stay out of the way: the Supabase SDK is lazily
imported so the edge proxy stays at ~89 kB instead of ~789 kB, and
hydration/telemetry work is scheduled through `lib/perf/idle.ts` so nothing runs
mid-interaction.

The portal system is designed to feel instant rather than merely be fast:

- **No flash of the wrong console.** `app/(console)/layout.tsx` resolves the
  portal on the server from the cookie, so the first paint already carries the
  right navigation — the client never repaints a full menu down to a smaller one.
- **Warm only what this business can open.** Route warm-up consumes
  `routeHrefsFor(portalId)` and warms the sidebar's own order — a dozen routes
  for a gym instead of thirty, at one route per idle slice, and none at all on a
  metered or 2G connection. A module the plan does not carry is left out of the
  warm-up and out of the sidebar's prefetch: its click lands on the paywall,
  so warming it would fetch two pages the owner is never shown.
- **Recolouring is a variable, not a re-render.** Accents ship as CSS custom
  properties (`--portal-accent`, `--portal-accent-deep`), so switching business
  type repaints the frame with no layout shift and no stylesheet swap.
