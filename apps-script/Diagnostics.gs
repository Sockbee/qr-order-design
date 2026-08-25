/**
 * Public diagnostics entry point and integrity checks.
 * Diagnostics are read-only and can safely run during the event.
 */

const QR_ORDER_DIAGNOSTIC_ISSUE_LIMIT = 100;

function runDiagnostics() {
  let report;
  try {
    report = collectDiagnostics_(getConfiguredSpreadsheet_());
  } catch (error) {
    report = newDiagnosticsReport_();
    addDiagnostic_(report, 'ERROR', 'DIAGNOSTICS_FAILED', error.message || String(error));
    finishDiagnosticsReport_(report);
  }

  console.log(JSON.stringify(report, null, 2));
  showDiagnosticsReport_(report);
  return report;
}

function collectDiagnostics_(spreadsheet) {
  const report = newDiagnosticsReport_();
  const tables = {};

  checkScriptProperties_(spreadsheet, report);

  QR_ORDER_SHEET_ORDER.forEach(sheetName => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      addDiagnostic_(report, 'ERROR', 'MISSING_SHEET', '필수 Sheet가 없습니다.', sheetName);
      tables[sheetName] = [];
      return;
    }

    const schema = getSchema_(sheetName);
    const actualHeaders = sheet.getRange(1, 1, 1, schema.headers.length).getDisplayValues()[0];
    if (!valuesEqual_(actualHeaders, Array.from(schema.headers))) {
      addDiagnostic_(
        report,
        'ERROR',
        'HEADER_MISMATCH',
        '헤더가 schema와 다릅니다. expected=[' + schema.headers.join(', ') +
          '] actual=[' + actualHeaders.join(', ') + ']',
        sheetName,
        1
      );
      tables[sheetName] = [];
      return;
    }

    const lastColumn = sheet.getLastColumn();
    if (lastColumn > schema.headers.length) {
      const extraHeaders = sheet
        .getRange(1, schema.headers.length + 1, 1, lastColumn - schema.headers.length)
        .getDisplayValues()[0]
        .filter(value => !isBlankValue_(value));
      if (extraHeaders.length) {
        addDiagnostic_(
          report,
          'ERROR',
          'HEADER_EXTRA',
          'schema에 정의되지 않은 추가 헤더가 있습니다: [' + extraHeaders.join(', ') + ']',
          sheetName,
          1
        );
        tables[sheetName] = [];
        return;
      }
    }

    const table = readSheetTable_(spreadsheet, sheetName);
    tables[sheetName] = table.rows;
    report.stats[sheetName] = { rowCount: table.rows.length };
    checkRowsAgainstSchema_(sheetName, schema, table.rows, report);
    checkValidations_(sheet, sheetName, schema, report);
    checkProtections_(sheet, sheetName, report);
  });

  checkSettings_(tables, report);
  checkTableSecurity_(tables, report);
  checkForeignKeys_(tables, report);
  checkCatalogRules_(tables, report);
  checkOrderIntegrity_(tables, report);
  finishDiagnosticsReport_(report);
  return report;
}

function newDiagnosticsReport_() {
  return {
    ok: false,
    bootstrapVersion: QR_ORDER_APP.BOOTSTRAP_VERSION,
    checkedAt: new Date().toISOString(),
    errors: [],
    warnings: [],
    stats: {},
    _counts: { errorCount: 0, warningCount: 0 },
  };
}

function finishDiagnosticsReport_(report) {
  const counts = report._counts || {
    errorCount: report.errors.length,
    warningCount: report.warnings.length,
  };
  report.ok = counts.errorCount === 0;
  report.summary = {
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    returnedErrorCount: report.errors.length,
    returnedWarningCount: report.warnings.length,
  };
  report.truncated = {
    errorCount: Math.max(counts.errorCount - report.errors.length, 0),
    warningCount: Math.max(counts.warningCount - report.warnings.length, 0),
  };
  delete report._counts;
}

function addDiagnostic_(report, severity, code, message, sheetName, rowNumber, column) {
  const issue = { code: code, message: message };
  if (sheetName) issue.sheet = sheetName;
  if (rowNumber) issue.row = rowNumber;
  if (column) issue.column = column;
  const isError = severity === 'ERROR';
  const target = isError ? report.errors : report.warnings;
  const countKey = isError ? 'errorCount' : 'warningCount';
  report._counts[countKey] += 1;
  if (target.length < QR_ORDER_DIAGNOSTIC_ISSUE_LIMIT) target.push(issue);
}

