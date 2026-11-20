'use strict';
// Functional invariants migrated from the 4T–4X experiment suites.
const assert = require('node:assert/strict');
const Controller = require('../../assets/js/spotify-playback-controller.js');
const {Clock, SpotifySimulator} = require('./simulator.js');
const cases = [];
const test = (name, fn) => cases.push({name, fn});
function setup(remote = {}) {
  const clock = new Clock(), api = new SpotifySimulator(clock);
  api.change({trackId:'song', deviceId:'device', playing:true, positionMs:50000, ...remote});
  const controller = new Controller({api, clock, timeoutMs:1000, verifyIntervalMs:100, verifyAttempts:3, toleranceMs:100});
  const context = {contextId:'tab', trackId:'song', trackUri:'spotify:track:song', durationMs:120000};
  controller.selectContext(context);
  const request = (playing, ms, reason) => controller.requestPlayback({...context, playing, reason, position:ms === null ? {mode:'retain'} : {mode:'absolute', ms}});
  return {clock, api, controller, context, request};
}
const names = x => x.api.commands.map(c=>c.name);
test('new track at nonzero position is selected then sought separately', async () => {
  const x=setup({trackId:'other'}); x.request(true,30000,'play'); await x.clock.advance(20);
  assert.deepEqual(names(x),['playTrack','seek']); assert.equal(x.api.commands[1].args.positionMs,30000);
});
test('same track manual replay and scrub only seek', async () => {
  const x=setup(); x.request(true,30000,'replay'); await x.clock.advance(20);
  x.request(true,45000,'scrub'); await x.clock.advance(20); assert.deepEqual(names(x),['seek','seek']);
});
test('paused scrub stays paused and URI-free resume retains target', async () => {
  const x=setup({playing:false}); x.request(false,30000,'scrub'); await x.clock.advance(20);
  assert.equal(x.api.remote.playing,false); x.request(true,null,'play'); await x.clock.advance(20);
  assert.deepEqual(names(x),['seek','resume']); assert.equal(x.api.remote.positionMs,30000);
  assert.equal(x.api.commands[1].args.trackUri,undefined);
});
test('restricted or absent device causes no command', async () => {
  for (const remote of [{restricted:true},{deviceId:null}]) {
    const x=setup(remote); x.request(true,30000,'replay'); await x.clock.advance(20);
    assert.deepEqual(names(x),[]); assert.equal(x.controller.snapshot().state,'uncertain');
  }
});
test('failed seek does not fall back to play', async () => {
  for (const opt of [{status:403},{status:500},{network:true}]) {
    const x=setup(); x.api.commandOptions.push(opt); x.request(true,30000,'replay'); await x.clock.advance(20);
    assert.deepEqual(names(x),['seek']); assert.equal(x.controller.snapshot().state,'uncertain');
    assert.equal(x.controller.snapshot().displayed.playing,false);
  }
});
test('contradictory seek observations expire without repeated commands', async () => {
  const x=setup(); x.api.commandOptions.push({neverApply:true}); x.request(true,30000,'replay'); await x.clock.advance(500);
  assert.deepEqual(names(x),['seek']); assert.equal(x.controller.snapshot().state,'uncertain');
  const pos=x.controller.snapshot().displayed.positionMs; await x.clock.advance(1000); assert.equal(x.controller.snapshot().displayed.positionMs,pos);
});
test('new pause during replay observation prevents old seek', async () => {
  const x=setup(); x.api.observationOptions.push({deliveryDelay:100}); x.request(true,30000,'replay'); await x.clock.advance(10);
  x.request(false,null,'pause'); await x.clock.advance(200); assert.deepEqual(names(x),['pause']);
});
test('tab change during seek prevents dependent resume', async () => {
  const x=setup({playing:false}); x.api.commandOptions.push({responseDelay:100}); x.request(true,30000,'scrub'); await x.clock.advance(10);
  x.controller.selectContext({contextId:'next',trackId:'next',trackUri:'spotify:track:next',durationMs:120000});
  await x.clock.advance(200); assert.deepEqual(names(x),['seek']); assert.equal(x.controller.snapshot().context.trackId,'next');
});
(async()=>{for(const t of cases) {await t.fn(); console.log('ok - '+t.name);} console.log(`${cases.length} migrated behavior scenarios passed`);})().catch(error=>{console.error(error);process.exitCode=1;});
