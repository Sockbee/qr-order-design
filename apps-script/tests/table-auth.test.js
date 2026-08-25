const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appsScriptDir = path.resolve(__dirname, '..');
const source = [
  'Http.gs', 'Repositories.gs', 'CatalogSeed.gs', 'TableCatalogService.gs',
  'TableProvisioning.gs', 'Code.gs',
]
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
context.__categoriesRows = [
  { category_id: 'hidden', label: '숨김', heading: '숨김', sort_order: 5, active: false },
  { category_id: 'main', label: '메인', heading: '메인 메뉴', sort_order: 10, active: true },
];
context.__menuRows = [
  {
    menu_id: 'sold-out', category_id: 'main', name: '품절 메뉴', description: '품절',
    base_price: 2000, image_url: '', available: false, min_quantity: 1, max_quantity: 5,
    allergens: '', origin: '', badge_tags: '품절|인기', sort_order: 20,
  },
  {
    menu_id: 'main-menu', category_id: 'main', name: '메인 메뉴', description: '설명',
    base_price: 10000, image_url: 'https://example.com/menu.jpg', available: true,
    min_quantity: 1, max_quantity: 10, allergens: '대두 | 밀', origin: '국내산',
    badge_tags: '', sort_order: 10,
  },
  {
    menu_id: 'hidden-menu', category_id: 'hidden', name: '숨김 메뉴', description: '숨김',
    base_price: 1, image_url: '', available: true, min_quantity: 1, max_quantity: 1,
    allergens: '', origin: '', badge_tags: '', sort_order: 1,
  },
];
context.__groupRows = [
  {
    option_group_id: 'inactive-group', menu_id: 'main-menu', label: '숨김 옵션',
    selection_type: 'SINGLE', required: false, min_select: 0, max_select: 1,
    sort_order: 1, active: false,
  },
  {
    option_group_id: 'required-group', menu_id: 'main-menu', label: '필수 옵션',
    selection_type: 'SINGLE', required: true, min_select: 1, max_select: 1,
    sort_order: 10, active: true,
  },
];
context.__optionRows = [
  {
    option_id: 'option-b', option_group_id: 'required-group', menu_id: 'main-menu',
    name: '옵션 B', price_delta: 500, available: false, default_selected: false, sort_order: 20,
  },
  {
    option_id: 'option-a', option_group_id: 'required-group', menu_id: 'main-menu',
    name: '옵션 A', price_delta: 0, available: true, default_selected: true, sort_order: 10,
  },
];
context.getConfiguredSpreadsheet_ = function getConfiguredSpreadsheet() { return {}; };
context.readSheetTable_ = function readSheetTable(spreadsheet, sheetName) {
  const rowsBySheet = {
    Settings: context.__settingsRows,
    Tables: context.__tableRows,
    Categories: context.__categoriesRows,
    Menu: context.__menuRows,
    MenuOptionGroups: context.__groupRows,
    MenuOptions: context.__optionRows,
  };
  return { rows: rowsBySheet[sheetName] || [] };
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

const menuEvent = JSON.stringify({
  pathInfo: '/menu',
  postData: {
    contents: JSON.stringify({ apiVersion: 'v1', tableId: 'T01', tableToken: token }),
  },
});
const menu = JSON.parse(evaluate('doPost(' + menuEvent + ').text'));
assert.equal(menu.success, true);
assert.deepEqual(menu.data.categories.map(category => category.categoryId), ['main']);
assert.deepEqual(menu.data.items.map(item => item.menuId), ['main-menu', 'sold-out']);
assert.equal(menu.data.items[1].available, false);
assert.deepEqual(menu.data.items[1].badgeTags, ['품절', '인기']);
assert.deepEqual(menu.data.items[0].allergens, ['대두', '밀']);
assert.equal(menu.data.items[0].origin, '국내산');
assert.equal(menu.data.items[0].optionGroups.length, 1);
assert.equal(menu.data.items[0].optionGroups[0].selectionType, 'single');
assert.deepEqual(menu.data.items[0].optionGroups[0].defaultSelectedOptionIds, ['option-a']);
assert.deepEqual(
  menu.data.items[0].optionGroups[0].options.map(option => option.optionId),
  ['option-a', 'option-b']
);
assert.equal(menu.data.items[0].optionGroups[0].options[1].available, false);

const seededCategories = JSON.parse(evaluate('JSON.stringify(QR_ORDER_CATEGORY_SEED)'));
const seededMenu = JSON.parse(evaluate('JSON.stringify(QR_ORDER_MENU_SEED)'));
context.__categoriesRows = seededCategories.map(category => ({ ...category, active: true }));
context.__menuRows = seededMenu.map(item => ({
  ...item,
  description: item.name,
  image_url: '',
  available: true,
  min_quantity: 1,
  max_quantity: 10,
  allergens: '',
  origin: '',
  badge_tags: '',
  sort_order: (seededMenu.filter(candidate => candidate.category_id === item.category_id)
    .findIndex(candidate => candidate.menu_id === item.menu_id) + 1) * 10,
}));
context.__groupRows = [];
context.__optionRows = [];
const seededCatalog = JSON.parse(evaluate('doPost(' + menuEvent + ').text'));
assert.equal(seededCatalog.success, true);
assert.deepEqual(
  seededCatalog.data.categories.map(category => category.categoryId),
  ['main', 'side', 'alcohol', 'beverage']
);
assert.equal(seededCatalog.data.items.length, 19);
assert.equal(
  seededCatalog.data.items.find(item => item.menuId === 'soju').basePrice,
  4500
);

context.__settingsRows[0].value = 'FALSE';
const closed = JSON.parse(evaluate('doPost(' + resolveEvent + ').text'));
assert.equal(closed.success, false);
assert.equal(closed.error.code, 'EVENT_CLOSED');
const closedMenu = JSON.parse(evaluate('doPost(' + menuEvent + ').text'));
assert.equal(closedMenu.success, false);
assert.equal(closedMenu.error.code, 'EVENT_CLOSED');

console.log('table-catalog API tests passed');
