'use strict';
const assert = require('node:assert/strict');
const Controller = require('../../assets/js/spotify-playback-controller.js');
const {Clock, SpotifySimulator} = require('./simulator.js');
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function setup(remote = {}) {
  const clock = new Clock(), api = new SpotifySimulator(clock);
  api.change(remote);
  const c = new Controller({api, clock, timeoutMs:1000, verifyIntervalMs:100, verifyAttempts:3, toleranceMs:100});
  const context = {contextId:'tab', trackId:'song', trackUri:'spotify:track:song', durationMs:120000};
  c.selectContext(context);
  const request = (playing, ms, reason = 'play') => c.requestPlayback({...context, playing, position:ms == null ? {mode:'retain'} : {mode:'absolute', ms}, reason});
  return {clock, api, c, context, request};
}
const names = api => api.commands.map(x => x.name);
test('initial play and nonzero track start use separate seek', async () => {
  const x=setup(); x.request(true,30000); await x.clock.advance(20);
  assert.deepEqual(names(x.api), ['playTrack','seek']); assert.equal(x.c.snapshot().state,'playing'); assert.equal(x.api.remote.positionMs,30000);
  const y=setup(); y.request(true,null); await y.clock.advance(20); assert.deepEqual(names(y.api),['playTrack']);
});
test('pause, resume and playing or paused seeks', async () => {
  const x=setup({trackId:'song', playing:true, positionMs:5000}); x.request(false,null,'pause'); await x.clock.advance(20);
  assert.equal(x.c.snapshot().state,'paused'); x.request(false,25000,'scrub'); await x.clock.advance(20);
  assert.equal(x.api.remote.playing,false); x.request(true,null); await x.clock.advance(20);
  assert.deepEqual(names(x.api),['pause','seek','resume']); x.request(true,30000,'replay'); await x.clock.advance(20);
  assert.deepEqual(names(x.api),['pause','seek','resume','seek']);
});
test('paused seek then play verifies seek before resume', async () => {
  const x=setup({trackId:'song', playing:false}); x.request(true,30000,'scrub'); await x.clock.advance(20);
  assert.deepEqual(names(x.api),['seek','resume']); assert.equal(x.c.snapshot().state,'playing');
});
test('loop uses seek and deduplicates traversal', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:60000}); const poll=x.c.observe(); await x.clock.advance(1); await poll;
  assert.ok(x.c.loopBoundary({traversalId:1,positionMs:30000})); await x.clock.advance(20);
  assert.equal(x.c.loopBoundary({traversalId:1,positionMs:30000}),null);
  assert.ok(x.c.loopBoundary({traversalId:2,positionMs:30000})); await x.clock.advance(20); assert.deepEqual(names(x.api),['seek','seek']);
});
test('tab selection never starts playback and fences old metadata and polls', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:40000}); x.api.observationOptions.push({deliveryDelay:100}); const old=x.c.observe(); await x.clock.advance(1);
  x.c.selectContext({contextId:'new',trackId:'new',trackUri:'spotify:track:new',durationMs:90000});
  assert.equal(x.c.setDuration('tab','song',999),false); await x.clock.advance(200); await old;
  assert.equal(x.c.snapshot().displayed.positionMs,0); assert.equal(x.c.snapshot().context.durationMs,90000); assert.deepEqual(names(x.api),[]);
});
test('drag wins over in-flight observation', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:5000}); x.api.observationOptions.push({deliveryDelay:100}); const old=x.c.observe(); await x.clock.advance(1);
  x.c.beginDrag(30000); await x.clock.advance(150); await old; assert.equal(x.c.snapshot().displayed.positionMs,30000);
});
test('new pause survives an unresolved seek and timeout', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:5000}); x.api.commandOptions.push({neverSettle:true, neverApply:true});
  x.request(true,30000,'replay'); await x.clock.advance(10); const id=x.request(false,null,'pause'); await x.clock.advance(1100);
  assert.deepEqual(names(x.api),['seek','pause']); assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'paused');
});
test('rapid replay supersedes old dependent work', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({responseDelay:200}); x.request(true,10000,'replay'); await x.clock.advance(10); x.request(true,20000,'replay'); await x.clock.advance(300);
  assert.deepEqual(names(x.api),['seek','seek']); assert.equal(x.c.snapshot().state,'playing'); assert.ok(x.c.snapshot().displayed.positionMs>=20000);
});
test('late and missing application are verified with bounded attempts', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({executeDelay:150}); x.request(true,30000,'replay'); await x.clock.advance(300); assert.equal(x.c.snapshot().state,'playing');
  const y=setup({trackId:'song',playing:true}); y.api.commandOptions.push({neverApply:true}); y.request(true,30000,'replay'); await y.clock.advance(500); assert.equal(y.c.snapshot().state,'uncertain'); assert.equal(y.c.snapshot().displayed.provisional,false); assert.equal(y.c.loopBoundary({traversalId:1,positionMs:0}),null);
});
test('old timestamps do not reject fresh progress and out of order responses are fenced', async () => {
  const x=setup({trackId:'song',playing:true,timestamp:-10000}); x.api.observationOptions.push({deliveryDelay:100},{});
  const a=x.c.observe(); await x.clock.advance(10); const b=x.c.observe(); await x.clock.advance(10); await b; const pos=x.c.snapshot().displayed.positionMs;
  await x.clock.advance(100); await a; assert.ok(x.c.snapshot().displayed.positionMs>=pos);
});
test('errors release protection and allow recovery', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({network:true}); x.request(true,10000,'scrub'); await x.clock.advance(20);
  assert.equal(x.c.snapshot().state,'uncertain'); x.request(false,null,'pause'); await x.clock.advance(20); assert.equal(x.c.snapshot().state,'paused');
  const y=setup({trackId:'song',playing:true,restricted:true}); y.request(false,null); await y.clock.advance(20); assert.equal(y.c.snapshot().state,'uncertain'); assert.deepEqual(names(y.api),[]);
});
test('tab change during seek cannot send old dependent resume', async () => {
  const x=setup({trackId:'song',playing:false}); x.api.commandOptions.push({responseDelay:200}); x.request(true,10000,'scrub'); await x.clock.advance(10);
  x.c.selectContext({contextId:'next',trackId:'next',trackUri:'spotify:track:next',durationMs:100000}); await x.clock.advance(300);
  assert.deepEqual(names(x.api),['seek']); assert.equal(x.c.snapshot().state,'idle');
});
test('external device switch suspends a pending operation', async () => {
  const x=setup({trackId:'song',playing:false}); x.api.commandOptions.push({executeDelay:1000}); x.request(true,10000,'scrub'); await x.clock.advance(20);
  x.api.change({deviceId:'elsewhere'}); await x.clock.advance(300);
  assert.deepEqual(names(x.api),['seek']); assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().desired.cancelled,true);
});
test('rate limit rejects subsequent commands until retry-after', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status:429,retryAfterMs:500}); x.request(false,null); await x.clock.advance(20);
  x.request(false,null); await x.clock.advance(20); assert.deepEqual(names(x.api),['pause']);
  await x.clock.advance(500); x.request(false,null); await x.clock.advance(20); assert.deepEqual(names(x.api),['pause','pause']);
});
test('old timed-out command can complete without dispatching its remaining plan', async () => {
  const x=setup({trackId:'song',playing:false}); x.api.commandOptions.push({neverSettle:true,executeDelay:1500}); x.request(true,10000,'scrub'); await x.clock.advance(10);
  x.request(false,null,'pause'); await x.clock.advance(1100); assert.deepEqual(names(x.api),['seek']); assert.equal(x.c.snapshot().state,'paused');
  await x.clock.advance(500); assert.deepEqual(names(x.api),['seek']);
});
test('absolute targets are clamped to duration', async () => {
  const x=setup({trackId:'song',playing:false}); x.request(false,500000,'scrub'); await x.clock.advance(20);
  assert.equal(x.api.commands[0].args.positionMs,119999);
});
test('pause controls existing playback after selecting another tab', async () => {
  const x=setup({trackId:'other',playing:true}); x.request(false,null,'pause'); await x.clock.advance(20);
  assert.deepEqual(names(x.api),['pause']); assert.equal(x.api.remote.playing,false); assert.equal(x.c.snapshot().displayed.positionMs,0);
});
test('diagnostics omit identifiers and supplied private text', async () => {
  const x=setup({trackId:'song',playing:true}); x.c.enableDiagnostics(); x.request(true,10000,'sensitive title'); await x.clock.advance(20);
  const report=JSON.stringify(x.c.diagnostics()); for (const secret of ['song','spotify:','device','sensitive title']) assert.equal(report.includes(secret),false);
});
test('hardening: late timed-out seek contradiction retains newest intent and freezes', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:5000}); x.api.commandOptions.push({neverSettle:true,executeDelay:1500});
  x.request(true,30000,'scrub'); await x.clock.advance(10); const id=x.request(false,null,'pause'); await x.clock.advance(1600);
  const poll=x.c.observe(); await x.clock.advance(1); await poll;
  assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().displayed.playing,false);
  assert.deepEqual(names(x.api),['seek']);
});
test('hardening: rejected seek displays observed position with uncertainty', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:5000}); x.api.commandOptions.push({status:403}); x.request(false,30000,'scrub'); await x.clock.advance(20);
  assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().displayed.positionMs,5000);
});
test('hardening: external device change preserves the suspended intent', async () => {
  const x=setup({trackId:'song',playing:false}); x.api.commandOptions.push({executeDelay:1000}); const id=x.request(true,10000,'scrub'); await x.clock.advance(20);
  x.api.change({deviceId:'elsewhere'}); await x.clock.advance(300); assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'uncertain');
});
test('hardening: pause freezes provisional playback immediately', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({neverSettle:true}); x.request(true,30000,'replay'); await x.clock.advance(20);
  x.request(false,null,'pause'); const pos=x.c.snapshot().displayed.positionMs; await x.clock.advance(200); assert.equal(x.c.snapshot().displayed.positionMs,pos);
});
test('hardening: idle observations respect unrelated tracks and external controls', async () => {
  const x=setup({trackId:'other',playing:true,positionMs:60000});
  async function poll() { const p=x.c.observe(); await x.clock.advance(1); await p; }
  await poll(); assert.equal(x.c.snapshot().state,'idle'); assert.equal(x.c.snapshot().displayed.positionMs,0);
  x.api.change({trackId:'song',playing:true,positionMs:1000}); await poll(); assert.equal(x.c.snapshot().state,'playing');
  x.api.change({playing:false}); await poll(); assert.equal(x.c.snapshot().state,'paused');
  x.api.change({playing:true}); await poll(); assert.equal(x.c.snapshot().state,'playing');
  x.api.change({trackId:'other'}); await poll(); assert.equal(x.c.snapshot().state,'idle'); assert.deepEqual(names(x.api),[]);
});
test('hardening: stale pre-seek poll cannot overwrite confirmed seek', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:1000}); x.api.observationOptions.push({deliveryDelay:200}); const old=x.c.observe(); await x.clock.advance(1);
  x.request(false,30000,'scrub'); await x.clock.advance(220); await old; assert.equal(x.c.snapshot().displayed.positionMs,30000);
});
test('hardening: recent timestamp cannot confirm contradictory position', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:1000}); x.api.commandOptions.push({neverApply:true});
  x.api.observationOptions.push({}, {override:{positionMs:1000,timestamp:99999}},{override:{positionMs:1000,timestamp:99999}},{override:{positionMs:1000,timestamp:99999}});
  x.request(false,30000,'scrub'); await x.clock.advance(300); assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().displayed.positionMs,1000);
});
test('hardening: repeated contradictory reports remain uncertain with no retries', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:1000}); x.api.commandOptions.push({neverApply:true}); x.request(true,30000,'scrub'); await x.clock.advance(300);
  for (let i=0;i<6;i++) { x.api.change({playing:!!(i%2),positionMs:i*1000}); const p=x.c.observe(); await x.clock.advance(1); await p; assert.equal(x.c.snapshot().state,'uncertain'); }
  assert.deepEqual(names(x.api),['seek']); assert.equal(x.c.snapshot().displayed.playing,false); assert.equal(x.c.loopBoundary({traversalId:1,positionMs:0}),null);
});
test('hardening: accepted execution outside verification window stays uncertain until deliberate recovery', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:1000}); x.api.commandOptions.push({executeDelay:600}); x.request(false,30000,'scrub'); await x.clock.advance(700);
  assert.equal(x.c.snapshot().state,'uncertain'); const p=x.c.observe(); await x.clock.advance(1); await p; assert.equal(x.c.snapshot().state,'uncertain');
  x.request(false,null,'pause'); await x.clock.advance(20); assert.equal(x.c.snapshot().state,'paused'); assert.deepEqual(names(x.api),['seek']);
});
test('hardening: late old play after pause is detected without restart', async () => {
  const x=setup({trackId:'other',playing:false}); x.api.commandOptions.push({neverSettle:true,executeDelay:1500}); x.request(true,null); await x.clock.advance(10);
  const id=x.request(false,null,'pause'); await x.clock.advance(1600); const p=x.c.observe(); await x.clock.advance(1); await p;
  assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'uncertain'); assert.deepEqual(names(x.api),['playTrack']);
});
test('hardening: 401 refresh retries once only for current operation', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status:401}); x.api.refreshOptions.push({delay:100}); x.request(false,null); await x.clock.advance(200);
  assert.deepEqual(names(x.api),['pause','pause']); assert.equal(x.api.refreshes,1); assert.equal(x.c.snapshot().state,'paused');
  const y=setup({trackId:'song',playing:true}); y.api.commandOptions.push({status:401}); y.api.refreshOptions.push({delay:100}); y.request(false,null); await y.clock.advance(10); const id=y.request(true,null); await y.clock.advance(200);
  assert.deepEqual(names(y.api),['pause']); assert.equal(y.c.snapshot().desired.id,id); assert.equal(y.c.snapshot().state,'playing');
});
test('hardening: failed or timed-out refresh cannot replay a mutation', async () => {
  for (const refresh of [{success:false},{neverSettle:true}]) {
    const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status:401}); x.api.refreshOptions.push(refresh); x.request(false,null); await x.clock.advance(1200);
    assert.deepEqual(names(x.api),['pause']); assert.equal(x.c.snapshot().state,'uncertain');
  }
});
test('hardening: HTTP and network failures are classified without fallback', async () => {
  for (const status of [401,403,404,429,500,503]) {
    const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status, retryAfterMs:500}); if (status===401) x.api.refreshOptions.push({success:false}); x.request(false,null); await x.clock.advance(20);
    assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().failure.status,status); assert.equal(x.c.snapshot().failure.outcome,status >= 500 ? 'unknown' : 'rejected'); assert.deepEqual(names(x.api),['pause']);
  }
  for (const opt of [{network:true},{neverSettle:true,neverApply:true}]) {
    const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push(opt); x.request(false,null); await x.clock.advance(1200);
    assert.equal(x.c.snapshot().failure.outcome,'unknown'); assert.deepEqual(names(x.api),['pause']);
  }
});
test('hardening: context switch during play and verification fences continuations', async () => {
  for (const initial of [false,true]) {
    const x=setup({trackId:initial?'other':'song',playing:false}); x.api.commandOptions.push({responseDelay:200}); x.request(true,30000,'scrub'); await x.clock.advance(10);
    x.c.selectContext({contextId:'next',trackId:'next',trackUri:'spotify:track:next',durationMs:10000}); await x.clock.advance(250);
    assert.equal(x.c.snapshot().state,'idle'); assert.equal(x.c.snapshot().displayed.positionMs,0); assert.equal(x.api.commands.length,1);
  }
});
test('hardening: device changes during pause resume and seek stop follow-up commands', async () => {
  for (const [playing, target, reason] of [[false,null,'pause'],[true,null,'play'],[true,20000,'scrub']]) {
    const x=setup({trackId:'song',playing:!playing,positionMs:1000}); x.api.commandOptions.push({executeDelay:500}); const id=x.request(playing,target,reason); await x.clock.advance(20);
    x.api.change({deviceId:'new-device'}); await x.clock.advance(300); assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.api.commands.length,1);
    await x.clock.advance(300); assert.equal(x.api.remote.deviceId,'new-device'); assert.equal(x.api.commands.length,1);
  }
});
test('hardening: rapid interactions retain newest intent and loop cannot supersede it', async () => {
  for (const [first,second] of [ [[true,null,'play'],[false,null,'pause']], [[false,null,'pause'],[true,null,'play']], [[true,10000,'replay'],[false,null,'pause']], [[true,10000,'scrub'],[true,20000,'replay']], [[false,10000,'scrub'],[true,null,'play']] ]) {
    const x=setup({trackId:'song',playing:!first[0]}); x.api.commandOptions.push({responseDelay:200}); x.request(...first); await x.clock.advance(10); const id=x.request(...second);
    assert.equal(x.c.loopBoundary({traversalId:1,positionMs:0}),null); await x.clock.advance(500); assert.equal(x.c.snapshot().desired.id,id); assert.notEqual(x.c.snapshot().state,'transitioning');
    assert.equal(names(x.api).includes('playTrack'),false);
  }
});
test('hardening: stale polling and prolonged observation loss stop interpolation', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:1000}); const p=x.c.observe(); await x.clock.advance(1); await p;
  const before=x.c.snapshot().displayed.positionMs; await x.clock.advance(7000); const s=x.c.snapshot(); assert.equal(s.state,'uncertain'); assert.equal(s.displayed.playing,false); assert.ok(s.displayed.positionMs>before);
  const frozen=s.displayed.positionMs; await x.clock.advance(1000); assert.equal(x.c.snapshot().displayed.positionMs,frozen);
});
test('hardening: post-seek contradictory position cannot replace confirmed cursor', async () => {
  const x=setup({trackId:'song',playing:false,positionMs:1000}); x.request(false,30000,'scrub'); await x.clock.advance(20);
  x.api.observationOptions.push({override:{positionMs:1000,timestamp:99999}}); const p=x.c.observe(); await x.clock.advance(1); await p;
  assert.equal(x.c.snapshot().state,'uncertain'); assert.equal(x.c.snapshot().displayed.positionMs,30000); assert.deepEqual(names(x.api),['seek']);
});
test('hardening: observation 429 prevents repeated polls until backoff', async () => {
  const x=setup({trackId:'song'}); x.api.observationOptions.push({status:429,retryAfterMs:500}); const p=x.c.observe().catch(e=>e); await x.clock.advance(1); assert.equal((await p).status,429);
  await assert.rejects(x.c.observe(), e=>e.kind==='rate-limit'); assert.equal(x.api.observations,1); await x.clock.advance(500);
  const next=x.c.observe(); await x.clock.advance(1); await next; assert.equal(x.api.observations,2);
});
test('hardening: tab and device changes during auth cannot replay rejected command', async () => {
  for (const change of ['context','device']) {
    const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status:401}); x.api.refreshOptions.push({delay:100}); x.request(false,null); await x.clock.advance(10);
    if (change==='context') x.c.selectContext({contextId:'new',trackId:'new',trackUri:'spotify:track:new'}); else x.api.change({deviceId:'new'});
    await x.clock.advance(200); assert.deepEqual(names(x.api),['pause']); if (change==='device') assert.equal(x.c.snapshot().state,'uncertain');
  }
});
test('hardening: simultaneous authentication failures have bounded effects', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({status:401}); x.api.refreshOptions.push({delay:100}); x.request(false,null); await x.clock.advance(10);
  x.api.observationOptions.push({status:401}); const poll=x.c.observe().catch(e=>e); await x.clock.advance(10); assert.equal((await poll).status,401);
  const id=x.request(true,null); await x.clock.advance(200); assert.equal(x.api.refreshes,1); assert.deepEqual(names(x.api),['pause']); assert.equal(x.c.snapshot().desired.id,id);
});
test('hardening: rapid drag releases and manual replay outrank loop intents', async () => {
  const x=setup({trackId:'song',playing:true}); x.c.beginDrag(10000); x.request(true,10000,'scrub'); await x.clock.advance(1);
  x.c.beginDrag(20000); const id=x.request(true,20000,'replay'); assert.equal(x.c.requestPlayback({...x.context,playing:true,position:{mode:'absolute',ms:0},source:'loop',reason:'loop'}),null);
  await x.clock.advance(200); assert.equal(x.c.snapshot().desired.id,id); assert.ok(x.c.snapshot().displayed.positionMs>=20000); assert.equal(names(x.api).includes('playTrack'),false);
});
test('hardening: metadata from a previous visit cannot update a reselected tab', async () => {
  const x=setup(); const old=x.c.metadataToken(); x.c.selectContext({contextId:'next',trackId:'next',trackUri:'spotify:track:next'}); x.c.selectContext(x.context);
  assert.equal(x.c.setDuration('tab','song',10,old),false); const fresh=x.c.metadataToken(); assert.equal(x.c.setDuration('tab','song',90000,fresh),true); assert.equal(x.c.snapshot().context.durationMs,90000);
});
test('hardening: older device observation cannot undo a newer device report', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.observationOptions.push({deliveryDelay:200}); const old=x.c.observe(); await x.clock.advance(1);
  x.api.change({deviceId:'new'}); const recent=x.c.observe(); await x.clock.advance(1); await recent; await x.clock.advance(200); await old;
  assert.equal(x.c.snapshot().observed.deviceId,'new'); assert.deepEqual(names(x.api),[]);
});
test('hardening: network failure may still execute remotely', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:1000}); x.api.commandOptions.push({network:true,applyOnNetworkFailure:true,executeDelay:300}); x.request(false,null,'pause'); await x.clock.advance(20);
  assert.equal(x.c.snapshot().failure.outcome,'unknown'); await x.clock.advance(400); const poll=x.c.observe(); await x.clock.advance(1); await poll;
  assert.equal(x.api.remote.playing,false); assert.equal(x.c.snapshot().state,'uncertain'); assert.deepEqual(names(x.api),['pause']);
});
test('hardening: concurrent playing poll cannot unfreeze a pending pause', async () => {
  const x=setup({trackId:'song',playing:true}); x.api.commandOptions.push({neverSettle:true,neverApply:true}); x.request(true,30000,'replay'); await x.clock.advance(10);
  x.request(false,null,'pause'); const pos=x.c.snapshot().displayed.positionMs; const poll=x.c.observe(); await x.clock.advance(20); await poll;
  assert.equal(x.c.snapshot().displayed.playing,false); assert.equal(x.c.snapshot().displayed.positionMs,pos); await x.clock.advance(1100); assert.equal(x.c.snapshot().state,'paused');
});
test('hardening: delayed seek response cannot complete or displace a newer pause', async () => {
  const x=setup({trackId:'song',playing:true,positionMs:5000}); x.api.commandOptions.push({responseDelay:300,executeDelay:100});
  x.request(true,30000,'replay'); await x.clock.advance(20); const id=x.request(false,null,'pause');
  await x.clock.advance(150); assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'transitioning');
  await x.clock.advance(300); assert.deepEqual(names(x.api),['seek','pause']); assert.equal(x.c.snapshot().desired.id,id); assert.equal(x.c.snapshot().state,'paused');
});
(async () => { for (const t of tests) { await t.fn(); console.log('ok - '+t.name); } console.log(`${tests.length} unified controller scenarios passed`); })().catch(error => { console.error(error); process.exitCode=1; });
