/** Table authentication and Settings access shared by customer API services. */

function sha256Hex_(text) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  ).map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function constantTimeEquals_(left, right) {
  const leftText = String(left || '');
  const rightText = String(right || '');
  if (!leftText || !rightText) return false;

  let difference = leftText.length ^ rightText.length;
  const length = Math.max(leftText.length, rightText.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function getRequiredTokenPepper_() {
  const pepper = PropertiesService.getScriptProperties().getProperty('TOKEN_PEPPER');
  if (!pepper || pepper.length < 32) {
    throw new Error('TOKEN_PEPPER must be a secret value of at least 32 characters.');
  }
  return pepper;
}

function settingsMap_(spreadsheet) {
  const target = spreadsheet || getConfiguredSpreadsheet_();
  return readSheetTable_(target, 'Settings').rows.reduce((map, row) => {
    let value = row.value;
    if (row.type === 'INTEGER') value = Number(value);
    if (row.type === 'BOOLEAN') {
      value = value === true || String(value).toUpperCase() === 'TRUE';
    }
    map[String(row.key)] = value;
    return map;
  }, {});
}

function getRequiredSetting_(settings, key) {
  const value = settings[key];
  if (value === undefined || value === null || value === '') {
    throw new Error('Missing required Settings value: ' + key);
  }
  return value;
}

function normalizeFrontendBaseUrl_(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url)) {
    throw new Error('FRONTEND_BASE_URL must be an HTTPS origin without a path.');
  }
  return url;
}

function validateTable_(tableId, tableToken, requireActive, spreadsheet) {
  const normalizedId = String(tableId || '').trim();
  const normalizedToken = String(tableToken || '');
  const invalidQr = () => {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  };

  if (!/^T\d{2,}$/.test(normalizedId) || !/^[0-9a-f]{64}$/i.test(normalizedToken)) invalidQr();

  const target = spreadsheet || getConfiguredSpreadsheet_();
  const table = readSheetTable_(target, 'Tables').rows.find(row => {
    return String(row.table_id) === normalizedId;
  });

  const actualHash = sha256Hex_(getRequiredTokenPepper_() + ':' + normalizedToken);
  const expectedHash = table ? String(table.token_hash) : '0'.repeat(64);
  if (!constantTimeEquals_(actualHash, expectedHash) || !table) invalidQr();
  if (requireActive && table.active !== true) {
    throw new ApiError('INACTIVE_TABLE', '현재 이 테이블에서는 주문할 수 없습니다.', false);
  }
  return table;
}

function assertEventOpen_(settings) {
  if (settings.EVENT_OPEN !== true) {
    throw new ApiError('EVENT_CLOSED', '현재 주문을 받고 있지 않습니다.', false);
  }
}

function resolveTable(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }
  let spreadsheet;
  let table;
  let settings;
  try {
    spreadsheet = getConfiguredSpreadsheet_();
    table = validateTable_(payload.tableId, payload.tableToken, true, spreadsheet);
    settings = settingsMap_(spreadsheet);
    assertEventOpen_(settings);
    ensureOpenTableSession_(spreadsheet, String(table.table_id));
  } finally {
    lock.releaseLock();
  }

  const statusPollSeconds = Number(getRequiredSetting_(settings, 'STATUS_POLL_SECONDS'));
  if (!Number.isInteger(statusPollSeconds) || statusPollSeconds < 1) {
    throw new Error('STATUS_POLL_SECONDS must be a positive integer.');
  }

  return {
    table: {
      tableId: String(table.table_id),
      displayName: String(table.display_name),
    },
    store: {
      name: String(getRequiredSetting_(settings, 'STORE_NAME')),
      open: true,
      notice: String(getRequiredSetting_(settings, 'NOTICE')),
    },
    statusPollSeconds: statusPollSeconds,
  };
}

function getMenu(payload) {
  const spreadsheet = getConfiguredSpreadsheet_();
  validateTable_(payload.tableId, payload.tableToken, true, spreadsheet);
  assertEventOpen_(settingsMap_(spreadsheet));

  const catalog = readCatalogForResponse_(spreadsheet);
  return {
    categories: catalog.categories,
    items: catalog.items,
    generatedAt: new Date().toISOString(),
  };
}

