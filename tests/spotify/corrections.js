'use strict';
const assert = require('node:assert/strict');
const Controller = require('../../assets/js/spotify-playback-controller.js');
const {Clock, SpotifySimulator} = require('./simulator.js');
async function loop(change) {
  const clock = new Clock(), api = new SpotifySimulator(clock);
  api.change({trackId:'song', deviceId:'original', playing:true, positionMs:99500});
  const c = new Controller({api, clock});
  const context = {contextId:'tab', trackId:'song', trackUri:'spotify:track:song', durationMs:100000};
  c.selectContext(context);
  const poll = c.observe(); await clock.advance(1); await poll;
  api.change(change);
  c.loopBoundary({traversalId:1, positionMs:10000});
  await clock.advance(1000);
  return {api,c};
}
(async () => {
  const cases = {
    track: {trackId:'other'}, device:{deviceId:'new'}, pause:{playing:false}, valid:{}
  };
  for (const [name, change] of Object.entries(cases)) {
    const {api} = await loop(change);
    assert.deepEqual(api.commands.map(c=>c.name), name === 'valid' ? ['seek'] : [], name);
  }
  const clock = new Clock(), api = new SpotifySimulator(clock);
  api.change({trackId:'song', deviceId:'original', playing:true, positionMs:99500});
  const c = new Controller({api, clock});
  c.selectContext({contextId:'tab', trackId:'song', trackUri:'spotify:track:song', durationMs:100000});
  const initial = c.observe(); await clock.advance(1); await initial;
  api.observationOptions.push({deliveryDelay:300});
  c.loopBoundary({traversalId:1, positionMs:10000}); await clock.advance(10);
  api.change({trackId:'other', deviceId:'new'}); await clock.advance(1000);
  assert.deepEqual(api.commands, []);
  assert.equal(c.snapshot().state, 'uncertain');
  console.log('B1: 5 loop dispatch regressions passed');
})().catch(e=>{ console.error(e); process.exitCode=1; });
