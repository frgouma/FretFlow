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
