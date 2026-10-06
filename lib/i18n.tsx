'use client';

/**
 * Whole-product internationalisation for DukaanOS.
 *
 * English is the authored source language. Selecting a locale loads one static,
 * same-origin catalogue and translates rendered copy, dynamic messages,
 * placeholders, titles, and accessibility labels throughout the application.
 * The catalogue is generated from the complete TS/TSX source tree, so product
 * copy can stay beside the feature that owns it without silently falling back
 * to English on screens that do not call a translation hook themselves.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type LanguageCode =
  | 'en'
  | 'as'
  | 'bn'
  | 'brx'
  | 'doi'
  | 'gu'
  | 'hi'
  | 'kn'
  | 'kok'
  | 'ks'
  | 'mai'
  | 'ml'
  | 'mni'
  | 'mr'
  | 'ne'
  | 'or'
  | 'pa'
  | 'sa'
  | 'sat'
  | 'sd'
  | 'ta'
  | 'te'
  | 'ur';

export type Language = {
  code: LanguageCode;
  name: string;
  native: string;
  locale: string;
  dir?: 'rtl';
};

/** English plus every language in the Eighth Schedule of India's Constitution. */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English', locale: 'en-IN' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', locale: 'as-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', locale: 'bn-IN' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', locale: 'brx-IN' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', locale: 'doi-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', locale: 'gu-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', locale: 'hi-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', locale: 'kn-IN' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', locale: 'ks-IN', dir: 'rtl' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', locale: 'kok-IN' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', locale: 'mai-IN' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', locale: 'ml-IN' },
  { code: 'mni', name: 'Manipuri (Meitei)', native: 'ꯃꯤꯇꯩ ꯂꯣꯟ', locale: 'mni-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', locale: 'mr-IN' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', locale: 'ne-IN' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', locale: 'or-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', locale: 'pa-IN' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', locale: 'sa-IN' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', locale: 'sat-IN' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', locale: 'sd-IN', dir: 'rtl' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', locale: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', locale: 'te-IN' },
  { code: 'ur', name: 'Urdu', native: 'اردو', locale: 'ur-IN', dir: 'rtl' },
];

const CORE_MESSAGES = {
  'nav.signIn': 'Sign in',
  'nav.openConsole': 'Open console',
  'nav.charts': 'Charts',
  'nav.upi': 'UPI QR',
  'nav.features': 'Modules',
  'nav.security': 'Security',
  'nav.pricing': 'Pricing',
  'hero.badge': 'One operating system for every business — gyms, cafés, salons, shops & more',
  'hero.titleA': 'Your business. Your money.',
  'hero.titleB': 'Straight to your bank.',
  'hero.sub': 'DukaanOS runs your billing, inventory, memberships, and reports on one live ledger. Your collection QR comes from your own bank account — customers pay you directly. No gateway. No middleman. No liability.',
  'hero.ctaStart': 'Start your business — free',
  'hero.ctaConsole': 'Peek at the live console',
  'charts.sample': 'Sample data only — never real or fabricated business numbers',
  'zeroStart.line': 'Every new business starts at zero. Every rupee on your dashboard appears only when you record a real sale or expense.',
  'nav.why': 'Why pay',
  'nav.compare': 'Compare',
  'nav.faq': 'Questions',
  'hero.promise': 'Free plan forever · 3-day full trial · Growth ₹499/month · No card, no auto-debit',
  'why.title': 'Why owners pay for this',
  'why.sub': 'Not for a dashboard. For the money the dashboard finds.',
  'compare.title': 'Free forever, or paid and automated',
  'compare.sub': 'The same console either way. What changes is how much it chases for you.',
  'faq.title': 'Straight answers',
  'pricing.sub': 'Prices are per business — not per bill, not per counter, and never a cut of what you collect.',
} as const;

export type I18nKey = keyof typeof CORE_MESSAGES;
type Catalogue = Record<string, string>;
type TemplateTranslation = { regex: RegExp; translated: string };

