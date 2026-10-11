/**
 * Portal blueprints.
 *
 * Eight businesses, eight consoles. Each blueprint answers the same three
 * questions for its trade:
 *
 *   1. Which modules does this business actually open every day?
 *   2. What are those modules called in this trade?
 *   3. What does the owner want to know the second the app opens?
 *
 * The `excluded` line is deliberate and visible in the product: the fastest way
 * to lose an owner's trust is to fill their screen with a counter they will
 * never use — inventory in a gym, memberships in a kirana, a stylist day-book
 * in a phone shop. Every portal states what it left out and how to get it back.
 *
 * Pure data — no React, no icons, no store — so Edge middleware can enforce the
 * same decisions the UI renders.
 */

import type { ModuleKey, PortalBlueprint, PortalId, PortalVocabulary } from './types';

/** Modules every business gets: money in, money out, and the picture. */
const MONEY: ModuleKey[] = ['payments', 'expenses', 'transactions', 'cashflow', 'profitability'];
/** Modules every business gets: seeing and understanding the numbers. */
const ANALYSIS: ModuleKey[] = ['dashboard', 'insights', 'alerts', 'reports', 'comparisons'];

/** Fill a vocabulary object so a portal never has to spell out all ten words. */
function vocab(overrides: Partial<PortalVocabulary> = {}, base: Partial<PortalVocabulary> = {}): PortalVocabulary {
  return {
    customers: 'Customers',
    customerOne: 'Customer',
    catalog: 'Products',
    catalogOne: 'Product',
    stock: 'Inventory',
    sale: 'Sales',
    saleOne: 'Invoice',
    plans: 'Memberships',
    staff: 'Team',
    desk: 'Counter',
    ...base,
    ...overrides,
  };
}

