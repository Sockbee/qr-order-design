const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'TableSessionService.gs', 'OrderValidation.gs', 'OrderService.gs',
  'StaffTableService.gs', 'StaffOrderEditService.gs', 'StaffAuthService.gs', 'Code.gs',
].map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

let uuidCounter = 0;
const context = vm.createContext({
  console: { error() {}, warn() {} },
  Utilities: {
    getUuid() {
      uuidCounter += 1;
      return '00000000-0000-4000-8000-' + String(uuidCounter).padStart(12, '0');
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
  Set,
  Map,
  Date,
  JSON,
});
vm.runInContext(source, context);

const now = Date.now();
const openSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const paidSessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state = {
  Tables: [
    { table_id: 'T01', display_name: '테이블 1', active: true },
    { table_id: 'T02', display_name: '테이블 2', active: true },
  ],
  TableSessions: [
    {
      session_id: openSessionId, table_id: 'T01', origin_table_id: 'T01', status: 'OPEN',
      discount_rate: 0, merged_into_session_id: '', payment_status: 'UNPAID',
      subtotal_amount: '', discount_amount: '', final_amount: '',
      opened_at: new Date(now - 3600000), closed_at: '', paid_at: '', updated_at: new Date(),
    },
    {
      session_id: paidSessionId, table_id: 'T02', origin_table_id: 'T02', status: 'CLOSED',
      discount_rate: 0, merged_into_session_id: '', payment_status: 'PAID',
      subtotal_amount: 3000, discount_amount: 0, final_amount: 3000,
      opened_at: new Date(now - 7200000), closed_at: new Date(), paid_at: new Date(),
      updated_at: new Date(),
    },
  ],
  Orders: [
    {
      order_id: 'order-1', session_id: openSessionId, write_state: 'COMMITTED',
      status: 'RECEIVED', public_status: 'accepted', payment_status: 'UNPAID',
      total_amount: 1000, note: '', note_audience: 'GENERAL',
      write_payload_json: '[]', created_at: new Date(now - 120000), updated_at: new Date(),
    },
    {
      order_id: 'order-2', session_id: openSessionId, write_state: 'COMMITTED',
      status: 'PREPARING', public_status: 'preparing', payment_status: 'UNPAID',
      total_amount: 2000, note: '', note_audience: 'GENERAL',
      write_payload_json: '[]', created_at: new Date(now - 60000), updated_at: new Date(),
    },
    {
      order_id: 'order-3', session_id: paidSessionId, write_state: 'COMMITTED',
      status: 'COMPLETED', public_status: 'closed', payment_status: 'PAID',
      total_amount: 3000, note: '', note_audience: 'GENERAL',
      write_payload_json: '[]', created_at: new Date(now - 180000), updated_at: new Date(),
    },
  ],
  OrderItems: [
    {
      order_item_id: 'order-1-01', order_id: 'order-1', line_no: 1, menu_id: 'menu-1',
      menu_name_snapshot: '첫 메뉴', base_price_snapshot: 1000, unit_price_snapshot: 1000,
      quantity: 1, line_total: 1000, created_at: new Date(), status: 'ACTIVE', updated_at: new Date(),
    },
    {
      order_item_id: 'order-2-01', order_id: 'order-2', line_no: 1, menu_id: 'menu-2',
      menu_name_snapshot: '둘째 메뉴', base_price_snapshot: 1500, unit_price_snapshot: 2000,
      quantity: 1, line_total: 2000, created_at: new Date(), status: 'ACTIVE', updated_at: new Date(),
    },
    {
      order_item_id: 'order-3-01', order_id: 'order-3', line_no: 1, menu_id: 'menu-3',
      menu_name_snapshot: '결제 메뉴', base_price_snapshot: 3000, unit_price_snapshot: 3000,
      quantity: 1, line_total: 3000, created_at: new Date(), status: 'ACTIVE', updated_at: new Date(),
    },
  ],
  OrderItemOptions: [{
    order_item_option_id: 'order-2-01-01', order_item_id: 'order-2-01', order_id: 'order-2',
    option_id: 'large', option_group_name_snapshot: '크기', option_name_snapshot: '대',
    price_delta_snapshot: 500, sort_order: 1, created_at: new Date(),
  }],
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
context.requireStaffAuth_ = function requireStaffAuth(payload) {
  if (payload.staffToken !== 'valid-staff-token') {
    throw new context.ApiError('STAFF_AUTH_REQUIRED', '운영 인증이 필요합니다.', false);
  }
  return { deviceLabel: '카운터' };
};

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

function apiCall(action, payload = {}) {
  const event = JSON.stringify({
    parameter: { action },
    postData: { contents: JSON.stringify({
      apiVersion: 'v1', staffToken: 'valid-staff-token', ...payload,
    }) },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

const quantity = apiCall('staff/orders/update', {
  operation: 'quantity', itemId: 'order-1-01', quantity: 3,
});
assert.equal(quantity.success, true, JSON.stringify(quantity));
assert.equal(state.OrderItems[0].quantity, 3);
assert.equal(state.OrderItems[0].line_total, 3000);
assert.equal(state.Orders[0].total_amount, 3000);
assert.equal(JSON.parse(state.Orders[0].write_payload_json)[0].quantity, 3);

const itemCancel = apiCall('staff/orders/update', {
  operation: 'cancel-item', itemId: 'order-1-01',
});
assert.equal(itemCancel.success, true, JSON.stringify(itemCancel));
assert.equal(state.OrderItems[0].status, 'CANCELLED');
assert.equal(state.Orders[0].status, 'CANCELLED');
assert.equal(state.Orders[0].total_amount, 0);
assert.equal(JSON.parse(state.Orders[0].write_payload_json)[0].cancelled, true);

const note = apiCall('staff/orders/update', {
  operation: 'note', tableId: 'T01', note: '서빙 전에 알려 주세요', audience: 'serving',
});
assert.equal(note.success, true, JSON.stringify(note));
assert.equal(state.Orders[1].note, '서빙 전에 알려 주세요');
assert.equal(state.Orders[1].note_audience, 'SERVING');

const paidMutation = apiCall('staff/orders/update', {
  operation: 'quantity', itemId: 'order-3-01', quantity: 2,
});
assert.equal(paidMutation.success, false);
assert.equal(paidMutation.error.code, 'SESSION_ALREADY_PAID');

const wholeCancel = apiCall('staff/orders/cancel', { tableId: 'T01' });
assert.equal(wholeCancel.success, true, JSON.stringify(wholeCancel));
assert.equal(state.Orders[1].status, 'CANCELLED');
assert.equal(state.Orders[1].total_amount, 0);
assert.equal(state.OrderItems[1].status, 'CANCELLED');
assert.equal(state.AuditLogs.some(log => log.action === 'TABLE_ORDERS_CANCELLED'), true);

console.log('staff order edit tests passed');
