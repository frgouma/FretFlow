# Spotify playback diagnostics

Open the browser developer console on the FretFlow page. The recorder is off by default and exists only in memory for the current page. Enable it before reproducing:

```js
FretFlowSpotifyDiagnostics.enable()
```

After reproducing, obtain the newline-delimited report with:

```js
FretFlowSpotifyDiagnostics.report()
```

Copy the returned text from the console; where the browser provides a `copy` console helper, `copy(FretFlowSpotifyDiagnostics.report())` copies it directly. Stop recording and erase the buffer and session aliases with:

```js
FretFlowSpotifyDiagnostics.disable()
FretFlowSpotifyDiagnostics.clear()
```

The newest 250 events are retained. Timestamps are wall-clock UTC; durations and ages use the browser's monotonic clock. Request IDs correlate request start, completion and state application. An older-response flag means a newer playback-state request had already started; it does not prove the response is stale. `stateAgeMs` measures time since FretFlow received the response, not the age of Spotify's underlying device state. `requestAgeMs` includes request and response processing. Aliases are local to the current capture and reset on clear. A report may contain playback positions and timing, so review it before sharing.

For the account-free mock test from the repository root:

```sh
node tests/spotify/diagnostics.js
```

## Optional Seek experiment

The experiment is independently disabled by default and resets on page reload. Enable diagnostics as above to observe it, then use:

```js
FretFlowSpotifySeekExperiment.enable()
FretFlowSpotifySeekExperiment.status() // true or false
FretFlowSpotifySeekExperiment.disable()
```

After an accepted nonzero Play, the experiment waits 800 ms and performs one targeted playback-state read. It seeks only when the same track and active device are playing, the Spotify state timestamp is plausibly after Play, and progress is more than three seconds outside the range that accounts for elapsed time. It skips a response if verification takes more than five seconds from Play start. It attempts at most one Seek, then waits 600 ms and reads state once more. New playback intent, changing tabs, or disabling the experiment invalidates pending work. A Seek already sent cannot be recalled. The verification does not update the playhead directly; normal polling does that.

Spotify's timestamp represents a state change, not a guaranteed fresh sample of the device position. Clock differences, missing timestamps, delayed device state, or slow requests can make the experiment skip a case or leave uncertainty; even a recent timestamp cannot prove the returned position was sampled after Play. An HTTP success does not prove the device applied Seek. Review `seekExperiment.*` events alongside request status and playback-state events. Track and device values are session aliases.

Run both account-free tests from the repository root:

```sh
node tests/spotify/diagnostics.js
node tests/spotify/seek_experiment.js
```

## Direct Seek manual Replay experiment

This switch is independent of the recorder and the earlier conditional Seek fallback, is off by default, and resets on reload:

```js
FretFlowSpotifyDirectSeekExperiment.enable()
FretFlowSpotifyDirectSeekExperiment.status() // true or false
FretFlowSpotifyDirectSeekExperiment.disable()
```

For a controlled Android comparison:

1. Open FretFlow in Firefox on Linux. Select the native Spotify Android app as playback device and start the same track selected in FretFlow.
2. Set A near 0:30, B near 1:00, and Replay delay to zero. In the console run:

   ```js
   FretFlowSpotifySeekExperiment.disable()
   FretFlowSpotifyDiagnostics.clear()
   FretFlowSpotifyDiagnostics.enable()
   FretFlowSpotifyDirectSeekExperiment.enable()
   ```

3. While the track is playing, press manual Replay several times. Listen for any fragment from 0:00, note how quickly playback reaches A, and watch the black playhead.
4. Retrieve `FretFlowSpotifyDiagnostics.report()` and copy the returned text. For each eligible Replay, check for one `/me/player/seek` request and no `/me/player/play` or `/me/player/pause` request, then inspect subsequent `state.received` and `state.applied` events. A successful HTTP response alone does not prove the device applied the Seek.
5. Disable direct Seek, clear the diagnostic buffer, and repeat the same manual Replay test for the existing behavior. Optionally repeat both tests with the desktop Spotify Web Player. Disable and clear diagnostics when finished.

