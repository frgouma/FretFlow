// Account-free tests for the optional positioning sequences.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('FretFlow.html', 'utf8');
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'), html.indexOf('class AmpPresetTool'));
let timeoutFast = false;
const context = {window:{}, performance, URLSearchParams, Date, clearTimeout,
  setTimeout:(fn, ms) => setTimeout(fn, ms === 250 || (timeoutFast && ms === 3000) ? 0 : ms), console};
vm.createContext(context);
vm.runInContext(source + '\nwindow.PracticeForTest = SpotifyPractice;', context);
const diag = context.window.FretFlowSpotifyDiagnostics;
const control = context.window.FretFlowSpotifyDirectSeekExperiment;
const p = Object.create(context.window.PracticeForTest.prototype);
Object.assign(p, {trackId:'TrackSecret', trackUri:'spotify:track:TrackSecret', durationMs:120000, isPlaying:true,
  syncBaseMs:50000, syncAt:performance.now(), tab:{id:'test'}, sessions:new Map(), memory:new Map(), loopRunning:false});
p.renderIcons = p.renderTimeline = p.clearStatus = p.showStatus = () => {};
p.showError = error => { p.lastError = error; };
p.prepareTrack = async () => true;
p.accessToken = async () => 'TokenSecret';
let playback, requests, pauseFails, seekIneffective, seekFails, cancelDelay, changeAtSeek, blockRead, blockCommand, resumeOld;
const session = p.sessionFor();
const reset = () => {
  playback = {item:{id:'TrackSecret'},device:{id:'DeviceSecret',name:'NameSecret',is_active:true,is_restricted:false},
    is_playing:true,progress_ms:50000,timestamp:Date.now()+5};
  Object.assign(session,{aMs:30000,bMs:60000,playheadMs:50000,loopActive:true,delay:0});
  Object.assign(p,{isPlaying:true,loopRunning:false,busy:false,directSeekPending:null,directSeekCommandInFlight:null,directSeekFence:null,lastError:null});
  requests=[]; pauseFails=seekIneffective=seekFails=cancelDelay=changeAtSeek=false; blockRead=null; blockCommand=null; resumeOld=false; timeoutFast=false; diag.clear();
};
p.withDelay = async action => { requests.push({type:'delay'}); assert.equal(p.isPlaying,false); assert.equal(session.playheadMs,session.aMs); if (cancelDelay) vm.runInContext('SpotifySeekExperiment.intent()', context); await action(); };
context.fetch = async (url, options) => {
  const parsed = new URL(url); requests.push({type:options.method,path:parsed.pathname,body:options.body});
  if (blockCommand && options.method === 'PUT') {
    const blocked=blockCommand; blockCommand=null;
    return new Promise(resolve => { blocked.resolve=() => resolve({ok:true,status:204,text:async () => ''}); });
  }
  let status = 204;
  if (parsed.pathname.endsWith('/pause') && !pauseFails) { playback.is_playing=false; playback.timestamp=Date.now()+5; }
  if (parsed.pathname.endsWith('/seek')) {
    if (seekFails) status=500;
    if (!seekIneffective && !seekFails) { playback.progress_ms=Number(parsed.searchParams.get('position_ms')); playback.timestamp=Date.now()+5; }
    if (changeAtSeek) playback.device.id='OtherDevice';
  }
  if (parsed.pathname.endsWith('/play')) { playback.is_playing=true; playback.timestamp=resumeOld ? Date.now()-5000 : Date.now()+5; }
  if (options.method === 'GET' && resumeOld && playback.is_playing) playback.progress_ms+=400;
  const value = options.method === 'GET' ? JSON.stringify(playback) : '';
  if (options.method === 'GET' && blockRead) {
    const blocked = blockRead; blockRead = null;
    return new Promise(resolve => { blocked.resolve = () => resolve({ok:true,status:200,text:async () => value}); });
  }
  if (options.method === 'GET') status=200;
  return {ok:status<300,status,text:async () => value};
};
const commands = () => requests.filter(x=>x.type==='PUT').map(x=>x.path.split('/').pop());
(async () => {
  assert.equal(control.status(),false); diag.enable(); control.enable();
  reset(); await p.replayFromA(); assert.deepEqual(commands(), ['seek']);
  assert(p.directSeekPending); assert.match(diag.report(),/protection.start/);
  await p.syncPlaybackState(); assert.equal(p.directSeekPending,null); assert.match(diag.report(),/"reason":"confirmed"/);
  reset();
  const blocked = {}; blockRead=blocked;
  const oldRead = p.syncPlaybackState();
  await new Promise(resolve => setImmediate(resolve));
  await p.replayFromA(); await p.syncPlaybackState();
  const positionAfterSeek = session.playheadMs;
  blocked.resolve(); await oldRead;
  assert.equal(session.playheadMs, positionAfterSeek);
  assert.match(diag.report(), /older-request/);
  reset(); await p.autoReplay(); assert.deepEqual(commands(), ['seek']);
  reset(); session.delay=2; p.scrubbing=true; p.scrubWasPlaying=true;
  p.scrubOperation=vm.runInContext('SpotifySeekExperiment.intent()',context); session.playheadMs=40000;
  await p.finishPlayheadScrub(); assert.deepEqual(commands(), ['seek']);
  reset(); p.scrubbing=true; p.scrubWasPlaying=false; await p.finishPlayheadScrub(); assert.deepEqual(commands(), []);
  for (const kind of ['replay','loop']) {
    reset(); session.delay=2;
    if(kind==='replay') await p.replayFromA(); else await p.autoReplay();
    assert.deepEqual(commands(), ['pause','seek','play']);
    assert.equal(requests.find(x=>x.path?.endsWith('/play')).body, undefined);
    assert(requests.findIndex(x=>x.type==='delay') > requests.findIndex(x=>x.path?.endsWith('/seek')));
    assert.equal(p.directSeekPending,null); assert.match(diag.report(),/directSeek.resume.verify/);
  }
  reset(); session.delay=2; resumeOld=true;
  await p.replayFromA(); assert.deepEqual(commands(), ['pause','seek','play']);
  assert.match(diag.report(), /"fresh":false,"advancing":true/);
  reset(); session.delay=2; pauseFails=true;
  await assert.rejects(p.replayFromA()); assert.deepEqual(commands(), ['pause']); assert.equal(p.directSeekPending,null);
  reset(); session.delay=2; seekIneffective=true;
  await assert.rejects(p.replayFromA()); assert.deepEqual(commands(), ['pause','seek']); assert.equal(p.directSeekPending,null);
  reset(); session.delay=2; cancelDelay=true;
  await p.replayFromA(); assert.deepEqual(commands(), ['pause','seek']); assert.equal(p.directSeekPending,null);
  reset(); session.delay=2; changeAtSeek=true;
  await p.replayFromA(); assert.deepEqual(commands(), ['pause','seek']); assert.equal(p.directSeekPending,null);
  reset(); seekFails=true;
  await assert.rejects(p.replayFromA()); assert.deepEqual(commands(), ['seek']); assert.equal(p.directSeekPending,null);
  reset(); timeoutFast=true; const stalled={}; blockCommand=stalled;
  await assert.rejects(p.replayFromA());
  assert.equal(p.directSeekPending,null); assert.deepEqual(commands(), ['seek']);
  // A timed-out command may still reach Spotify; do not send a conflicting experiment.
  await p.replayFromA(); assert.deepEqual(commands(), ['seek']);
  stalled.resolve(); await new Promise(resolve => setImmediate(resolve));
  reset(); await p.replayFromA(); p.directSeekPending.expires=0; p.tickPlayback(); assert.equal(p.directSeekPending,null);
  assert.match(diag.report(),/cancelled-or-timeout/);
  assert.doesNotMatch(diag.report(),/TrackSecret|DeviceSecret|TokenSecret|NameSecret|spotify:track/);
  control.disable(); diag.disable();
  console.log('Spotify positioning sequence mock tests passed');
})().catch(error => {console.error(error); process.exitCode=1;});