function checkScriptProperties_(spreadsheet, report) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  const pepper = properties.getProperty('TOKEN_PEPPER');

  if (!spreadsheetId) {
    addDiagnostic_(report, 'ERROR', 'MISSING_SCRIPT_PROPERTY', 'SPREADSHEET_ID가 없습니다.');
  } else if (spreadsheetId !== spreadsheet.getId()) {
    addDiagnostic_(
      report,
      'ERROR',
      'SPREADSHEET_ID_MISMATCH',
      'SPREADSHEET_ID가 현재 진단 대상 Spreadsheet와 다릅니다.'
    );
  }

  if (!pepper || pepper.length < 32) {
    addDiagnostic_(
      report,
      'ERROR',
      'WEAK_OR_MISSING_TOKEN_PEPPER',
      'TOKEN_PEPPER는 최소 32자 이상의 비밀 난수여야 합니다.'
    );
  } else if (!/^[0-9a-f]{64,}$/i.test(pepper)) {
    addDiagnostic_(
      report,
      'WARNING',
      'TOKEN_PEPPER_ENTROPY_UNVERIFIED',
      'TOKEN_PEPPER 길이는 충분하지만 32바이트 이상 난수인지 확인하세요.'
    );
  }
}

function checkRowsAgainstSchema_(sheetName, schema, rows, report) {
  schema.required.forEach(header => {
    rows.forEach(row => {
      if (isBlankValue_(row[header])) {
        addDiagnostic_(report, 'ERROR', 'MISSING_REQUIRED_VALUE', '필수 값이 비어 있습니다.',
          sheetName, row.__rowNumber, header);
      }
    });
  });

  schema.unique.forEach(header => {
    const seen = new Map();
    rows.forEach(row => {
      if (isBlankValue_(row[header])) return;
      const key = String(row[header]);
      if (seen.has(key)) {
        addDiagnostic_(
          report,
          'ERROR',
          'DUPLICATE_UNIQUE_VALUE',
          header + ' 값이 중복됩니다. 첫 행: ' + seen.get(key),
          sheetName,
          row.__rowNumber,
          header
        );
      } else {
        seen.set(key, row.__rowNumber);
      }
    });
  });

  schema.text.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && typeof value !== 'string') {
      addDiagnostic_(report, 'ERROR', 'INVALID_TEXT_TYPE', '문자열이어야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  schema.integers.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && !Number.isInteger(value)) {
      addDiagnostic_(report, 'ERROR', 'INVALID_INTEGER', '정수여야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  schema.nonNegative.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && Number(value) < 0) {
      addDiagnostic_(report, 'ERROR', 'NEGATIVE_VALUE', '0 이상이어야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  schema.positive.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && Number(value) < 1) {
      addDiagnostic_(report, 'ERROR', 'NON_POSITIVE_VALUE', '1 이상이어야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  schema.dates.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && (!(value instanceof Date) || Number.isNaN(value.getTime()))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_DATETIME', '유효한 날짜/시간이어야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  schema.checkboxes.forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && typeof value !== 'boolean') {
      addDiagnostic_(report, 'ERROR', 'INVALID_BOOLEAN', 'TRUE/FALSE boolean이어야 합니다.',
        sheetName, row.__rowNumber, header);
    }
  }));

  Object.keys(schema.dropdowns).forEach(header => rows.forEach(row => {
    const value = row[header];
    if (!isBlankValue_(value) && !schema.dropdowns[header].includes(String(value))) {
      addDiagnostic_(
        report,
        'ERROR',
        'INVALID_ENUM',
        '허용값: ' + schema.dropdowns[header].join(', '),
        sheetName,
        row.__rowNumber,
        header
      );
    }
  }));
}

