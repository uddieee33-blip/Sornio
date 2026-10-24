# Sornio business admin redesign

The product had 29 destinations with overlapping summaries, several layers of
navigation, and a bill editor sharing the screen with receipts and payment
activity. Search also offered actions that changed the business type immediately.
This redesign organises the existing features around the owner's work, using the
familiar Shopify admin pattern while retaining Sornio branding. The requested
scope is the business admin; no online store or checkout is introduced.

| Work area | Existing modules |
| --- | --- |
| Home | Daily work, alerts |
| Sales | Bills and receipts, counter sales, barcode tools |
| Finances | Collections, expenses, balances, money entries |
| Customers | Customers, memberships, appointments, check-ins, reminders, marketing |
| Products | Items and prices, stock levels, suppliers |
| Analytics | Exports, business overview, margins, comparisons, insights |
| Settings | Preferences, business details, team access, security and backup, activity history, subscription |

`lib/workspace.ts` is the single grouping source. It consumes links already
resolved by the business portal, deduplicates them and never adds a module.
Only the current work area's tools expand in the sidebar and drawer. The home
screen has one primary job, a compact quick-action list, real business summaries,
a catalogue/bill setup checklist derived from saved records, and recent bills.
The sidebar stays in view while scrolling, and search occupies the admin header.
Saved bills have payment-status filters, search and chronological sorting.
A searchable tool directory opens deliberately; the complete catalogue is not
placed in front of the owner on every visit. Specialist overviews remain reachable.

## Bill flow

1. Home → Make a bill → `/billing/new`.
2. Select a catalogue item or enter a custom item/service. Catalogue selection
   carries the existing product ID, name, category and price into the bill.
3. Save once through the existing `createInvoice` command. It already posts
   revenue, stock and customer dues together; this redesign adds the missing
   catalogue selection to that UI without replacing its accounting rules.
4. Open the saved bill in `/billing?invoice=...`, then collect or print.
5. Confirm money received through the existing collection flow. Saving a bill
   alone remains unpaid. Custom lines do not change stock.

Counter sales remain a separate, clearly labelled existing path for recording
payment and stock together. They are not silently converted into invoices.
Stock shortages and repeated product quantities are still validated by the same
posting commands. No schema, balance migration or settlement policy changes.

## Access and search

- Business types retain their existing module boundaries and vocabulary.
- Paid tools still use the independent plan gate; missing access is not granted
  by grouping a link or by opening search.
- `/billing/new` inherits the existing `/billing` portal and plan boundary.
- Search navigates to jobs and tools. Business-type changes live in Business
  details, where the owner can see what they are changing.
- Existing role, counter-lock, sign-in and server-side guards remain in place.

## Scope

This pass redesigns workspace navigation, the daily home, search, bill creation
and saved bills. It retains the existing customer, stock, membership and report
forms inside the new structure. Native offline Windows operation and LAN sync
remain the separate engineering work described in the master blueprint.

The approved Sornio artwork and ten-theme appearance system are retained.
New copy has English fallbacks pending native-language review.

## Navigation state regression

Server navigation can supply a newly serialized identity object for the same
owner. Previously, that object retriggered vault hydration and could replace a
just-recorded payment with the last saved unpaid snapshot before the write
debounce completed. Hydration now depends on the user/business storage scope.
A lifecycle regression test verifies that same-owner navigation preserves the
payment while a different account still loads its own saved records.