const STORAGE_KEY = 'dukaanos-language';
const EMPTY_CATALOGUE: Catalogue = {};
const loadedCatalogues = new Map<LanguageCode, Catalogue>([['en', EMPTY_CATALOGUE]]);
const textSources = new WeakMap<Text, { source: string; output: string }>();
const attributeSources = new WeakMap<Element, Map<string, { source: string; output: string }>>();
const TRANSLATED_ATTRIBUTES = ['alt', 'aria-description', 'aria-label', 'placeholder', 'title'] as const;
const SKIPPED_ELEMENTS = new Set(['CODE', 'KBD', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG']);

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileTemplates(catalogue: Catalogue): TemplateTranslation[] {
  return Object.entries(catalogue)
    .filter(([source]) => /\{\{\d+\}\}/.test(source))
    .sort(([left], [right]) => right.length - left.length)
    .map(([source, translated]) => {
      let cursor = 0;
      let pattern = '';
      for (const match of source.matchAll(/\{\{(\d+)\}\}/g)) {
        pattern += escapeRegex(source.slice(cursor, match.index));
        pattern += `(.*?)`;
        cursor = (match.index ?? 0) + match[0].length;
      }
      pattern += escapeRegex(source.slice(cursor));
      return { regex: new RegExp(`^${pattern}$`, 'u'), translated };
    });
}

function translateValue(source: string, catalogue: Catalogue, templates: TemplateTranslation[]): string {
  const key = normalise(source);
  if (!key) return source;

  const exact = catalogue[key];
  if (exact) return exact;

  for (const template of templates) {
    const match = key.match(template.regex);
    if (!match) continue;
    return template.translated.replace(/\{\{(\d+)\}\}/g, (_, index: string) => match[Number(index) + 1] ?? '');
  }

  return key;
}

function shouldSkip(element: Element | null): boolean {
  if (!element) return false;
  if (SKIPPED_ELEMENTS.has(element.tagName)) return true;
  return Boolean(element.closest('[data-i18n-ignore="true"]'));
}

function translateTextNode(node: Text, catalogue: Catalogue, templates: TemplateTranslation[]) {
  if (shouldSkip(node.parentElement)) return;
  const current = node.data;
  let record = textSources.get(node);
  if (!record || current !== record.output) {
    record = { source: current, output: current };
    textSources.set(node, record);
  }

  const leading = record.source.match(/^\s*/)?.[0] ?? '';
  const trailing = record.source.match(/\s*$/)?.[0] ?? '';
  const core = normalise(record.source);
  const output = core ? `${leading}${translateValue(core, catalogue, templates)}${trailing}` : record.source;
  record.output = output;
  if (current !== output) node.data = output;
}

function translateElementAttributes(element: Element, catalogue: Catalogue, templates: TemplateTranslation[]) {
  if (shouldSkip(element)) return;
  let records = attributeSources.get(element);
  if (!records) {
    records = new Map();
    attributeSources.set(element, records);
  }

  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    let record = records.get(attribute);
    if (!record || current !== record.output) {
      record = { source: current, output: current };
      records.set(attribute, record);
    }
    const output = translateValue(record.source, catalogue, templates);
    record.output = output;
    if (current !== output) element.setAttribute(attribute, output);
  }
}

function translateTree(root: Node, catalogue: Catalogue, templates: TemplateTranslation[]) {
  if (root instanceof Text) {
    translateTextNode(root, catalogue, templates);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment) && !(root instanceof Document)) return;
  if (root instanceof Element) {
    if (shouldSkip(root)) return;
    translateElementAttributes(root, catalogue, templates);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateTextNode(node, catalogue, templates);
    else if (node instanceof Element) translateElementAttributes(node, catalogue, templates);
    node = walker.nextNode();
  }
}

type I18nContextValue = {
  lang: LanguageCode;
  locale: string;
  dir: 'ltr' | 'rtl';
  ready: boolean;
  setLang: (code: LanguageCode) => void;
  t: (key: I18nKey) => string;
  translate: (source: string) => string;
  languageName: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en');
  const [loaded, setLoaded] = useState<{ lang: LanguageCode; catalogue: Catalogue }>({ lang: 'en', catalogue: EMPTY_CATALOGUE });
  const [ready, setReady] = useState(true);
  const currentLanguage = LANGUAGES.find((language) => language.code === lang) ?? LANGUAGES[0];
  const catalogue = useMemo(
    () => (loaded.lang === lang ? loaded.catalogue : EMPTY_CATALOGUE),
    [lang, loaded],
  );
  const templates = useMemo(() => compileTemplates(catalogue), [catalogue]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && LANGUAGES.some((language) => language.code === saved)) {
        // Keep the server's English first render hydration-safe, then adopt the
        // persisted browser preference immediately after mounting.
        queueMicrotask(() => setLangState(saved));
      }
    } catch {
      // Storage unavailable — English remains the safe SSR-compatible default.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = currentLanguage.locale;
    document.documentElement.dir = currentLanguage.dir ?? 'ltr';
  }, [currentLanguage]);

  useEffect(() => {
    let cancelled = false;
    const cached = loadedCatalogues.get(lang);
    if (cached) {
      queueMicrotask(() => {
        if (!cancelled) {
          setLoaded({ lang, catalogue: cached });
          setReady(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setReady(false);
    });
    fetch(`/locales/${lang}.json`, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${lang} translations (${response.status})`);
        return response.json() as Promise<Catalogue>;
      })
      .then((nextCatalogue) => {
        loadedCatalogues.set(lang, nextCatalogue);
        if (!cancelled) {
          setLoaded({ lang, catalogue: nextCatalogue });
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        console.error('[i18n]', error);
        if (!cancelled) {
          setLoaded({ lang, catalogue: {} });
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    const apply = (root: Node = document.body) => translateTree(root, catalogue, templates);
    apply();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          apply(mutation.target);
        } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          translateElementAttributes(mutation.target, catalogue, templates);
        } else {
          mutation.addedNodes.forEach(apply);
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [catalogue, templates]);

  const setLang = useCallback((code: LanguageCode) => {
    setLangState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // A private browser may reject storage; language still changes in-session.
    }
  }, []);

  const translate = useCallback(
    (source: string) => translateValue(source, catalogue, templates),
    [catalogue, templates],
  );

  const t = useCallback((key: I18nKey) => translate(CORE_MESSAGES[key]), [translate]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      locale: currentLanguage.locale,
      dir: currentLanguage.dir ?? 'ltr',
      ready,
      setLang,
      t,
      translate,
      languageName: currentLanguage.native,
    }),
    [currentLanguage, lang, ready, setLang, t, translate],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
