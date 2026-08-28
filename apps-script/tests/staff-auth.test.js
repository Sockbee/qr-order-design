const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'StaffAuthService.gs', 'Code.gs',
].map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

const pepper = 'a'.repeat(64);
const tokenSecret = 's'.repeat(64);
const passcode = 'correct horse battery staple';
const properties = {
  SPREADSHEET_ID: 'spreadsheet-id',
  TOKEN_PEPPER: pepper,
  STAFF_PASSCODE_HASH: crypto.createHash('sha256')
    .update(pepper + ':' + passcode, 'utf8').digest('hex'),
  STAFF_TOKEN_SECRET: tokenSecret,
};
const cacheValues = new Map();
let uuidCounter = 0;
let settingsReadCount = 0;

function webSafeBase64(value) {
  const buffer = typeof value === 'string'
    ? Buffer.from(value, 'utf8')
    : Buffer.from(Array.from(value, byte => (Number(byte) + 256) % 256));
  return buffer.toString('base64url') + (buffer.length % 3 === 1 ? '==' : buffer.length % 3 === 2 ? '=' : '');
}

const context = vm.createContext({
  console: { error() {}, warn() {} },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, text) {
      assert.equal(algorithm, 'SHA_256');
      return Array.from(crypto.createHash('sha256').update(text, 'utf8').digest())
        .map(byte => byte > 127 ? byte - 256 : byte);
    },
    computeHmacSha256Signature(text, secret) {
      return Array.from(crypto.createHmac('sha256', secret).update(text, 'utf8').digest())
        .map(byte => byte > 127 ? byte - 256 : byte);
    },
    base64EncodeWebSafe(value) { return webSafeBase64(value); },
    base64DecodeWebSafe(value) { return Array.from(Buffer.from(value, 'base64url')); },
    newBlob(bytes) {
      return { getDataAsString() { return Buffer.from(bytes).toString('utf8'); } };
    },
    getUuid() {
      uuidCounter += 1;
      return '00000000-0000-4000-8000-' + String(uuidCounter).padStart(12, '0');
    },
  },
  PropertiesService: {
    getScriptProperties() {
      return { getProperty(key) { return properties[key] ?? null; } };
    },
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return cacheValues.has(key) ? cacheValues.get(key) : null; },
        put(key, value) { cacheValues.set(key, String(value)); },
        remove(key) { cacheValues.delete(key); },
      };
    },
  },
  ContentService: {
    MimeType: { JSON: 'JSON' },
    createTextOutput(text) {
      return {
        text,
        setMimeType(mimeType) { this.mimeType = mimeType; return this; },
      };
    },
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock() { return context.__lockAllowed !== false; },
        releaseLock() {},
      };
    },
  },
  Set,
  Map,
  Date,
  JSON,
});
vm.runInContext(source, context);

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

const state = {
  Settings: [
    { key: 'STAFF_TOKEN_EPOCH', value: '3', type: 'INTEGER' },
    { key: 'STAFF_SESSION_HOURS', value: '14', type: 'INTEGER' },
  ],
  AuditLogs: [],
};
context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  if (sheetName === 'Settings') settingsReadCount += 1;
  return {
    rows: (state[sheetName] || []).map((row, index) => ({ ...row, __rowNumber: index + 2 })),
  };
};
context.appendObjectsBySchema_ = function appendObjects(spreadsheet, sheetName, objects) {
  objects.forEach(object => state[sheetName].push({ ...object }));
  return { startRow: state[sheetName].length - objects.length + 2, rowCount: objects.length };
};

