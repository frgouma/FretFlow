/* Standalone, account-free playback coordinator. No authentication or DOM dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FretFlowSpotifyPlaybackController = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  class SpotifyPlaybackController {
    constructor({api, clock = {now: () => performance.now(), setTimeout: (...args) => globalThis.setTimeout(...args), clearTimeout: (...args) => globalThis.clearTimeout(...args)}, timeoutMs = 3000, verifyIntervalMs = 250, verifyAttempts = 3, toleranceMs = 1500, diagnosticLimit = 250}) {
      if (!api || typeof api.command !== 'function' || typeof api.observe !== 'function') throw new TypeError('An API adapter is required');
      Object.assign(this, {api, clock, timeoutMs, verifyIntervalMs, verifyAttempts, toleranceMs, diagnosticLimit});
      this.context = null; this.desired = null; this.observed = null; this.command = null;
      this.state = 'idle'; this.sequence = 0; this.generation = 0; this.latestObservation = 0;
      this.anchor = {ms: 0, at: clock.now(), playing: false}; this.drag = null; this.protection = null;
      this.running = false; this.pending = null; this.events = []; this.recording = false; this.loopTraversal = null; this.cooldownUntil = 0;
      this.unknownEffect = false; this.failure = null; this.positionFence = null; this.selectionRevision = 0;
    }
    log(type, fields = {}) {
      if (!this.recording) return;
      // Deliberately allowlisted: never copy adapter responses or user-supplied strings.
      const safe = {};
      for (const key of ['operation', 'generation', 'command', 'result', 'reason', 'positionMs', 'playing', 'status']) {
        if (fields[key] !== undefined) safe[key] = fields[key];
      }
      this.events.push({at: this.clock.now(), type, ...safe});
      if (this.events.length > this.diagnosticLimit) this.events.shift();
    }
    enableDiagnostics() { this.recording = true; }
    disableDiagnostics() { this.recording = false; }
    clearDiagnostics() { this.events = []; }
    diagnostics() { return this.events.map(event => ({...event})); }
    clearContext() {
      ++this.generation; ++this.selectionRevision;
      this.context = null; this.pending = null; this.desired = null; this.observed = null;
      this.drag = null; this.protection = null; this.positionFence = null; this.failure = null;
      this.anchor = {ms:0, at:this.clock.now(), playing:false}; this.state = 'idle';
    }
    selectContext({contextId, trackId, trackUri, durationMs = 0}) {
      if (contextId == null || !trackId || !trackUri) throw new TypeError('Context and track required');
      ++this.sequence; ++this.generation; ++this.selectionRevision; this.context = {contextId, trackId, trackUri, durationMs: Math.max(0, Number(durationMs) || 0)};
      this.pending = null; this.desired = null; this.observed = null; this.drag = null; this.protection = null; this.failure = null; this.positionFence = null;
      this.anchor = {ms: 0, at: this.clock.now(), playing: false}; this.state = 'idle'; this.loopTraversal = null;
      this.log('context', {generation: this.generation});
    }
    metadataToken() { return {contextId:this.context?.contextId, trackId:this.context?.trackId, selection:this.selectionRevision}; }
    setDuration(contextId, trackId, durationMs, token) {
      if (!this.context || contextId !== this.context.contextId || trackId !== this.context.trackId || !Number.isFinite(durationMs) || !token || token.contextId !== contextId || token.trackId !== trackId || token.selection !== this.selectionRevision) return false;
      this.context.durationMs = Math.max(0, durationMs); return true;
    }
    clamp(ms) { const n = Math.max(0, Number(ms) || 0); return this.context?.durationMs ? Math.min(n, Math.max(0, this.context.durationMs - 1)) : n; }
    requestPlayback(intent) {
      if (!this.context || intent.contextId !== this.context.contextId || intent.trackId !== this.context.trackId || intent.trackUri !== this.context.trackUri || typeof intent.playing !== 'boolean' || !['retain', 'absolute'].includes(intent.position?.mode)) throw new TypeError('Invalid playback intent');
      if (intent.position.mode === 'absolute' && !Number.isFinite(intent.position.ms)) throw new TypeError('Invalid position');
      if (intent.devicePolicy && intent.devicePolicy !== 'active') throw new TypeError('Only the externally selected active device is supported');
      if (intent.source === 'loop' && (this.state !== 'playing' || this.running || this.pending || this.drag)) return null;
      const displayed = this.snapshot().displayed.positionMs;
      ++this.generation; // Fence polls that began before this intent.
      const op = {id: ++this.sequence, generation: this.generation, context: {...this.context}, playing: intent.playing,
        position: intent.position.mode === 'absolute' ? {mode: 'absolute', ms: this.clamp(intent.position.ms)} : {mode: 'retain'},
        source: intent.source === 'loop' ? 'loop' : 'user', reason: ['play','pause','replay','loop','scrub'].includes(intent.reason) ? intent.reason : 'other', devicePolicy: 'active'};
      if (op.source === 'loop') op.loopDeviceId = this.observed?.deviceId;
      if (this.pending || this.running) this.log('superseded', {operation: op.id});
      this.desired = op; this.pending = op; this.drag = null; this.failure = null;
      if (op.position.mode === 'absolute') {
        this.anchor = {ms: op.position.ms, at: this.clock.now(), playing: op.playing};
        this.protection = {operation: op.id, until: this.clock.now() + this.timeoutMs * (this.verifyAttempts + 3)};
      } else { this.anchor = {ms:displayed, at:this.clock.now(), playing:intent.playing && this.anchor.playing}; this.protection = null; }
      this.state = 'transitioning'; this.log('intent', {operation: op.id, reason: op.reason, playing: op.playing});
      void this.drain(); return op.id;
    }
    beginDrag(ms) {
      if (!this.context) return;
      ++this.generation; this.pending = null; if (this.desired) this.desired.cancelled = true; this.protection = null;
      if (this.running) this.state = 'uncertain';
      this.drag = {ms: this.clamp(ms), generation: this.generation}; this.log('drag', {positionMs: this.drag.ms});
    }
    updateDrag(ms) { if (this.drag) this.drag.ms = this.clamp(ms); }
    cancelDrag() { this.drag = null; }
    loopBoundary({traversalId, positionMs}) {
      if (!this.context || this.state !== 'playing' || this.running || this.pending || this.drag || traversalId == null || traversalId === this.loopTraversal) return null;
      this.loopTraversal = traversalId;
      return this.requestPlayback({...this.context, playing: true, position: {mode:'absolute', ms:positionMs}, source:'loop', reason:'loop'});
    }
    snapshot() {
      if (this.protection && this.clock.now() >= this.protection.until) {
        if (this.desired?.id === this.protection.operation) this.desired.cancelled = true;
        this.protection = null; this.state = 'uncertain'; this.freezeAtObservation(); this.log('protection-expired');
      }
      if (!this.protection && this.anchor.playing && this.clock.now() - this.anchor.at > this.timeoutMs * (this.verifyAttempts + 3)) {
        this.anchor = {ms:this.clamp(this.anchor.ms + this.timeoutMs * (this.verifyAttempts + 3)), at:this.clock.now(), playing:false}; this.state = 'uncertain';
      }
      const ms = this.drag ? this.drag.ms : this.clamp(this.anchor.ms + (this.anchor.playing ? Math.max(0, this.clock.now() - this.anchor.at) : 0));
      return {state:this.state, desired:this.desired && {...this.desired, context:{...this.desired.context}, position:{...this.desired.position}}, command:this.command && {...this.command}, observed:this.observed && {...this.observed}, failure:this.failure && {...this.failure}, displayed:{positionMs:ms, playing:!!this.anchor.playing, dragging:!!this.drag, provisional:!!this.protection}, context:this.context && {...this.context}};
    }
    freezeAtObservation() {
      const obs = this.observed;
      this.anchor = {ms:obs && obs.trackId === this.context?.trackId ? this.clamp(obs.positionMs) : 0, at:this.clock.now(), playing:false};
    }
    current(op) { return !op.cancelled && this.desired?.id === op.id && this.context?.contextId === op.context.contextId && op.generation === this.generation; }
    async bounded(promise) {
      let timer;
      try { return await Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = this.clock.setTimeout(() => reject(Object.assign(new Error('timeout'), {kind:'timeout'})), this.timeoutMs); })]); }
      finally { this.clock.clearTimeout(timer); }
    }
    sleep(ms) { return new Promise(resolve => this.clock.setTimeout(resolve, ms)); }
    observationToken() { return {contextId:this.context?.contextId, generation:this.generation, requestedAt:this.clock.now(), sequence:++this.latestObservation}; }
    acceptObservation(token, data) {
      if (!this.context || token.contextId !== this.context.contextId || token.generation !== this.generation || token.sequence < (this.appliedObservation || 0)) return false;
      this.appliedObservation = token.sequence;
      const obs = {...data, requestedAt:token.requestedAt, receivedAt:this.clock.now(), generation:token.generation, sequence:token.sequence};
      const previous = this.observed; this.observed = obs;
      this.log('observation', {generation:token.generation, playing:!!obs.playing, positionMs:Math.round(obs.positionMs || 0)});
      const activeCommand = this.running && this.command && this.command.operation === this.desired?.id;
      const changed = previous && (previous.deviceId !== obs.deviceId || previous.trackId !== obs.trackId);
      const expectedTrackChange = activeCommand && this.command.expectTrackChange && previous.deviceId === obs.deviceId && obs.trackId === this.context.trackId;
      if (changed && activeCommand && token.requestedAt >= this.command.dispatchedAt && !expectedTrackChange) {
        this.desired.cancelled = true; this.protection = null; this.state = 'uncertain'; this.unknownEffect = true; this.freezeAtObservation(); this.log('external-change');
        return true;
      }
      if (!this.running && !this.pending && this.positionFence && this.clock.now() < this.positionFence.until && obs.trackId === this.positionFence.trackId && obs.deviceId === this.positionFence.deviceId) {
        const expected = this.anchor.ms + (this.anchor.playing ? Math.max(0, obs.receivedAt - this.anchor.at) : 0);
        if (Math.abs(obs.positionMs - expected) > this.toleranceMs * 2) {
          this.anchor = {ms:this.clamp(expected), at:this.clock.now(), playing:false}; this.state = 'uncertain'; this.log('position-contradiction'); return true;
        }
      }
      if (!this.running && !this.pending && this.state === 'uncertain') { this.freezeAtObservation(); return true; }
      if (!this.running && !this.pending && this.unknownEffect && this.desired && changed) {
        this.state = 'uncertain'; this.freezeAtObservation(); this.log('late-contradiction'); return true;
      }
      if (!this.running && !this.pending && this.unknownEffect && this.desired && obs.trackId === this.context.trackId && previous?.trackId === obs.trackId && previous?.deviceId === obs.deviceId) {
        const expected = this.anchor.ms + (this.anchor.playing ? Math.max(0, obs.receivedAt - this.anchor.at) : 0);
        if (obs.playing !== this.anchor.playing || Math.abs(obs.positionMs - expected) > this.toleranceMs * 2) {
          this.state = 'uncertain'; this.freezeAtObservation(); this.log('late-contradiction'); return true;
        }
      }
      // During a plan, observations supply evidence but do not own the cursor.
      // The active operation publishes its verified anchor when it completes.
      if (this.running || this.pending) return true;
      if (!this.drag && !this.protection && obs.trackId === this.context.trackId) {
        this.anchor = {ms:this.clamp(obs.positionMs), at:this.clock.now(), playing:!!obs.playing};
        if (!this.running && !this.pending) this.state = obs.playing ? 'playing' : 'paused';
      } else if (!this.drag && !this.protection && obs.trackId !== this.context.trackId && !this.running) {
        this.anchor = {ms:0, at:this.clock.now(), playing:false}; this.state = 'idle';
      }
      return true;
    }
    async observe() {
      if (this.clock.now() < this.cooldownUntil) throw Object.assign(new Error('rate limited'), {kind:'rate-limit', outcome:'not-sent'});
      const token = this.observationToken();
      try {
        const data = await this.bounded(this.api.observe());
        return this.acceptObservation(token, data) ? this.observed : null;
      } catch (error) {
        if (error.status === 429) this.cooldownUntil = this.clock.now() + Math.max(0, Number(error.retryAfterMs) || 0);
        throw error;
      }
    }
    async mutate(op, name, args, expected) {
      if (!this.current(op)) return false;
      if (this.clock.now() < this.cooldownUntil) throw Object.assign(new Error('rate limited'), {kind:'rate-limit', outcome:'not-sent'});
      const dispatchedAt = this.clock.now();
      this.command = {operation:op.id, name, dispatchedAt, expectTrackChange:name === 'playTrack'};
      this.log('dispatch', {operation:op.id, command:name});
      try {
        let response = await this.bounded(this.api.command(name, args));
        // A 401 is an explicit rejection. Only that response permits one guarded
        // retry after the injected authentication adapter refreshes credentials.
        if (response?.status === 401 && typeof this.api.refreshAuth === 'function') {
          let refreshed;
          try { refreshed = await this.bounded(this.api.refreshAuth()); }
          catch (error) { if (error.kind && error.kind !== 'auth') throw error; throw Object.assign(new Error('authentication failed'), {kind:'auth', status:401}); }
          if (!this.current(op)) return false;
          if (!refreshed) throw Object.assign(new Error('authentication failed'), {kind:'auth', status:401});
          const state = await this.observe();
          if (!this.current(op)) return false;
          if (!state || state.deviceId !== args.deviceId || state.restricted) throw Object.assign(new Error('device changed'), {kind:'device'});
          if (op.source === 'loop' && (state.trackId !== op.context.trackId || !state.playing || this.clock.now() - state.requestedAt > this.verifyIntervalMs)) throw Object.assign(new Error('playback changed'), {kind:'uncertain'});
          this.command.dispatchedAt = this.clock.now();
          this.log('dispatch', {operation:op.id, command:name});
          response = await this.bounded(this.api.command(name, args));
        }
        if (response && response.status >= 400) {
          if (response.status === 429) this.cooldownUntil = this.clock.now() + Math.max(0, Number(response.retryAfterMs) || 0);
          throw Object.assign(new Error('rejected'), {kind:response.status === 429 ? 'rate-limit' : 'http', status:response.status});
        }
        this.log('command-result', {operation:op.id, command:name, result:'accepted'});
      } catch (error) {
        if (!error.status || error.status >= 500 || error.kind === 'timeout') this.unknownEffect = true;
        this.log('command-result', {operation:op.id, command:name, result:error.kind || 'network', status:error.status});
        throw error;
      }
      if (!this.current(op)) { this.unknownEffect = true; return false; }
      for (let i = 0; i < this.verifyAttempts && this.current(op); i++) {
        if (i) await this.sleep(this.verifyIntervalMs);
        if (!this.current(op)) { this.unknownEffect = true; return false; }
        let obs;
        try { obs = await this.observe(); }
        catch (error) { error.outcome = 'unknown'; throw error; }
        if (!this.current(op)) { this.unknownEffect = true; return false; }
        if (obs && obs.requestedAt >= dispatchedAt && expected(obs)) {
          this.log('verified', {operation:op.id, command:name}); return true;
        }
      }
      this.unknownEffect = true;
      throw Object.assign(new Error('unconfirmed'), {kind:'uncertain'});
    }
    async execute(op) {
      let obs = await this.observe();
      if (!this.current(op)) return;
      if (op.source === 'loop' && (!obs || !op.loopDeviceId || obs.deviceId !== op.loopDeviceId || obs.trackId !== op.context.trackId || !obs.playing || obs.restricted || this.clock.now() - obs.requestedAt > this.verifyIntervalMs)) {
        this.protection = null;
        this.anchor = {ms:obs?.trackId === op.context.trackId ? this.clamp(obs.positionMs) : 0, at:this.clock.now(), playing:!!(obs?.trackId === op.context.trackId && obs.playing)};
        this.state = !obs || this.clock.now() - obs.requestedAt > this.verifyIntervalMs ? 'uncertain' : obs.trackId === op.context.trackId ? (obs.playing ? 'playing' : 'paused') : 'idle';
        if (this.state === 'uncertain') this.anchor.playing = false;
        return;
      }
      if (!obs || !obs.deviceId || obs.restricted) throw Object.assign(new Error('device unavailable'), {kind:obs?.restricted ? 'restricted' : 'device', outcome:'not-sent'});
      const deviceId = obs.deviceId;
      // Pause addresses the current external playback, even when another tab is selected.
      if (obs.trackId !== op.context.trackId && !op.playing && op.position.mode === 'retain') {
        if (obs.playing && !await this.mutate(op, 'pause', {deviceId}, s => s.deviceId === deviceId && !s.playing)) return;
        if (this.current(op)) { this.protection = null; this.anchor = {ms:0, at:this.clock.now(), playing:false}; this.state = 'idle'; }
        return;
      }
      const same = () => this.observed?.trackId === op.context.trackId && this.observed?.deviceId === deviceId;
      const positionMatches = s => Math.abs(s.positionMs - op.position.ms) <= this.toleranceMs + (s.playing ? Math.max(0, s.receivedAt - this.command.dispatchedAt) : 0);
      const commands = [];
      if (obs.trackId !== op.context.trackId) {
        if (!op.playing) throw Object.assign(new Error('track not loaded'), {kind:'device'});
        commands.push('playTrack');
      }
      if (op.position.mode === 'absolute') commands.push('seek');
      if (op.playing) commands.push('resume-if-paused'); else commands.push('pause-if-playing');
      this.log('plan', {operation:op.id, command:commands.join(',')});
      if (obs.trackId !== op.context.trackId) {
        if (!await this.mutate(op, 'playTrack', {deviceId, trackUri:op.context.trackUri}, s => s.deviceId === deviceId && s.trackId === op.context.trackId && s.playing)) return;
      }
      if (op.position.mode === 'absolute') {
        if (!await this.mutate(op, 'seek', {deviceId, positionMs:op.position.ms}, s => same() && positionMatches(s))) return;
      }
      if (op.source === 'loop' && !this.observed.playing) throw Object.assign(new Error('playback changed'), {kind:'uncertain'});
      if (op.playing && !this.observed.playing) {
        if (!await this.mutate(op, 'resume', {deviceId}, s => same() && s.playing)) return;
      } else if (!op.playing && this.observed.playing) {
        if (!await this.mutate(op, 'pause', {deviceId}, s => same() && !s.playing)) return;
      }
      if (!this.current(op)) return;
      this.protection = null; obs = this.observed;
      this.anchor = {ms:this.clamp(obs.positionMs), at:this.clock.now(), playing:!!obs.playing};
      if (op.position.mode === 'absolute') this.positionFence = {trackId:obs.trackId, deviceId:obs.deviceId, until:this.clock.now() + this.timeoutMs * (this.verifyAttempts + 3)};
      this.state = obs.playing ? 'playing' : 'paused'; this.log('reconciled', {operation:op.id, positionMs:Math.round(this.anchor.ms)});
    }
    async drain() {
      if (this.running) return;
      this.running = true;
      try {
        while (this.pending) {
          const op = this.pending; this.pending = null;
          try { await this.execute(op); }
          catch (error) {
            if (this.current(op)) {
              this.protection = null; this.freezeAtObservation();
              this.failure = {kind:error.kind || 'network', status:error.status || null, outcome:error.outcome || (error.status && error.status < 500 ? 'rejected' : 'unknown')};
              this.state = 'uncertain'; this.log('failure', {operation:op.id, result:error.kind || 'network', status:error.status});
            }
          }
        }
      } finally { this.command = null; this.running = false; }
    }
  }
  return SpotifyPlaybackController;
});