function checkValidations_(sheet, sheetName, schema, report) {
  const validationRows = Array.from(new Set([2, sheet.getMaxRows()]));

  schema.checkboxes.forEach(header => {
    validationRows.forEach(rowNumber => {
      const rule = sheet.getRange(rowNumber, columnNumber_(sheetName, header)).getDataValidation();
      if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
        addDiagnostic_(report, 'ERROR', 'MISSING_CHECKBOX_VALIDATION',
          '체크박스 validation이 없습니다.', sheetName, rowNumber, header);
      }
    });
  });

  Object.keys(schema.dropdowns).forEach(header => {
    validationRows.forEach(rowNumber => {
      const rule = sheet.getRange(rowNumber, columnNumber_(sheetName, header)).getDataValidation();
      if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
        addDiagnostic_(report, 'ERROR', 'MISSING_DROPDOWN_VALIDATION',
          'dropdown validation이 없습니다.', sheetName, rowNumber, header);
        return;
      }
      const criteriaValues = rule.getCriteriaValues();
      const actual = Array.isArray(criteriaValues[0]) ? criteriaValues[0].map(String) : [];
      const expected = Array.from(schema.dropdowns[header]);
      if (!valuesEqual_(actual, expected)) {
        addDiagnostic_(report, 'ERROR', 'DROPDOWN_VALUES_MISMATCH',
          'dropdown 값이 schema와 다릅니다.', sheetName, rowNumber, header);
      }
    });
  });
}

function checkProtections_(sheet, sheetName, report) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(protection => (protection.getDescription() || '').indexOf(
      QR_ORDER_APP.PROTECTION_PREFIX
    ) === 0);
  const schema = getSchema_(sheetName);
  const expected = [{
    description: QR_ORDER_APP.PROTECTION_PREFIX + ' ' + sheetName + ' header',
    a1: 'A1:' + columnLetter_(schema.headers.length) + '1',
  }].concat(QR_ORDER_PROTECTIONS[sheetName].map(spec => ({
    description: QR_ORDER_APP.PROTECTION_PREFIX + ' ' + sheetName + ' ' + spec.label,
    a1: spec.a1,
  })));

  if (sheetName === 'Settings') {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const keys = sheet.getRange(2, columnNumber_('Settings', 'key'), lastRow - 1, 1)
        .getDisplayValues();
      const counterOffset = keys.findIndex(row => row[0] === 'NEXT_DISPLAY_NUMBER');
      if (counterOffset >= 0) {
        expected.push({
          description: QR_ORDER_APP.PROTECTION_PREFIX + ' Settings NEXT_DISPLAY_NUMBER value',
          a1: 'B' + (counterOffset + 2),
        });
      }
    }
  }

  const actualKeys = protections.map(protection => {
    return protection.getDescription() + '|' + protection.getRange().getA1Notation();
  });
  const expectedKeys = expected.map(item => item.description + '|' + item.a1);

  expectedKeys.forEach(key => {
    if (!actualKeys.includes(key)) {
      addDiagnostic_(report, 'ERROR', 'MISSING_PROTECTION',
        '필수 관리 보호 범위가 없습니다: ' + key, sheetName);
    }
  });
  actualKeys.forEach(key => {
    if (!expectedKeys.includes(key)) {
      addDiagnostic_(report, 'ERROR', 'UNEXPECTED_MANAGED_PROTECTION',
        '정의되지 않은 관리 보호 범위가 있습니다: ' + key, sheetName);
    }
  });

  protections.forEach(protection => {
    if (protection.isWarningOnly()) {
      addDiagnostic_(report, 'ERROR', 'WARNING_ONLY_PROTECTION',
        '보호 범위가 warning-only입니다: ' + protection.getDescription(), sheetName);
    }
    if (protection.canDomainEdit()) {
      addDiagnostic_(report, 'ERROR', 'DOMAIN_EDITABLE_PROTECTION',
        '도메인 전체가 보호 범위를 수정할 수 있습니다: ' + protection.getDescription(), sheetName);
    }
  });
}