A recent playback-state response must show the selected track playing on an active, unrestricted device before the experiment can reposition it. The existing selector must agree with that device; the target must be within the track. A failed Seek is reported without a Play retry, and normal polling can reconcile state. Other cases retain the existing Replay path. Existing polling is unchanged and can still temporarily move the playhead based on a delayed response; a state timestamp or HTTP success cannot guarantee the device has applied the command. A Seek already sent cannot be recalled. Remote playback is not sample-accurate.

Run the account-free tests with:

```sh
node tests/spotify/diagnostics.js
node tests/spotify/seek_experiment.js
node tests/spotify/direct_seek_experiment.js
```


## Looping, scrubbing and delayed Replay experiment

Use Firefox on Linux, the native Spotify Android app, the same track playing in both, A near 0:30 and B near 1:00. In the console run:

```js
FretFlowSpotifySeekExperiment.disable()
FretFlowSpotifyDiagnostics.enable()
FretFlowSpotifyDirectSeekExperiment.enable()
```

**A — Zero delay:** Clear diagnostics, set the replay delay to zero, press Replay, let playback reach B, then scrub the playhead while playing. Listen for any fragment from 0:00 and watch the playhead. The report should show device-targeted Seek commands without Play or Pause for eligible operations. Read it with `FretFlowSpotifyDiagnostics.report()`.

**B — Two-second delay:** Clear diagnostics, set delay to two seconds, press Replay and let playback subsequently reach B. Listen for silence, the duration of the countdown, and the position at which audio resumes. The playhead should stay at A during the countdown. The report should show Pause and a paused-state confirmation, Seek and a paused-position confirmation, delay, and URI-free Resume followed by a state check. A command accepted by Spotify is not proof that the device applied it.

**C — Cancellation:** During the countdown, press Play/Pause or Replay. Confirm that the old countdown does not send a Resume. Save each report for comparison. Finally run `FretFlowSpotifyDirectSeekExperiment.disable()`, `FretFlowSpotifyDiagnostics.disable()`, and `FretFlowSpotifyDiagnostics.clear()`.

The experiment uses at most two state reads for each verification phase, with a 250 ms interval and a three-second limit for each request. It stops on uncertain state, rejected commands, timeout or cancellation; it does not restart with a URI after a failure. The additional check after the countdown catches detected track/device changes before Resume. Spotify's state timestamp is a change timestamp rather than proof of a fresh device sample, so verification is conservative but cannot eliminate all races. Commands already sent cannot be recalled. If a timed-out command never settles, further experimental commands are suppressed until it settles or the page is reloaded; disabling the experiment restores the ordinary path. Provisional playhead protection expires and regular polling resumes; no sample-accurate timing is promised. Paused scrubbing and other ineligible states keep their existing behavior.

Run all account-free tests:

```sh
node tests/spotify/diagnostics.js
node tests/spotify/seek_experiment.js
node tests/spotify/direct_seek_experiment.js
node tests/spotify/position_sequences.js
```

## Resume verification and ordinary Pause/Play

For the Android test, open FretFlow in Firefox on Linux with the native Spotify Android app selected as the playback device. Run:

```js
FretFlowSpotifySeekExperiment.disable()
FretFlowSpotifyDiagnostics.enable()
FretFlowSpotifyDirectSeekExperiment.enable()
```

1. **Delayed Replay:** Play the selected track, set A near 0:30 and B near 1:00, and set delay to two seconds. Press Replay several times. Confirm silence during the countdown, resumption near A, and no verification error when playback succeeds.
2. **Pause/Play:** Play from a nonzero position, press Pause, then press Play without moving the playhead. Confirm Android resumes at the paused position and FretFlow's playhead follows.
3. **Moved playhead:** Pause, move the black playhead to a different position, then press Play. Confirm that the experiment does not issue URI-free Resume at the old paused position. This case retains the existing Play pathway and its Android limitations.

Clear the diagnostic buffer before each case with `FretFlowSpotifyDiagnostics.clear()` and capture failures with `FretFlowSpotifyDiagnostics.report()`. Inspect `directSeek.resume.eligibility` and `directSeek.resume.verify`, including `fresh`, `advancing` and `progressDeltaMs`, alongside request events. Disable and clear diagnostics and disable the experiment when finished.

