const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),WebSocket=require('ws');
const ROOT=path.resolve(__dirname,'../dist');
// Exercise the shipped Firebase SDK, with a local read-only wire fixture. GET
// succeeds but does not retain the root cache when only children are subscribed.
test('shipped Firebase SDK retains complete Board data through a transaction only while a root listener is attached',async()=>{
 const data={app:{live:{day:'2026-11-18',revision:5},config:{schema:1,tables:[{id:'L5'}]},reservations:{existing:{name:'Fixture guest',people:8}},bookingPublicRateLimits:{untouched:true}}};
 const server=new WebSocket.Server({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve));
 const port=server.address().port,requests=[],timers=new Set(),read=p=>p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data)??null;
 server.on('connection',socket=>{
  const send=x=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(x));};
  send({t:'c',d:{t:'h',d:{ts:Date.now(),v:'5',h:'127.0.0.1:'+port,s:'fixture'}}});
  socket.on('message',buffer=>{const text=buffer.toString();if(text==='0')return;const packet=JSON.parse(text),request=packet.d;if(packet.t!=='d')return;requests.push(request);
   if(request.a==='p'||request.a==='m'){send({t:'d',d:{r:request.r,b:{s:'permission_denied',d:'Read-only fixture'}}});return;}
   const respond=()=>{if(request.a==='q')send({t:'d',d:{a:'d',b:{p:request.b.p,d:read(request.b.p)}}});send({t:'d',d:{r:request.r,b:{s:'ok',d:request.a==='g'?read(request.b.p):{}}}});};
   if(request.a==='q'){const timer=setTimeout(()=>{timers.delete(timer);respond();},15);timers.add(timer);}else respond();
  });
 });
 const dom=new JSDOM('',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;w.WebSocket=WebSocket;
 const watches=[];let app;
 try{
  for(const name of ['firebase-app-compat.js','firebase-database-compat.js','transport.js'])w.eval(fs.readFileSync(path.join(ROOT,name),'utf8'));
  app=w.firebase.initializeApp({databaseURL:'https://cache-fixture.firebaseio.com'},'cache-test');const db=app.database();db.useEmulator('127.0.0.1',port);db.INTERNAL.forceWebSockets();const ref=db.ref('app');
  for(const key of ['live','config','reservations']){const child=ref.child(key),fn=()=>{};child.on('value',fn);watches.push(()=>child.off('value',fn));}
  const root=await ref.get();assert.equal(root.val().live.revision,5);
  let before='unset';await ref.transaction(value=>{before=value;return undefined;},undefined,false);assert.equal(before,null,'reproduce the failed SAVE precondition after GET');
  const connection=Object.create(w.HostConnection.prototype);connection.ref=ref;connection.connected=true;
  let after;const result=await connection.boardTransaction(value=>{after=value;return undefined;});
  assert.equal(result.committed,false);assert.equal(after.live.revision,5);assert.equal(after.reservations.existing.people,8);assert.equal(after.bookingPublicRateLimits.untouched,true);
  assert.equal(requests.filter(r=>r.a==='p'||r.a==='m').length,0,'diagnostic never writes');
  let cleaned='unset';await ref.transaction(value=>{cleaned=value;return undefined;},undefined,false);assert.equal(cleaned,null,'temporary root listener is removed after completion');
 }finally{for(const off of watches)off();if(app)await app.delete();dom.window.close();for(const timer of timers)clearTimeout(timer);for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
});
