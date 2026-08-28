const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'TableSessionService.gs', 'OrderValidation.gs', 'OrderService.gs',
  'StaffTableService.gs', 'StaffCallService.gs', 'StaffDashboardService.gs',
  'StaffAuthService.gs', 'Code.gs',
].map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

let uuidCounter = 0;
const context = vm.createContext({
  console: { error() {}, warn() {} },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, text) {
      return Array.from(crypto.createHash('sha256').update(String(text)).digest())
        .map(value => value > 127 ? value - 256 : value);
    },
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
const state = {
  Tables: [1, 2, 3].map(number => ({
    table_id: 'T' + String(number).padStart(2, '0'),
    display_name: '테이블 ' + number,
    active: true,
    sort_order: number,
  })),
  TableSessions: [
    {
      session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', table_id: 'T01',
      origin_table_id: 'T01', status: 'OPEN', discount_rate: 20,
      merged_into_session_id: '', payment_status: 'UNPAID',
      subtotal_amount: '', discount_amount: '', final_amount: '',
      opened_at: new Date(now - 40 * 60_000), closed_at: '', paid_at: '',
      updated_at: new Date(),
    },
    {
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', table_id: 'T02',
      origin_table_id: 'T02', status: 'OPEN', discount_rate: 0,
      merged_into_session_id: '', payment_status: 'UNPAID',
      subtotal_amount: '', discount_amount: '', final_amount: '',
      opened_at: new Date(now - 20 * 60_000), closed_at: '', paid_at: '',
      updated_at: new Date(),
    },
  ],
  Orders: [
    {
      order_id: 'order-1', display_number: 1, display_code: 'A-1', table_id: 'T01',
      session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', write_state: 'COMMITTED',
      status: 'RECEIVED', public_status: 'accepted', payment_status: 'UNPAID',
      total_amount: 10000, note: '김치전 먼저', note_audience: 'KITCHEN',
      created_at: new Date(now - 10 * 60_000),
      status_updated_at: new Date(now - 10 * 60_000), updated_at: new Date(),
    },
    {
      order_id: 'order-2', display_number: 2, display_code: 'A-2', table_id: 'T01',
      session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', write_state: 'COMMITTED',
      status: 'SERVING', public_status: 'served', payment_status: 'UNPAID',
      total_amount: 5000, note: '', created_at: new Date(now - 20 * 60_000),
      status_updated_at: new Date(now - 5 * 60_000), updated_at: new Date(),
    },
    {
      order_id: 'order-3', display_number: 3, display_code: 'A-3', table_id: 'T02',
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', write_state: 'COMMITTED',
      status: 'COMPLETED', public_status: 'closed', payment_status: 'UNPAID',
      total_amount: 7000, note: '', created_at: new Date(now - 30 * 60_000),
      status_updated_at: new Date(now - 2 * 60_000), updated_at: new Date(),
    },
  ],
  OrderItems: [
    {
      order_item_id: 'order-1-01', order_id: 'order-1', line_no: 1,
      menu_id: 'kimchi', menu_name_snapshot: '김치전', base_price_snapshot: 10000,
      unit_price_snapshot: 10000, quantity: 1, line_total: 10000,
    },
    {
      order_item_id: 'order-2-01', order_id: 'order-2', line_no: 1,
      menu_id: 'soju', menu_name_snapshot: '소주', base_price_snapshot: 5000,
      unit_price_snapshot: 5000, quantity: 1, line_total: 5000,
    },
    {
      order_item_id: 'order-1-02', order_id: 'order-1', line_no: 2,
      menu_id: 'soju', menu_name_snapshot: '취소 소주', base_price_snapshot: 5000,
      unit_price_snapshot: 5000, quantity: 4, line_total: 20000, status: 'CANCELLED',
    },
    {
      order_item_id: 'order-3-01', order_id: 'order-3', line_no: 1,
      menu_id: 'kimchi', menu_name_snapshot: '김치전', base_price_snapshot: 7000,
      unit_price_snapshot: 7000, quantity: 1, line_total: 7000,
    },
  ],
  OrderItemOptions: [{
    order_item_option_id: 'option-1', order_item_id: 'order-1-01', order_id: 'order-1',
    option_id: 'crispy', option_group_name_snapshot: '굽기',
    option_name_snapshot: '바삭하게', price_delta_snapshot: 0, sort_order: 1,
  }],
  Calls: [{
    call_id: 'call-1', table_id: 'T01', reason: 'WATER_UTENSIL', status: 'PENDING',
    created_at: new Date(now - 3 * 60_000), updated_at: new Date(),
  }],
  Categories: [{
    category_id: 'food', label: '음식', heading: '음식 메뉴', active: true, sort_order: 1,
  }],
  Menu: [
    {
      menu_id: 'kimchi', category_id: 'food', name: '김치전', base_price: 7000,
      available: true, min_quantity: 1, max_quantity: 10, sort_order: 1,
    },
    {
      menu_id: 'soju', category_id: 'food', name: '소주', base_price: 5000,
      available: false, min_quantity: 1, max_quantity: 10, sort_order: 2,
    },
  ],
  MenuOptionGroups: [],
  MenuOptions: [],
  Settings: [
    { key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN' },
    { key: 'MAX_ORDER_LINES', value: '20', type: 'INTEGER' },
    { key: 'NEXT_DISPLAY_NUMBER', value: '4', type: 'INTEGER' },
    { key: 'ORDER_PREFIX', value: 'A-', type: 'STRING' },
    { key: 'TABLE_DISCOUNT_RATE', value: '20', type: 'INTEGER' },
  ],
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
    postData: {
      contents: JSON.stringify({
        apiVersion: 'v1', staffToken: 'valid-staff-token', ...payload,
      }),
    },
  });
  return JSON.parse(evaluate('doPost(' + event + ').text'));
}

