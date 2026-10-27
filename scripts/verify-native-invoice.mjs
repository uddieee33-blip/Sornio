import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),out=mkdtempSync(join(tmpdir(),'sornio-native-money-'));
try {
 execFileSync(process.execPath,[require.resolve('typescript/lib/tsc.js'),'packages/business-domain/src/native-invoice.ts','--outDir',out,'--target','es2022','--module','commonjs','--skipLibCheck','--ignoreConfig'],{stdio:'inherit'});
 const {calculateNativeInvoice:c}=require(join(out,'native-invoice.js'));
 for(const f of JSON.parse(readFileSync('packages/business-domain/fixtures/native-invoices.json','utf8'))){assert.deepEqual(c([{quantityMilli:f.quantity,unitPricePaise:f.price}],f.bps),{lineTotalsPaise:[f.line],subtotalPaise:f.line,taxPaise:f.tax,totalPaise:f.total});}
 for(const q of [0,-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>c([{quantityMilli:q,unitPricePaise:100}],0));
 assert.throws(()=>c([{quantityMilli:9000000000000,unitPricePaise:9000000000000}],0));
 assert.throws(()=>c([],0));assert.throws(()=>c([{quantityMilli:1000,unitPricePaise:0}],0));
 console.log('Native invoice shared rounding fixtures and invalid/overflow checks passed.');
}finally{rmSync(out,{recursive:true,force:true});}
