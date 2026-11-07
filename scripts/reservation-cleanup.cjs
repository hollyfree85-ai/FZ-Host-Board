const C=require('../dist/core.js');
const cfg=require('../dist/app-config.json');
async function cleanup({now=Date.now(),fetcher=fetch}={}){
 const base=cfg.databaseURL+'/'+cfg.path+'/reservations';
 const response=await fetcher(base+'.json');if(!response.ok)throw Error('Reservation read failed');
 const records=await response.json();let removed=0,conflicts=0;
 for(const [id,r]of Object.entries(records||{})){
  if(!C.reservationUndoExpired(r,now))continue;
  const url=base+'/'+encodeURIComponent(id)+'.json';
  const checked=await fetcher(url,{headers:{'X-Firebase-ETag':'true'}});if(!checked.ok)throw Error('Reservation verification failed');
  if(!C.reservationUndoExpired(await checked.json(),now))continue;
  const etag=checked.headers.get('etag');if(!etag)throw Error('Missing concurrency guard');
  const result=await fetcher(url,{method:'DELETE',headers:{'if-match':etag}});
  if(result.status===412){conflicts++;continue;}if(!result.ok)throw Error('Reservation cleanup failed');removed++;
 }
 return {removed,conflicts};
}
module.exports={cleanup};
if(require.main===module)cleanup().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
