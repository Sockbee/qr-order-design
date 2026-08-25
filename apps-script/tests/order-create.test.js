const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'OrderValidation.gs', 'OrderService.gs', 'Code.gs',
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

const token = 'b'.repeat(64);
const tokenHash = evaluate("sha256Hex_('" + 'a'.repeat(64) + ':' + token + "')");
const state = {
  Tables: [{
    table_id: 'T01', display_name: '테이블 1', token_hash: tokenHash,
    token_version: 1, active: true, sort_order: 1,
  }],
  Settings: [
    { key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN' },
    { key: 'MAX_ORDER_LINES', value: '20', type: 'INTEGER' },
    { key: 'ORDER_PREFIX', value: 'A-', type: 'STRING' },
    { key: 'NEXT_DISPLAY_NUMBER', value: '1042', type: 'INTEGER' },
  ],
  Categories: [
    { category_id: 'main', label: '메인', heading: '메인 메뉴', sort_order: 10, active: true },
  ],
  Menu: [
    {
      menu_id: 'main-menu', category_id: 'main', name: '메인 메뉴', description: '설명',
      base_price: 10000, image_url: '', available: true, min_quantity: 1, max_quantity: 5,
      allergens: '', origin: '', badge_tags: '', sort_order: 10,
    },
    {
      menu_id: 'sold-out', category_id: 'main', name: '품절 메뉴', description: '품절',
      base_price: 5000, image_url: '', available: false, min_quantity: 1, max_quantity: 5,
      allergens: '', origin: '', badge_tags: '', sort_order: 20,
    },
  ],
  MenuOptionGroups: [{
    option_group_id: 'required-group', menu_id: 'main-menu', label: '필수 옵션',
    selection_type: 'SINGLE', required: true, min_select: 1, max_select: 1,
    sort_order: 10, active: true,
  }],
  MenuOptions: [
    {
      option_id: 'option-a', option_group_id: 'required-group', menu_id: 'main-menu',
      name: '옵션 A', price_delta: 0, available: true, default_selected: true, sort_order: 10,
    },
    {
      option_id: 'option-b', option_group_id: 'required-group', menu_id: 'main-menu',
      name: '옵션 B', price_delta: 500, available: true, default_selected: false, sort_order: 20,
    },
    {
      option_id: 'option-sold-out', option_group_id: 'required-group', menu_id: 'main-menu',
      name: '품절 옵션', price_delta: 1000, available: false, default_selected: false, sort_order: 30,
    },
  ],
  Orders: [],
  OrderItems: [],
  OrderItemOptions: [],
  AuditLogs: [],
};

context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  return {
    rows: (state[sheetName] || []).map((row, index) => ({ ...row, __rowNumber: index + 2 })),
  };
};
context.appendObjectsBySchema_ = function appendObjects(spreadsheet, sheetName, objects) {
  if (!objects.length) return null;
  if (sheetName === 'OrderItemOptions' && context.__failOptionsOnce) {
    context.__failOptionsOnce = false;
    throw new Error('simulated option write failure');
  }
  const startRow = state[sheetName].length + 2;
  objects.forEach(object => state[sheetName].push({ ...object }));
  return { startRow, rowCount: objects.length };
};
context.updateObjectRowBySchema_ = function updateObject(spreadsheet, sheetName, rowNumber, patch) {
  Object.assign(state[sheetName][rowNumber - 2], patch);
};

function setting(key) {
  return state.Settings.find(row => row.key === key);
}

