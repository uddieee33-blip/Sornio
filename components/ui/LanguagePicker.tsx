'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LANGUAGES, useI18n, type LanguageCode } from '@/lib/i18n';

/** Compact dropdown listing all 22 scheduled Indian languages. */
export function LanguagePicker({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { lang, setLang, languageName } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (code: LanguageCode) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-brand-400/40 hover:text-stone-900"
        aria-label="Choose language"
      >
        <Globe size={13} className="text-brand-600" />
        {languageName}
      </button>

      {open ? (
        <div
          className={`absolute top-full z-50 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-stone-200 bg-panel/98 p-2 shadow-2xl backdrop-blur-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <p className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">22 Indian languages</p>
          {LANGUAGES.map((language) => {
            const active = language.code === lang;
            return (
              <button
                key={language.code}
                onClick={() => choose(language.code)}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? 'bg-brand-500/15 text-brand-200' : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'}`}
              >
                <span>
                  {language.native}
                  <span className="ml-1.5 text-xs text-stone-600">{language.name}</span>
                </span>
                {active ? <Check size={14} className="text-brand-600" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
