// No global teardown required – @libsql/client uses napi-rs prebuilts and
// does not need ABI restoration after tests.
module.exports = async function globalTeardown() {};