Resume confirmation accepts a matching, plausible playing position with a fresh state-change timestamp; when that timestamp is old, it instead requires two plausible post-request observations that advance consistently. The latter is evidence rather than proof that Spotify's device state is fresh. Pause and Seek verification retain their existing timestamp requirements. The ordinary optimization requires an unmoved playhead close to Spotify's paused position and the same verified active device. An accepted command does not by itself confirm playback.

Run the account-free Resume test with:

```sh
node tests/spotify/resume_experiment.js
```

## Isolated unified controller (4Z)

`assets/js/spotify-playback-controller.js` is not loaded by FretFlow. It exports a CommonJS constructor or the browser global `FretFlowSpotifyPlaybackController`. Inject `api` and optionally a monotonic `clock` (`now`, `setTimeout`, `clearTimeout`). The adapter's `observe()` resolves to `{trackId, deviceId, playing, positionMs, timestamp, restricted}`; `command(name, args)` resolves to `{status, retryAfterMs}` and supports `playTrack`, `seek`, `pause`, and `resume`. It must reject network errors; HTTP failures should resolve with their status. The adapter owns authentication, conversion to Spotify's wire format, and active-device policy. It must not transparently retry a playback mutation after refreshing credentials: an explicit 401 may invoke its optional `refreshAuth()`, after which the controller rechecks operation and device identity before one retry. Observation failures reject with `status` and optionally `retryAfterMs`; playback commands return those fields. Refresh returns a boolean. Its observations must represent snapshots generated during the request, and timing is measured by the controller. Neither adapter nor controller can cancel a mutation already delivered to Spotify.

Call `selectContext({contextId, trackId, trackUri, durationMs})` on tab selection; it does not mutate playback. Call `requestPlayback({contextId, trackId, trackUri, playing, position:{mode:'retain'|'absolute', ms}, reason, source, devicePolicy:'active'})` for all playback intents. It returns an operation ID. `beginDrag(ms)`, `updateDrag(ms)`, and `cancelDrag()` control the local cursor; submit an absolute intent on release. `loopBoundary({traversalId, positionMs})` submits an ordinary absolute playing intent once per traversal. Capture `metadataToken()` when starting metadata retrieval and pass it to `setDuration(contextId, trackId, ms, token)`; the selection revision also fences a return to the same tab. Render `snapshot()`; use `observe()` or `observationToken()` plus `acceptObservation(token, observation)` for polling. Track and device identities in snapshots are application data, not diagnostics.

`idle`, `playing`, `paused`, `transitioning`, and `uncertain` distinguish display and remote knowledge. Accepted HTTP responses are followed by bounded observation checks. A different track uses URI Play followed by a separate Seek; same-track movement uses Seek; a paused track resumes with URI-free Resume. The executor serializes dispatch and preserves the latest pending intent across a bounded timeout. It never retries an alternate mutation. `enableDiagnostics()`, `diagnostics()`, `disableDiagnostics()`, and `clearDiagnostics()` manage an opt-in bounded memory-only allowlisted record; the context generation is its anonymous context identity. No raw identifiers, titles, URIs, credentials, or bodies are recorded.

Run `node tests/spotify/unified_controller.js`. `simulator.js` separates dispatch, response, device execution, snapshot generation and delivery using virtual time; the existing tests above remain applicable to the active UI.

### Current limitations before integration

This is an isolated prototype, not evidence of Spotify or Android compatibility. Observation confirmation is bounded plausibility evidence, not proof that a position snapshot was generated after the device applied a command; Spotify's timestamp is a state-change timestamp. A delayed mutation can execute after a timeout and after a later intent: a later poll is necessary to detect a contradictory effect. The controller retains the latest intent, stops interpolation and exposes uncertainty; it does not issue an automatic corrective command. Recovery requires a deliberate new intent. This is conservative because a remote user action and a late mutation can be indistinguishable. A command already delivered cannot be recalled, and no finite observation window can prove that it will never execute. A recent Spotify timestamp does not establish snapshot freshness. Verifications are bounded plausibility checks, not proof of application. The simulator does not establish behavior of real Spotify devices or authentication services. Integration requires real-device validation and an adapter that honors the no-transparent-retry contract. `loopBoundary` requires the caller to supply a new traversal identity after each crossing.

### 4AA integration and deletion inventory

