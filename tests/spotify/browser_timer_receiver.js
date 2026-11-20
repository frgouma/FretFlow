'use strict';
// Emulate browser timer methods that require the global object as receiver.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/spotify-playback-controller.js', 'utf8');
const context = {performance, nativeSetTimeout:setTimeout, nativeClearTimeout:clearTimeout};
vm.createContext(context);
vm.runInContext(`
  globalThis.setTimeout = function (fn, ms) {
    if (this !== globalThis) throw new TypeError('Illegal invocation: setTimeout receiver');
    return nativeSetTimeout(fn, ms);
  };
  globalThis.clearTimeout = function (id) {
    if (this !== globalThis) throw new TypeError('Illegal invocation: clearTimeout receiver');
    return nativeClearTimeout(id);
  };
`, context);
vm.runInContext(source, context);
(async () => {
  const controller = vm.runInContext(`new FretFlowSpotifyPlaybackController({api:{
    observe:async () => ({trackId:'track',deviceId:'device',playing:false,positionMs:0}),
    command:async () => ({status:204})
  }})`, context);
  controller.selectContext({contextId:'tab',trackId:'track',trackUri:'spotify:track:track'});
  assert.equal((await controller.observe()).deviceId, 'device');
  await controller.sleep(0);
  console.log('Browser timer receiver: observation, timeout cleanup and sleep passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
