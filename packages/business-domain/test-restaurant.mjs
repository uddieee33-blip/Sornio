import test from 'node:test';import assert from 'node:assert/strict';
import {restaurantSubtotal} from './src/restaurant.ts';
test('accepted variants and separately priced add-ons retain integer paise',()=>{assert.equal(restaurantSubtotal([{productId:'large-pizza',name:'Pizza',note:'No onion',quantity:2,unitPricePaise:19999},{productId:'cheese',name:'Extra cheese',note:'',quantity:2,unitPricePaise:2500}]),44998);});
test('unpriced legacy lines, invalid quantities and overflow cannot be billed',()=>{for(const item of [{name:'legacy',quantity:1,note:''},{productId:'x',quantity:1.5,unitPricePaise:1},{productId:'x',quantity:2,unitPricePaise:9000000000000}])assert.equal(restaurantSubtotal([item]),null);});
