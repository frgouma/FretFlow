// Account-free integration of the real SpotifyPractice handlers and controller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Controller = require('../../assets/js/spotify-playback-controller.js');
const html = fs.readFileSync('FretFlow.html', 'utf8');
assert.match(html, /<script id="fretflow-spotify-controller">[\s\S]*?<\/script>\s*<script id="fretflow-runtime">/);
assert.doesNotMatch(html, /practiceDelay|practice-delay|FretFlowSpotifySeekExperiment|FretFlowSpotifyDirectSeekExperiment|seekToPositionAndPlay/);
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'), html.indexOf('class AmpPresetTool'));
class Element {
  constructor() { this.listeners = {}; this.style = {}; this.hidden = false; this.textContent = ''; this.classList = {add(){}, remove(){}, toggle(){}, contains(){return false;}}; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.({}); }
  setAttribute() {} getBoundingClientRect() { return {left:0, width:100}; }
  setPointerCapture() {} releasePointerCapture() {}
}
const elements = new Map();
const document = {getElementById(id){ if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); }, querySelector(){return null;}};
const state = {track:'other', device:'PrivateDeviceID', playing:false, position:0};
const requests = [];
let holdPoll = null, pollRelease = null, rejectMutation = 0, holdRefresh = false, refreshRelease;
let holdMetadata = false, metadataRelease;
const response = (status, data) => ({ok:status < 400, status, headers:{get(){return null;}}, text:async()=>data == null ? '' : JSON.stringify(data)});
const fetch = async (url, options={}) => {
  const u = new URL(url), method = options.method || 'GET';
  requests.push({path:u.pathname, query:u.searchParams, method, body:typeof options.body === 'string' ? JSON.parse(options.body) : undefined});
  if (u.hostname === 'accounts.spotify.com') { if (holdRefresh) await new Promise(resolve => {refreshRelease = resolve;}); return response(200,{access_token:'new-secret',expires_in:3600}); }
  if (u.pathname.startsWith('/v1/tracks/')) { if (holdMetadata) { holdMetadata=false; await new Promise(resolve => {metadataRelease=resolve;}); } return response(200,{duration_ms:100000}); }
  if (method === 'PUT' && rejectMutation) { const status=rejectMutation; rejectMutation=0; return response(status,{}); }
  if (u.pathname === '/v1/me/player' && method === 'GET') {
    const copy = {item:{id:state.track}, device:{id:state.device,is_active:true}, is_playing:state.playing, progress_ms:state.position};
    if (holdPoll) { holdPoll = false; await new Promise(resolve => {pollRelease = resolve;}); }
    return response(200,copy);
  }
  if (u.pathname.endsWith('/play')) { if(options.body) state.track=JSON.parse(options.body).uris[0].split(':').pop(); state.playing=true; }
  if (u.pathname.endsWith('/pause')) state.playing=false;
  if (u.pathname.endsWith('/seek')) state.position=Number(u.searchParams.get('position_ms'));
  return response(204);
};
const window = {listeners:{}, addEventListener(type, fn){this.listeners[type]=fn;}, visualViewport:null};
const context = {window,document,fetch,FretFlowSpotifyPlaybackController:Controller,performance,URL,URLSearchParams,Date,setTimeout,clearTimeout,setInterval,clearInterval,console,requestAnimationFrame(){},localStorage:{getItem(){return null;},setItem(){},removeItem(){}}};
context.FretFlow = {SPOTIFY_STORAGE_PREFIX:'test', viewerIcon(){return '';}};
vm.createContext(context); vm.runInContext(source+'\nwindow.PracticeForTest = SpotifyPractice;',context);
const practice = new window.PracticeForTest({app:{data:{project:{spotifyClientId:'client'}}}});
practice.positionInFrame = () => {};
for (const name of ['togglePlayback','replayFromA','autoReplay','syncPlaybackState','seekToPositionAndPlay']) assert.equal(name in practice,false, `removed method ${name}`);
practice.storageSet('auth_client_id','client'); practice.storageSet('access_token','secret'); practice.storageSet('expires_at',Date.now()+3600000);
const settle = async () => { for(let i=0;i<100 && (practice.controller.running || practice.controller.pending);i++) await new Promise(r=>setTimeout(r,5)); assert.equal(practice.controller.running,false); };
const event = (x,id='practicePlayhead') => ({pointerId:1,clientX:x,preventDefault(){},stopPropagation(){},currentTarget:elements.get(id)});
(async()=>{
  practice.open({id:'one',spotifyUrl:'spotify:track:track1'});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(requests.filter(r=>r.method==='PUT').length,0,'opening does not mutate');
  elements.get('practiceMarkerA').listeners.pointerdown(event(10,'practiceMarkerA'));
  window.listeners.pointerup(event(10,'practiceMarkerA')); assert.equal(practice.sessionFor().aMs,10000);
  elements.get('practiceMarkerB').listeners.pointerdown(event(80,'practiceMarkerB'));
  window.listeners.pointerup(event(80,'practiceMarkerB')); assert.equal(practice.sessionFor().bMs,80000);
  practice.sessionFor().aMs=0; practice.sessionFor().bMs=100000; practice.updateLoopActive();
  elements.get('practicePlay').click(); await settle();
  assert.equal(state.track,'track1'); assert.equal(state.playing,true);
  elements.get('practicePlay').click(); await settle(); assert.equal(state.playing,false);
  elements.get('practicePlay').click(); await settle();
  assert.equal(requests.filter(r=>r.path.endsWith('/play')).at(-1).body,undefined,'resume has no URI');
  elements.get('practicePlayhead').listeners.pointerdown(event(30)); window.listeners.pointerup(event(30)); await settle();
  assert.equal(state.position,30000); assert.equal(state.playing,true);
  elements.get('practicePlay').click(); await settle();
  practice.beginMarkerDrag(event(40),'playhead'); practice.markerEnd(event(40)); await settle();
  assert.equal(state.position,40000); assert.equal(state.playing,false);
  elements.get('practicePlay').click(); await settle(); assert.equal(state.position,40000);
  practice.sessionFor().aMs=10000;
  // An old session object can still contain a historical delay; it must be ignored.
  practice.sessionFor().delay=5;
  const replayStart=requests.length;
  elements.get('practiceReplay').click(); await settle(); assert.equal(state.position,10000);
  assert.deepEqual(requests.slice(replayStart).filter(r=>r.method==='PUT').map(r=>r.path), ['/v1/me/player/seek']);
  practice.sessionFor().bMs=20000; practice.sessionFor().loopActive=true; state.position=20000;
  practice.controller.anchor.at -= 10000;
  await practice.controller.observe(); practice.tickPlayback(); await settle(); assert.equal(state.position,10000);
  // A newer pause supersedes Replay while its initial observation is pending.
  holdPoll=true; elements.get('practiceReplay').click(); await new Promise(r=>setTimeout(r,0));
  elements.get('practicePlay').click(); pollRelease(); await settle(); assert.equal(state.playing,false);
  elements.get('practicePlay').click(); await settle();
  holdPoll=true; const polling=practice.controller.observe(); await new Promise(r=>setTimeout(r,0));
  practice.beginMarkerDrag(event(60),'playhead'); pollRelease(); await polling;
  assert.equal(practice.controller.snapshot().displayed.positionMs,60000); practice.markerEnd(event(60)); await settle();
  assert.equal(elements.has('practiceDelay'),false);
  window.FretFlowSpotifyDiagnostics.enable(); elements.get('practicePlay').click(); await settle();
  assert.doesNotMatch(window.FretFlowSpotifyDiagnostics.report(),/track1|secret|PrivateDeviceID/);
  // A delayed metadata result from a previous tab cannot update its successor.
  holdMetadata=true; practice.open({id:'two',spotifyUrl:'spotify:track:track2'});
  await new Promise(r=>setTimeout(r,0));
  practice.open({id:'three',spotifyUrl:'spotify:track:track3'}); metadataRelease();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(practice.controller.snapshot().context.trackId,'track3');
  // External playback changes are observed without reclaiming the old track.
  state.track='external'; state.device='ExternalDevice'; state.playing=true;
  await practice.controller.observe(); const before=requests.filter(r=>r.method==='PUT').length;
  practice.tickPlayback(); await new Promise(r=>setTimeout(r,10));
  assert.equal(requests.filter(r=>r.method==='PUT').length,before);
  // A rejected command becomes uncertain and does not trigger a fallback.
  rejectMutation=403; elements.get('practicePlay').click(); await settle();
  assert.equal(practice.controller.snapshot().state,'uncertain');
  assert.equal(practice.controller.snapshot().displayed.playing,false);
  // Tab changes fence an outstanding initial observation before any mutation.
  holdPoll=true; elements.get('practicePlay').click(); await new Promise(r=>setTimeout(r,0));
  const tabCommands=requests.filter(r=>r.method==='PUT').length;
  practice.open({id:'four',spotifyUrl:'spotify:track:track4'}); pollRelease(); await settle();
  assert.equal(requests.filter(r=>r.method==='PUT').length,tabCommands);
  await new Promise(r=>setTimeout(r,20));
  // A device switch observed during a transition prevents dependent commands.
  state.track='track4'; state.device='DeviceBefore'; state.playing=true;
  await practice.controller.observe(); holdPoll=true;
  practice.beginMarkerDrag(event(20),'playhead'); practice.markerEnd(event(20));
  await new Promise(r=>setTimeout(r,0)); state.device='DeviceAfter'; pollRelease(); await settle();
  assert.equal(practice.controller.snapshot().state,'uncertain');
  // A 401 refresh that finishes after a newer Pause must not retry the old Play.
  state.track='another'; state.playing=true; await practice.controller.observe();
  practice.storageSet('refresh_token','refresh-secret');
  rejectMutation=401; holdRefresh=true;
  elements.get('practicePlay').click();
  for(let i=0;i<100 && !refreshRelease;i++) await new Promise(r=>setTimeout(r,5));
  assert.ok(refreshRelease, 'refresh started ' + JSON.stringify(practice.controller.snapshot()));
  const oldPlays=requests.filter(r=>r.method==='PUT' && r.path.endsWith('/play')).length;
  elements.get('practicePlay').click(); holdRefresh=false; refreshRelease(); await settle();
  assert.equal(requests.filter(r=>r.method==='PUT' && r.path.endsWith('/play')).length,oldPlays);
  practice.hide(); console.log('Spotify integration: 19 interaction checks passed');
})().catch(e=>{practice.hide(); console.error(e); process.exitCode=1;});