function checkSettings_(tables, report) {
  const settings = tables.Settings || [];
  const byKey = new Map(settings.map(row => [String(row.key), row]));

  QR_ORDER_SETTINGS_DEFAULTS.forEach(expected => {
    const row = byKey.get(expected.key);
    if (!row) {
      addDiagnostic_(report, 'ERROR', 'MISSING_SETTING', '필수 설정이 없습니다: ' + expected.key,
        'Settings');
      return;
    }
    if (row.type !== expected.type) {
      addDiagnostic_(report, 'ERROR', 'SETTING_TYPE_MISMATCH',
        expected.key + ' type은 ' + expected.type + '이어야 합니다.',
        'Settings', row.__rowNumber, 'type');
    }
    if (row.type === 'INTEGER' && !/^-?\d+$/.test(String(row.value))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_SETTING_INTEGER',
        expected.key + ' 값은 정수 문자열이어야 합니다.',
        'Settings', row.__rowNumber, 'value');
    }
    if (row.type === 'BOOLEAN' && !['TRUE', 'FALSE'].includes(String(row.value).toUpperCase())) {
      addDiagnostic_(report, 'ERROR', 'INVALID_SETTING_BOOLEAN',
        expected.key + ' 값은 TRUE/FALSE여야 합니다.',
        'Settings', row.__rowNumber, 'value');
    }
  });

  const timeZone = byKey.get('TIME_ZONE');
  if (timeZone && String(timeZone.value) !== 'Asia/Seoul') {
    addDiagnostic_(report, 'WARNING', 'UNEXPECTED_TIME_ZONE',
      'TIME_ZONE은 Asia/Seoul을 권장합니다.', 'Settings', timeZone.__rowNumber, 'value');
  }

  const eventId = byKey.get('EVENT_ID');
  if (eventId && String(eventId.value) === '2026-fall-pub') {
    addDiagnostic_(report, 'WARNING', 'PLACEHOLDER_EVENT_ID',
      'EVENT_ID 기본값을 실제 행사 ID로 변경하세요.', 'Settings', eventId.__rowNumber, 'value');
  }

  const frontendBaseUrl = byKey.get('FRONTEND_BASE_URL');
  if (frontendBaseUrl) {
    try {
      normalizeFrontendBaseUrl_(frontendBaseUrl.value);
    } catch (error) {
      addDiagnostic_(report, 'ERROR', 'INVALID_FRONTEND_BASE_URL',
        'FRONTEND_BASE_URL은 path가 없는 HTTPS origin이어야 합니다. 예: https://caucse.shop',
        'Settings', frontendBaseUrl.__rowNumber, 'value');
    }
  }

  const nextNumber = byKey.get('NEXT_DISPLAY_NUMBER');
  const orderNumbers = (tables.Orders || []).map(row => Number(row.display_number))
    .filter(Number.isFinite);
  const currentMax = orderNumbers.length ? Math.max.apply(null, orderNumbers) : 0;
  if (nextNumber && Number(nextNumber.value) <= currentMax) {
    addDiagnostic_(report, 'ERROR', 'DISPLAY_COUNTER_COLLISION',
      'NEXT_DISPLAY_NUMBER는 현재 최대 주문번호 ' + currentMax + '보다 커야 합니다.',
      'Settings', nextNumber.__rowNumber, 'value');
  }
}

function checkTableSecurity_(tables, report) {
  (tables.Tables || []).forEach(row => {
    if (!/^T\d{2,}$/.test(String(row.table_id))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_TABLE_ID_FORMAT',
        'table_id는 T01 형식이어야 합니다.',
        'Tables', row.__rowNumber, 'table_id');
    }
    if (!/^[0-9a-f]{64}$/i.test(String(row.token_hash))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_TABLE_TOKEN_HASH',
        'token_hash는 SHA-256 64자리 hex여야 합니다. 원본 token을 입력하면 안 됩니다.',
        'Tables', row.__rowNumber, 'token_hash');
    }
  });
}

