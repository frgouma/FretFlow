// Account-free integration tests for manual Replay and the real API wrapper.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('FretFlow.html', 'utf8');
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'), html.indexOf('class AmpPresetTool'));
const context = {window:{}, performance, URLSearchParams, Date, setTimeout, clearTimeout, console};
vm.createContext(context);
vm.runInContext(source + '\nwindow.PracticeForTest = SpotifyPractice;', context);
const control = context.window.FretFlowSpotifyDirectSeekExperiment;
const diag = context.window.FretFlowSpotifyDiagnostics;
const p = Object.create(context.window.PracticeForTest.prototype);
Object.assign(p, {trackId:'PrivateTrack', trackUri:'spotify:track:PrivateTrack', durationMs:180000,
  isPlaying:true, syncBaseMs:50000, syncAt:performance.now(), tab:{id:'test'}, sessions:new Map(), memory:new Map()});
p.renderIcons = p.renderTimeline = p.clearStatus = () => {};
p.prepareTrack = async () => true;
p.accessToken = async () => 'PrivateToken';
p.withDelay = async action => action();
const session = p.sessionFor();
Object.assign(session, {aMs:30000, bMs:60000, playheadMs:50000, loopActive:true, delay:0});
let playback, requests, failSeek, blockState, blockSeek;
const matching = () => ({item:{id:'PrivateTrack'}, device:{id:'PrivateDevice',is_active:true,is_restricted:false,name:'PrivateName'},
  is_playing:true, progress_ms:50000, timestamp:Date.now()});
const response = (status, value = null) => ({ok:status >= 200 && status < 300, status, text:async () => value ? JSON.stringify(value) : ''});
context.fetch = async (url, options) => {
  requests.push({url, method:options.method, body:options.body});
  if (url.includes('/seek')) {
    if (blockSeek) return new Promise(resolve => { blockSeek.resolve = () => resolve(response(204)); });
    return response(failSeek ? 500 : 204);
  }
  if (url.includes('/devices')) return response(200, {devices:[{id:'PrivateDevice',is_active:true,is_restricted:false}]});
  if (options.method === 'GET' && url.endsWith('/me/player')) {
    if (blockState) return new Promise(resolve => { blockState.resolve = () => resolve(response(200, playback)); });
    return response(playback ? 200 : 204, playback);
  }
  return response(204);
};
const reset = () => { playback = matching(); requests = []; failSeek = false; blockState = null; blockSeek = null; session.delay = 0; session.aMs = 30000; session.playheadMs = 50000; p.directSeekPending = null; diag.clear(); };
const methods = () => requests.filter(r => r.method === 'PUT').map(r => new URL(r.url).pathname);
(async () => {
  assert.equal(control.status(), false);
  reset(); await p.replayFromA();
  const baseline = JSON.stringify(requests);
  assert.deepEqual(methods(), ['/v1/me/player/pause','/v1/me/player/play']);
  reset(); await p.replayFromA(); assert.equal(JSON.stringify(requests), baseline);
  diag.enable(); control.enable(); assert.equal(control.status(), true);
  reset(); await p.replayFromA();
  assert.deepEqual(methods(), ['/v1/me/player/seek']);
  assert.match(requests.find(r => r.method === 'PUT').url, /seek\?position_ms=30000&device_id=PrivateDevice/);
  assert.equal(session.playheadMs, 30000);
  assert.match(diag.report(), /"action":"directSeek.playhead"/);
  assert.doesNotMatch(diag.report(), /PrivateTrack|PrivateDevice|PrivateToken|PrivateName|spotify:track/);
  const scenarios = [
    () => {playback.is_playing = false;},
    () => {playback.item.id = 'DifferentTrack';},
    () => {playback.device.is_active = false;},
    () => {delete playback.device.id;},
    () => {playback.device.is_restricted = true;},
    () => {playback = null;},
    () => {delete playback.timestamp;},
    () => {session.aMs = -1;}
  ];
  for (const scenario of scenarios) {
    reset(); scenario(); await p.replayFromA();
    assert(!methods().includes('/v1/me/player/seek'), 'ineligible Replay must not Seek');
    assert(methods().includes('/v1/me/player/play'), 'ineligible Replay uses existing path');
  }
  // A selector result different from the reported active device is ineligible.
  reset(); const ensure = p.ensureDevice;
  p.ensureDevice = async () => 'OtherDevice';
  await p.replayFromA(); assert(!methods().includes('/v1/me/player/seek')); assert(methods().includes('/v1/me/player/play'));
  p.ensureDevice = ensure;
  // A newer action or disabling while the read is pending prevents both Seek and old fallback.
  for (const cancel of [() => vm.runInContext('SpotifySeekExperiment.intent()', context), () => control.disable()]) {
    reset(); control.enable(); blockState = {};
    const pending = p.replayFromA();
    await new Promise(resolve => setImmediate(resolve));
    cancel(); blockState.resolve(); await pending;
    assert.deepEqual(methods(), []); assert.match(diag.report(), /directSeek.cancelled/);
  }
  // Exercise real entry points for newer Play/Pause, Replay and scrub intent.
  const prepare = p.prepareTrack;
  p.timeline = {getBoundingClientRect:() => ({width:0})};
  for (const action of ['play', 'pause', 'replay', 'scrub']) {
    reset(); control.enable(); blockState = {};
    const old = p.replayFromA();
    await new Promise(resolve => setImmediate(resolve));
    p.prepareTrack = async () => false;
    if (action === 'scrub') p.beginMarkerDrag({preventDefault(){},stopPropagation(){},pointerId:1}, 'playhead');
    else if (action === 'replay') await p.replayFromA();
    else { p.isPlaying = action === 'pause'; await p.togglePlayback(); }
    p.prepareTrack = prepare;
    blockState.resolve(); await old;
    assert.deepEqual(methods(), []); assert.match(diag.report(), /directSeek.cancelled/);
  }
  // A newer intent, a switch change, or a detected device change while Seek is in flight
  // must prevent its late response from setting a provisional playhead.
  for (const kind of ['newer', 'disable', 'device']) {
    control.enable(); reset(); blockSeek = {};
    const pending = p.replayFromA();
    await new Promise(resolve => setImmediate(resolve));
    if (kind === 'newer') vm.runInContext('SpotifySeekExperiment.intent()', context);
    if (kind === 'disable') control.disable();
    if (kind === 'device') { playback.device.id = 'OtherDevice'; await p.syncPlaybackState(); }
    session.playheadMs = 45000;
    blockSeek.resolve(); await pending;
    assert.equal(session.playheadMs, 45000);
    assert.match(diag.report(), /directSeek.cancelled/);
  }
  control.enable(); reset(); failSeek = true;
  await assert.rejects(p.replayFromA());
  assert.deepEqual(methods(), ['/v1/me/player/seek']);
  assert.match(diag.report(), /directSeek.error/);
  assert.notEqual(session.playheadMs, 30000, 'failed Seek must not set provisional position');
  control.disable(); diag.disable();
  console.log('Spotify direct Seek experiment mock tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
