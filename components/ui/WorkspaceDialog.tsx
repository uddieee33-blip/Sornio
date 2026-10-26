'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native top-layer modality: background inertness, focus containment and Escape. */
export function WorkspaceDialog({ children, label, onClose, className = '' }: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`workspace-dialog ${className}`}
      onKeyDown={(event) => {
        // Native modality makes the background inert, but Chromium can still
        // send Tab to browser chrome at the last control. Wrap both directions
        // using the live controls, including after a dialog changes steps.
        if (event.key !== 'Tab' || event.target instanceof Element && event.target.closest('dialog') !== event.currentTarget) return;
        const dialog = event.currentTarget;
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
        )).filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') &&
          !node.closest('[inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {children}
    </dialog>
  );
}