function apiCall(pathInfo, payload) {
  const event = JSON.stringify({
    pathInfo,
    postData: { contents: JSON.stringify({ apiVersion: 'v1', ...payload }) },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

function orderPayload(clientRequestId, overrides = {}) {
  return {
    tableId: 'T01',
    tableToken: token,
    clientRequestId,
    note: '테스트 주문',
    items: [{ menuId: 'main-menu', quantity: 2, selectedOptionIds: ['option-b'] }],
    ...overrides,
  };
}

const firstRequestId = '11111111-1111-4111-8111-111111111111';
const firstPayload = orderPayload(firstRequestId);
const created = apiCall('/orders/create', firstPayload);
assert.equal(created.success, true);
assert.equal(created.data.displayNumber, 1042);
assert.equal(created.data.displayCode, 'A-1042');
assert.equal(created.data.totalAmount, 21000);
assert.equal(created.data.status, 'RECEIVED');
assert.equal(created.data.publicStatus, 'accepted');
assert.equal(created.data.paymentStatus, 'UNPAID');
assert.equal(created.data.idempotentReplay, false);
assert.equal(created.data.items[0].unitPrice, 10500);
assert.equal(created.data.items[0].lineTotal, 21000);
assert.equal(created.data.items[0].selectedOptions[0].optionId, 'option-b');
assert.equal(state.Orders.length, 1);
assert.equal(state.OrderItems.length, 1);
assert.equal(state.OrderItemOptions.length, 1);
assert.equal(setting('NEXT_DISPLAY_NUMBER').value, '1043');
assert.equal(state.Orders[0].write_state, 'COMMITTED');
assert.equal(state.Orders[0].client_request_id, firstRequestId);
assert.equal(state.Orders[0].request_fingerprint.length, 64);
assert.equal(JSON.stringify(state).includes(token), false);

const replay = apiCall('/orders/create', firstPayload);
assert.equal(replay.success, true);
assert.equal(replay.data.orderId, created.data.orderId);
assert.equal(replay.data.idempotentReplay, true);
assert.equal(state.Orders.length, 1);
assert.equal(state.OrderItems.length, 1);
assert.equal(state.OrderItemOptions.length, 1);
assert.equal(setting('NEXT_DISPLAY_NUMBER').value, '1043');

const conflicting = apiCall('/orders/create', orderPayload(firstRequestId, {
  items: [{ menuId: 'main-menu', quantity: 1, selectedOptionIds: ['option-b'] }],
}));
assert.equal(conflicting.success, false);
assert.equal(conflicting.error.code, 'DUPLICATE_REQUEST');

const missingRequiredOption = apiCall('/orders/create', orderPayload(
  '22222222-2222-4222-8222-222222222222',
  { items: [{ menuId: 'main-menu', quantity: 1, selectedOptionIds: [] }] }
));
assert.equal(missingRequiredOption.success, false);
assert.equal(missingRequiredOption.error.code, 'INVALID_OPTION_SELECTION');

const soldOutMenu = apiCall('/orders/create', orderPayload(
  '33333333-3333-4333-8333-333333333333',
  { items: [{ menuId: 'sold-out', quantity: 1, selectedOptionIds: [] }] }
));
assert.equal(soldOutMenu.success, false);
assert.equal(soldOutMenu.error.code, 'MENU_SOLD_OUT');

const soldOutOption = apiCall('/orders/create', orderPayload(
  '44444444-4444-4444-8444-444444444444',
  { items: [{ menuId: 'main-menu', quantity: 1, selectedOptionIds: ['option-sold-out'] }] }
));
assert.equal(soldOutOption.success, false);
assert.equal(soldOutOption.error.code, 'OPTION_SOLD_OUT');

const clientPrice = apiCall('/orders/create', {
  ...orderPayload('55555555-5555-4555-8555-555555555555'),
  totalAmount: 1,
});
assert.equal(clientPrice.success, false);
assert.equal(clientPrice.error.code, 'INVALID_REQUEST');

setting('EVENT_OPEN').value = 'FALSE';
const replayWhileClosed = apiCall('/orders/create', firstPayload);
assert.equal(replayWhileClosed.success, true);
assert.equal(replayWhileClosed.data.idempotentReplay, true);
const closedNewOrder = apiCall('/orders/create', orderPayload(
  '66666666-6666-4666-8666-666666666666'
));
assert.equal(closedNewOrder.success, false);
assert.equal(closedNewOrder.error.code, 'EVENT_CLOSED');
setting('EVENT_OPEN').value = 'TRUE';

state.Tables[0].active = false;
const replayAtInactiveTable = apiCall('/orders/create', firstPayload);
assert.equal(replayAtInactiveTable.success, true);
assert.equal(replayAtInactiveTable.data.idempotentReplay, true);
const inactiveNewOrder = apiCall('/orders/create', orderPayload(
  '99999999-9999-4999-8999-999999999999'
));
assert.equal(inactiveNewOrder.success, false);
assert.equal(inactiveNewOrder.error.code, 'INACTIVE_TABLE');
state.Tables[0].active = true;

context.__failOptionsOnce = true;
const recoveryPayload = orderPayload('77777777-7777-4777-8777-777777777777');
const failedWrite = apiCall('/orders/create', recoveryPayload);
assert.equal(failedWrite.success, false);
assert.equal(failedWrite.error.code, 'INTERNAL_ERROR');
const failedOrder = state.Orders.find(row => row.client_request_id === recoveryPayload.clientRequestId);
assert.equal(failedOrder.write_state, 'FAILED');
const failedOrderItemCount = state.OrderItems.filter(row => row.order_id === failedOrder.order_id).length;
assert.equal(failedOrderItemCount, 1);
assert.equal(
  state.OrderItemOptions.filter(row => row.order_id === failedOrder.order_id).length,
  0
);

const recovered = apiCall('/orders/create', recoveryPayload);
assert.equal(recovered.success, true);
assert.equal(recovered.data.idempotentReplay, true);
assert.equal(failedOrder.write_state, 'COMMITTED');
assert.equal(state.OrderItems.filter(row => row.order_id === failedOrder.order_id).length, 1);
assert.equal(state.OrderItemOptions.filter(row => row.order_id === failedOrder.order_id).length, 1);
assert.equal(setting('NEXT_DISPLAY_NUMBER').value, '1044');

failedOrder.write_state = 'WRITING';
failedOrder.updated_at = new Date();
const inProgress = apiCall('/orders/create', recoveryPayload);
assert.equal(inProgress.success, false);
assert.equal(inProgress.error.code, 'ORDER_WRITE_IN_PROGRESS');
failedOrder.write_state = 'COMMITTED';

context.__lockAllowed = false;
const locked = apiCall('/orders/create', orderPayload(
  '88888888-8888-4888-8888-888888888888'
));
assert.equal(locked.success, false);
assert.equal(locked.error.code, 'LOCK_TIMEOUT');
context.__lockAllowed = true;

console.log('order-create tests passed');
