'use strict';
// Account-free R1 coverage of the production Practice UI, adapter and controller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const Controller = require('../../assets/js/spotify-playback-controller.js');
const html = fs.readFileSync('FretFlow.html','utf8');
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'), html.indexOf('class AmpPresetTool'));
class Element {
  constructor() { this.listeners={}; this.style={}; this.hidden=false; this.textContent=''; const classes=new Set(); this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on ? classes.add(x) : classes.delete(x)}; }
  addEventListener(type,fn) { this.listeners[type]=fn; }
  click() { this.listeners.click?.({}); }
  setAttribute() {} getBoundingClientRect() { return {left:0,width:100}; }
}
const elements=new Map(), document={getElementById(id){if(!elements.has(id)) elements.set(id,new Element());return elements.get(id);},querySelector(){return null;}};
let readStatus=200, mutationStatus=204, refreshStatus=200, device='active', timeoutMutation=false, failVerification=false;
const requests=[];
const response=(status,data)=>({ok:status<400,status,headers:{get(){return '0';}},text:async()=>data==null?'':JSON.stringify(data)});
const fetch=async(url,options={})=>{
  const u=new URL(url); requests.push({path:u.pathname,method:options.method||'GET'});
  if(u.hostname==='accounts.spotify.com') return response(refreshStatus,refreshStatus===200?{access_token:'new-secret',refresh_token:'refresh-secret',expires_in:3600}:{error:'invalid_grant'});
  if(options.method==='PUT') { if(timeoutMutation) throw Error('network'); if(failVerification) readStatus=403; return response(mutationStatus,{}); }
  if(readStatus!==200) return response(readStatus,{error:{message:'private body'}});
  if(u.pathname.startsWith('/v1/tracks/')) return response(200,{duration_ms:60000});
  return response(200,{item:{id:'another'},device:device==='none'?null:{id:'private-device',is_active:true,is_restricted:device==='restricted'},is_playing:false,progress_ms:0});
};
const popup={location:{},close(){}};
const window={listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},open(){return popup;},visualViewport:null};
const context={window,document,fetch,FretFlowSpotifyPlaybackController:Controller,performance,URL,URLSearchParams,Date,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},console,requestAnimationFrame(){},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},crypto:webcrypto,Uint8Array,TextEncoder,btoa};
context.FretFlow={SPOTIFY_STORAGE_PREFIX:'test',SPOTIFY_REDIRECT_URI:'https://example.test/auth',SPOTIFY_AUTH_ORIGIN:'https://example.test',viewerIcon(){return '';}};
vm.createContext(context); vm.runInContext(source+'\nwindow.PracticeForTest = SpotifyPractice;',context);
const practice=new window.PracticeForTest({app:{data:{project:{spotifyClientId:'client'}}}});
practice.positionInFrame=()=>{};
const status=elements.get('practiceStatus'), play=elements.get('practicePlay');
const settle=async()=>{for(let i=0;i<200 && (practice.controller.running||practice.controller.pending);i++)await new Promise(r=>setTimeout(r,2));assert.equal(practice.controller.running,false);practice.tickPlayback();};
const tokens=(expired=false)=>{practice.storageSet('auth_client_id','client');practice.storageSet('access_token','private-access');practice.storageSet('refresh_token','refresh-secret');practice.storageSet('expires_at',expired?1:Date.now()+3600000);practice.authRequired=false;};
const playAndWait=async()=>{play.click();await settle();};
(async()=>{
  practice.open({id:'one',spotifyUrl:'spotify:track:track1'});
  await playAndWait(); assert.equal(practice.controller.snapshot().failure.kind,'auth'); assert(status.classList.contains('action')); assert.match(status.textContent,/koppelen/);
  // The actual click opens the existing OAuth flow; a matching response exchanges the code.
  status.click(); for(let i=0;i<100 && !popup.location.href;i++) await new Promise(r=>setTimeout(r,2));
  assert.match(popup.location.href,/accounts\.spotify\.com\/authorize/);
  await practice.handleAuthMessage({origin:'https://example.test',data:{type:'fretflow-spotify-auth',state:practice.storageGet('auth_state'),code:'private-code'}});
  await new Promise(r=>setTimeout(r,0)); practice.tickPlayback(); assert.equal(practice.authRequired,false); assert(!status.classList.contains('action')); assert.equal(status.hidden,true);
  tokens(true); refreshStatus=200; readStatus=200; device='none'; await playAndWait(); assert.equal(practice.controller.snapshot().failure.kind,'device'); assert.match(status.textContent,/apparaat/); assert(requests.some(r=>r.path==='/api/token'));
  tokens(true); refreshStatus=400; await playAndWait(); assert.equal(practice.controller.snapshot().failure.kind,'auth'); assert(status.classList.contains('action'));
  tokens(); refreshStatus=200; device='restricted'; await playAndWait(); assert.equal(practice.controller.snapshot().failure.kind,'restricted'); assert.match(status.textContent,/beperkt/);
  device='active';
  for(const code of [401,403,404,429]) {
    tokens(); readStatus=code; if(code===401) refreshStatus=400;
    await playAndWait(); const failure=practice.controller.snapshot().failure; assert.equal(failure.status,code,`read ${code}`);
    if(code===401) assert(status.classList.contains('action')); else { assert(!status.classList.contains('action')); assert.notEqual(status.textContent,'Spotify-status onzeker'); }
  }
  readStatus=200; refreshStatus=200;
  for(const code of [401,403,404,429]) {
    tokens(); mutationStatus=code; if(code===401) refreshStatus=400;
    await playAndWait(); assert.equal(practice.controller.snapshot().failure.status,code,`mutation ${code}`);
    if(code===401) assert(status.classList.contains('action')); else assert.notEqual(status.textContent,'Spotify-status onzeker');
  }
  mutationStatus=204; tokens(); timeoutMutation=true; await playAndWait(); assert.equal(status.textContent,'Spotify-status onzeker'); assert.equal(practice.controller.snapshot().failure.outcome,'unknown');
  timeoutMutation=false; tokens(); failVerification=true; await playAndWait(); assert.equal(practice.controller.snapshot().failure.outcome,'unknown'); assert.match(status.textContent,/Uitvoering onzeker/); failVerification=false; readStatus=200;
  window.FretFlowSpotifyDiagnostics.enable(); readStatus=403; await playAndWait();
  const report=window.FretFlowSpotifyDiagnostics.report(); assert.match(report,/"status":403/); assert.match(report,/playback.failure/); assert.doesNotMatch(report,/private-access|refresh-secret|private-code|private-device|private body/);
  practice.hide(); console.log('Spotify R1 recovery: authentication, OAuth action, refresh, devices, 401/403/404/429 read and mutation failures, uncertainty and privacy passed');
})().catch(e=>{practice.hide();console.error(e);process.exitCode=1;});
