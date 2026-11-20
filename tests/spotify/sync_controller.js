'use strict';
// Keep the inline browser copy generated from the canonical controller source.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const htmlPath = path.join(root, 'FretFlow.html');
const source = fs.readFileSync(path.join(root, 'assets/js/spotify-playback-controller.js'), 'utf8');
if (/<\/script/i.test(source)) throw new Error('Controller source contains an HTML script closing tag');
const html = fs.readFileSync(htmlPath, 'utf8');
const tag = /<script id="fretflow-spotify-controller">\n[\s\S]*?<\/script>|<script src="assets\/js\/spotify-playback-controller\.js"><\/script>/g;
const matches = html.match(tag) || [];
if (matches.length !== 1) throw new Error(`Expected one controller script, found ${matches.length}`);
const updated = html.replace(tag, () => `<script id="fretflow-spotify-controller">\n${source}</script>`);
if (process.argv.includes('--check')) {
  if (updated !== html) { console.error('Embedded Spotify controller is out of sync; run node tests/spotify/sync_controller.js'); process.exitCode = 1; }
  else console.log('Embedded Spotify controller matches canonical source');
} else if (updated !== html) fs.writeFileSync(htmlPath, updated);
