/**
 * Idempotent initial catalog seed.
 * Keep names and prices aligned with docs/qr-order/menu-list.md.
 */

const QR_ORDER_CATEGORY_SEED = Object.freeze([
  Object.freeze({ category_id: 'main', label: '메인', heading: '메인 메뉴', sort_order: 10 }),
  Object.freeze({ category_id: 'side', label: '사이드', heading: '사이드 메뉴', sort_order: 20 }),
  Object.freeze({ category_id: 'alcohol', label: '주류', heading: '주류', sort_order: 30 }),
  Object.freeze({ category_id: 'beverage', label: '음료', heading: '음료', sort_order: 40 }),
]);

const QR_ORDER_MENU_SEED = Object.freeze([
  Object.freeze({ menu_id: 'chicken-feet', category_id: 'main', name: '닭발', base_price: 10000 }),
  Object.freeze({
    menu_id: 'tteokbokki-egg-fried-set', category_id: 'main',
    name: '국물 떡볶이 + 계란 + 튀김 SET', base_price: 10000,
  }),
  Object.freeze({
    menu_id: 'jjapagetti-egg-cheese', category_id: 'main',
    name: '짜계치 (짜파게티 + 계란 + 치즈)', base_price: 5000,
  }),
  Object.freeze({ menu_id: 'spicy-pork', category_id: 'main', name: '제육볶음', base_price: 9000 }),
  Object.freeze({
    menu_id: 'perilla-egg-fry-sikhye-set', category_id: 'main',
    name: '꼬소들기름계란후라이 + 식혜 SET', base_price: 8000,
  }),
  Object.freeze({
    menu_id: 'seaweed-soup-rice', category_id: 'side',
    name: '해장미역국밥', base_price: 7000,
  }),
  Object.freeze({
    menu_id: 'tuna-mayo-rice-ball', category_id: 'side',
    name: '참치마요주먹밥', base_price: 6000,
  }),
  Object.freeze({
    menu_id: 'cheese-egg-custard', category_id: 'side',
    name: '폭탄치즈대왕 계란찜', base_price: 9000,
  }),
  Object.freeze({
    menu_id: 'dried-snack-platter', category_id: 'side',
    name: '마른 안주 (뻥튀기 / 쥐포 / 오징어)', base_price: 7000,
  }),
  Object.freeze({
    menu_id: 'red-bean-bingsu', category_id: 'side',
    name: '옛날팥빙수', base_price: 4500,
  }),
  Object.freeze({ menu_id: 'soju', category_id: 'alcohol', name: '소주', base_price: 4500 }),
  Object.freeze({ menu_id: 'beer', category_id: 'alcohol', name: '맥주', base_price: 4500 }),
  Object.freeze({
    menu_id: 'banana-milk-highball', category_id: 'alcohol',
    name: '바나나 우유 하이볼', base_price: 5000,
  }),
  Object.freeze({
    menu_id: 'mix-coffee-highball', category_id: 'alcohol',
    name: '믹스 커피 하이볼', base_price: 5000,
  }),
  Object.freeze({
    menu_id: 'classic-highball', category_id: 'alcohol',
    name: '기본 하이볼', base_price: 5000,
  }),
  Object.freeze({
    menu_id: 'frozen-sikhye', category_id: 'beverage',
    name: '살얼음 식혜', base_price: 3000,
  }),
  Object.freeze({ menu_id: 'eolbaksa', category_id: 'beverage', name: '얼박사', base_price: 3000 }),
  Object.freeze({ menu_id: 'cola', category_id: 'beverage', name: '콜라', base_price: 1500 }),
  Object.freeze({ menu_id: 'cider', category_id: 'beverage', name: '사이다', base_price: 1500 }),
]);

