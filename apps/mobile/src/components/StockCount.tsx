import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { countDraft, displayCount, type CountDraft } from '../../../../packages/business-domain/src/stock-count-draft.ts';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';
import { createSecureStore } from '../storage/secureStore';
import { stockCounts } from '../storage/stockCounts';

export function StockCount({ productId, observedMilli, snapshotAt }: { productId: string; observedMilli: string; snapshotAt: string }) {
  const { session } = useCompanion(); const { palette } = useTheme();
  const [open, setOpen] = useState(false), [typed, setTyped] = useState(''), [saved, setSaved] = useState<CountDraft | null>(null);
  const [message, setMessage] = useState('Opening saved count…'), [busy, setBusy] = useState(false), [ready, setReady] = useState(false); const submitting = useRef(false);
  const businessId = session?.business.businessId, actorId = session?.userId, mode = session?.mode;
  useEffect(() => {
    let current = true;
    setReady(false); setSaved(null); setTyped('');
    if (open && businessId && actorId && mode) {
      Promise.resolve().then(() => stockCounts(createSecureStore(true), { businessId, actorId, mode }).read(productId)).then(value => {
        if (current) { setReady(true); setSaved(value); setTyped(value ? displayCount(value.countedMilli) : ''); setMessage(value ? 'Saved on this device. Review against current stock before recording a correction.' : 'Count stock in the item’s selling unit.'); }
      }).catch(() => { if (current) setMessage('The saved count could not be opened securely. Close and reopen to retry.'); });
    }
    return () => { current = false; };
  }, [open, businessId, actorId, mode, productId]);
  async function save(remove = false) {
    if (!ready || submitting.current || !businessId || !actorId || !mode) return;
    submitting.current = true; setBusy(true);
    try {
      const scope = { businessId, actorId, mode }; const store = stockCounts(createSecureStore(true), scope);
      if (remove) { await store.remove(productId); setSaved(null); setTyped(''); setMessage('Saved count removed from this device.'); }
      else { const next = countDraft(scope, productId, observedMilli, typed, snapshotAt); await store.save(next); setSaved(next); setMessage('Count saved securely on this device. Stock has not been changed or synced.'); }
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'The count could not be saved.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  const actionStyle = { minHeight: 48, justifyContent: 'center' as const };
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled: busy }} disabled={busy} onPress={() => { if (!open) { setReady(false); setSaved(null); setTyped(''); setMessage('Opening saved count…'); } setOpen(v => !v); }} style={actionStyle}><Text style={{ color: palette.ink }}>{open ? 'Close stock count' : 'Count this item'}</Text></Pressable>
    {open ? <View style={{ gap: 8 }}><Text style={{ color: palette.muted }}>Offline count draft{mode === 'demo' ? ' · Demo data' : ''}. Review and apply corrections in the authoritative POS.</Text>
      <TextInput accessibilityLabel="Counted quantity in selling units" keyboardType="decimal-pad" editable={!busy} maxLength={16} value={typed} onChangeText={setTyped} placeholder="Counted quantity" placeholderTextColor={palette.muted} style={{ minHeight:48, color:palette.ink, borderColor:palette.line, borderWidth:1, padding:12 }}/>
      <Text accessibilityLiveRegion="polite" style={{ color:palette.ink }}>{message}</Text>
      {saved && (saved.observedMilli !== observedMilli || saved.snapshotAt !== snapshotAt) ? <Text style={{ color:palette.muted }}>Shop stock or snapshot changed since this draft was saved. Recount before applying any correction.</Text> : null}
      {saved ? <Text style={{ color:palette.muted }}>Saved count: {displayCount(saved.countedMilli)} · {saved.savedAt}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled:busy || !typed || !ready }} disabled={busy || !typed || !ready} onPress={() => void save()} style={actionStyle}><Text style={{ color:palette.ink }}>{busy ? 'Saving…' : 'Save count on this device'}</Text></Pressable>
      {saved ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save(true)} style={actionStyle}><Text style={{ color:palette.ink }}>Remove saved count</Text></Pressable> : null}</View> : null}
  </View>;
}