function checkForeignKeys_(tables, report) {
  const tableIds = valueSet_(tables.Tables, 'table_id');
  const categoryIds = valueSet_(tables.Categories, 'category_id');
  const menuIds = valueSet_(tables.Menu, 'menu_id');
  const groupIds = valueSet_(tables.MenuOptionGroups, 'option_group_id');
  const orderIds = valueSet_(tables.Orders, 'order_id');
  const itemIds = valueSet_(tables.OrderItems, 'order_item_id');
  const optionIds = valueSet_(tables.MenuOptions, 'option_id');

  checkForeignKeyRows_(tables.Menu, 'category_id', categoryIds, 'Menu', 'Categories.category_id', report);
  checkForeignKeyRows_(tables.MenuOptionGroups, 'menu_id', menuIds,
    'MenuOptionGroups', 'Menu.menu_id', report);
  checkForeignKeyRows_(tables.MenuOptions, 'option_group_id', groupIds,
    'MenuOptions', 'MenuOptionGroups.option_group_id', report);
  checkForeignKeyRows_(tables.MenuOptions, 'menu_id', menuIds,
    'MenuOptions', 'Menu.menu_id', report);
  checkForeignKeyRows_(tables.Orders, 'table_id', tableIds, 'Orders', 'Tables.table_id', report);
  checkForeignKeyRows_(tables.OrderItems, 'order_id', orderIds,
    'OrderItems', 'Orders.order_id', report);
  checkForeignKeyRows_(tables.OrderItems, 'menu_id', menuIds, 'OrderItems', 'Menu.menu_id', report);
  checkForeignKeyRows_(tables.OrderItemOptions, 'order_item_id', itemIds,
    'OrderItemOptions', 'OrderItems.order_item_id', report);
  checkForeignKeyRows_(tables.OrderItemOptions, 'order_id', orderIds,
    'OrderItemOptions', 'Orders.order_id', report);
  checkForeignKeyRows_(tables.OrderItemOptions, 'option_id', optionIds,
    'OrderItemOptions', 'MenuOptions.option_id', report);
}

function valueSet_(rows, header) {
  return new Set((rows || []).filter(row => !isBlankValue_(row[header])).map(row => String(row[header])));
}

function checkForeignKeyRows_(rows, header, targetSet, sheetName, targetName, report) {
  (rows || []).forEach(row => {
    if (isBlankValue_(row[header])) return;
    if (!targetSet.has(String(row[header]))) {
      addDiagnostic_(report, 'ERROR', 'BROKEN_FOREIGN_KEY',
        header + '가 존재하지 않는 ' + targetName + '를 참조합니다.',
        sheetName, row.__rowNumber, header);
    }
  });
}

function checkCatalogRules_(tables, report) {
  const categories = new Map((tables.Categories || []).map(row => [String(row.category_id), row]));
  const menu = new Map((tables.Menu || []).map(row => [String(row.menu_id), row]));
  const groups = new Map((tables.MenuOptionGroups || []).map(row => [String(row.option_group_id), row]));
  const optionsByGroup = groupRows_(tables.MenuOptions || [], 'option_group_id');

  if (!(tables.Tables || []).length) {
    addDiagnostic_(report, 'WARNING', 'NO_TABLES', '아직 등록된 테이블이 없습니다.', 'Tables');
  }
  if (!(tables.Menu || []).length) {
    addDiagnostic_(report, 'WARNING', 'NO_MENU', '아직 등록된 메뉴가 없습니다.', 'Menu');
  }

  (tables.Menu || []).forEach(row => {
    if (Number(row.min_quantity) > Number(row.max_quantity)) {
      addDiagnostic_(report, 'ERROR', 'INVALID_QUANTITY_RANGE',
        'min_quantity는 max_quantity보다 클 수 없습니다.',
        'Menu', row.__rowNumber, 'min_quantity');
    }
    const category = categories.get(String(row.category_id));
    if (row.available === true && category && category.active !== true) {
      addDiagnostic_(report, 'WARNING', 'MENU_IN_INACTIVE_CATEGORY',
        '판매 가능한 메뉴가 비활성 카테고리에 속해 있습니다.',
        'Menu', row.__rowNumber, 'category_id');
    }
  });

  (tables.MenuOptionGroups || []).forEach(group => {
    if (Number(group.min_select) > Number(group.max_select)) {
      addDiagnostic_(report, 'ERROR', 'INVALID_SELECTION_RANGE',
        'min_select는 max_select보다 클 수 없습니다.',
        'MenuOptionGroups', group.__rowNumber, 'min_select');
    }
    if (group.selection_type === 'SINGLE' && Number(group.max_select) !== 1) {
      addDiagnostic_(report, 'ERROR', 'INVALID_SINGLE_MAX',
        'SINGLE 그룹의 max_select는 1이어야 합니다.',
        'MenuOptionGroups', group.__rowNumber, 'max_select');
    }
    if (group.required === true && Number(group.min_select) < 1) {
      addDiagnostic_(report, 'ERROR', 'INVALID_REQUIRED_MIN',
        'required 그룹의 min_select는 1 이상이어야 합니다.',
        'MenuOptionGroups', group.__rowNumber, 'min_select');
    }

    const options = optionsByGroup.get(String(group.option_group_id)) || [];
    if (group.active === true && options.length === 0) {
      addDiagnostic_(report, 'ERROR', 'ACTIVE_GROUP_WITHOUT_OPTIONS',
        '활성 옵션 그룹에 옵션이 없습니다.', 'MenuOptionGroups', group.__rowNumber);
    }
    const availableCount = options.filter(option => option.available === true).length;
    if (group.active === true && group.required === true && availableCount < Number(group.min_select)) {
      addDiagnostic_(report, 'ERROR', 'REQUIRED_GROUP_NOT_ORDERABLE',
        '필수 옵션 그룹의 판매 가능한 옵션 수가 min_select보다 적습니다.',
        'MenuOptionGroups', group.__rowNumber);
    } else if (group.active === true && options.length > 0 && availableCount === 0) {
      addDiagnostic_(report, 'WARNING', 'OPTIONAL_GROUP_SOLD_OUT',
        '활성 옵션 그룹의 모든 옵션이 품절입니다.', 'MenuOptionGroups', group.__rowNumber);
    }

    const defaults = options.filter(option => option.default_selected === true);
    if (defaults.length > Number(group.max_select)) {
      addDiagnostic_(report, 'ERROR', 'TOO_MANY_DEFAULT_OPTIONS',
        '기본 선택 옵션 수가 max_select를 초과합니다.',
        'MenuOptionGroups', group.__rowNumber);
    }
    if (defaults.some(option => option.available !== true)) {
      addDiagnostic_(report, 'WARNING', 'DEFAULT_OPTION_SOLD_OUT',
        '기본 선택 옵션 중 품절 옵션이 있습니다.', 'MenuOptionGroups', group.__rowNumber);
    }
  });

  (tables.MenuOptions || []).forEach(option => {
    const group = groups.get(String(option.option_group_id));
    if (group && String(option.menu_id) !== String(group.menu_id)) {
      addDiagnostic_(report, 'ERROR', 'OPTION_MENU_MISMATCH',
        'option의 menu_id가 option group의 menu_id와 다릅니다.',
        'MenuOptions', option.__rowNumber, 'menu_id');
    }
    if (group && !menu.has(String(group.menu_id))) return;
  });
}

