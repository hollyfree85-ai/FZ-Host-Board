const {test}=require('node:test'),assert=require('node:assert/strict');
const {makeBookingHandler,dueReminder}=require('./backend.cjs');
const {reservationTime}=require('../dist/core.js');
const date='2027-01-09',time='18:00',arrival=reservationTime(date,time),now=arrival-10800000;
const request={requestId:'12345678-1234-4234-9234-123456789abc',name:'Test Guest',date,time,people:6,channel:'email',email:'guest@example.com',consent:true};
test('confirmed only after save, idempotent retry, no overwrite, same slot supports separate bookings',async()=>{
 const rows=new Map();
 const book=makeBookingHandler({now:()=>now,verifyHuman:async()=>true,reservations:{child:id=>({transaction:async update=>{
 const next=update(rows.get(id)??null);if(next)rows.set(id,next);
 return {snapshot:{val:()=>rows.get(id)}};
 }})}});
 await assert.rejects(book({...request,people:5}));
 const first=await book(request);assert.deepEqual(await book(request),first);
 await assert.rejects(book({...request,people:7}));
 await book({...request,requestId:'22345678-1234-4234-9234-123456789abc'});
 assert.equal(rows.size,2);
 const row=rows.get(first.reference);
 assert.equal(dueReminder(row,arrival-7200000,reservationTime).minutes,120);
 assert.equal(dueReminder(row,arrival-3600000,reservationTime).minutes,60);
 assert.equal(dueReminder({...row,status:'deleted'},arrival-3600000,reservationTime),null);
 assert.equal(dueReminder({...row,online:{...row.online,consentAt:arrival-5000000}},arrival-6000000,reservationTime),null);
});
