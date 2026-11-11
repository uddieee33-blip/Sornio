import { useEffect, useState } from 'react';
import { reorderItems } from '../../../packages/business-domain/src/business-profiles.ts';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal.ts';
import { invoke } from './native';
import { errorCode, errorMessage } from './access';
import { quantity, type Product } from './billing-types';

export function GroceryStockPanel({ refreshToken, onLocked }: { refreshToken: number; onLocked: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [unit, setUnit] = useState('pcs'), [threshold, setThreshold] = useState('5');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    invoke<Product[]>('list_local_products').then(items => { if (active) { setProducts(items); setError(''); } })
      .catch((caught: unknown) => { if (active) { setProducts(null); if (errorCode(caught) === 'locked') onLocked(); else setError(errorMessage(caught, 'Stock review could not be loaded.')); } });
    return () => { active = false; };
  }, [refreshToken, retry, onLocked]);
  const milli = parseFixedDecimal(threshold, unit === 'pcs' ? 0 : 3);
  const thresholdMilli = milli === null ? null : unit === 'pcs' ? milli * 1000 : milli;
  const rows = products && thresholdMilli !== null ? reorderItems(products, unit, thresholdMilli) : [];
  return <section className="panel" aria-labelledby="grocery-review-heading">
    <p className="eyebrow">GROCERY & KIRYANA</p><h2 id="grocery-review-heading">Plan the next delivery.</h2>
    <p>Review stock at or below your threshold. These are current saved quantities; held bills do not reserve stock.</p>
    <div className="grocery-filters"><label>Selling unit<select value={unit} onChange={e => { setUnit(e.target.value); setThreshold('5'); }}>
      {['pcs', 'kg', 'litre', 'metre'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>At or below<input inputMode="decimal" value={threshold} maxLength={15} onChange={e => setThreshold(e.target.value)}/></label>
      <button type="button" className="quiet-button" onClick={() => setRetry(v => v + 1)}>Refresh stock review</button></div>
    {error ? <p role="alert">{error}</p> : thresholdMilli === null ? <p role="alert">Enter a valid {unit === 'pcs' ? 'whole number' : 'quantity with up to 3 decimal places'}.</p> : products === null ? <p role="status">Opening saved stock…</p> : <>
      <p role="status">{rows.length} items to review · {unit}</p>
      {rows.length ? <table><thead><tr><th>Item</th><th>Saved barcode / SKU</th><th>On hand</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.sku || 'No saved code'}</td><td>{quantity(item.stockMilli)} {item.unit}</td></tr>)}</tbody></table> : <p>No items are at or below this threshold.</p>}
      <p className="muted">Use Items & stock below to record an actual delivery or count correction.</p></>}
  </section>;
}
