export type KeyInput={key:string;altKey:boolean;metaKey:boolean;ctrlKey:boolean;shiftKey:boolean;repeat:boolean;isComposing:boolean};
/** Plain scanner Enter is never a financial confirmation. Called on the focused confirmation button only. */
export function deliberateCheckoutConfirm(e:KeyInput):boolean{return e.key==='Enter'&&!e.repeat&&!e.isComposing&&!e.ctrlKey&&!e.shiftKey&&(e.altKey!==e.metaKey);}
/** Mac Command aliases are navigation only. Existing function keys remain available. */
export function cashierNavigationKey(e:KeyInput):string|null{
 if(e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.shiftKey)return null;
 if(e.metaKey){if(e.key.toLowerCase()==='f')return 'F2';if(e.key.toLowerCase()==='b')return 'F4';return null;}
 return ['F2','F3','F4','F8','Escape'].includes(e.key)?e.key:null;
}
