const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'TableSessionService.gs', 'OrderValidation.gs', 'OrderService.gs',
  'OrderQueryService.gs', 'Code.gs',
].map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

let uuidCounter = 0;
const context = vm.createContext({
  console: { error() {}, warn() {} },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, text) {
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
      return { text, setMimeType() { return this; } };
    },
  },
  LockService: {
    getScriptLock() {
      return { tryLock() { return true; }, releaseLock() {} };
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

const tokenOne = 'b'.repeat(64);
const tokenTwo = 'c'.repeat(64);
const hashOne = evaluate("sha256Hex_('" + 'a'.repeat(64) + ':' + tokenOne + "')");
const hashTwo = evaluate("sha256Hex_('" + 'a'.repeat(64) + ':' + tokenTwo + "')");
const state = {
  Tables: [
    { table_id: 'T01', display_name: '테이블 1', token_hash: hashOne, active: true },
    { table_id: 'T02', display_name: '테이블 2', token_hash: hashTwo, active: true },
  ],
  Settings: [
    { key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN' },
    { key: 'MAX_ORDER_LINES', value: '20', type: 'INTEGER' },
    { key: 'ORDER_PREFIX', value: 'A-', type: 'STRING' },
    { key: 'NEXT_DISPLAY_NUMBER', value: '1042', type: 'INTEGER' },
  ],
  Categories: [
    { category_id: 'main', label: '메인', heading: '메인 메뉴', sort_order: 10, active: true },
  ],
  Menu: [{
    menu_id: 'main-menu', category_id: 'main', name: '원래 메뉴명', description: '설명',
    base_price: 10000, image_url: '', available: true, min_quantity: 1, max_quantity: 5,
    allergens: '', origin: '', badge_tags: '', sort_order: 10,
  }],
  MenuOptionGroups: [],
  MenuOptions: [],
  Orders: [],
  OrderItems: [],
  OrderItemOptions: [],
  TableSessions: [],
  AuditLogs: [],
};

context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  return { rows: (state[sheetName] || []).map((row, index) => ({ ...row, __rowNumber: index + 2 })) };
};
context.appendObjectsBySchema_ = function appendObjects(spreadsheet, sheetName, objects) {
  if (!objects.length) return null;
  const startRow = state[sheetName].length + 2;
  objects.forEach(object => state[sheetName].push({ ...object }));
  return { startRow, rowCount: objects.length };
};
context.updateObjectRowBySchema_ = function updateObject(spreadsheet, sheetName, rowNumber, patch) {
  Object.assign(state[sheetName][rowNumber - 2], patch);
};

function apiCall(pathInfo, payload) {
  const event = JSON.stringify({
    pathInfo,
    postData: { contents: JSON.stringify({ apiVersion: 'v1', ...payload }) },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

function create(clientRequestId, quantity) {
  return apiCall('/orders/create', {
    tableId: 'T01',
    tableToken: tokenOne,
    clientRequestId,
    items: [{ menuId: 'main-menu', quantity, selectedOptionIds: [] }],
  });
}

const first = create('11111111-1111-4111-8111-111111111111', 1);
assert.equal(first.success, true);
const second = create('22222222-2222-4222-8222-222222222222', 2);
assert.equal(second.success, true);
state.Orders[1].status = 'CANCELLED';
state.Orders[1].public_status = 'cancelled';

// Reads must use immutable snapshots rather than the current Menu sheet.
state.Menu[0].name = '변경된 메뉴명';
state.Menu[0].base_price = 999999;

const byId = apiCall('/orders/get', {
  tableId: 'T01', tableToken: tokenOne, orderId: first.data.orderId,
});
assert.equal(byId.success, true);
assert.equal(byId.data.displayCode, 'A-1042');
assert.equal(byId.data.totalAmount, 10000);
assert.equal(byId.data.items[0].name, '원래 메뉴명');
assert.equal(byId.data.items[0].basePrice, 10000);
assert.equal(Object.hasOwn(byId.data, 'idempotentReplay'), false);

const byDisplayCode = apiCall('/orders/get', {
  tableId: 'T01', tableToken: tokenOne, displayCode: 'A-1042',
});
assert.equal(byDisplayCode.success, true);
assert.equal(byDisplayCode.data.orderId, first.data.orderId);

const list = apiCall('/orders/list', { tableId: 'T01', tableToken: tokenOne });
assert.equal(list.success, true);
assert.deepEqual(list.data.orders.map(order => order.displayCode), ['A-1043', 'A-1042']);
assert.equal(list.data.orders[0].publicStatus, 'cancelled');
assert.equal(list.data.orders[0].items[0].name, '원래 메뉴명');
assert.deepEqual(list.data.orders[0].items[0].selectedOptions, []);
assert.equal(list.data.latestPublicStatus, 'accepted');
assert.equal(list.data.sessionTotalAmount, 10000);

const bothIdentifiers = apiCall('/orders/get', {
  tableId: 'T01', tableToken: tokenOne, orderId: first.data.orderId, displayCode: 'A-1042',
});
assert.equal(bothIdentifiers.success, false);
assert.equal(bothIdentifiers.error.code, 'INVALID_REQUEST');

const crossTable = apiCall('/orders/get', {
  tableId: 'T02', tableToken: tokenTwo, orderId: first.data.orderId,
});
assert.equal(crossTable.success, false);
assert.equal(crossTable.error.code, 'ORDER_NOT_FOUND');

state.Orders[0].write_state = 'FAILED';
const hiddenFailedWrite = apiCall('/orders/get', {
  tableId: 'T01', tableToken: tokenOne, orderId: first.data.orderId,
});
assert.equal(hiddenFailedWrite.success, false);
assert.equal(hiddenFailedWrite.error.code, 'ORDER_NOT_FOUND');
state.Orders[0].write_state = 'COMMITTED';

state.Tables[0].active = false;
const inactiveTableList = apiCall('/orders/list', { tableId: 'T01', tableToken: tokenOne });
assert.equal(inactiveTableList.success, true);

const extraField = apiCall('/orders/list', {
  tableId: 'T01', tableToken: tokenOne, totalAmount: 1,
});
assert.equal(extraField.success, false);
assert.equal(extraField.error.code, 'INVALID_REQUEST');

assert.equal(JSON.stringify(list).includes(tokenOne), false);
console.log('order-query API tests passed');
