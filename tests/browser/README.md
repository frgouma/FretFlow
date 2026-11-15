# Browser smoke test

With the existing `fretflow-dev` Conda environment, from the repository root:

```sh
conda run -n fretflow-dev pytest -s tests/browser
```

The pytest Playwright plugin launches headless Chromium in a fresh, non-persistent
context. The test opens `FretFlow.html` directly using `file://`, blocks and
reports external HTTP(S) requests, and checks the initial unloaded launcher and
startup JavaScript errors. It does not install dependencies or use songbook data.
It permits local file requests only within the repository; service workers are
blocked. The test requires the already installed Playwright Chromium browser.