Baseline before 4Z: `FretFlow.html` 8,552 lines; the `SpotifyPractice` class spans approximately 1,464 lines (2036–3499 including its trailing whitespace/comments); the diagnostic and experiment declarations occupy another 63 lines (1973–2035). Runtime experiment switches are `FretFlowSpotifySeekExperiment` and `FretFlowSpotifyDirectSeekExperiment`, both off by default. Existing account-free tests are `diagnostics.js`, `seek_experiment.js`, `direct_seek_experiment.js`, `position_sequences.js`, and `resume_experiment.js`.

For 4AA, first review the uncertainty policy and adapter contract above and adapt the existing authenticated API transport to the controller interface without duplicating token management. Route tab selection, metadata, poll responses, play/pause, drag release, Replay and loop crossing through the controller; bind rendering to its snapshot and preserve selected-tab/session identity. Bundle/load the controller in the central application in a manner compatible with direct `file://` and standalone export requirements.

Then remove the superseded playback portions of `SpotifyPractice`: `pausePlayback`, `playTrackAt`, `verifySeekExperiment`, the play/resume decision and `experimentalPosition`, `replayFromA`, `autoReplay`, `withDelay`, `cancelCountdown`, and the old scrub/poll/playhead synchronization pathways (`syncPlaybackState`, `applyPlaybackState`, `finishPlayheadScrub`, `estimatedProgressMs`, and playback-related `tickPlayback` logic). Retain or adapt UI, authentication, track metadata, A/B marker, and device transport code as needed; audit all call sites before deletion. Remove the two experiment switch declarations and their fences/state (`directSeekPending`, `directSeekCommandInFlight`, `directSeekFence`, `scrubOperation`), and replace duplicated ownership such as `syncBaseMs`, `syncAt`, `playheadDirty`, `loopRunning`, and playback `isPlaying` with controller state.

Remove the `practiceDelay` markup, `.practice-delay` CSS and responsive rule, `this.delay`, its change handler and assignments, `countdownId`, `withDelay`/`cancelCountdown`, and session `delay` reads/defaults. Preserve any historical project data without writing a schema migration. Remove delay-specific busy handling only after its remaining UI uses are reviewed. Migrate useful behavior from the five existing tests to adapter/controller and UI integration tests, then delete experiment-only tests once the code and switches are removed; retain privacy coverage from `diagnostics.js`. Replace the existing diagnostic wiring deliberately rather than leaving two competing recorders. Recheck offline use, export behavior, and real Spotify devices before making the new controller active.

### Hardening invariants and test coverage (4Z.1)

Each accepted intent has an identity and generation; only the executor calls `command`. A newer intent fences earlier observations and dependent continuations. A context selection has a separate metadata revision. Device or track changes suspend an active plan while preserving the desired intent, and never initiate a reclaim. Same-track positioning uses Seek; paused positioning cannot Resume unless explicitly requested. Accepted commands require observations, and request, verification, provisional display, refresh and interpolation have bounded waits. Contradiction after an unknown outcome freezes the displayed playhead and remains uncertain until a new explicit intent; looping is suppressed in that state. HTTP rejection, local backoff and unknown outcomes are exposed through `snapshot().failure`. HTTP 5xx, network failure and timeout are treated as potentially executed; 401/403/404/429 are explicit rejections.

The simulator records command and observation dispatch and independently schedules HTTP delivery, remote execution, snapshot creation and snapshot delivery. `unified_controller.js` contains the original 18 scenarios and 27 hardening scenarios, including late effects, contradictory positions, external track/device changes, tab and metadata fencing, rapid intents, 401 refresh races, 403/404/429/5xx, network failures and timeouts. A new intent supersedes local continuations but cannot cancel Spotify-side execution. Protection expires into uncertainty rather than pretending the remote operation was reversed. Observation 429 backoff applies to both polling and commands.

Readiness for 4AA remains conditional on an integration review of evidence strength and the authentication adapter contract, followed by actual Spotify device validation. In particular, after an indeterminate old mutation the controller may conservatively report uncertainty for an unrelated external action; it cannot attribute a later Spotify state change to a particular request. The consumer must continue bounded polling and must render uncertainty instead of automatically resubmitting intent.