function getCatalogForOrder_(spreadsheet) {
  return readCatalogForResponse_(spreadsheet);
}

function readCatalogForResponse_(spreadsheet) {

  const categories = readSheetTable_(spreadsheet, 'Categories').rows
    .filter(row => row.active === true);
  const activeCategoryIds = new Set(categories.map(row => String(row.category_id)));
  const menu = readSheetTable_(spreadsheet, 'Menu').rows
    .filter(row => activeCategoryIds.has(String(row.category_id)));
  const groups = readSheetTable_(spreadsheet, 'MenuOptionGroups').rows
    .filter(row => row.active === true);
  const options = readSheetTable_(spreadsheet, 'MenuOptions').rows;

  return {
    categories: sortCatalogRows_(categories, 'category_id').map(categoryResponse_),
    items: sortCatalogRows_(menu, 'menu_id').map(item => {
      return catalogItemResponse_(item, groups, options);
    }),
  };
}

function categoryResponse_(row) {
  return {
    categoryId: String(row.category_id),
    label: String(row.label),
    heading: String(row.heading),
  };
}

function catalogItemResponse_(item, groups, options) {
  const menuId = String(item.menu_id);
  const itemGroups = groups.filter(group => String(group.menu_id) === menuId)
    .slice()
    .sort((left, right) => {
      return Number(right.required) - Number(left.required) ||
        Number(left.sort_order) - Number(right.sort_order) ||
        String(left.option_group_id).localeCompare(String(right.option_group_id));
    });

  return {
    menuId: menuId,
    categoryId: String(item.category_id),
    name: String(item.name),
    description: String(item.description),
    basePrice: catalogInteger_(item.base_price, 'Menu.base_price'),
    imageUrl: nullableCatalogString_(item.image_url),
    available: item.available === true,
    minQuantity: catalogInteger_(item.min_quantity, 'Menu.min_quantity'),
    maxQuantity: catalogInteger_(item.max_quantity, 'Menu.max_quantity'),
    allergens: splitCatalogList_(item.allergens),
    origin: nullableCatalogString_(item.origin),
    badgeTags: splitCatalogList_(item.badge_tags),
    optionGroups: itemGroups.map(group => catalogGroupResponse_(group, options, menuId)),
  };
}

function catalogGroupResponse_(group, options, menuId) {
  const groupId = String(group.option_group_id);
  const groupOptions = sortCatalogRows_(options.filter(option => {
    return String(option.option_group_id) === groupId && String(option.menu_id) === menuId;
  }), 'option_id');

  return {
    optionGroupId: groupId,
    label: String(group.label),
    required: group.required === true,
    selectionType: catalogSelectionType_(group.selection_type),
    minSelections: catalogInteger_(group.min_select, 'MenuOptionGroups.min_select'),
    maxSelections: catalogInteger_(group.max_select, 'MenuOptionGroups.max_select'),
    defaultSelectedOptionIds: groupOptions
      .filter(option => option.default_selected === true)
      .map(option => String(option.option_id)),
    options: groupOptions.map(option => ({
      optionId: String(option.option_id),
      name: String(option.name),
      priceDelta: catalogInteger_(option.price_delta, 'MenuOptions.price_delta'),
      available: option.available === true,
    })),
  };
}

function sortCatalogRows_(rows, idField) {
  return rows.slice().sort((left, right) => {
    return catalogInteger_(left.sort_order, idField + '.sort_order') -
        catalogInteger_(right.sort_order, idField + '.sort_order') ||
      String(left[idField]).localeCompare(String(right[idField]));
  });
}

function catalogSelectionType_(value) {
  if (value === 'SINGLE') return 'single';
  if (value === 'MULTIPLE') return 'multiple';
  throw new Error('MenuOptionGroups.selection_type is invalid.');
}

function catalogInteger_(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(fieldName + ' must be an integer.');
  return number;
}

function nullableCatalogString_(value) {
  const text = String(value || '').trim();
  return text || null;
}

function splitCatalogList_(value) {
  if (isBlankValue_(value)) return [];
  return String(value).split('|').map(item => item.trim()).filter(Boolean);
}
