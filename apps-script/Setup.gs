/**
 * Public bootstrap entry points.
 * Run bootstrapSpreadsheet() once after configuring SPREADSHEET_ID and TOKEN_PEPPER.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QR 주문 관리')
    .addItem('초기 구조 생성/복구', 'bootstrapSpreadsheet')
    .addItem('무결성 진단', 'runDiagnostics')
    .addToUi();
}

function bootstrapSpreadsheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let result;
  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    const summary = {
      bootstrapVersion: QR_ORDER_APP.BOOTSTRAP_VERSION,
      spreadsheetId: spreadsheet.getId(),
      createdSheets: [],
      repairedHeaders: [],
      insertedSettings: [],
      configuredSheets: [],
    };

    reuseBlankDefaultSheet_(spreadsheet, summary);

    QR_ORDER_SHEET_ORDER.forEach(sheetName => {
      const sheetResult = ensureCanonicalSheet_(spreadsheet, sheetName);
      if (sheetResult.created) summary.createdSheets.push(sheetName);
      if (sheetResult.repairedHeader) summary.repairedHeaders.push(sheetName);
      configureSheetFormat_(sheetResult.sheet, sheetName);
      applySheetValidations_(sheetResult.sheet, sheetName);
      summary.configuredSheets.push(sheetName);
    });

    summary.insertedSettings = seedSettings_(spreadsheet);

    // Settings rows now exist, so width and validation can include the seeded values.
    configureSheetFormat_(getCanonicalSheet_(spreadsheet, 'Settings'), 'Settings');
    applyAllManagedProtections_(spreadsheet);

    const diagnostics = collectDiagnostics_(spreadsheet);
    result = { summary: summary, diagnostics: diagnostics };
  } finally {
    lock.releaseLock();
  }

  console.log(JSON.stringify(result, null, 2));
  showBootstrapResult_(result);
  return result;
}

function reuseBlankDefaultSheet_(spreadsheet, summary) {
  if (spreadsheet.getSheetByName(QR_ORDER_SHEET_ORDER[0])) return;

  const candidate = spreadsheet.getSheets().find(sheet => {
    if (!['Sheet1', '시트1'].includes(sheet.getName())) return false;
    const values = sheet.getDataRange().getDisplayValues();
    return values.every(row => row.every(value => value === ''));
  });

  if (candidate) {
    candidate.setName(QR_ORDER_SHEET_ORDER[0]);
    summary.createdSheets.push(QR_ORDER_SHEET_ORDER[0]);
  }
}

function ensureCanonicalSheet_(spreadsheet, sheetName) {
  const schema = getSchema_(sheetName);
  let sheet = spreadsheet.getSheetByName(sheetName);
  let created = false;
  let repairedHeader = false;

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    created = true;
  }

  ensureSheetSize_(sheet, schema.minRows, schema.headers.length);

  const expected = Array.from(schema.headers);
  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  const extraLastColumn = Math.max(sheet.getLastColumn(), expected.length);
  const extraHeader = sheet.getRange(1, 1, 1, extraLastColumn).getDisplayValues()[0]
    .slice(expected.length)
    .filter(value => value !== '');

  if (!valuesEqual_(actual, expected) || extraHeader.length > 0) {
    const hasData = sheet.getLastRow() > 1 && sheet.getRange(
      2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 1)
    ).getDisplayValues().some(row => row.some(value => value !== ''));

    if (hasData) {
      throw new Error(
        'Header mismatch in ' + sheetName + ' with existing data. ' +
        'Expected [' + expected.join(', ') + '], found [' + actual.join(', ') + ']. ' +
        'Fix or migrate the sheet manually; bootstrap will not overwrite it.'
      );
    }

    sheet.getRange(1, 1, 1, extraLastColumn).clearContent();
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    repairedHeader = !created;
  }

  return { sheet: sheet, created: created, repairedHeader: repairedHeader };
}

function ensureSheetSize_(sheet, minRows, minColumns) {
  if (sheet.getMaxRows() < minRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < minColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), minColumns - sheet.getMaxColumns());
  }
}

function configureSheetFormat_(sheet, sheetName) {
  const schema = getSchema_(sheetName);
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const headerRange = sheet.getRange(1, 1, 1, schema.headers.length);

  sheet.setFrozenRows(1);
  headerRange
    .setBackground(QR_ORDER_APP.HEADER_BACKGROUND)
    .setFontColor(QR_ORDER_APP.HEADER_FOREGROUND)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  schema.text.forEach(header => {
    sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1)
      .setNumberFormat(QR_ORDER_APP.TEXT_FORMAT);
  });
  schema.integers.forEach(header => {
    sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1)
      .setNumberFormat(QR_ORDER_APP.INTEGER_FORMAT);
  });
  (schema.money || []).forEach(header => {
    sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1)
      .setNumberFormat(QR_ORDER_APP.MONEY_FORMAT);
  });
  schema.dates.forEach(header => {
    sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1)
      .setNumberFormat(QR_ORDER_APP.DATE_FORMAT);
  });

  sheet.autoResizeColumns(1, schema.headers.length);
  schema.headers.forEach((header, index) => {
    const column = index + 1;
    let minimum = 100;
    let maximum = 220;
    if (/description|notice|payload|detail_json|note/.test(header)) {
      minimum = 220;
      maximum = 360;
    } else if (/(_id|_hash|fingerprint|_code)$/.test(header)) {
      minimum = 140;
      maximum = 240;
    } else if (/_at$/.test(header)) {
      minimum = 150;
      maximum = 180;
    }
    const current = sheet.getColumnWidth(column);
    sheet.setColumnWidth(column, Math.max(minimum, Math.min(maximum, current)));
  });
}

function applySheetValidations_(sheet, sheetName) {
  const schema = getSchema_(sheetName);
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);

  schema.checkboxes.forEach(header => {
    const range = sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1);
    range.clearDataValidations();
    range.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireCheckbox()
        .setAllowInvalid(false)
        .setHelpText(header + ' 값은 체크박스로 입력합니다.')
        .build()
    );
  });

  Object.keys(schema.dropdowns).forEach(header => {
    const values = Array.from(schema.dropdowns[header]);
    const range = sheet.getRange(2, columnNumber_(sheetName, header), rowCount, 1);
    range.clearDataValidations();
    range.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(values, true)
        .setAllowInvalid(false)
        .setHelpText('허용값: ' + values.join(', '))
        .build()
    );
  });
}

function seedSettings_(spreadsheet) {
  const table = readSheetTable_(spreadsheet, 'Settings');
  const existingKeys = new Set(table.rows.map(row => stringValue_(row.key)));
  const now = new Date();
  const missing = QR_ORDER_SETTINGS_DEFAULTS.filter(setting => !existingKeys.has(setting.key));

  appendObjectsBySchema_(spreadsheet, 'Settings', missing.map(setting => ({
    key: setting.key,
    value: setting.value,
    type: setting.type,
    description: setting.description,
    updated_at: now,
  })));

  return missing.map(setting => setting.key);
}

function applyAllManagedProtections_(spreadsheet) {
  removeManagedProtections_(spreadsheet);

  QR_ORDER_SHEET_ORDER.forEach(sheetName => {
    const sheet = getCanonicalSheet_(spreadsheet, sheetName);
    const schema = getSchema_(sheetName);
    createManagedProtection_(
      sheet.getRange(1, 1, 1, schema.headers.length),
      sheetName + ' header'
    );

    QR_ORDER_PROTECTIONS[sheetName].forEach(spec => {
      createManagedProtection_(sheet.getRange(spec.a1), sheetName + ' ' + spec.label);
    });
  });

  const settings = readSheetTable_(spreadsheet, 'Settings');
  const counter = settings.rows.find(row => row.key === 'NEXT_DISPLAY_NUMBER');
  if (counter) {
    createManagedProtection_(
      settings.sheet.getRange(counter.__rowNumber, columnNumber_('Settings', 'value')),
      'Settings NEXT_DISPLAY_NUMBER value'
    );
  }
}

function removeManagedProtections_(spreadsheet) {
  spreadsheet.getSheets().forEach(sheet => {
    [SpreadsheetApp.ProtectionType.RANGE, SpreadsheetApp.ProtectionType.SHEET]
      .forEach(type => sheet.getProtections(type).forEach(protection => {
        const description = protection.getDescription() || '';
        if (description.indexOf(QR_ORDER_APP.PROTECTION_PREFIX) !== 0) return;
        if (!protection.canEdit()) {
          throw new Error('Cannot replace managed protection: ' + description);
        }
        protection.remove();
      }));
  });
}

function createManagedProtection_(range, label) {
  const protection = range.protect()
    .setDescription(QR_ORDER_APP.PROTECTION_PREFIX + ' ' + label)
    .setWarningOnly(false);

  const currentUser = Session.getEffectiveUser();
  const currentUserEmail = currentUser.getEmail();
  if (!currentUserEmail) {
    protection.remove();
    throw new Error('보호 범위를 설정할 실행 사용자 이메일을 확인할 수 없습니다. 배포 계정으로 다시 실행하세요.');
  }

  protection.addEditor(currentUser);
  const otherEditors = protection.getEditors().filter(user => {
    return user.getEmail() !== currentUserEmail;
  });
  if (otherEditors.length) protection.removeEditors(otherEditors);
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  return protection;
}

function showBootstrapResult_(result) {
  const diagnostics = result.diagnostics;
  const errorCount = diagnostics.summary ? diagnostics.summary.errorCount : diagnostics.errors.length;
  const warningCount = diagnostics.summary
    ? diagnostics.summary.warningCount
    : diagnostics.warnings.length;
  const lines = [
    'QR 주문 bootstrap 완료',
    '생성된 Sheet: ' + (result.summary.createdSheets.join(', ') || '없음'),
    '추가된 Settings: ' + (result.summary.insertedSettings.join(', ') || '없음'),
    '진단: 오류 ' + errorCount + '개 / 경고 ' + warningCount + '개',
  ];
  try {
    SpreadsheetApp.getUi().alert(lines.join('\n'));
  } catch (error) {
    console.log(lines.join('\n'));
  }
}
