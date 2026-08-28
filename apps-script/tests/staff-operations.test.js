const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Config.gs', 'Http.gs', 'Repositories.gs', 'TableCatalogService.gs',
  'TableSessionService.gs',
  'StaffAuthService.gs', 'StaffCallService.gs', 'StaffTableService.gs', 'Code.gs',
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
      return { tryLock() { return context.__lockAllowed !== false; }, releaseLock() {} };
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
  Tables: [1, 2, 3, 4].map(number => ({
    table_id: 'T' + String(number).padStart(2, '0'),
    display_name: '테이블 ' + number,
    active: true,
  })),
  Settings: [{ key: 'TABLE_DISCOUNT_RATE', value: '20', type: 'INTEGER' }],
  Calls: [
    {
      call_id: '11111111-1111-4111-8111-111111111111', table_id: 'T01',
      reason: 'WATER_UTENSIL', status: 'PENDING', created_at: new Date(now - 120000),
      updated_at: new Date(now - 120000),
    },
    {
      call_id: '22222222-2222-4222-8222-222222222222', table_id: 'T01',
      reason: 'WATER_UTENSIL', status: 'PENDING', created_at: new Date(now - 60000),
      updated_at: new Date(now - 60000),
    },
    {
      call_id: '33333333-3333-4333-8333-333333333333', table_id: 'T02',
      reason: 'PAYMENT_REQUEST', status: 'PENDING', created_at: new Date(now - 30000),
      updated_at: new Date(now - 30000),
    },
  ],
  TableSessions: [
    {
      session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', table_id: 'T01',
      origin_table_id: 'T01', status: 'OPEN', discount_rate: 20,
      merged_into_session_id: '', payment_status: 'UNPAID',
      subtotal_amount: '', discount_amount: '', final_amount: '',
      opened_at: new Date(now - 3600000), closed_at: '', paid_at: '', updated_at: new Date(),
    },
    {
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', table_id: 'T02',
      origin_table_id: 'T02', status: 'OPEN', discount_rate: 0,
      merged_into_session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payment_status: 'UNPAID', subtotal_amount: '', discount_amount: '', final_amount: '',
      opened_at: new Date(now - 1800000), closed_at: '', paid_at: '', updated_at: new Date(),
    },
  ],
  Orders: [
    {
      order_id: 'order-1', session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      write_state: 'COMMITTED', status: 'PREPARING', payment_status: 'UNPAID',
      total_amount: 10000,
    },
    {
      order_id: 'order-2', session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      write_state: 'COMMITTED', status: 'RECEIVED', payment_status: 'UNPAID',
      total_amount: 5000,
    },
    {
      order_id: 'order-cancelled', session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      write_state: 'COMMITTED', status: 'CANCELLED', payment_status: 'UNPAID',
      total_amount: 9000,
    },
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

const calls = apiCall('staff/calls/list');
assert.equal(calls.success, true);
assert.equal(calls.data.tableCount, 2);
assert.deepEqual(calls.data.groups.map(group => group.tableId), ['T01', 'T02']);
assert.equal(calls.data.groups[0].count, 2);
assert.deepEqual(calls.data.groups[0].reasons, ['WATER_UTENSIL']);

const acknowledged = apiCall('staff/calls/acknowledge', { tableId: 'T01' });
assert.equal(acknowledged.success, true);
assert.equal(acknowledged.data.acknowledgedCount, 2);
assert.equal(state.Calls[0].status, 'ACKNOWLEDGED');
assert.equal(state.Calls[1].status, 'ACKNOWLEDGED');
assert.equal(state.Calls[0].acknowledged_at.getTime(), state.Calls[1].acknowledged_at.getTime());
assert.equal(state.Calls[0].acknowledged_by, '카운터');
assert.equal(state.AuditLogs.filter(log => log.action === 'CALL_ACKNOWLEDGED').length, 1);

const emptyAcknowledge = apiCall('staff/calls/acknowledge', { tableId: 'T01' });
assert.equal(emptyAcknowledge.success, true);
assert.equal(emptyAcknowledge.data.acknowledgedCount, 0);

const initialBill = apiCall('staff/tables/bill', { tableId: 'T02' });
assert.equal(initialBill.success, true);
assert.equal(initialBill.data.tableId, 'T01');
assert.deepEqual(initialBill.data.mergedTableIds, ['T02']);
assert.equal(initialBill.data.subtotalAmount, 15000);
assert.equal(initialBill.data.discountAmount, 3000);
assert.equal(initialBill.data.finalAmount, 12000);
assert.equal(initialBill.data.orderCount, 2);

const childDiscount = apiCall('staff/tables/discount', { tableId: 'T02', discountRate: 20 });
assert.equal(childDiscount.success, false);
assert.equal(childDiscount.error.code, 'SESSION_NOT_PRIMARY');
const invalidDiscount = apiCall('staff/tables/discount', { tableId: 'T01', discountRate: 15 });
assert.equal(invalidDiscount.success, false);
assert.equal(invalidDiscount.error.code, 'INVALID_DISCOUNT_RATE');

const split = apiCall('staff/tables/split', { tableId: 'T02' });
assert.equal(split.success, true);
assert.equal(state.TableSessions[1].merged_into_session_id, '');
const merge = apiCall('staff/tables/merge', {
  primaryTableId: 'T01', secondaryTableId: 'T02',
});
assert.equal(merge.success, true);
assert.equal(state.TableSessions[1].merged_into_session_id, state.TableSessions[0].session_id);

const occupiedMove = apiCall('staff/tables/move', { fromTableId: 'T01', toTableId: 'T02' });
assert.equal(occupiedMove.success, false);
assert.equal(occupiedMove.error.code, 'DESTINATION_OCCUPIED');
const moved = apiCall('staff/tables/move', { fromTableId: 'T02', toTableId: 'T03' });
assert.equal(moved.success, true);
assert.equal(state.TableSessions[1].table_id, 'T03');
assert.equal(state.TableSessions[1].origin_table_id, 'T02');

const changedAmount = apiCall('staff/tables/confirm-payment', {
  tableId: 'T01', expectedFinalAmount: 11999,
});
assert.equal(changedAmount.success, false);
assert.equal(changedAmount.error.code, 'BILL_AMOUNT_CHANGED');
assert.equal(changedAmount.error.details.finalAmount, 12000);

const paid = apiCall('staff/tables/confirm-payment', {
  tableId: 'T01', expectedFinalAmount: 12000,
});
assert.equal(paid.success, true);
assert.equal(state.TableSessions[0].status, 'CLOSED');
assert.equal(state.TableSessions[1].status, 'CLOSED');
assert.equal(state.TableSessions[0].subtotal_amount, 15000);
assert.equal(state.TableSessions[0].discount_amount, 3000);
assert.equal(state.TableSessions[0].final_amount, 12000);
assert.equal(state.TableSessions[1].subtotal_amount, '');
assert.equal(state.Orders[0].payment_status, 'PAID');
assert.equal(state.Orders[1].payment_status, 'PAID');
assert.equal(state.Orders[2].payment_status, 'PAID');

const paidAgain = apiCall('staff/tables/confirm-payment', {
  tableId: 'T01', expectedFinalAmount: 12000,
});
assert.equal(paidAgain.success, false);
assert.equal(paidAgain.error.code, 'SESSION_ALREADY_PAID');

const paidBill = apiCall('staff/tables/bill', { tableId: 'T01' });
assert.equal(paidBill.success, true);
assert.equal(paidBill.data.paymentStatus, 'PAID');
assert.equal(paidBill.data.finalAmount, 12000);

state.Orders[0].total_amount = 99999;
const immutablePaidBill = apiCall('staff/tables/bill', { tableId: 'T01' });
assert.equal(immutablePaidBill.success, true);
assert.equal(immutablePaidBill.data.subtotalAmount, 15000);
assert.equal(immutablePaidBill.data.finalAmount, 12000);

console.log('staff operations tests passed');