export const PORTAL_BLUEPRINTS: PortalBlueprint[] = [
  // ---------------------------------------------------------------- gym ----
  {
    id: 'gym',
    templateId: 'template-gym',
    name: 'Gym & Fitness',
    tagline: 'Plans, members, renewals — and the floor',
    category: 'fitness',
    icon: 'gym',
    promise: 'Plans, members, check-ins, renewals and collections. Everything a gym runs on — and nothing that belongs in a shop.',
    excluded:
      'No inventory, no stock shelves, no counter billing and no supplier chain. A gym’s stock is its equipment, not goods. If you also sell supplements at the desk, switch Stock on from Business Setup and it appears instantly.',
    examples: ['Neighbourhood gyms', 'CrossFit boxes', 'Yoga & Pilates studios', 'Personal-training studios'],
    accent: { rgb: '15 118 110', deepRgb: '4 47 46', label: 'Studio teal' },
    capture: {
      label: 'Front-desk pad',
      what: 'A finger on the pad, and the phone number as the everyday fallback',
      channels: ['fingerprint', 'keypad'],
      note: 'A gym’s desk reads fingers, not packets — there is no barcode counter here, and nothing will ever ask you to scan a product. If you sell supplements off a shelf, move to General Business: every record comes with you.',
      symbologies: [],
      jobs: [
        { href: '/check-ins', label: 'Fingerprint check-in at the front desk' },
        { href: '/memberships', label: 'Enrol a member’s finger when they join' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'memberships',
      'checkins',
      'reminders',
      'customers',
      'marketing',
    ],
    terms: vocab({
      customers: 'Members',
      customerOne: 'Member',
      catalog: 'Retail shelf',
      catalogOne: 'Retail item',
      stock: 'Retail stock',
      sale: 'Enrolment',
      saleOne: 'Enrolment receipt',
      plans: 'Plans',
      staff: 'Trainers',
      desk: 'Front desk',
    }),
    nav: [
      {
        title: 'The Floor',
        links: [
          { href: '/home', label: 'Front Desk' },
          { href: '/check-ins', label: 'Check-ins & Fingerprint', keywords: 'attendance in out floor today biometric finger enrol' },
          { href: '/memberships', label: 'Plans & Members' },
          { href: '/reminders', label: 'Renewals' },
          { href: '/customers', label: 'Members' },
        ],
      },
      {
        title: 'Money',
        links: [
          { href: '/payments', keywords: 'fees collected cash upi card' },
          { href: '/expenses', keywords: 'rent equipment electricity salaries' },
          { href: '/transactions' },
          { href: '/cashflow' },
          { href: '/profitability' },
        ],
      },
      {
        title: 'Growth',
        links: [
          { href: '/marketing', keywords: 'offers ads referrals trial' },
          { href: '/dashboard', label: 'Performance' },
          { href: '/insights' },
          { href: '/alerts' },
          { href: '/reports' },
          { href: '/comparisons' },
        ],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Front desk',
      headline: 'Your floor, right now',
      blurb: 'Who is training today, whose plan lapses this week, and what came in at the desk.',
      tiles: [
        { label: 'Checked in today', metric: 'checkedInToday', caption: 'entries at the front desk' },
        { label: 'Renewals due (7 days)', metric: 'renewalsDue7', caption: 'chase these before they lapse' },
        { label: 'Active members', metric: 'activeMembers', caption: 'plans currently running' },
        { label: 'Collected this month', metric: 'monthRevenue', caption: 'fees received' },
      ],
      actions: [
        { href: '/check-ins', label: 'Check in a member', primary: true },
        { href: '/memberships', label: 'Renew a plan' },
        { href: '/payments', label: 'Record a payment' },
      ],
      focus: {
        kind: 'renewals',
        title: 'Renewals due this week',
        href: '/memberships',
        cta: 'Open plans & members',
        empty: 'No plan lapses in the next 7 days. Retention is under control.',
      },
    },
  },

  // --------------------------------------------------------------- cafe ----
  {
    id: 'cafe',
    templateId: 'template-cafe',
    name: 'Cafe & Restaurant',
    tagline: 'Menu, orders, covers and the pantry',
    category: 'hospitality',
    icon: 'cafe',
    promise: 'The menu, the counter, the pantry and the daily closing — built around covers, turn time and what actually sells.',
    excluded:
      'No memberships and no renewal chasing. A café serves guests, not subscribers — you will never be asked to send a renewal SMS here. Recurring plans can be turned on from Business Setup if you run subscriptions.',
    examples: ['Cafés & bakeries', 'Cloud kitchens', 'Dhabas & quick-service restaurants', 'Tea & juice counters'],
    accent: { rgb: '180 83 9', deepRgb: '69 26 3', label: 'Roast amber' },
    capture: {
      label: 'Counter scanner',
      what: 'Sealed bottles, tins and takeaway packs that already carry a barcode',
      channels: ['barcode', 'keypad'],
      note: 'Anything the kitchen makes is billed from the menu, not scanned — a dosa has no barcode. Packaged goods the counter sells over the top do, so the scanner is here for those.',
      symbologies: ['EAN-13', 'EAN-8', 'Code 128', 'QR'],
      jobs: [
        { href: '/scan', label: 'Scan a bottle or packet onto a bill' },
        { href: '/inventory', label: 'Scan the pantry delivery in' },
        { href: '/products', label: 'Print a label for a house-made pack' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'scan',
      'inventory',
      'sales',
      'billing',
      'customers',
      'suppliers',
      'marketing',
    ],
    terms: vocab({
      customers: 'Guests',
      customerOne: 'Guest',
      catalog: 'Menu',
      catalogOne: 'Dish',
      stock: 'Pantry',
      sale: 'Counter',
      saleOne: 'Bill',
      plans: 'Subscriptions',
      staff: 'Kitchen & floor team',
      desk: 'Counter',
    }),
    nav: [
      {
        title: 'Service',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/sales', label: 'Counter', keywords: 'order table parcel bill' },
          { href: '/scan', label: 'Scan Station', keywords: 'barcode bottle packet scanner' },
          { href: '/billing', label: 'Bills' },
          { href: '/products', label: 'Menu' },
          { href: '/inventory', label: 'Pantry', keywords: 'ingredients wastage recipes' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Guests & Vendors',
        links: [
          { href: '/customers', label: 'Guests' },
          { href: '/suppliers', label: 'Vendors' },
          { href: '/marketing', keywords: 'offers instagram festive' },
        ],
      },
      {
        title: 'Analysis',
        links: [{ href: '/dashboard' }, { href: '/insights' }, { href: '/alerts', keywords: 'expiry pantry' }, { href: '/reports' }, { href: '/comparisons' }],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Service',
      headline: 'Covers, kitchen and closing',
      blurb: 'What the counter took today, which dishes pull the crowd, and what the pantry is running out of.',
      tiles: [
        { label: 'Sales today', metric: 'todaySales', caption: 'counter + parcel' },
        { label: 'Average bill', metric: 'avgBill', caption: 'per order today' },
        { label: 'Pantry value', metric: 'stockValue', caption: 'at cost, on the shelf' },
        { label: 'Items to reorder', metric: 'reorderCount', caption: 'at or below reorder level' },
      ],
      actions: [
        { href: '/scan', label: 'Scan a bottle', primary: true },
        { href: '/sales', label: 'New order' },
        { href: '/products', label: 'Update the menu' },
        { href: '/expenses', label: 'Log an expense' },
      ],
      focus: {
        kind: 'reorder',
        title: 'Pantry items to reorder',
        href: '/inventory',
        cta: 'Open pantry',
        empty: 'Nothing is below its reorder level. The kitchen is covered.',
      },
    },
  },

  // ------------------------------------------------------------- kirana ----
  {
    id: 'kirana',
    templateId: 'template-grocery',
    name: 'Kirana & Grocery',
    tagline: 'Counter, stock and udhaar khata',
    category: 'retail',
    icon: 'kirana',
    promise: 'Fast counter billing, stock that turns daily, and the udhaar khata you already keep in your head — now written down and chased for you.',
    excluded:
      'No memberships, no appointment book, no service bookings. A kirana runs on turn and trust, not subscribers. WhatsApp reminders stay off until you want them.',
    examples: ['Kirana & general stores', 'Fruit & vegetable shops', 'Dairy & bakery counters', 'Mini supermarkets'],
    accent: { rgb: '29 78 216', deepRgb: '23 37 84', label: 'Ledger blue' },
    capture: {
      label: 'Counter scanner',
      what: 'Every packet in the shop — and your own labels for loose atta, dal, sugar and rice',
      channels: ['barcode', 'keypad'],
      note: 'Goods that arrive without a barcode are not a problem: DukaanOS prints its own label (an internal code, or an in-store EAN-13 that carries the weight the scale read out), and any scanner in the shop reads it. No fingerprint pad — a kirana knows its customers by name.',
      symbologies: ['EAN-13', 'EAN-8', 'UPC-A', 'ITF-14 (carton)', 'Code 128', 'Code 39'],
      jobs: [
        { href: '/scan', label: 'Bill a customer by scanning' },
        { href: '/scan', label: 'Weigh loose grain and print the label' },
        { href: '/scan', label: 'Receive the market delivery into stock' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'scan',
      'inventory',
      'sales',
      'billing',
      'customers',
      'suppliers',
      'marketing',
    ],
    terms: vocab({
      customers: 'Khata',
      customerOne: 'Customer',
      catalog: 'Items',
      catalogOne: 'Item',
      stock: 'Stock',
      sale: 'Counter billing',
      saleOne: 'Bill',
      plans: 'Plans',
      staff: 'Helpers',
      desk: 'Counter',
    }),
    nav: [
      {
        title: 'Counter',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/sales', label: 'Counter Billing', keywords: 'quick bill weight kg' },
          { href: '/scan', label: 'Scan & Bill', keywords: 'barcode scanner packet loose weigh label' },
          { href: '/billing', label: 'Bills' },
          { href: '/products', label: 'Items', keywords: 'rate mrp wholesale' },
          { href: '/inventory', label: 'Stock', keywords: 'reorder quantity racks' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Khata & Vendors',
        links: [
          { href: '/customers', label: 'Udhaar Khata', keywords: 'udhaar credit balance collect' },
          { href: '/suppliers', label: 'Vendors', keywords: 'mandi purchase' },
          { href: '/marketing', keywords: 'festive offers' },
        ],
      },
      {
        title: 'Analysis',
        links: [{ href: '/dashboard' }, { href: '/insights' }, { href: '/alerts', keywords: 'expiry stock' }, { href: '/reports' }, { href: '/comparisons' }],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Counter',
      headline: 'Counter, stock and khata',
      blurb: 'What the counter took, who still owes you, and what needs to come in from the market tomorrow.',
      tiles: [
        { label: 'Counter sales today', metric: 'todaySales', caption: 'cash + upi + card' },
        { label: 'Udhaar outstanding', metric: 'udhaarOutstanding', caption: 'open in the khata' },
        { label: 'Stock value', metric: 'stockValue', caption: 'at cost, on the racks' },
        { label: 'Items to reorder', metric: 'reorderCount', caption: 'at or below reorder level' },
      ],
      actions: [
        { href: '/scan', label: 'Scan & bill', primary: true },
        { href: '/sales', label: 'Type a bill' },
        { href: '/products', label: 'Add an item' },
        { href: '/payments', label: 'Collect pending' },
      ],
      focus: {
        kind: 'udhaar',
        title: 'Udhaar to collect',
        href: '/customers',
        cta: 'Open udhaar khata',
        empty: 'Every khata is settled. Nobody owes you anything today.',
      },
    },
  },

  // -------------------------------------------------------------- salon ----
  {
    id: 'salon',
    templateId: 'template-salon',
    name: 'Salon & Spa',
    tagline: 'Services, stylists and the day book',
    category: 'service',
    icon: 'salon',
    promise: 'Services, stylists, the appointment book and prepaid packages — the day book a salon actually runs on.',
    excluded:
      'No pantry stock and no supplier chain. Colour, foil and towels are consumables, not inventory to be counted. Turn Stock on from Business Setup the day you start retailing products off the shelf.',
    examples: ['Salons & barbershops', 'Spas & wellness centres', 'Nail & makeup studios', 'Bridal studios'],
    accent: { rgb: '190 24 93', deepRgb: '80 7 36', label: 'Blush rose' },
    capture: {
      label: 'Reception',
      what: 'The day book and the client’s number — nothing is scanned',
      channels: ['keypad'],
      note: 'No scanner at the reception. Colour, foil and towels are consumables, not stock to be counted, so a barcode counter would only be in the way here. The day you retail take-home products off a shelf, General Business carries the scanner and your clients stay exactly where they are.',
      symbologies: [],
      jobs: [
        { href: '/appointments', label: 'Book and complete a slot' },
        { href: '/memberships', label: 'Sell a prepaid package' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'appointments',
      'memberships',
      'reminders',
      'customers',
      'sales',
      'billing',
      'marketing',
    ],
    terms: vocab({
      customers: 'Clients',
      customerOne: 'Client',
      catalog: 'Services',
      catalogOne: 'Service',
      stock: 'Retail stock',
      sale: 'Counter',
      saleOne: 'Bill',
      plans: 'Packages',
      staff: 'Stylists',
      desk: 'Reception',
    }),
    nav: [
      {
        title: 'Reception',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/appointments', label: 'Day Book', keywords: 'appointment slot stylist time' },
          { href: '/customers', label: 'Clients' },
          { href: '/memberships', label: 'Packages', keywords: 'prepaid bridal package' },
          { href: '/products', label: 'Services', keywords: 'menu of services price chart' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/sales', label: 'Counter' }, { href: '/billing', label: 'Bills' }, { href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Growth',
        links: [
          { href: '/reminders', label: 'Follow-ups' },
          { href: '/marketing', keywords: 'offers festive instagram' },
          { href: '/dashboard' },
          { href: '/insights' },
          { href: '/alerts' },
          { href: '/reports' },
          { href: '/comparisons' },
        ],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team', label: 'Stylists & Roles' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Reception',
      headline: 'Today in the salon',
      blurb: 'Who is booked, what the chairs earned, and which prepaid packages are running low.',
      tiles: [
        { label: 'Appointments today', metric: 'appointmentsToday', caption: 'in the day book' },
        { label: 'Service revenue today', metric: 'todaySales', caption: 'counter + packages' },
        { label: 'Active packages', metric: 'activeMembers', caption: 'prepaid clients' },
        { label: 'Clients on file', metric: 'clientsOnFile', caption: 'with phone numbers' },
      ],
      actions: [
        { href: '/appointments', label: 'Add a booking', primary: true },
        { href: '/sales', label: 'Bill a service' },
        { href: '/customers', label: 'Add a client' },
      ],
      focus: {
        kind: 'appointments',
        title: 'Today’s day book',
        href: '/appointments',
        cta: 'Open the day book',
        empty: 'No bookings today yet. Add the first one — walk-ins can be billed from the counter.',
      },
    },
  },

  // -------------------------------------------------------- electronics ----
  {
    id: 'electronics',
    templateId: 'template-electronics',
    name: 'Electronics & Mobiles',
    tagline: 'Catalogue, serial stock, warranty',
    category: 'electronics',
    icon: 'electronics',
    promise: 'Catalogue, serial-tracked stock, warranty records and formal billing for high-value sales.',
    excluded:
      'No memberships and no salon-style day book. A phone shop sells devices and service jobs, not subscriptions — nothing here will ask you to chase renewals.',
    examples: ['Mobile & accessory shops', 'Home-appliance dealers', 'Computer & laptop stores', 'CCTV & electrical dealers'],
    accent: { rgb: '14 116 144', deepRgb: '8 51 68', label: 'Circuit cyan' },
    capture: {
      label: 'Counter scanner',
      what: 'Model boxes, IMEI/serial stickers and accessory packets — every unit becomes traceable at the second it is scanned',
      channels: ['barcode', 'keypad'],
      note: 'One scan does three jobs here: it bills the line, records the serial for warranty, and moves that exact unit out of serial stock. Case codes on a carton (ITF-14) are read at goods-inward, not at the counter.',
      symbologies: ['EAN-13', 'UPC-A', 'ITF-14 (carton)', 'Code 128 (IMEI)', 'Code 39', 'QR (warranty)'],
      jobs: [
        { href: '/scan', label: 'Scan the IMEI box onto the bill' },
        { href: '/scan', label: 'Receive a consignment into serial stock' },
        { href: '/billing', label: 'Invoice the sale with the serial on it' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'scan',
      'inventory',
      'sales',
      'billing',
      'customers',
      'suppliers',
      'marketing',
    ],
    terms: vocab({
      customers: 'Customers',
      catalog: 'Catalogue',
      catalogOne: 'Model',
      stock: 'Serial stock',
      sale: 'Sales',
      saleOne: 'Invoice',
      staff: 'Team',
      desk: 'Counter',
    }),
    nav: [
      {
        title: 'Counter',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/sales', label: 'Sales' },
          { href: '/scan', label: 'Scan Station', keywords: 'imei serial barcode model sticker' },
          { href: '/billing', label: 'Invoices & Warranty', keywords: 'warranty serial imei' },
          { href: '/products', label: 'Catalogue', keywords: 'model brand variant' },
          { href: '/inventory', label: 'Serial Stock', keywords: 'imei model stock' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Partners & Growth',
        links: [
          { href: '/customers' },
          { href: '/suppliers', label: 'Vendors', keywords: 'distributor purchase' },
          { href: '/marketing', keywords: 'exchange offers festive' },
          { href: '/dashboard' },
          { href: '/insights' },
          { href: '/alerts', keywords: 'dead stock slow moving' },
          { href: '/reports' },
          { href: '/comparisons' },
        ],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Counter',
      headline: 'Stock, sales and warranty',
      blurb: 'What moved today, what is sitting on the shelf too long, and which bills are still open.',
      tiles: [
        { label: 'Sales today', metric: 'todaySales', caption: 'devices + accessories' },
        { label: 'Stock value', metric: 'stockValue', caption: 'at cost, on the shelf' },
        { label: 'Open invoices', metric: 'pendingInvoices', caption: 'awaiting payment' },
        { label: 'Models to reorder', metric: 'reorderCount', caption: 'at or below reorder level' },
      ],
      actions: [
        { href: '/scan', label: 'Scan a sale', primary: true },
        { href: '/sales', label: 'New sale' },
        { href: '/billing', label: 'Raise an invoice' },
        { href: '/products', label: 'Add a model' },
      ],
      focus: {
        kind: 'reorder',
        title: 'Models running low',
        href: '/inventory',
        cta: 'Open serial stock',
        empty: 'Every model is above its reorder level. Nothing needs a purchase order today.',
      },
    },
  },

  // ----------------------------------------------------------- boutique ----
  {
    id: 'boutique',
    templateId: 'template-boutique',
    name: 'Boutique & Fashion',
    tagline: 'Collections, sizes, stock turn',
    category: 'fashion',
    icon: 'boutique',
    promise: 'Collections, sizes, colours, fast billing and festive campaigns — the rhythm a clothing store actually runs on.',
    excluded:
      'No memberships and no appointment book by default. Your client walks in to buy or to collect a stitched order — if you take trial appointments, switch Bookings on from Business Setup.',
    examples: ['Boutiques & readymade stores', 'Tailors & stitching units', 'Footwear & accessory shops', 'Kids-wear stores'],
    accent: { rgb: '124 58 237', deepRgb: '46 16 101', label: 'Atelier violet' },
    capture: {
      label: 'Counter scanner',
      what: 'Design tags — size and colour — plus a shop-made label on every stitched order',
      channels: ['barcode', 'keypad'],
      note: 'A readymade tag already scans; a stitched order gets a DukaanOS internal code on the order slip, so the same tag works when the client comes to collect. Nothing is scanned at the trial room, only at the counter.',
      symbologies: ['EAN-13', 'Code 128', 'Code 39 (small tags)'],
      jobs: [
        { href: '/scan', label: 'Bill a set at the counter' },
        { href: '/scan', label: 'Label a stitched order and scan it at collection' },
        { href: '/inventory', label: 'Receive the season’s stock by carton' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'scan',
      'inventory',
      'sales',
      'billing',
      'customers',
      'suppliers',
      'marketing',
    ],
    terms: vocab({
      customers: 'Clients',
      customerOne: 'Client',
      catalog: 'Collections',
      catalogOne: 'Design',
      stock: 'Stock',
      sale: 'Sales',
      saleOne: 'Bill',
      staff: 'Team',
      desk: 'Counter',
    }),
    nav: [
      {
        title: 'Store',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/sales', label: 'Sales', keywords: 'size colour trial' },
          { href: '/scan', label: 'Scan & Tag', keywords: 'tag barcode design size label' },
          { href: '/billing', label: 'Bills' },
          { href: '/products', label: 'Collections', keywords: 'design size colour fabric' },
          { href: '/inventory', label: 'Stock', keywords: 'size rack season' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Clients & Vendors',
        links: [
          { href: '/customers', label: 'Clients' },
          { href: '/suppliers', label: 'Vendors', keywords: 'wholesale supplier' },
          { href: '/marketing', keywords: 'festive season offers lookbook' },
        ],
      },
      {
        title: 'Analysis',
        links: [{ href: '/dashboard' }, { href: '/insights' }, { href: '/alerts', keywords: 'dead stock slow moving sizes' }, { href: '/reports' }, { href: '/comparisons' }],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Store',
      headline: 'Collections and the season',
      blurb: 'What sold today, which sizes are drying up, and what the season needs next.',
      tiles: [
        { label: 'Sales today', metric: 'todaySales', caption: 'counter + stitching' },
        { label: 'Average bill', metric: 'avgBill', caption: 'per client today' },
        { label: 'Stock value', metric: 'stockValue', caption: 'at cost, on the racks' },
        { label: 'Clients on file', metric: 'clientsOnFile', caption: 'with phone numbers' },
      ],
      actions: [
        { href: '/scan', label: 'Scan & bill', primary: true },
        { href: '/sales', label: 'New sale' },
        { href: '/products', label: 'Add a design' },
        { href: '/marketing', label: 'Plan a campaign' },
      ],
      focus: {
        kind: 'reorder',
        title: 'Sizes and designs to restock',
        href: '/inventory',
        cta: 'Open stock',
        empty: 'Every design is above its reorder level. The racks are healthy.',
      },
    },
  },

  // ------------------------------------------------------------ service ----
  {
    id: 'service',
    templateId: 'template-service',
    name: 'Services & Studio',
    tagline: 'Services, bookings and invoices',
    category: 'service',
    icon: 'service',
    promise: 'A service menu, a booking book, client records and clean invoices — for repair shops, tuition classes, consultants and studios.',
    excluded:
      'No stock shelves and no membership plans. You sell your time and your skill, so the console only carries what you bill for. Both can be switched on from Business Setup if that changes.',
    examples: ['Repair & service centres', 'Tuition & coaching classes', 'Consultants & agencies', 'Photography & event studios'],
    accent: { rgb: '3 105 161', deepRgb: '8 47 73', label: 'Workshop sky' },
    capture: {
      label: 'The desk',
      what: 'Job numbers, service tags and the client’s number',
      channels: ['qr', 'keypad'],
      note: 'You bill time and skill, so there is no product scanner at this desk. Job cards and service tags get a scannable number from the catalogue when you need one — and if parts start moving off a shelf, General Business carries the full scan station.',
      symbologies: ['QR', 'Code 128'],
      jobs: [
        { href: '/appointments', label: 'Take in a job with a scannable tag' },
        { href: '/billing', label: 'Bill the job and the parts on it' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'appointments',
      'customers',
      'billing',
      'reminders',
      'marketing',
    ],
    terms: vocab({
      customers: 'Clients',
      customerOne: 'Client',
      catalog: 'Services',
      catalogOne: 'Service',
      stock: 'Parts',
      sale: 'Counter',
      saleOne: 'Invoice',
      plans: 'Contracts',
      staff: 'Team',
      desk: 'Desk',
    }),
    nav: [
      {
        title: 'The Desk',
        links: [
          { href: '/home', label: 'Today' },
          { href: '/appointments', label: 'Bookings', keywords: 'appointment slot class batch' },
          { href: '/products', label: 'Services', keywords: 'rate card packages hours' },
          { href: '/customers', label: 'Clients' },
          { href: '/reminders', label: 'Follow-ups' },
        ],
      },
      {
        title: 'Money',
        links: [{ href: '/billing', label: 'Invoices' }, { href: '/payments' }, { href: '/expenses' }, { href: '/transactions' }, { href: '/cashflow' }, { href: '/profitability' }],
      },
      {
        title: 'Growth',
        links: [
          { href: '/marketing', keywords: 'ads referrals offers' },
          { href: '/dashboard' },
          { href: '/insights' },
          { href: '/alerts' },
          { href: '/reports' },
          { href: '/comparisons' },
        ],
      },
      {
        title: 'Platform',
        links: [{ href: '/business' }, { href: '/team' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'The desk',
      headline: 'Bookings, jobs and billing',
      blurb: 'What is booked today, which invoices are still open, and who needs a follow-up call.',
      tiles: [
        { label: 'Bookings today', metric: 'appointmentsToday', caption: 'in the book' },
        { label: 'Open invoices', metric: 'pendingInvoices', caption: 'awaiting payment' },
        { label: 'Billed today', metric: 'todaySales', caption: 'jobs completed' },
        { label: 'Clients on file', metric: 'clientsOnFile', caption: 'with phone numbers' },
      ],
      actions: [
        { href: '/appointments', label: 'Add a booking', primary: true },
        { href: '/billing', label: 'Raise an invoice' },
        { href: '/customers', label: 'Add a client' },
      ],
      focus: {
        kind: 'appointments',
        title: 'Today’s bookings',
        href: '/appointments',
        cta: 'Open the booking book',
        empty: 'Nothing booked today. Add a booking or bill a walk-in from invoices.',
      },
    },
  },

  // ------------------------------------------------------------ general ----
  {
    id: 'general',
    templateId: 'template-general',
    name: 'General Business',
    tagline: 'Every module, on',
    category: 'general',
    icon: 'general',
    promise: 'Every module switched on, because a mixed business sells goods, services and plans in the same week.',
    excluded:
      'Nothing is hidden in this portal — it is the honest default for a business that does a bit of everything. Pick a sharper portal whenever one fits, and your records stay exactly where they are.',
    examples: ['Mixed retail + services', 'New businesses still finding shape', 'Wholesale + retail'],
    accent: { rgb: '40 98 59', deepRgb: '17 50 31', label: 'DukaanOS green' },
    capture: {
      label: 'Full capture — every channel',
      what: 'Barcodes at the counter, weigh-scale labels for loose goods, fingerprints at a front desk, and the keypad when a label is torn',
      channels: ['barcode', 'fingerprint', 'keypad'],
      note: 'A mixed business does all of it in one week, so nothing is left out: the scan station bills and receives, the check-in desk takes a finger, and every code you mint yourself is printable and scannable from the same screen.',
      symbologies: ['EAN-13', 'EAN-8', 'UPC-A', 'ITF-14 (carton)', 'Code 128', 'Code 39', 'QR'],
      jobs: [
        { href: '/scan', label: 'Scan a counter sale' },
        { href: '/scan', label: 'Receive stock by scanning the carton' },
        { href: '/scan', label: 'Print a label for anything uncoded' },
        { href: '/check-ins', label: 'Take a fingerprint at the front desk' },
      ],
    },
    modules: [
      ...ANALYSIS,
      ...MONEY,
      'catalog',
      'scan',
      'inventory',
      'checkins',
      'appointments',
      'sales',
      'billing',
      'memberships',
      'reminders',
      'customers',
      'suppliers',
      'marketing',
    ],
    terms: vocab(),
    nav: [
      {
        title: 'Overview',
        links: [{ href: '/home' }, { href: '/dashboard' }, { href: '/insights' }, { href: '/alerts' }],
      },
      {
        title: 'Operations',
        links: [
          { href: '/products' },
          { href: '/inventory' },
          { href: '/check-ins' },
          { href: '/appointments' },
          { href: '/sales' },
          { href: '/scan' },
          { href: '/billing' },
          { href: '/marketing' },
        ],
      },
      {
        title: 'People',
        links: [
          { href: '/memberships' },
          { href: '/reminders' },
          { href: '/customers' },
          { href: '/suppliers' },
          { href: '/team' },
        ],
      },
      {
        title: 'Money',
        links: [
          { href: '/payments' },
          { href: '/expenses' },
          { href: '/transactions' },
          { href: '/cashflow' },
          { href: '/profitability' },
        ],
      },
      {
        title: 'Analysis',
        links: [{ href: '/reports' }, { href: '/comparisons' }, { href: '/subscription' }, { href: '/audit' }, { href: '/security' }, { href: '/settings' }],
      },
    ],
    cockpit: {
      eyebrow: 'Overview',
      headline: 'Everything, in one place',
      blurb: 'Sales, stock, plans and cash — one console for a business that does a bit of everything.',
      tiles: [
        { label: 'Sales today', metric: 'todaySales', caption: 'counter + online' },
        { label: 'Net profit', metric: 'netProfit', caption: 'recorded so far' },
        { label: 'Cash position', metric: 'cashPosition', caption: 'cash in hand' },
        { label: 'Customers on file', metric: 'clientsOnFile', caption: 'with phone numbers' },
      ],
      actions: [
        { href: '/scan', label: 'Scan a sale', primary: true },
        { href: '/sales', label: 'Record a sale' },
        { href: '/products', label: 'Add a product' },
        { href: '/expenses', label: 'Record an expense' },
      ],
      focus: {
        kind: 'recent',
        title: 'Latest activity',
        href: '/transactions',
        cta: 'Open the ledger',
        empty: 'Nothing recorded yet. Every balance starts at zero and moves only when you record real activity.',
      },
    },
  },
];

/** Portal shown before a business type is chosen — and the safe fallback. */
export const DEFAULT_PORTAL_ID: PortalId = 'general';
