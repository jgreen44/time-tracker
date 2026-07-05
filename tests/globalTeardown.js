/**
 * Jest globalTeardown – rebuild better-sqlite3 against Electron's ABI so the
 * app works again after running the test suite.
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalTeardown() {
  const root = path.resolve(__dirname, '..');
  console.log('[jest] Restoring better-sqlite3 for Electron (app environment)…');
  try {
    execSync('npx electron-rebuild -f -w better-sqlite3', { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.warn('[jest] electron-rebuild failed – run `npm run postinstall` before using the app.', err);
  }
};
