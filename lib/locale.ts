/**
 * Locale shared by formatting helpers that are called outside React.
 *
 * The i18n provider updates this before its context consumers render. Helpers
 * still accept an explicit locale when a caller has one, while this value keeps
 * existing ledger/portal helpers locale-aware without coupling them to React.
 */
let activeLocale = 'en-IN';

export function setActiveFormattingLocale(locale: string): void {
  activeLocale = locale;
}

export function getActiveFormattingLocale(): string {
  return activeLocale;
}
