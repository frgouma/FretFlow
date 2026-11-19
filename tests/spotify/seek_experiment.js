// Account-free exercise of the actual experimental playback code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('FretFlow.html', 'utf8');
const source = html.slice(html.indexOf('// Opt-in, memory-only playback diagnostics.'), html.indexOf('class AmpPresetTool'));
const context = {window:{}, performance, URLSearchParams, Date, setTimeout:callback => { queueMicrotask(callback); return 1; }, clearTimeout, console};
vm.createContext(context);
vm.runInContext(source + '\nwindow.PracticeForTest = SpotifyPractice;', context);
const diag = context.window.FretFlowSpotifyDiagnostics;
const experiment = context.window.FretFlowSpotifySeekExperiment;
const practice = Object.create(context.window.PracticeForTest.prototype);
Object.assign(practice, {trackId:'TrackPrivate', trackUri:'spotify:track:TrackPrivate', durationMs:180000,
  isPlaying:false, syncBaseMs:0, syncAt:performance.now(), tab:{id:'test'}, sessions:new Map()});
practice.renderIcons = practice.renderTimeline = practice.clearStatus = () => {};
practice.accessToken = async () => 'TokenPrivate';
const session = practice.sessionFor();
Object.assign(session, {aMs:30000, bMs:60000, playheadMs:0, loopActive:true, delay:0});
let responses = [], requests = [];
context.fetch = async (url, options) => {
  requests.push({url, method:options.method, body:options.body});
  if (url.includes('/seek') && responses[0] === 'fail') { responses.shift(); return {ok:false,status:500,text:async () => ''}; }
  const state = options.method === 'GET' ? responses.shift() : null;
  return {ok:true,status:state ? 200 : 204,text:async () => state ? JSON.stringify(state) : ''};
};
const state = (progress, changes = {}) => ({item:{id:'TrackPrivate'}, device:{id:'DevicePrivate',name:'Private name',is_active:true}, is_playing:true, progress_ms:progress, timestamp:Date.now()+10, ...changes});
const operation = () => vm.runInContext('SpotifySeekExperiment.intent()', context);
const run = async (states, before) => {
  requests = []; responses = [...states]; diag.clear();
  const id = operation();
  const info = {operation:id, deviceId:'DevicePrivate', trackId:'TrackPrivate', position:30000, playStartedAt:Date.now(), playStartedMono:performance.now()};
  if (before) before();
  await practice.verifySeekExperiment(info);
  return {requests, report:diag.report()};
};
(async () => {
  assert.equal(experiment.status(), false);
  practice.ensureDevice = async () => 'DevicePrivate';
  await practice.playTrackAt(30000);
  assert.deepEqual(requests.map(r => r.method), ['PUT']);
  assert.equal(JSON.parse(requests[0].body).position_ms, 30000);
  diag.enable(); experiment.enable();
  assert.equal(experiment.status(), true);
  let result = await run([state(30500)]);
  assert.equal(result.requests.length, 1); assert.match(result.report, /position-within-tolerance/);
  result = await run([state(1000), state(30500)]);
  assert.deepEqual(result.requests.map(r => r.method), ['GET','PUT','GET']);
  assert.match(result.requests[1].url, /seek\?position_ms=30000&device_id=DevicePrivate/);
  assert.match(result.report, /"phase":"after-seek"/); assert.match(result.report, /"progressMs":30500/);
  assert.doesNotMatch(result.report, /TrackPrivate|DevicePrivate|TokenPrivate|Private name|spotify:track/);
  for (const wrong of [state(1000,{item:{id:'Other'}}), state(1000,{device:{id:'Other'}})]) {
    result = await run([wrong]); assert.equal(result.requests.length, 1); assert.match(result.report, /track-device-or-playback-mismatch/);
  }
  result = await run([state(1000,{device:{id:'DevicePrivate',is_active:false}})]);
  assert.equal(result.requests.length, 1); assert.match(result.report, /track-device-or-playback-mismatch/);
  result = await run([state(1000,{timestamp:Date.now()-10000})]);
  assert.equal(result.requests.length, 1); assert.match(result.report, /state-freshness-uncertain/);
  practice.prepareTrack = async () => false;
  practice.timeline = {getBoundingClientRect:() => ({width:0})};
  for (const action of ['togglePlayback','replayFromA','scrub']) {
    result = await run([], () => {
      // These represent new control intent at the same generation boundary used by the controls.
      if (action === 'scrub') practice.beginMarkerDrag({preventDefault(){},stopPropagation(){},pointerId:1}, 'playhead');
      else { const promise = practice[action](); promise.catch(() => {}); }
    });
    assert.match(result.report, /newer-intent-or-disabled/);
  }
  // Cancel while the verification response is in flight.
  const originalApi = practice.api;
  let resolveState;
  practice.api = () => new Promise(resolve => { resolveState = resolve; });
  diag.clear();
  const pending = practice.verifySeekExperiment({operation:operation(), deviceId:'DevicePrivate', trackId:'TrackPrivate',
    position:30000, playStartedAt:Date.now(), playStartedMono:performance.now()});
  await new Promise(resolve => setImmediate(resolve));
  await practice.togglePlayback();
  resolveState(state(1000));
  await pending;
  assert.match(diag.report(), /newer-intent-or-disabled/);
  assert.doesNotMatch(diag.report(), /seekExperiment.seek"/);
  practice.api = originalApi;
  result = await run([state(1000), 'fail']);
  assert.equal(result.requests.filter(r => r.url.includes('/seek')).length, 1);
  assert.match(result.report, /"phase":"seek","category":"request-failed"/);
  experiment.disable(); assert.equal(experiment.status(), false);
  console.log('Spotify seek experiment mock tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
