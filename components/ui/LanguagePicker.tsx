'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LANGUAGES, useI18n, type LanguageCode } from '@/lib/i18n';

/** English plus all 22 languages in the Eighth Schedule of the Constitution. */
export function LanguagePicker({
  align = 'right',
  compact = false,
}: {
  align?: 'left' | 'right';
  compact?: boolean;
}) {
  const { lang, setLang, languageName, ready } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const choose = (code: LanguageCode) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-700 transition hover:border-brand-400/40 hover:text-stone-900 ${compact ? 'h-11 w-11 p-0 md:h-auto md:w-auto md:px-2.5 md:py-1.5' : 'px-3 py-2'}`}
        aria-label="Choose language"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="listbox"
        title={compact ? 'Choose language' : undefined}
      >
        <Globe size={compact ? 14 : 13} className={ready ? 'text-brand-600' : 'animate-pulse text-brand-600'} />
        <span data-i18n-ignore="true" className={compact ? 'hidden md:inline' : undefined}>{languageName}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="listbox"
          aria-label="Choose language"
          className={`absolute top-full z-[80] mt-2 max-h-[min(28rem,70vh)] w-64 overflow-y-auto rounded-2xl border border-stone-200 bg-panel/98 p-2 shadow-2xl backdrop-blur-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <p className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600">
            English + all 22 scheduled languages
          </p>
          {LANGUAGES.map((language) => {
            const active = language.code === lang;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                key={language.code}
                onClick={() => choose(language.code)}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? 'bg-brand-500/15 text-brand-700' : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'}`}
              >
                <span>
                  <span data-i18n-ignore="true" lang={language.locale}>{language.native}</span>
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
