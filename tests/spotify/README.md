# Spotify playback tests and diagnostics

The Spotify Practice Controls use `assets/js/spotify-playback-controller.js` as their sole playback authority. The primary HTML embeds a generated copy of the module before the FretFlow runtime; standalone export embeds the controller constructor into its runtime. SpotifyPractice adapts authentication, HTTP, tab selection and UI events. The controller plans and serializes mutations, reconciles observations, and provides the displayed position. Replay and looping seek immediately; historical delay values have no effect. Session marker preferences remain in memory and no saved schema migration is needed.

The mutation adapter does not refresh or retry credentials. A 401 is returned to the controller, which may refresh through the existing authentication layer and recheck operation and device identity before one retry. Read-only requests retain the existing refresh behavior. Opening a tab does not issue a playback mutation.

Run account-free checks from the repository root:

```sh
node tests/spotify/sync_controller.js --check
node tests/spotify/self_contained.js
node tests/spotify/unified_controller.js
node tests/spotify/migrated_behaviors.js
node tests/spotify/integration.js
node tests/spotify/recovery.js
node tests/spotify/diagnostics.js
node tests/spotify/standalone.js
node tests/spotify/corrections.js
node tests/spotify/position_corrections.js # known failing B2 regression
conda run -n fretflow-dev pytest -q tests/browser
```

The simulator covers 45 deterministic controller scenarios. Eight migrated scenarios preserve the functional intent of the retired Seek, Direct Seek, positioning and Resume experiment suites: separate track selection and Seek, same-track positioning, paused Seek and Resume, device eligibility, failure without fallback, bounded verification, supersession and tab switching. The simulator also covers delayed and out-of-order observations, authentication retry limits, device changes and uncertainty. Old tests for switch state, delayed Replay and experimental verification details were removed with those implementations.

The integration harness exercises actual SpotifyPractice handlers and the HTTP adapter with a simulated DOM and mocked transport, including historical session delay data and 401 refresh supersession. `diagnostics.js` checks the actual diagnostics facade and controller, including privacy and bounded recording. `standalone.js` runs the actual export function and initializes its embedded controller in a browser-like JavaScript context. These are not browser or Spotify-device tests. The browser smoke test requires Chromium to launch.

Diagnostics are opt-in and memory-only: `FretFlowSpotifyDiagnostics.enable()`, `.report()`, `.disable()`, and `.clear()`. Reports include controller events and sanitized request events. They can contain playback positions and timing; review them before sharing. Device and track identifiers are not recorded raw.

Neither mocks nor simulation establish compatibility with real Spotify devices. An accepted mutation is not proof that a device applied it; state confirmation is bounded evidence. The controller exposes uncertainty without automatically restarting playback, and a command already delivered to Spotify cannot be recalled.

The B1 regression covers external track, device and pause changes before loop dispatch, a delayed observation, and an unchanged playing device. A single fresh observation can still represent stale Spotify state, and an external change can occur after the observation. The B2 suite has 13 focused scenarios: 5 pass and 8 fail on the current controller. Failures cover transport supersession, unloaded-track scrubs, and an accepted seek that never executes. An attempted in-flight intent merge passed those scenarios but was reverted because it failed to apply a newer Pause after a seek timeout and conflicted with the existing Replay supersession test. B3 and R2 remain open. R1 recovery is covered by account-free tests; Android device and OAuth behavior still require live verification. The retired Resume suite included advancing-position evidence that is not fully represented by the migrated scenarios. The integration fake DOM does not reproduce every browser interaction; the standalone checks validate source embedding and initialization, not a complete exported application.

After editing the canonical controller, run `node tests/spotify/sync_controller.js` to update its inline copy in `FretFlow.html`; the `--check` command above detects drift. Do not edit the generated inline copy directly.

`recovery.js` exercises the production connection action, refresh, device and HTTP failure handling with mocked Spotify responses. Diagnostics include endpoint categories, status codes, authentication and device availability, and controller failure classifications; request bodies and credentials are not recorded.
