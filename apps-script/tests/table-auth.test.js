const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = ['Http.gs', 'TableCatalogService.gs', 'TableProvisioning.gs', 'Code.gs']
  .map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8'))
  .join('\n');

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
    getUuid() { return '11111111-2222-4333-8444-555555555555'; },
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
        mimeType: null,
        setMimeType(mimeType) { this.mimeType = mimeType; return this; },
      };
    },
  },
  encodeURIComponent,
  Set,
  Map,
  Date,
  JSON,
});
vm.runInContext(source, context);

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

assert.equal(
  evaluate("sha256Hex_('abc')"),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
);
assert.equal(evaluate("constantTimeEquals_('same', 'same')"), true);
assert.equal(evaluate("constantTimeEquals_('same', 'different')"), false);
assert.equal(evaluate("normalizeFrontendBaseUrl_('https://caucse.shop/')"), 'https://caucse.shop');
assert.throws(() => evaluate("normalizeFrontendBaseUrl_('http://caucse.shop')"));
assert.throws(() => evaluate("normalizeFrontendBaseUrl_('https://caucse.shop/path')"));
assert.equal(evaluate('formatTableId_(1)'), 'T01');
assert.equal(evaluate('formatTableId_(100)'), 'T100');
assert.equal(
  evaluate("buildTableQrUrl_('https://caucse.shop/', 'T01', 'token value')"),
  'https://caucse.shop/t/T01?token=token%20value'
);
assert.equal(evaluate("apiRoute_({pathInfo:'/resolve-table/'})"), 'resolve-table');
assert.equal(evaluate("apiRoute_({parameter:{action:'health'}})"), 'health');
assert.equal(
  evaluate("parseJsonBody_({postData:{contents:'{\"apiVersion\":\"v1\"}'}}).apiVersion"),
  'v1'
);
assert.equal(
  evaluate("(() => { try { parseJsonBody_({postData:{contents:'{}'}}); } catch (e) { return e.code; } })()"),
  'UNSUPPORTED_API_VERSION'
);

const token = 'b'.repeat(64);
context.__tableRows = [{
  table_id: 'T01',
  display_name: '테이블 1',
  token_hash: evaluate("sha256Hex_('" + 'a'.repeat(64) + ":" + token + "')"),
  token_version: 1,
  active: true,
}];
context.__settingsRows = [
  { key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN' },
  { key: 'STORE_NAME', value: '테스트 매장', type: 'STRING' },
  { key: 'NOTICE', value: '테스트 안내', type: 'STRING' },
  { key: 'STATUS_POLL_SECONDS', value: '15', type: 'INTEGER' },
];
context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  return { rows: sheetName === 'Settings' ? context.__settingsRows : context.__tableRows };
};
assert.equal(
  evaluate("validateTable_('T01', '" + token + "', true, {}).table_id"),
  'T01'
);
assert.equal(
  evaluate("(() => { try { validateTable_('T02', '" + token + "', true, {}); } catch (e) { return e.code; } })()"),
  'INVALID_TABLE_TOKEN'
);
assert.equal(
  evaluate("(() => { try { validateTable_('T01', '" + 'c'.repeat(64) + "', true, {}); } catch (e) { return e.code; } })()"),
  'INVALID_TABLE_TOKEN'
);

const health = JSON.parse(evaluate("doGet({pathInfo:'/health'}).text"));
assert.equal(health.success, true);
assert.equal(health.data.status, 'ok');

const resolveEvent = JSON.stringify({
  pathInfo: '/resolve-table',
  postData: {
    contents: JSON.stringify({ apiVersion: 'v1', tableId: 'T01', tableToken: token }),
  },
});
const resolved = JSON.parse(evaluate('doPost(' + resolveEvent + ').text'));
assert.equal(resolved.success, true);
assert.equal(resolved.data.table.tableId, 'T01');
assert.equal(resolved.data.statusPollSeconds, 15);

context.__settingsRows[0].value = 'FALSE';
const closed = JSON.parse(evaluate('doPost(' + resolveEvent + ').text'));
assert.equal(closed.success, false);
assert.equal(closed.error.code, 'EVENT_CLOSED');

console.log('table-auth tests passed');
