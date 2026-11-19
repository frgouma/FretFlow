// Account-free tests for URI-free Resume and post-Resume confirmation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('FretFlow.html','utf8');
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'),html.indexOf('class AmpPresetTool'));
const context = {window:{},performance,URLSearchParams,Date,clearTimeout,
  setTimeout:(fn,ms)=>setTimeout(fn,ms===250?0:ms),console};
vm.createContext(context);
vm.runInContext(source+'\nwindow.PracticeForTest=SpotifyPractice;',context);
const control=context.window.FretFlowSpotifyDirectSeekExperiment;
const diag=context.window.FretFlowSpotifyDiagnostics;
const p=Object.create(context.window.PracticeForTest.prototype);
Object.assign(p,{trackId:'PrivateTrack',trackUri:'spotify:track:PrivateTrack',durationMs:120000,isPlaying:false,
  syncBaseMs:30000,syncAt:performance.now(),tab:{id:'tab'},sessions:new Map(),memory:new Map()});
p.renderIcons=p.renderTimeline=p.clearStatus=()=>{};
p.prepareTrack=async()=>true;
p.accessToken=async()=> 'PrivateToken';
const session=p.sessionFor();
let state, requests, resumed, results, resumeFails, blockResume;
const reset=()=>{
  state={item:{id:'PrivateTrack'},device:{id:'PrivateDevice',name:'PrivateName',is_active:true,is_restricted:false},
    is_playing:false,progress_ms:30000,timestamp:Date.now()-5000};
  Object.assign(session,{aMs:30000,bMs:60000,playheadMs:30000,loopActive:true,delay:0,playheadDirty:false});
  Object.assign(p,{isPlaying:false,directSeekPending:null,directSeekCommandInFlight:null,directSeekFence:null});
  requests=[]; resumed=false; results=[]; resumeFails=false; blockResume=null; diag.clear();
};
const success=(body=null,status=200)=>({ok:status>=200&&status<300,status,text:async()=>body?JSON.stringify(body):''});
context.fetch=async(url,options)=>{
  const parsed=new URL(url); requests.push({method:options.method,path:parsed.pathname,body:options.body});
  if(options.method==='PUT'&&parsed.pathname.endsWith('/play')){
    resumed=true;
    if(blockResume) return new Promise(resolve=>{blockResume.resolve=()=>resolve(success(null,204));});
    return success(null,resumeFails?500:204);
  }
  if(options.method==='GET'&&parsed.pathname.endsWith('/player')){
    return success(resumed ? (results.shift() || {...state,is_playing:true,timestamp:Date.now()+5}) : state);
  }
  return success(null,204);
};
const plays=()=>requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/play'));
(async()=>{
  assert.equal(control.status(),false);
  reset(); await p.togglePlayback(); assert.equal(JSON.parse(plays()[0].body).position_ms,30000);
  diag.enable(); control.enable();
  reset(); await p.togglePlayback(); assert.equal(plays().length,1); assert.equal(plays()[0].body,undefined);
  assert.equal(p.directSeekPending,null); assert.match(diag.report(),/directSeek.resume.verify/);
  reset(); const old=Date.now()-5000;
  results=[{...state,is_playing:true,progress_ms:31000,timestamp:old}, {...state,is_playing:true,progress_ms:31400,timestamp:old}];
  await p.togglePlayback(); assert.equal(plays().length,1); assert.equal(plays()[0].body,undefined);
  assert.match(diag.report(),/"fresh":false,"advancing":true/); assert.equal(p.directSeekPending,null);
  for(const outputs of [
    [{...state,is_playing:true,progress_ms:30000,timestamp:old},{...state,is_playing:true,progress_ms:30000,timestamp:old}],
    [{...state,is_playing:true,progress_ms:1000,timestamp:old},{...state,is_playing:true,progress_ms:1400,timestamp:old}],
    [{...state,is_playing:false,progress_ms:30000,timestamp:old},{...state,is_playing:true,progress_ms:30400,timestamp:old}]
  ]) {
    reset(); results=outputs; await assert.rejects(p.togglePlayback());
    assert.equal(plays().length,1); assert.equal(p.directSeekPending,null);
  }
  for(const modify of [()=>{state.item.id='OtherTrack';},()=>{state.device.id=null;},()=>{state.device.is_restricted=true;},
    ()=>{session.playheadDirty=true;session.playheadMs=45000;},()=>{state.progress_ms=20000;}]) {
    reset(); modify();
    // Existing fallback device selection is stubbed when the synthetic state has no usable device.
    const ensure=p.ensureDevice; p.ensureDevice=async()=> 'PrivateDevice';
    await p.togglePlayback(); p.ensureDevice=ensure;
    assert.equal(plays().length,1); assert.ok(plays()[0].body, 'ineligible Play keeps the existing request');
  }
  reset(); resumeFails=true; await assert.rejects(p.togglePlayback());
  assert.equal(plays().length,1); assert.equal(plays()[0].body,undefined); assert.equal(p.directSeekPending,null);
  for (const action of ['play','pause','disable','tab']) {
    reset(); control.enable(); blockResume={}; const pending=p.togglePlayback();
    await new Promise(resolve=>setImmediate(resolve));
    if(action === 'disable') control.disable();
    else if(action === 'tab') { p.tab={id:'other'}; }
    else {
      const prepare=p.prepareTrack; p.prepareTrack=async()=>false;
      p.isPlaying=action==='pause'; await p.togglePlayback(); p.prepareTrack=prepare;
    }
    session.playheadMs=50000;
    blockResume.resolve(); await pending;
    assert.equal(session.playheadMs,50000); assert.equal(p.directSeekPending,null);
    assert.match(diag.report(),/directSeek.cancelled/);
    p.tab={id:'tab'};
  }
  assert.doesNotMatch(diag.report(),/PrivateTrack|PrivateDevice|PrivateName|PrivateToken|spotify:track/);
  control.disable();diag.disable(); console.log('Spotify Resume experiment mock tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
