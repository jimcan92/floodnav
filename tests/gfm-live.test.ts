import { writeFileSync, appendFileSync } from 'node:fs';
import { test } from 'vitest';
import { getObservedFloods } from '../client/src/lib/server/observedFloods';
test('temporary live validation',async()=>{
 const original=globalThis.fetch;
 writeFileSync('/tmp/floodnav-gfm-network.log','start\n');
 globalThis.fetch=async(...args)=>{const url=String(args[0]).startsWith('data:')?'decoder WASM':String(args[0]);appendFileSync('/tmp/floodnav-gfm-network.log',`START ${Date.now()} ${url}\n`);try{const r=await original(...args);appendFileSync('/tmp/floodnav-gfm-network.log',`END ${Date.now()} ${r.status} ${url}\n`);return r;}catch(e){appendFileSync('/tmp/floodnav-gfm-network.log',`FAIL ${String(e)}\n`);throw e;}};
 const oldWarn=console.warn;console.warn=(...args)=>appendFileSync('/tmp/floodnav-gfm-network.log',args.join(' ')+'\n');
 try{const data=await getObservedFloods([123.75,10.15,124.1,10.55]);writeFileSync('/tmp/floodnav-gfm-validation.json',JSON.stringify(data));}finally{globalThis.fetch=original;console.warn=oldWarn;}
},210000);
