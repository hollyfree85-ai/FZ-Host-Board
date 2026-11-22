(function(root){'use strict';
function slots(day){const end=day===5||day===6?1340:1280,step=day>=1&&day<=4?90:60,result=[];for(let m=660;m<=end;m+=step)result.push(m);if(result.at(-1)!==end)result.push(end);return result;}
class FloorAlerts{
 constructor(){this.audio=null;document.addEventListener('pointerdown',()=>this.unlock(),{passive:true});}
 async unlock(){try{const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return;if(!this.audio)this.audio=new Audio();if(this.audio.state==='suspended')await this.audio.resume();}catch(_){} }
 sound(){try{if(!this.audio||this.audio.state!=='running')return;for(let i=0;i<3;i++){const o=this.audio.createOscillator(),g=this.audio.createGain(),at=this.audio.currentTime+i*.65;o.frequency.value=740;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.18,at+.03);g.gain.exponentialRampToValueAtTime(.001,at+.4);o.connect(g);g.connect(this.audio.destination);o.start(at);o.stop(at+.45);}}catch(_){} }
}
FloorAlerts.slots=slots;root.FloorAlerts=FloorAlerts;if(typeof module!=='undefined')module.exports={slots};
})(globalThis);
