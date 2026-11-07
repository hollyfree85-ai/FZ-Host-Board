const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../dist/core.js');const {cleanup}=require('../scripts/reservation-cleanup.cjs');
const at=1794000000000,now=at+72*3600000,deleted={status:'deleted',deletedAt:at,phone:'5551234'};
test('Reservation undo expires exactly 72 hours after deletion',()=>{
 assert.equal(C.reservationUndoAvailable(deleted,now-1),true);
 assert.equal(C.reservationUndoAvailable(deleted,now),false);
 assert.equal(C.reservationUndoExpired(deleted,now),true);
 for(const r of [{...deleted,status:'scheduled'},{status:'deleted'},{status:'deleted',deletedAt:'bad'}])assert.equal(C.reservationUndoExpired(r,now),false);
});
test('Cleanup deletes only expired records with a fresh ETag guard',async()=>{
 const calls=[];const response=(value,status=200)=>({ok:status<300,status,json:async()=>value,headers:{get:()=> '"v1"'}});
 const fetcher=async(url,options={})=>{calls.push([url,options]);if(calls.length===1)return response({old:deleted,active:{...deleted,status:'scheduled'},recent:{...deleted,deletedAt:now-1}});if(options.method==='DELETE'){assert.equal(options.headers['if-match'],'"v1"');return response(null);}return response(deleted);};
 assert.deepEqual(await cleanup({now,fetcher}),{removed:1,conflicts:0});assert.equal(calls.length,3);
});
test('Cleanup preserves a reservation restored during cleanup and skips write conflicts',async()=>{
 let step=0;const response=(v,status=200)=>({ok:status<300,status,json:async()=>v,headers:{get:()=> '"v2"'}});
 const fetcher=async()=>{step++;return step===1?response({restored:deleted,changed:deleted}):step===2?response({...deleted,status:'scheduled'}):step===3?response(deleted):response(null,412);};
 assert.deepEqual(await cleanup({now,fetcher}),{removed:0,conflicts:1});assert.equal(step,4);
});