function checkOrderIntegrity_(tables, report) {
  const orders = tables.Orders || [];
  const items = tables.OrderItems || [];
  const itemOptions = tables.OrderItemOptions || [];
  const itemsByOrder = groupRows_(items, 'order_id');
  const optionsByItem = groupRows_(itemOptions, 'order_item_id');
  const itemsById = new Map(items.map(row => [String(row.order_item_id), row]));

  checkCompositeUnique_(items, ['order_id', 'line_no'], 'OrderItems', report);
  checkCompositeUnique_(
    itemOptions,
    ['order_item_id', 'option_id'],
    'OrderItemOptions',
    report
  );

  items.forEach(item => {
    if (Number(item.line_total) !== Number(item.unit_price_snapshot) * Number(item.quantity)) {
      addDiagnostic_(report, 'ERROR', 'LINE_TOTAL_MISMATCH',
        'line_total이 unit_price_snapshot * quantity와 다릅니다.',
        'OrderItems', item.__rowNumber, 'line_total');
    }
    const optionDelta = (optionsByItem.get(String(item.order_item_id)) || [])
      .reduce((sum, option) => sum + Number(option.price_delta_snapshot), 0);
    if (Number(item.unit_price_snapshot) !== Number(item.base_price_snapshot) + optionDelta) {
      addDiagnostic_(report, 'ERROR', 'UNIT_PRICE_SNAPSHOT_MISMATCH',
        'unit_price_snapshot이 base 가격과 옵션 증감의 합과 다릅니다.',
        'OrderItems', item.__rowNumber, 'unit_price_snapshot');
    }
    const expectedId = String(item.order_id) + '-' + String(item.line_no).padStart(2, '0');
    if (String(item.order_item_id) !== expectedId) {
      addDiagnostic_(report, 'WARNING', 'NON_DETERMINISTIC_ITEM_ID',
        '권장 deterministic order_item_id와 다릅니다: ' + expectedId,
        'OrderItems', item.__rowNumber, 'order_item_id');
    }
  });

  itemOptions.forEach(option => {
    const item = itemsById.get(String(option.order_item_id));
    if (item && String(item.order_id) !== String(option.order_id)) {
      addDiagnostic_(report, 'ERROR', 'OPTION_ORDER_MISMATCH',
        'OrderItemOption의 order_id가 부모 item과 다릅니다.',
        'OrderItemOptions', option.__rowNumber, 'order_id');
    }
    const expectedId = String(option.order_item_id) + '-' +
      String(option.sort_order).padStart(2, '0');
    if (String(option.order_item_option_id) !== expectedId) {
      addDiagnostic_(report, 'WARNING', 'NON_DETERMINISTIC_ITEM_OPTION_ID',
        '권장 deterministic order_item_option_id와 다릅니다: ' + expectedId,
        'OrderItemOptions', option.__rowNumber, 'order_item_option_id');
    }
  });

  orders.forEach(order => {
    const expectedPublic = QR_ORDER_STATUS_TO_PUBLIC[order.status];
    if (expectedPublic && order.public_status !== expectedPublic) {
      addDiagnostic_(report, 'ERROR', 'PUBLIC_STATUS_MISMATCH',
        'public_status는 ' + expectedPublic + '이어야 합니다.',
        'Orders', order.__rowNumber, 'public_status');
    }

    if (String(order.note || '').length > QR_ORDER_LIMITS.MAX_NOTE_LENGTH) {
      addDiagnostic_(report, 'ERROR', 'ORDER_NOTE_TOO_LONG',
        '주문 메모는 ' + QR_ORDER_LIMITS.MAX_NOTE_LENGTH + '자 이하여야 합니다.',
        'Orders', order.__rowNumber, 'note');
    }
    if (!/^[0-9a-f]{64}$/i.test(String(order.request_fingerprint))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_REQUEST_FINGERPRINT',
        'request_fingerprint는 SHA-256 64자리 hex여야 합니다.',
        'Orders', order.__rowNumber, 'request_fingerprint');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(String(order.client_request_id))) {
      addDiagnostic_(report, 'ERROR', 'INVALID_CLIENT_REQUEST_ID',
        'client_request_id는 소문자 UUID 형식이어야 합니다.',
        'Orders', order.__rowNumber, 'client_request_id');
    }
    const expectedIdempotencyKey = String(order.table_id) + ':' +
      String(order.client_request_id).toLowerCase();
    if (String(order.idempotency_key) !== expectedIdempotencyKey) {
      addDiagnostic_(report, 'ERROR', 'INVALID_IDEMPOTENCY_KEY',
        'idempotency_key는 table_id:client_request_id 형식이어야 합니다.',
        'Orders', order.__rowNumber, 'idempotency_key');
    }

    try {
      const payload = JSON.parse(String(order.write_payload_json));
      if (!Array.isArray(payload)) throw new Error('not an array');
      if (containsSensitiveOrderPayloadField_(payload)) {
        addDiagnostic_(report, 'ERROR', 'SENSITIVE_WRITE_PAYLOAD_FIELD',
          'write_payload_json에 token 또는 인증 필드를 저장하면 안 됩니다.',
          'Orders', order.__rowNumber, 'write_payload_json');
      }
    } catch (error) {
      addDiagnostic_(report, 'ERROR', 'INVALID_WRITE_PAYLOAD_JSON',
        'write_payload_json은 배열 JSON이어야 합니다.',
        'Orders', order.__rowNumber, 'write_payload_json');
    }

    const orderItems = itemsByOrder.get(String(order.order_id)) || [];
    const itemTotal = orderItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    if (order.write_state === 'COMMITTED' && orderItems.length === 0) {
      addDiagnostic_(report, 'ERROR', 'COMMITTED_ORDER_WITHOUT_ITEMS',
        'COMMITTED 주문에 OrderItems가 없습니다.', 'Orders', order.__rowNumber);
    }
    if (order.write_state === 'COMMITTED' && Number(order.total_amount) !== itemTotal) {
      addDiagnostic_(report, 'ERROR', 'ORDER_TOTAL_MISMATCH',
        'total_amount가 OrderItems line_total 합과 다릅니다.',
        'Orders', order.__rowNumber, 'total_amount');
    }

    if (order.status === 'CANCELLED' && isBlankValue_(order.cancel_reason)) {
      addDiagnostic_(report, 'WARNING', 'MISSING_CANCEL_REASON',
        '취소 주문에는 cancel_reason 입력을 권장합니다.',
        'Orders', order.__rowNumber, 'cancel_reason');
    }
    if (order.status === 'CANCELLED' && isBlankValue_(order.cancelled_at)) {
      addDiagnostic_(report, 'ERROR', 'MISSING_CANCELLED_AT',
        'CANCELLED 주문에는 cancelled_at이 필요합니다.',
        'Orders', order.__rowNumber, 'cancelled_at');
    }
    if (order.status !== 'CANCELLED' && !isBlankValue_(order.cancelled_at)) {
      addDiagnostic_(report, 'WARNING', 'UNEXPECTED_CANCELLED_AT',
        'CANCELLED가 아닌 주문에 cancelled_at이 있습니다.',
        'Orders', order.__rowNumber, 'cancelled_at');
    }
    if (order.payment_status === 'PAID' && isBlankValue_(order.paid_at)) {
      addDiagnostic_(report, 'WARNING', 'MISSING_PAID_AT',
        'PAID 주문에 paid_at이 없습니다.', 'Orders', order.__rowNumber, 'paid_at');
    }
    if (order.write_state === 'FAILED') {
      addDiagnostic_(report, 'WARNING', 'FAILED_ORDER_WRITE',
        '복구가 필요한 FAILED 주문입니다.', 'Orders', order.__rowNumber, 'write_state');
    }
    if (order.write_state === 'WRITING') {
      const ageMs = Date.now() - new Date(order.updated_at).getTime();
      if (Number.isFinite(ageMs) && ageMs > 30000) {
        addDiagnostic_(report, 'WARNING', 'STALE_WRITING_ORDER',
          '30초 이상 갱신되지 않은 WRITING 주문입니다.',
          'Orders', order.__rowNumber, 'write_state');
      }
    }
  });
}

