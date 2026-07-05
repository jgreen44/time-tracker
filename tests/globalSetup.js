/**
 * Jest globalSetup – rebuild better-sqlite3 against the system Node.js ABI
 * so the DB integration tests can load the native module.
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  const root = path.resolve(__dirname, '..');
  console.log('[jest] Rebuilding better-sqlite3 for Node.js (test environment)…');
  execSync('npm rebuild better-sqlite3', { cwd: root, stdio: 'inherit' });
};