function seedCatalog() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let result;
  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    assertCatalogSheetsReady_(spreadsheet);
    const now = new Date();
    const defaultMaxQuantity = readSeedMaxQuantity_(spreadsheet);
    const categoryIds = new Set(QR_ORDER_CATEGORY_SEED.map(category => category.category_id));
    const nextSortByCategory = new Map();
    const seedSortByMenuId = new Map();
    QR_ORDER_MENU_SEED.forEach(seed => {
      if (!categoryIds.has(seed.category_id)) {
        throw new Error('Unknown seed category: ' + seed.category_id);
      }
      const nextSort = (nextSortByCategory.get(seed.category_id) || 0) + 10;
      nextSortByCategory.set(seed.category_id, nextSort);
      seedSortByMenuId.set(seed.menu_id, nextSort);
    });

    const categories = readSheetTable_(spreadsheet, 'Categories');
    const existingCategoryIds = new Set(categories.rows.map(row => String(row.category_id)));
    const missingCategories = QR_ORDER_CATEGORY_SEED.filter(seed => {
      return !existingCategoryIds.has(seed.category_id);
    });
    appendObjectsBySchema_(spreadsheet, 'Categories', missingCategories.map(seed => ({
      category_id: seed.category_id,
      label: seed.label,
      heading: seed.heading,
      sort_order: seed.sort_order,
      active: true,
      updated_at: now,
    })));

    const menu = readSheetTable_(spreadsheet, 'Menu');
    const existingMenuIds = new Set(menu.rows.map(row => String(row.menu_id)));
    const missingMenu = QR_ORDER_MENU_SEED.filter(seed => !existingMenuIds.has(seed.menu_id));
    appendObjectsBySchema_(spreadsheet, 'Menu', missingMenu.map(seed => {
      return {
        menu_id: seed.menu_id,
        category_id: seed.category_id,
        name: seed.name,
        description: seed.name,
        base_price: seed.base_price,
        image_url: '',
        available: true,
        min_quantity: 1,
        max_quantity: defaultMaxQuantity,
        allergens: '',
        origin: '',
        badge_tags: '',
        sort_order: seedSortByMenuId.get(seed.menu_id),
        updated_at: now,
      };
    }));

    result = {
      insertedCategories: missingCategories.map(seed => seed.category_id),
      existingCategoryCount: QR_ORDER_CATEGORY_SEED.length - missingCategories.length,
      insertedMenu: missingMenu.map(seed => seed.menu_id),
      existingMenuCount: QR_ORDER_MENU_SEED.length - missingMenu.length,
      diagnostics: collectDiagnostics_(spreadsheet),
    };
  } finally {
    lock.releaseLock();
  }

  console.log(JSON.stringify(result, null, 2));
  showCatalogSeedResult_(result);
  return result;
}

function readSeedMaxQuantity_(spreadsheet) {
  const settings = readSheetTable_(spreadsheet, 'Settings');
  const row = settings.rows.find(setting => setting.key === 'DEFAULT_MAX_QUANTITY');
  const value = row ? Number(row.value) : NaN;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Settings.DEFAULT_MAX_QUANTITY는 1 이상의 정수여야 합니다.');
  }
  return value;
}

function assertCatalogSheetsReady_(spreadsheet) {
  ['Categories', 'Menu', 'Settings'].forEach(sheetName => {
    const table = readSheetTable_(spreadsheet, sheetName);
    const expected = Array.from(getSchema_(sheetName).headers);
    if (!valuesEqual_(table.headers, expected)) {
      throw new Error(
        sheetName + ' header가 bootstrap schema와 다릅니다. bootstrapSpreadsheet()를 먼저 실행하세요.'
      );
    }
  });
}

function showCatalogSeedResult_(result) {
  const diagnostics = result.diagnostics;
  const lines = [
    '카탈로그 초기 데이터 처리 완료',
    '추가 Categories: ' + result.insertedCategories.length + '개',
    '기존 Categories: ' + result.existingCategoryCount + '개',
    '추가 Menu: ' + result.insertedMenu.length + '개',
    '기존 Menu: ' + result.existingMenuCount + '개',
    '진단: 오류 ' + diagnostics.summary.errorCount + '개 / 경고 ' +
      diagnostics.summary.warningCount + '개',
  ];
  try {
    SpreadsheetApp.getUi().alert(lines.join('\n'));
  } catch (error) {
    console.log(lines.join('\n'));
  }
}
