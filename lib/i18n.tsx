'use client';

/**
 * DukaanOS i18n — small-shop owners across India speak many languages,
 * so the product ships with India's 22 scheduled languages available.
 *
 * Core strings are fully translated for the major languages; any missing
 * key falls back to English, so nothing ever renders blank. New languages
 * are filled in by extending the dictionaries below.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type LanguageCode =
  | 'en' | 'hi' | 'pa' | 'mr' | 'bn' | 'ta' | 'te' | 'gu' | 'kn' | 'ml'
  | 'or' | 'ur' | 'as' | 'mai' | 'sat' | 'ks' | 'ne' | 'sd' | 'kok'
  | 'doi' | 'mni' | 'brx';

export const LANGUAGES: { code: LanguageCode; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी' },
  { code: 'mni', name: 'Manipuri', native: 'ꯃꯤꯇꯩꯂꯣꯟ' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो' },
];

export type I18nKey =
  | 'nav.signIn' | 'nav.openConsole' | 'nav.charts' | 'nav.upi' | 'nav.features' | 'nav.security' | 'nav.pricing'
  | 'hero.badge' | 'hero.titleA' | 'hero.titleB' | 'hero.sub' | 'hero.ctaStart' | 'hero.ctaConsole'
  | 'charts.sample' | 'zeroStart.line'
  | 'nav.why' | 'nav.compare' | 'nav.faq' | 'hero.promise'
  | 'why.title' | 'why.sub' | 'compare.title' | 'compare.sub' | 'faq.title' | 'pricing.sub';

type Dictionary = Partial<Record<I18nKey, string>>;

const en: Dictionary = {
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
};

const hi: Dictionary = {
  'nav.signIn': 'साइन इन करें',
  'nav.openConsole': 'कंसोल खोलें',
  'nav.charts': 'चार्ट',
  'nav.upi': 'UPI QR',
  'nav.features': 'मॉड्यूल्स',
  'nav.security': 'सुरक्षा',
  'nav.pricing': 'कीमतें',
  'hero.badge': 'हर तरह के कारोबार के लिए एक ही ऑपरेटिंग सिस्टम — जिम, कैफ़े, सैलून, दुकानें और भी बहुत कुछ',
  'hero.titleA': 'आपका कारोबार। आपका पैसा।',
  'hero.titleB': 'सीधे आपके बैंक में।',
  'hero.sub': 'DukaanOS आपकी बिलिंग, इन्वेंटरी, मेंबरशिप और रिपोर्ट्स एक ही लेजर में चलाता है। आपका कलेक्शन QR आपके अपने बैंक खाते से बनता है — ग्राहक सीधे आपको भुगतान करते हैं। कोई गेटवे नहीं। कोई बिचौलिया नहीं।',
  'hero.ctaStart': 'अपना कारोबार मुफ़्त शुरू करें',
  'hero.ctaConsole': 'लाइव कंसोल देखें',
  'charts.sample': 'सिर्फ़ सैंपल डेटा — कभी भी असली या मनगढ़ंत आँकड़े नहीं',
  'zeroStart.line': 'हर नया कारोबार शून्य से शुरू होता है। डैशबोर्ड का हर रुपया तभी दिखता है जब आप असली बिक्री या खर्च दर्ज करते हैं।',
  'nav.why': 'क्यों भुगतान करें',
  'nav.compare': 'तुलना',
  'nav.faq': 'सवाल',
  'hero.promise': 'स्टार्टर प्लान हमेशा मुफ़्त · 3 दिन का पूरा ट्रायल · ग्रोथ ₹499/महीना · न कार्ड, न ऑटो-डेबिट',
  'why.title': 'कारोबारी इसके लिए भुगतान क्यों करते हैं',
  'why.sub': 'डैशबोर्ड के लिए नहीं — उस पैसे के लिए जो डैशबोर्ड ढूँढ़ देता है।',
  'compare.title': 'हमेशा मुफ़्त, या भुगतान के साथ पूरा ऑटोमेशन',
  'compare.sub': 'कंसोल दोनों में एक ही है। बदलता है तो बस यह कि वह आपके लिए कितना काम खुद करता है।',
  'faq.title': 'सीधे जवाब',
  'pricing.sub': 'कीमत पूरे कारोबार की है — हर बिल या काउंटर की नहीं, और आपकी कलेक्शन से कोई हिस्सा नहीं।',
};

const pa: Dictionary = {
  'nav.signIn': 'ਸਾਈਨ ਇਨ ਕਰੋ',
  'nav.openConsole': 'ਕਨਸੋਲ ਖੋਲ੍ਹੋ',
  'nav.charts': 'ਚਾਰਟ',
  'nav.upi': 'UPI QR',
  'nav.features': 'ਮੋਡਿਊਲ',
  'nav.security': 'ਸੁਰੱਖਿਆ',
  'nav.pricing': 'ਕੀਮਤਾਂ',
  'hero.badge': 'ਹਰ ਕਿਸਮ ਦੇ ਕਾਰੋਬਾਰ ਲਈ ਇੱਕੋ ਓਪਰੇਟਿੰਗ ਸਿਸਟਮ — ਜਿਮ, ਕੈਫ਼ੇ, ਸੈਲੂਨ, ਦੁਕਾਨਾਂ ਅਤੇ ਹੋਰ ਵੀ',
  'hero.titleA': 'ਤੁਹਾਡਾ ਕਾਰੋਬਾਰ। ਤੁਹਾਡਾ ਪੈਸਾ।',
  'hero.titleB': 'ਸਿੱਧਾ ਤੁਹਾਡੇ ਬੈਂਕ ਵਿੱਚ।',
  'hero.sub': 'DukaanOS ਤੁਹਾਡੀ ਬਿਲਿੰਗ, ਇਨਵੈਂਟਰੀ, ਮੈਂਬਰਸ਼ਿਪ ਅਤੇ ਰਿਪੋਰਟਾਂ ਇੱਕੋ ਲੈਜਰ ਵਿੱਚ ਚਲਾਉਂਦਾ ਹੈ। ਤੁਹਾਡਾ ਕਲੈਕਸ਼ਨ QR ਤੁਹਾਡੇ ਆਪਣੇ ਬੈਂਕ ਖਾਤੇ ਤੋਂ ਬਣਦਾ ਹੈ — ਗਾਹਕ ਸਿੱਧਾ ਤੁਹਾਨੂੰ ਭੁਗਤਾਨ ਕਰਦੇ ਹਨ। ਕੋਈ ਗੇਟਵੇ ਨਹੀਂ। ਕੋਈ ਵਿਚੌਲੀਆ ਨਹੀਂ।',
  'hero.ctaStart': 'ਆਪਣਾ ਕਾਰੋਬਾਰ ਮੁਫ਼ਤ ਸ਼ੁਰੂ ਕਰੋ',
  'hero.ctaConsole': 'ਲਾਈਵ ਕਨਸੋਲ ਵੇਖੋ',
  'charts.sample': 'ਸਿਰਫ਼ ਨਮੂਨਾ ਡਾਟਾ — ਕਦੇ ਵੀ ਅਸਲੀ ਜਾਂ ਮਨਘੜਤ ਅੰਕੜੇ ਨਹੀਂ',
  'zeroStart.line': 'ਹਰ ਨਵਾਂ ਕਾਰੋਬਾਰ ਜ਼ੀਰੋ ਤੋਂ ਸ਼ੁਰੂ ਹੁੰਦਾ ਹੈ। ਡੈਸ਼ਬੋਰਡ ਦਾ ਹਰ ਰੁਪਈਆ ਉਦੋਂ ਹੀ ਦਿਖਦਾ ਹੈ ਜਦੋਂ ਤੁਸੀਂ ਅਸਲੀ ਵਿਕਰੀ ਜਾਂ ਖਰਚਾ ਦਰਜ ਕਰਦੇ ਹੋ।',
};

const mr: Dictionary = {
  'nav.signIn': 'साइन इन करा',
  'nav.openConsole': 'कन्सोल उघडा',
  'nav.charts': 'चार्ट्स',
  'nav.upi': 'UPI QR',
  'nav.features': 'मॉड्यूल्स',
  'nav.security': 'सुरक्षा',
  'nav.pricing': 'किंमती',
  'hero.badge': 'प्रत्येक व्यवसायासाठी एकच ऑपरेटिंग सिस्टम — जिम, कॅफे, सलून, दुकाने आणि बरेच काही',
  'hero.titleA': 'तुमचा व्यवसाय. तुमचे पैसे.',
  'hero.titleB': 'थेट तुमच्या बँकेत.',
  'hero.ctaStart': 'तुमचा व्यवसाय मोफत सुरू करा',
  'hero.ctaConsole': 'लाइव्ह कन्सोल पहा',
};

const bn: Dictionary = {
  'nav.signIn': 'সাইন ইন করুন',
  'nav.openConsole': 'কনসোল খুলুন',
  'hero.titleA': 'আপনার ব্যবসা। আপনার টাকা।',
  'hero.titleB': 'সোজা আপনার ব্যাঙ্কে।',
  'hero.ctaStart': 'বিনামূল্যে আপনার ব্যবসা শুরু করুন',
};

const ta: Dictionary = {
  'nav.signIn': 'சைன் இன்',
  'nav.openConsole': 'கன்சோலைத் திறக்கவும்',
  'hero.titleA': 'உங்கள் வணிகம். உங்கள் பணம்.',
  'hero.titleB': 'நேராக உங்கள் வங்கிக்கு.',
  'hero.ctaStart': 'உங்கள் வணிகத்தை இலவசமாகத் தொடங்குங்கள்',
};

const te: Dictionary = {
  'nav.signIn': 'సైన్ ఇన్ చేయండి',
  'nav.openConsole': 'కన్సోల్ తెరవండి',
  'hero.titleA': 'మీ వ్యాపారం. మీ డబ్బు.',
  'hero.titleB': 'నేరుగా మీ బ్యాంకుకు.',
  'hero.ctaStart': 'మీ వ్యాపారాన్ని ఉచితంగా ప్రారంభించండి',
};

const gu: Dictionary = {
  'nav.signIn': 'સાઇન ઇન કરો',
  'nav.openConsole': 'કન્સોલ ખોલો',
  'hero.titleA': 'તમારો ધંધો. તમારો પૈસો.',
  'hero.titleB': 'સીધો તમારા બેંકમાં.',
  'hero.ctaStart': 'તમારો ધંધો મફત શરૂ કરો',
};

const ur: Dictionary = {
  'nav.signIn': 'سائن اِن کریں',
  'nav.openConsole': 'کنسول کھولیں',
  'hero.titleA': 'آپ کا کاروبار۔ آپ کا پیسہ۔',
  'hero.titleB': 'سیدھا آپ کے بینک میں۔',
  'hero.ctaStart': 'اپنا کاروبار مفت شروع کریں',
};

const dictionaries: Record<LanguageCode, Dictionary> = {
  en, hi, pa, mr, bn, ta, te, gu, ur,
  kn: {}, ml: {}, or: {}, as: {}, mai: {}, sat: {}, ks: {}, ne: {}, sd: {}, kok: {}, doi: {}, mni: {}, brx: {},
};

const STORAGE_KEY = 'dukaanos-language';

type I18nContextValue = {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  t: (key: I18nKey) => string;
  languageName: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      // Deliberate post-mount read. The server always renders English, so
      // adopting the stored language during render would guarantee a hydration
      // mismatch; syncing once after mount is the SSR-safe way to pick it up.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
      if (saved && dictionaries[saved]) setLangState(saved);
    } catch {
      // Storage unavailable — stay on English.
    }
  }, []);

  const setLang = useCallback((code: LanguageCode) => {
    setLangState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: I18nKey) => dictionaries[lang][key] ?? en[key] ?? key;
    const languageName = LANGUAGES.find((l) => l.code === lang)?.native ?? 'English';
    return { lang, setLang, t, languageName };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
