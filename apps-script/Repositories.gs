/**
 * Spreadsheet helpers shared by setup and the future API implementation.
 * All reads/writes are header based; business code must not hardcode columns.
 */

function getConfiguredSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error(
      'Missing SPREADSHEET_ID. Add it in Apps Script > Project Settings > Script Properties.'
    );
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getSchema_(sheetName) {
  const schema = QR_ORDER_SCHEMA[sheetName];
  if (!schema) throw new Error('Unknown canonical sheet: ' + sheetName);
  return schema;
}

function getCanonicalSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing canonical sheet: ' + sheetName);
  return sheet;
}

function readSheetTable_(spreadsheet, sheetName) {
  const schema = getSchema_(sheetName);
  const sheet = getCanonicalSheet_(spreadsheet, sheetName);
  const lastRow = sheet.getLastRow();
  const headerValues = sheet.getRange(1, 1, 1, schema.headers.length).getDisplayValues()[0];
  const checkboxColumns = new Set(
    schema.checkboxes.map(header => schema.headers.indexOf(header))
  );
  const rows = [];

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
    values.forEach((row, offset) => {
      if (isEffectivelyBlankRow_(row, checkboxColumns)) return;
      const object = { __rowNumber: offset + 2 };
      schema.headers.forEach((header, index) => { object[header] = row[index]; });
      rows.push(object);
    });
  }

  return {
    sheet: sheet,
    headers: headerValues,
    rows: rows,
  };
}

function isEffectivelyBlankRow_(row, checkboxColumns) {
  return row.every((value, index) => {
    return isBlankValue_(value) || (value === false && checkboxColumns.has(index));
  });
}

function appendObjectsBySchema_(spreadsheet, sheetName, objects) {
  if (!objects.length) return null;
  const schema = getSchema_(sheetName);
  const table = readSheetTable_(spreadsheet, sheetName);
  const sheet = table.sheet;
  const startRow = nextAppendRow_(table.rows);
  const values = objects.map(object => schema.headers.map(header => {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  }));
  const requiredLastRow = startRow + values.length - 1;
  if (sheet.getMaxRows() < requiredLastRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }
  sheet.getRange(startRow, 1, values.length, schema.headers.length).setValues(values);
  return { startRow: startRow, rowCount: values.length };
}

function nextAppendRow_(rows) {
  const lastDataRow = rows.reduce((maximum, row) => {
    return Math.max(maximum, Number(row.__rowNumber) || 1);
  }, 1);
  return lastDataRow + 1;
}

function updateObjectRowBySchema_(spreadsheet, sheetName, rowNumber, patch) {
  const schema = getSchema_(sheetName);
  const sheet = getCanonicalSheet_(spreadsheet, sheetName);
  const range = sheet.getRange(rowNumber, 1, 1, schema.headers.length);
  const row = range.getValues()[0];
  schema.headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = patch[header];
  });
  range.setValues([row]);
}

function headerIndex_(sheetName, header) {
  const index = getSchema_(sheetName).headers.indexOf(header);
  if (index < 0) throw new Error('Unknown header ' + sheetName + '.' + header);
  return index;
}

function columnNumber_(sheetName, header) {
  return headerIndex_(sheetName, header) + 1;
}

function columnLetter_(columnNumber) {
  let result = '';
  let value = columnNumber;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function isBlankValue_(value) {
  return value === '' || value === null || value === undefined;
}

function stringValue_(value) {
  return isBlankValue_(value) ? '' : String(value);
}

function valuesEqual_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
