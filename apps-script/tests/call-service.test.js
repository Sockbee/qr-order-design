const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'OrderValidation.gs', 'CallService.gs', 'Code.gs',
].map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

let uuidCounter = 0;
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
    getUuid() {
      uuidCounter += 1;
      return '00000000-0000-4000-8000-' + String(uuidCounter).padStart(12, '0');
    },
  },
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return 'a'.repeat(64); } };
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

const token = 'b'.repeat(64);
const tokenHash = evaluate("sha256Hex_('" + 'a'.repeat(64) + ':' + token + "')");
const state = {
  Tables: [{
    table_id: 'T01', display_name: '테이블 1', token_hash: tokenHash,
    token_version: 1, active: true, sort_order: 1,
  }],
  Settings: [
    { key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN' },
    { key: 'CALL_MIN_INTERVAL_SECONDS', value: '60', type: 'INTEGER' },
  ],
  Calls: [],
  AuditLogs: [],
};

context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  return {
    rows: (state[sheetName] || []).map((row, index) => ({ ...row, __rowNumber: index + 2 })),
  };
};
context.appendObjectsBySchema_ = function appendObjects(spreadsheet, sheetName, objects) {
  const startRow = state[sheetName].length + 2;
  objects.forEach(object => state[sheetName].push({ ...object }));
  return { startRow, rowCount: objects.length };
};
context.updateObjectRowBySchema_ = function updateObject(spreadsheet, sheetName, rowNumber, patch) {
  Object.assign(state[sheetName][rowNumber - 2], patch);
};

function apiCall(action, payload) {
  const event = JSON.stringify({
    parameter: { action },
    postData: { contents: JSON.stringify({ apiVersion: 'v1', ...payload }) },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

function createPayload(clientRequestId, overrides = {}) {
  return {
    tableId: 'T01',
    tableToken: token,
    reason: 'WATER_UTENSIL',
    clientRequestId,
    ...overrides,
  };
}

const firstRequestId = '11111111-1111-4111-8111-111111111111';
const created = apiCall('calls/create', createPayload(firstRequestId));
assert.equal(created.success, true);
assert.equal(created.data.tableId, 'T01');
assert.equal(created.data.reason, 'WATER_UTENSIL');
assert.equal(created.data.status, 'PENDING');
assert.equal(created.data.idempotentReplay, false);
assert.equal(state.Calls.length, 1);
assert.equal(state.Calls[0].client_request_id, firstRequestId);
assert.equal(state.AuditLogs[0].action, 'CALL_CREATED');
assert.equal(JSON.stringify(state).includes(token), false);

state.Tables[0].active = false;
state.Settings[0].value = 'FALSE';
const replay = apiCall('calls/create', createPayload(firstRequestId));
assert.equal(replay.success, true);
assert.equal(replay.data.callId, created.data.callId);
assert.equal(replay.data.idempotentReplay, true);
assert.equal(state.Calls.length, 1);

const conflictingReplay = apiCall('calls/create', createPayload(firstRequestId, {
  reason: 'SIDE_PLATE',
}));
assert.equal(conflictingReplay.success, false);
assert.equal(conflictingReplay.error.code, 'DUPLICATE_REQUEST');

const inactiveNew = apiCall('calls/create', createPayload(
  '22222222-2222-4222-8222-222222222222'
));
assert.equal(inactiveNew.success, false);
assert.equal(inactiveNew.error.code, 'INACTIVE_TABLE');

state.Tables[0].active = true;
const closedNew = apiCall('calls/create', createPayload(
  '33333333-3333-4333-8333-333333333333'
));
assert.equal(closedNew.success, false);
assert.equal(closedNew.error.code, 'EVENT_CLOSED');
state.Settings[0].value = 'TRUE';

const throttled = apiCall('calls/create', createPayload(
  '44444444-4444-4444-8444-444444444444'
));
assert.equal(throttled.success, false);
assert.equal(throttled.error.code, 'CALL_TOO_FREQUENT');
assert.equal(state.Calls.length, 1);
assert.equal(state.AuditLogs.at(-1).action, 'CALL_THROTTLED');

state.Calls[0].created_at = new Date(Date.now() - 61000);
const second = apiCall('calls/create', createPayload(
  '55555555-5555-4555-8555-555555555555',
  { reason: 'PAYMENT_REQUEST' }
));
assert.equal(second.success, true);
assert.equal(state.Calls.length, 2);

const cancelled = apiCall('calls/cancel', {
  tableId: 'T01', tableToken: token, callId: second.data.callId,
});
assert.equal(cancelled.success, true);
assert.equal(cancelled.data, null);
assert.equal(state.Calls[1].status, 'CANCELLED');
assert.equal(state.Calls[1].cancelled_at instanceof Date, true);
assert.equal(state.AuditLogs.at(-1).action, 'CALL_CANCELLED');

const cancelledAgain = apiCall('calls/cancel', {
  tableId: 'T01', tableToken: token, callId: second.data.callId,
});
assert.equal(cancelledAgain.success, false);
assert.equal(cancelledAgain.error.code, 'CALL_ALREADY_RESOLVED');

state.Calls[0].status = 'ACKNOWLEDGED';
state.Calls[0].acknowledged_at = new Date();
const acknowledgedCancel = apiCall('calls/cancel', {
  tableId: 'T01', tableToken: token, callId: created.data.callId,
});
assert.equal(acknowledgedCancel.success, false);
assert.equal(acknowledgedCancel.error.code, 'CALL_ALREADY_RESOLVED');

const missing = apiCall('calls/cancel', {
  tableId: 'T01', tableToken: token,
  callId: '99999999-9999-4999-8999-999999999999',
});
assert.equal(missing.success, false);
assert.equal(missing.error.code, 'CALL_NOT_FOUND');

const invalidReason = apiCall('calls/create', createPayload(
  '66666666-6666-4666-8666-666666666666',
  { reason: 'FREE_TEXT' }
));
assert.equal(invalidReason.success, false);
assert.equal(invalidReason.error.code, 'INVALID_REQUEST');

const unexpectedField = apiCall('calls/create', {
  ...createPayload('77777777-7777-4777-8777-777777777777'),
  passcode: 'must-not-be-accepted',
});
assert.equal(unexpectedField.success, false);
assert.equal(unexpectedField.error.code, 'INVALID_REQUEST');

context.__lockAllowed = false;
const lockTimeout = apiCall('calls/create', createPayload(
  '88888888-8888-4888-8888-888888888888'
));
assert.equal(lockTimeout.success, false);
assert.equal(lockTimeout.error.code, 'LOCK_TIMEOUT');

console.log('call service tests passed');