function containsSensitiveOrderPayloadField_(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveOrderPayloadField_);
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).some(key => {
    const normalized = String(key).replace(/[^a-z]/gi, '').toLowerCase();
    if (['token', 'tabletoken', 'tokenhash', 'tokenpepper'].includes(normalized)) return true;
    return containsSensitiveOrderPayloadField_(value[key]);
  });
}

function checkCompositeUnique_(rows, headers, sheetName, report) {
  const seen = new Map();
  rows.forEach(row => {
    if (headers.some(header => isBlankValue_(row[header]))) return;
    const key = headers.map(header => String(row[header])).join('\u001f');
    if (seen.has(key)) {
      addDiagnostic_(
        report,
        'ERROR',
        'DUPLICATE_COMPOSITE_VALUE',
        headers.join(' + ') + ' 조합이 중복됩니다. 첫 행: ' + seen.get(key),
        sheetName,
        row.__rowNumber
      );
    } else {
      seen.set(key, row.__rowNumber);
    }
  });
}

function groupRows_(rows, header) {
  return (rows || []).reduce((map, row) => {
    const key = String(row[header]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());
}

function showDiagnosticsReport_(report) {
  const errorCount = report.summary ? report.summary.errorCount : report.errors.length;
  const warningCount = report.summary ? report.summary.warningCount : report.warnings.length;
  const lines = [
    report.ok ? '무결성 진단 통과' : '무결성 진단 실패',
    '오류: ' + errorCount + '개',
    '경고: ' + warningCount + '개',
  ];
  report.errors.slice(0, 8).forEach(issue => {
    lines.push('[ERROR] ' + issue.code + ': ' + issue.message);
  });
  report.warnings.slice(0, 5).forEach(issue => {
    lines.push('[WARN] ' + issue.code + ': ' + issue.message);
  });
  if (errorCount > 8 || warningCount > 5) {
    lines.push('상세 내용은 실행 로그를 확인하세요.');
  }
  if (report.truncated && (report.truncated.errorCount || report.truncated.warningCount)) {
    lines.push(
      '로그 생략: 오류 ' + report.truncated.errorCount + '개 / 경고 ' +
        report.truncated.warningCount + '개'
    );
  }
  try {
    SpreadsheetApp.getUi().alert(lines.join('\n'));
  } catch (error) {
    console.log(lines.join('\n'));
  }
}