function apiCall(action, payload) {
  const event = JSON.stringify({
    parameter: { action },
    postData: { contents: JSON.stringify({ apiVersion: 'v1', ...payload }) },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

const invalidLabel = apiCall('staff/login', { passcode, deviceLabel: '창고' });
assert.equal(invalidLabel.success, false);
assert.equal(invalidLabel.error.code, 'INVALID_DEVICE_LABEL');

const mismatch = apiCall('staff/login', { passcode: 'wrong passcode', deviceLabel: '서빙' });
assert.equal(mismatch.success, false);
assert.equal(mismatch.error.code, 'STAFF_PASSCODE_MISMATCH');
assert.equal(state.AuditLogs[0].action, 'STAFF_LOGIN_FAILED');
assert.equal(JSON.stringify(state.AuditLogs[0]).includes('wrong passcode'), false);

const login = apiCall('staff/login', { passcode, deviceLabel: '주방' });
assert.equal(login.success, true);
assert.equal(login.data.deviceLabel, '주방');
assert.match(login.data.staffToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
assert.equal(Date.parse(login.data.expiresAt) > Date.now(), true);
assert.equal(state.AuditLogs.length, 2);
assert.equal(state.AuditLogs[1].action, 'STAFF_LOGIN');
assert.equal(state.AuditLogs[1].actor_id, '주방');
assert.equal(JSON.stringify(state).includes(passcode), false);
assert.equal(JSON.stringify(state).includes(properties.STAFF_PASSCODE_HASH), false);

const verified = JSON.parse(evaluate(
  'JSON.stringify(verifyStaffToken_(' + JSON.stringify(login.data.staffToken) + '))'
));
assert.equal(verified.deviceLabel, '주방');
assert.equal(verified.epoch, 3);
assert.equal(settingsReadCount, 2); // login settings + first token verification cache miss
evaluate('verifyStaffToken_(' + JSON.stringify(login.data.staffToken) + ')');
assert.equal(settingsReadCount, 2); // epoch is cached for subsequent middleware calls

const tampered = login.data.staffToken.slice(0, -1) +
  (login.data.staffToken.endsWith('a') ? 'b' : 'a');
assert.equal(evaluate(
  "(() => { try { verifyStaffToken_(" + JSON.stringify(tampered) + "); } catch (e) { return e.code; } })()"
), 'STAFF_TOKEN_INVALID');

const nowSeconds = Math.floor(Date.now() / 1000);
const expiredToken = evaluate('signStaffToken_(' + JSON.stringify({
  deviceLabel: '주방', issuedAt: nowSeconds - 7200, expiresAt: nowSeconds - 3600, epoch: 3,
}) + ')');
assert.equal(evaluate(
  "(() => { try { verifyStaffToken_(" + JSON.stringify(expiredToken) + "); } catch (e) { return e.code; } })()"
), 'STAFF_TOKEN_EXPIRED');

const oldEpochToken = evaluate('signStaffToken_(' + JSON.stringify({
  deviceLabel: '주방', issuedAt: nowSeconds, expiresAt: nowSeconds + 3600, epoch: 2,
}) + ')');
assert.equal(evaluate(
  "(() => { try { verifyStaffToken_(" + JSON.stringify(oldEpochToken) + "); } catch (e) { return e.code; } })()"
), 'STAFF_TOKEN_REVOKED');

const missingAuth = apiCall('staff/calls/list', {});
assert.equal(missingAuth.success, false);
assert.equal(missingAuth.error.code, 'STAFF_AUTH_REQUIRED');
const validAuthUnimplementedRoute = apiCall('staff/orders/update', {
  staffToken: login.data.staffToken,
});
assert.equal(validAuthUnimplementedRoute.success, false);
assert.equal(validAuthUnimplementedRoute.error.code, 'NOT_FOUND');

cacheValues.clear();
for (let attempt = 1; attempt <= 4; attempt += 1) {
  assert.equal(evaluate("recordStaffLoginFailure_('서빙')"), null);
}
const retryAfter = evaluate("recordStaffLoginFailure_('서빙')");
assert.equal(retryAfter > Date.now(), true);
assert.equal(evaluate("isStaffLoginThrottled_('서빙')"), true);
assert.equal(evaluate("isStaffLoginThrottled_('카운터')"), true); // global counter
const throttled = apiCall('staff/login', { passcode: 'wrong again', deviceLabel: '서빙' });
assert.equal(throttled.success, false);
assert.equal(throttled.error.code, 'STAFF_LOGIN_THROTTLED');
assert.equal(Date.parse(throttled.error.details.retryAfter) > Date.now(), true);
evaluate("clearStaffLoginFailures_('서빙')");
assert.equal(evaluate("isStaffLoginThrottled_('서빙')"), false);

context.__lockAllowed = false;
const lockTimeout = apiCall('staff/login', { passcode, deviceLabel: '결제' });
assert.equal(lockTimeout.success, false);
assert.equal(lockTimeout.error.code, 'LOCK_TIMEOUT');

console.log('staff auth tests passed');
