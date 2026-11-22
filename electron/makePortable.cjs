// Gera release/Marbot-Fichas-Portatil.zip a partir de release/win-unpacked (sem instalador).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'release', 'win-unpacked');
const dir = path.join(root, 'release', 'Marbot Fichas');
const zip = path.join(root, 'release', 'Marbot-Fichas-Portatil.zip');

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.cpSync(src, dir, { recursive: true });
fs.copyFileSync(path.join(root, 'LEIAME.md'), path.join(dir, 'LEIAME.md'));
execFileSync('zip', ['-rq9', zip, 'Marbot Fichas'], { cwd: path.join(root, 'release') });
console.log('  • portátil pronto:', path.relative(root, zip));
