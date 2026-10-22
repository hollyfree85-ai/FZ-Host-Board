const C=require('../dist/core.js');
const cfg=require('../dist/app-config.json');
async function reset({now=Date.now(),fetcher=fetch}={}) {
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(hour!==4)return {skipped:'Outside daily reset hour'};
 const base=cfg.databaseURL+'/'+cfg.path;
 const configResponse=await fetcher(base+'/config.json');if(!configResponse.ok)throw Error('Config read failed');
 const config=await configResponse.json();if(!config?.tables)throw Error('Configuration missing');
 for(let attempt=0;attempt<5;attempt++){
  const response=await fetcher(base+'/live.json',{headers:{'X-Firebase-ETag':'true'}});if(!response.ok)throw Error('Live read failed');
  const current=await response.json(),day=C.dayAt(now);if(current?.day>=day)return {skipped:'Already reset',day};
  const next=C.reduce(current,{id:'daily_'+day,type:'DAILY_RESET',at:now,day},config,now);
  const etag=response.headers.get('etag');if(!etag)throw Error('Missing concurrency guard');
  const saved=await fetcher(base+'/live.json',{method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},body:JSON.stringify(next)});
  if(saved.status===412)continue;if(!saved.ok)throw Error('Daily reset write failed');return {reset:true,day};
 }throw Error('Daily reset contention; retry on next client connection');
}
module.exports={reset};
if(require.main===module)reset().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
