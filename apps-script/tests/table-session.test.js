const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = ['Config.gs', 'Repositories.gs', 'TableSessionService.gs']
  .map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8')).join('\n');

let uuidCounter = 0;
const context = vm.createContext({
  Utilities: {
    getUuid() {
      uuidCounter += 1;
      return '00000000-0000-4000-8000-' + String(uuidCounter).padStart(12, '0');
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
  Orders: [
    {
      order_id: 'open-1', table_id: 'T01', session_id: '', status: 'COMPLETED',
      payment_status: 'UNPAID', total_amount: 10000, created_at: new Date(now - 3000),
    },
    {
      order_id: 'open-2', table_id: 'T01', session_id: '', status: 'CANCELLED',
      payment_status: 'UNPAID', total_amount: 9000, created_at: new Date(now - 2000),
    },
    {
      order_id: 'paid-1', table_id: 'T02', session_id: '', status: 'COMPLETED',
      payment_status: 'PAID', total_amount: 7000, created_at: new Date(now - 5000),
      paid_at: new Date(now - 1000),
    },
    {
      order_id: 'mixed-paid', table_id: 'T03', session_id: '', status: 'COMPLETED',
      payment_status: 'PAID', total_amount: 8000, created_at: new Date(now - 8000),
      paid_at: new Date(now - 6000),
    },
    {
      order_id: 'mixed-unpaid', table_id: 'T03', session_id: '', status: 'RECEIVED',
      payment_status: 'UNPAID', total_amount: 12000, created_at: new Date(now - 1000),
    },
  ],
  TableSessions: [],
};
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  return {
    rows: state[sheetName].map((row, index) => ({ ...row, __rowNumber: index + 2 })),
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

const result = context.migrateLegacyOrdersToSessions_({});
assert.deepEqual(
  JSON.parse(JSON.stringify(result)),
  { migratedOrderCount: 5, createdSessionCount: 4 },
);
assert.equal(state.TableSessions.length, 4);
assert.equal(state.TableSessions[0].status, 'OPEN');
assert.equal(state.TableSessions[0].subtotal_amount, '');
assert.equal(state.TableSessions[1].status, 'CLOSED');
assert.equal(state.TableSessions[1].payment_status, 'PAID');
assert.equal(state.TableSessions[1].subtotal_amount, 7000);
assert.equal(state.TableSessions[1].final_amount, 7000);
assert.equal(state.TableSessions[2].status, 'CLOSED');
assert.equal(state.TableSessions[2].subtotal_amount, 8000);
assert.equal(state.TableSessions[3].status, 'OPEN');
assert.notEqual(state.Orders[3].session_id, state.Orders[4].session_id);
assert.equal(state.Orders.every(order => Boolean(order.session_id)), true);

const replay = context.migrateLegacyOrdersToSessions_({});
assert.deepEqual(
  JSON.parse(JSON.stringify(replay)),
  { migratedOrderCount: 0, createdSessionCount: 0 },
);
assert.equal(state.TableSessions.length, 4);

state.TableSessions[0].table_id = 'T03';
const recoveredByOrigin = context.ensureOpenTableSession_({}, 'T01');
assert.equal(recoveredByOrigin.session_id, state.TableSessions[0].session_id);
assert.equal(state.TableSessions.length, 4);

const created = context.ensureOpenTableSession_({}, 'T04');
assert.equal(created.table_id, 'T04');
assert.equal(created.origin_table_id, 'T04');
assert.equal(state.TableSessions.length, 5);

console.log('table session tests passed');
