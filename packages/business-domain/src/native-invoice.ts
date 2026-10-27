/** Native contract: integer paise, thousandths of a unit, tax in basis points.
 * Catalogue snapshots supplied by native storage, never renderer prices for posting.
 */
export function calculateNativeInvoice(lines: readonly {quantityMilli:number; unitPricePaise:number}[], taxBasisPoints:number) {
 const max=9_000_000_000_000;
 if (!lines.length || lines.length>100 || !Number.isSafeInteger(taxBasisPoints) || taxBasisPoints<0 || taxBasisPoints>10000) throw new Error('Invalid native invoice');
 const totals=lines.map(l=>{
  if (!Number.isSafeInteger(l.quantityMilli)||l.quantityMilli<=0||l.quantityMilli>max||!Number.isSafeInteger(l.unitPricePaise)||l.unitPricePaise<0||l.unitPricePaise>max) throw new Error('Invalid native line');
  const n=(BigInt(l.quantityMilli)*BigInt(l.unitPricePaise)+500n)/1000n;
  if(n>BigInt(max))throw new Error('Invoice overflow');return Number(n);
 });
 const subtotal=totals.reduce((n,v)=>n+BigInt(v),0n);
 const tax=(subtotal*BigInt(taxBasisPoints)+5000n)/10000n;
 if(subtotal<=0n||subtotal+tax>BigInt(max))throw new Error('Invoice overflow');
 return {lineTotalsPaise:totals,subtotalPaise:Number(subtotal),taxPaise:Number(tax),totalPaise:Number(subtotal+tax)};
}
