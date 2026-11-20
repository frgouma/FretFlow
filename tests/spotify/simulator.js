'use strict';
// Virtual time and independent delivery/execution delays for the Spotify boundary.
class Clock {
  constructor() { this.time = 0; this.next = 0; this.jobs = []; }
  now = () => this.time;
  setTimeout = (fn, ms) => { const id = ++this.next; this.jobs.push({id, at:this.time + ms, fn}); return id; };
  clearTimeout = id => { this.jobs = this.jobs.filter(job => job.id !== id); };
  async advance(ms) {
    const end = this.time + ms;
    for (let count = 0; count < 10000; count++) {
      await this.flush(); this.jobs.sort((a,b) => a.at-b.at || a.id-b.id);
      if (!this.jobs.length || this.jobs[0].at > end) { this.time = end; await this.flush(); return; }
      const job = this.jobs.shift(); this.time = job.at; job.fn();
    }
    throw new Error('Virtual clock runaway');
  }
  async flush() { for (let i=0; i<20; i++) await Promise.resolve(); }
}
class SpotifySimulator {
  constructor(clock) {
    this.clock = clock; this.remote = {trackId:'other', deviceId:'device', playing:false, positionMs:0, timestamp:0, restricted:false};
    this.anchorAt = clock.now(); this.commands = []; this.commandOptions = []; this.observationOptions = []; this.refreshOptions = []; this.refreshes = 0; this.observations = 0;
  }
  progress() { return this.remote.positionMs + (this.remote.playing ? this.clock.now()-this.anchorAt : 0); }
  change(fields) { this.remote.positionMs = this.progress(); this.anchorAt = this.clock.now(); Object.assign(this.remote, fields); }
  command(name, args) {
    const opt = this.commandOptions.shift() || {}; this.commands.push({name, args, at:this.clock.now()});
    if (!opt.neverApply && !opt.status && (!opt.network || opt.applyOnNetworkFailure)) this.clock.setTimeout(() => {
      if (this.remote.deviceId !== args.deviceId) return;
      if (name === 'playTrack') this.change({trackId:args.trackUri.split(':').pop(), playing:true, positionMs:0, timestamp:this.clock.now()});
      if (name === 'seek') this.change({positionMs:args.positionMs, timestamp:this.clock.now()});
      if (name === 'pause') this.change({playing:false, timestamp:this.clock.now()});
      if (name === 'resume') this.change({playing:true, timestamp:this.clock.now()});
    }, opt.executeDelay || 0);
    return new Promise((resolve, reject) => {
      if (opt.neverSettle) return;
      this.clock.setTimeout(() => opt.network ? reject(new Error('network')) : resolve({status:opt.status || 204, retryAfterMs:opt.retryAfterMs}), opt.responseDelay || 0);
    });
  }
  refreshAuth() {
    const opt = this.refreshOptions.shift() || {}; this.refreshes++;
    return new Promise((resolve, reject) => {
      if (opt.neverSettle) return;
      this.clock.setTimeout(() => opt.network ? reject(new Error('refresh failed')) : resolve(opt.success !== false), opt.delay || 0);
    });
  }
  observe() {
    this.observations++;
    const opt = this.observationOptions.shift() || {};
    return new Promise((resolve, reject) => {
      if (opt.neverSettle) return;
      this.clock.setTimeout(() => {
        const snapshot = {...this.remote, positionMs:this.progress(), ...opt.override};
        this.clock.setTimeout(() => opt.status ? reject(Object.assign(new Error('HTTP failure'), {status:opt.status, retryAfterMs:opt.retryAfterMs})) : opt.network ? reject(new Error('network')) : resolve(snapshot), opt.deliveryDelay || 0);
      }, opt.snapshotDelay || 0);
    });
  }
}
module.exports = {Clock, SpotifySimulator};
