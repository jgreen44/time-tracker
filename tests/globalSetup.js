// No global setup required – @libsql/client uses napi-rs prebuilts and does
// not need to be rebuilt per Node.js or Electron ABI.
module.exports = async function globalSetup() {};