const list = apiCall('staff/tables/list');
assert.equal(list.success, true);
assert.equal(list.data.tables.length, 3);
assert.equal(list.data.tables[0].orderStatus, 'RECEIVED');
assert.equal(list.data.tables[0].totalAmount, 12000);
assert.equal(list.data.tables[0].pendingItemCount, 2);
assert.equal(list.data.tables[2].sessionStatus, 'EMPTY');
assert.deepEqual(
  JSON.parse(JSON.stringify(list.data.stationCounts)),
  { tables: 2, kitchen: 1, serving: 1, payment: 1 },
);

const detail = apiCall('staff/tables/detail', { tableId: 'T01' });
assert.equal(detail.success, true);
assert.equal(detail.data.items.length, 3);
assert.deepEqual(
  detail.data.items.find(item => item.itemId === 'order-1-01').selectedOptions,
  ['바삭하게'],
);
assert.equal(detail.data.notes[0].text, '김치전 먼저');
assert.equal(detail.data.notes[0].audience, 'kitchen');
assert.equal(detail.data.items.find(item => item.itemId === 'order-1-02').status, 'CANCELLED');
assert.equal(detail.data.call.count, 1);

const initialQueues = apiCall('staff/orders/queue');
assert.equal(initialQueues.data.kitchen[0].kitchenNote, '김치전 먼저');
assert.equal(initialQueues.data.kitchen[0].items.some(item => item.name === '취소 소주'), false);

const ambiguousStatus = apiCall('staff/orders/status', {
  tableId: 'T01', orderId: 'order-1', status: 'COOKING',
});
assert.equal(ambiguousStatus.success, false);
assert.equal(ambiguousStatus.error.code, 'INVALID_REQUEST');
const paymentBypass = apiCall('staff/orders/status', { tableId: 'T01', status: 'PAID' });
assert.equal(paymentBypass.success, false);
assert.equal(paymentBypass.error.code, 'INVALID_ORDER_STATUS_TRANSITION');

const oneStatus = apiCall('staff/orders/status', { orderId: 'order-1', status: 'COOKING' });
assert.equal(oneStatus.success, true);
assert.equal(state.Orders[0].status, 'PREPARING');
const tableStatus = apiCall('staff/orders/status', { tableId: 'T01', status: 'READY' });
assert.equal(tableStatus.success, true);
assert.equal(state.Orders[0].status, 'SERVING');
assert.equal(state.Orders[1].status, 'SERVING');

const queues = apiCall('staff/orders/queue');
assert.equal(queues.success, true);
assert.equal(queues.data.kitchen.length, 0);
assert.equal(queues.data.serving.length, 2);
assert.equal(queues.data.payment.length, 1);
assert.equal(queues.data.serving.find(order => order.orderId === 'order-1').servingNote, null);

const menu = apiCall('staff/menu/list');
assert.equal(menu.success, true);
assert.equal(menu.data.items[1].soldOut, true);
const availability = apiCall('staff/menu/availability', { itemId: 'soju', soldOut: false });
assert.equal(availability.success, true);
assert.equal(state.Menu[1].available, true);

const created = apiCall('staff/orders/create', {
  tableId: 'T03', items: [{ itemId: 'kimchi', quantity: 2 }], note: '빨리 부탁',
});
assert.equal(created.success, true, JSON.stringify(created));
assert.equal(created.data.displayCode, 'A-4');
assert.equal(state.Orders.at(-1).write_state, 'COMMITTED');
assert.equal(state.Orders.at(-1).total_amount, 14000);
assert.equal(state.OrderItems.at(-1).quantity, 2);
assert.equal(state.TableSessions.some(session => session.table_id === 'T03'), true);

console.log('staff dashboard tests passed');
