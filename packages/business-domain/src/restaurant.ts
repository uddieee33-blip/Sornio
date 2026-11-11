export type RestaurantMenu = {id:string;productId:string;category:string;label:string;variant:string;available:boolean};
export type RestaurantItem = {name:string;quantity:number;note:string;productId?:string;unitPricePaise?:number};
/** Exact accepted-item subtotal; legacy unpriced tickets must be repaired rather than billed. */
export function restaurantSubtotal(items:readonly RestaurantItem[]):number|null {
 let total=0n;for(const item of items){if(!item.productId||!Number.isSafeInteger(item.quantity)||item.quantity<1||!Number.isSafeInteger(item.unitPricePaise)||item.unitPricePaise!<0)return null;total+=BigInt(item.quantity)*BigInt(item.unitPricePaise!);if(total>9_000_000_000_000n)return null;}return Number(total);
}
