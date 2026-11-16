import type {KitchenStaffView} from './kitchen-staff.ts';
import type { RestaurantMenu, RestaurantItem } from './restaurant.ts';
export const KOT_STATES = ['pending','preparing','ready','served'] as const;
export type KotState=typeof KOT_STATES[number];
export type KitchenChange={kind:'added'|'removed'|'quantity'|'instructions';description:string;before:string;after:string};
export type KitchenCorrection={id:string;orderId:string;kind:'correction';changes:KitchenChange[];createdAt:string};
export type KitchenDestination={id:string;name:string;layout:'58mm'|'80mm'|'a4'};
export type KitchenPrint={jobId:string;destination:string;layout:KitchenDestination['layout'];ticket:{id:string;orderId:string;kind:'kot'|'correction';items?:RestaurantItem[];changes?:KitchenChange[];state?:KotState}};
export type KitchenView={destinations:KitchenDestination[];corrections:KitchenCorrection[];jobs:{id:string;ticketId:string;ticketKind:string;destinationId:string;state:'requested'|'operator_confirmed'|'operator_cancelled'}[]};
export type PaidKitchenTicket={id:string;orderId:string;kind:'dine_in'|'takeaway';tableName:string|null;actorId:string|null;displayName:string|null;items:RestaurantItem[];state:KotState;revision:number};
export type RestaurantSnapshot={kitchenStaff?:KitchenStaffView;paidKitchen?:PaidKitchenTicket[];acceptedBatches?:{id:string;orderId:string;items:RestaurantItem[]}[];schemaVersion:1;source:'shop';businessId:string;generatedAt:string;tables:{id:string;name:string}[];orders:{id:string;tableId:string|null;kind:'dine_in'|'takeaway';state:string;revision:number}[];tickets:{id:string;orderId:string;items:RestaurantItem[];state:KotState;revision:number}[];menu:(RestaurantMenu&{pricePaise:number})[];assignments:{orderId:string;actorId:string|null;displayName:string|null;checkoutState:string}[]};
export type RestaurantDraft={version:1;id:string;businessId:string;actorId:string;mode:'demo'|'live';kind:'dine_in'|'takeaway';tableId:string|null;items:{productId:string;label:string;quantityMilli:number;note:string}[];savedAt:string};
export type RestaurantCommand={version:1;commandId:string;businessId:string;orderId:string;expectedRevision:number;kind:'submit_draft'|'kitchen_correction';payload:unknown};
/** Commands are coordination contracts only. No mobile sender or financial endpoint is enabled. */
export function kitchenChangeValid(c:KitchenChange):boolean{return ['added','removed','quantity','instructions'].includes(c.kind)&&c.description.trim().length>0&&c.description.length<=120&&c.before.length<=200&&c.after.length<=200&&!/[\u0000-\u001f\u007f]/.test(c.description+c.before+c.after);}
