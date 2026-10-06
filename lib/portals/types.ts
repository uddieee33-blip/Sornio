/**
 * Portal system — types.
 *
 * A *portal* is not a theme. It is a decision about what a specific kind of
 * business actually needs, made once and then enforced everywhere:
 *
 *   • the sidebar only offers modules that business uses,
 *   • the wording is the wording of that trade ("Members", not "Customers"),
 *   • the cockpit opens on the question that owner asks first thing,
 *   • and the modules that would only add noise are switched off at the edge,
 *     not merely hidden in the UI.
 *
 * Everything in this file is plain data so the Edge middleware can import it
 * without pulling React, icons, or the store into the request path.
 */

export type PortalId =
  | 'gym'
  | 'cafe'
  | 'kirana'
  | 'salon'
  | 'electronics'
  | 'boutique'
  | 'service'
  | 'general';

/**
 * Every module DukaanOS can render, keyed by the thing it does — never by the
 * business type. A portal is a selection of these.
 */
export type ModuleKey =
  | 'cockpit'
  | 'dashboard'
  | 'insights'
  | 'alerts'
  | 'business'
  | 'catalog'
  | 'scan'
  | 'inventory'
  | 'checkins'
  | 'appointments'
  | 'sales'
  | 'billing'
  | 'payments'
  | 'expenses'
  | 'transactions'
  | 'marketing'
  | 'memberships'
  | 'reminders'
  | 'customers'
  | 'suppliers'
  | 'team'
  | 'cashflow'
  | 'profitability'
  | 'reports'
  | 'comparisons'
  | 'audit'
  | 'security'
  | 'settings';

export type IconName =
  // business-type marks
  | 'gym'
  | 'cafe'
  | 'kirana'
  | 'salon'
  | 'electronics'
  | 'boutique'
  | 'service'
  | 'general'
  // modules
  | 'cockpit'
  | 'dashboard'
  | 'insights'
  | 'alerts'
  | 'business'
  | 'catalog'
  | 'scan'
  | 'fingerprint'
  | 'inventory'
  | 'checkins'
  | 'appointments'
  | 'sales'
  | 'billing'
  | 'payments'
  | 'expenses'
  | 'transactions'
  | 'marketing'
  | 'memberships'
  | 'reminders'
  | 'customers'
  | 'suppliers'
  | 'team'
  | 'cashflow'
  | 'profitability'
  | 'reports'
  | 'comparisons'
  | 'audit'
  | 'security'
  | 'settings';

/** A cockpit figure a portal can feature, resolved live from the ledger. */
export type MetricKey =
  | 'todaySales'
  | 'todayCollected'
  | 'monthRevenue'
  | 'expensesThisMonth'
  | 'netProfit'
  | 'cashPosition'
  | 'activeMembers'
  | 'renewalsDue7'
  | 'checkedInToday'
  | 'membersOnFile'
  | 'clientsOnFile'
  | 'stockValue'
  | 'reorderCount'
  | 'udhaarOutstanding'
  | 'appointmentsToday'
  | 'avgBill'
  | 'pendingInvoices';

/** Which live list a portal puts in front of the owner on the cockpit. */
export type FocusKey = 'renewals' | 'appointments' | 'reorder' | 'udhaar' | 'checkins' | 'recent';

/**
 * The words this trade uses. Never a cosmetic rename: the same override feeds
 * the navigation, the cockpit, the empty states, and the export headers.
 */
export type PortalVocabulary = {
  /** Plural noun for the people who pay this business. */
  customers: string;
  /** Singular. */
  customerOne: string;
  /** What the business sells, plural. */
  catalog: string;
  /** What the business sells, singular. */
  catalogOne: string;
  /** Goods held for sale. */
  stock: string;
  /** The act of selling / billing. */
  sale: string;
  /** One sale document. */
  saleOne: string;
  /** The recurring-plan module, plural. */
  plans: string;
  /** Staff, in this trade's language. */
  staff: string;
  /** Where money is taken. */
  desk: string;
};

export type PortalAccent = {
  /** Space-separated RGB so Tailwind can apply opacity: `15 118 110`. */
  rgb: string;
  /** Deeper tone for gradients and headers. */
  deepRgb: string;
  /** Human name, for the setup screen. */
  label: string;
};

export type PortalNavItem = {
  href: string;
  /** Portal-specific label; falls back to the canonical module label. */
  label?: string;
  /** Overrides the canonical icon (e.g. Scissors for Services). */
  icon?: IconName;
  /** Extra search terms for ⌘K, in the words of this trade. */
  keywords?: string;
};

export type PortalNavSection = {
  title: string;
  links: PortalNavItem[];
};

export type PortalTile = {
  label: string;
  metric: MetricKey;
  /** One line of context under the number. */
  caption?: string;
};

export type PortalAction = {
  href: string;
  label: string;
  primary?: boolean;
};

export type PortalCockpit = {
  /** Small label above the greeting, in this trade's language. */
  eyebrow: string;
  /** The question this owner opens the app to answer. */
  headline: string;
  blurb: string;
  tiles: PortalTile[];
  actions: PortalAction[];
  focus: {
    kind: FocusKey;
    title: string;
    href: string;
    cta: string;
    /** Shown when the list is empty — reads as reassurance, not failure. */
    empty: string;
  };
};

/** How a counter can capture an identifier — the channels a blueprint chooses from. */
export type CaptureChannel = 'barcode' | 'qr' | 'keypad' | 'fingerprint';

/**
 * How this trade captures an identifier at its desk.
 *
 * This is the scanning half of a portal, decided once per business type and
 * enforced like everything else: a gym's console offers a fingerprint pad and
 * never a barcode counter, a kirana's counter offers the scanner and says
 * plainly that it has no fingerprint pad. The `note` is shown in the product, so
 * the omission is a statement rather than a gap.
 */
export type PortalCapture = {
  /** Where the setup screen files this under, e.g. "Counter scanner", "Front-desk pad". */
  label: string;
  /** What the trade actually reads, in its own words. */
  what: string;
  /** The channels this desk uses. Order matters: the first is the default. */
  channels: ('barcode' | 'qr' | 'keypad' | 'fingerprint')[];
  /** Why the channels that are missing are missing. Shown to the owner. */
  note: string;
  /** Symbologies that show up in this trade, named as the labels name them. */
  symbologies: string[];
  /** The jobs the scanner is put to, linked to the screens that do them. */
  jobs: { href: string; label: string }[];
};

export type PortalBlueprint = {
  id: PortalId;
  /** The onboarding template this portal belongs to (`template-gym`, …). */
  templateId: string;
  name: string;
  /** One-line identity, used in the sidebar tag and ⌘K. */
  tagline: string;
  category: 'fitness' | 'hospitality' | 'retail' | 'service' | 'electronics' | 'fashion' | 'general';
  icon: IconName;
  /** What this portal gives the owner. Written for the owner, not for us. */
  promise: string;
  /**
   * What this portal deliberately leaves out, and why. Stating the omission
   * plainly is the whole point: an owner should feel understood, not sold to.
   */
  excluded: string;
  /** Real-world businesses this portal was designed with. */
  examples: string[];
  accent: PortalAccent;
  /** How this trade reads a code or a finger at the desk. */
  capture: PortalCapture;
  /** Modules switched on. Core modules are always on and are not listed here. */
  modules: ModuleKey[];
  terms: PortalVocabulary;
  nav: PortalNavSection[];
  cockpit: PortalCockpit;
};
