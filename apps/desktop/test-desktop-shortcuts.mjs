import test from 'node:test';import assert from 'node:assert/strict';
import {deliberateCheckoutConfirm,cashierNavigationKey} from './src/desktop-shortcuts.ts';
const key=(extra={})=>({key:'Enter',altKey:false,metaKey:false,ctrlKey:false,shiftKey:false,repeat:false,isComposing:false,...extra});
test('focused confirmation accepts explicit Mac Command or Windows Alt, never scanner Enter',()=>{
 assert(!deliberateCheckoutConfirm(key()));assert(deliberateCheckoutConfirm(key({metaKey:true})));assert(deliberateCheckoutConfirm(key({altKey:true})));
 for(const extra of [{metaKey:true,altKey:true},{ctrlKey:true,metaKey:true},{metaKey:true,repeat:true},{metaKey:true,isComposing:true},{metaKey:true,shiftKey:true}])assert(!deliberateCheckoutConfirm(key(extra)));
});
test('Command aliases navigate only and preserve function keys and OS reload',()=>{
 assert.equal(cashierNavigationKey(key({key:'f',metaKey:true})),'F2');assert.equal(cashierNavigationKey(key({key:'b',metaKey:true})),'F4');
 for(const k of ['F2','F3','F4','F8','Escape'])assert.equal(cashierNavigationKey(key({key:k})),k);
 for(const k of ['Enter','r','q','p'])assert.equal(cashierNavigationKey(key({key:k,metaKey:true})),null);
 assert.equal(cashierNavigationKey(key({key:'f',metaKey:true,isComposing:true})),null);
});
