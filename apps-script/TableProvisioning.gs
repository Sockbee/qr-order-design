/**
 * Staff-only table provisioning commands.
 * Raw tokens are shown once in a transient export dialog and are never written to a Sheet/log.
 */

function provisionTables() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '테이블/QR 초기 발급',
    '운영할 전체 테이블 수를 입력하세요. 예: 20 → T01부터 T20까지 없는 테이블만 추가합니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return { cancelled: true };

  const tableCount = Number(String(response.getResponseText()).trim());
  if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 999) {
    ui.alert('테이블 수는 1~999 사이의 정수로 입력해 주세요.');
    return { cancelled: true };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let result;
  try {
    result = provisionTablesForCount_(tableCount);
  } finally {
    lock.releaseLock();
  }

  if (!result.exports.length) {
    ui.alert('T01~' + formatTableId_(tableCount) + '이(가) 이미 모두 등록되어 있습니다.');
    return { requestedCount: tableCount, createdCount: 0, existingCount: tableCount };
  }

  showQrExportDialog_(result.exports, '테이블 QR 발급 완료');
  return {
    requestedCount: tableCount,
    createdCount: result.exports.length,
    existingCount: tableCount - result.exports.length,
  };
}

function provisionTablesForCount_(tableCount) {
  const spreadsheet = getConfiguredSpreadsheet_();
  assertCanonicalHeaders_(spreadsheet, ['Tables', 'Settings', 'AuditLogs']);
  const settings = settingsMap_(spreadsheet);
  const frontendBaseUrl = normalizeFrontendBaseUrl_(
    getRequiredSetting_(settings, 'FRONTEND_BASE_URL')
  );
  const pepper = getRequiredTokenPepper_();
  const existingIds = new Set(readSheetTable_(spreadsheet, 'Tables').rows.map(row => {
    return String(row.table_id);
  }));
  const now = new Date();
  const rows = [];
  const exports = [];

  for (let number = 1; number <= tableCount; number += 1) {
    const tableId = formatTableId_(number);
    if (existingIds.has(tableId)) continue;

    const rawToken = generateTableToken_();
    rows.push({
      table_id: tableId,
      display_name: '테이블 ' + number,
      token_hash: sha256Hex_(pepper + ':' + rawToken),
      token_version: 1,
      active: true,
      sort_order: number,
      created_at: now,
      updated_at: now,
    });
    exports.push({
      tableId: tableId,
      displayName: '테이블 ' + number,
      tokenVersion: 1,
      url: buildTableQrUrl_(frontendBaseUrl, tableId, rawToken),
    });
  }

  appendObjectsBySchema_(spreadsheet, 'Tables', rows);
  appendAuditLogsSafely_(spreadsheet, exports.map(item => tableAuditLog_(
    'TABLE_PROVISIONED', item.tableId, '', String(item.tokenVersion), now
  )));
  return { exports: exports };
}

function rotateSelectedTableToken() {
  const ui = SpreadsheetApp.getUi();
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = activeSpreadsheet && activeSpreadsheet.getActiveSheet();
  const activeRange = activeSpreadsheet && activeSpreadsheet.getActiveRange();
  if (!activeSheet || !activeRange || activeSheet.getName() !== 'Tables' || activeRange.getRow() < 2) {
    ui.alert('Tables Sheet에서 token을 재발급할 테이블 행을 선택해 주세요.');
    return { cancelled: true };
  }

  const rowNumber = activeRange.getRow();
  if (ui.alert(
    '선택 테이블 token 재발급',
    '기존 QR은 즉시 무효화됩니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  ) !== ui.Button.YES) return { cancelled: true };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let exported;
  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    if (activeSpreadsheet.getId() !== spreadsheet.getId()) {
      throw new Error('현재 열린 Spreadsheet가 SPREADSHEET_ID와 다릅니다.');
    }
    assertCanonicalHeaders_(spreadsheet, ['Tables', 'Settings', 'AuditLogs']);
    const table = readSheetTable_(spreadsheet, 'Tables').rows.find(row => {
      return row.__rowNumber === rowNumber;
    });
    if (!table) throw new Error('선택한 행에 유효한 테이블 데이터가 없습니다.');

    const previousVersion = Number(table.token_version);
    if (!Number.isInteger(previousVersion) || previousVersion < 1) {
      throw new Error('선택한 테이블의 token_version이 올바르지 않습니다.');
    }

    const settings = settingsMap_(spreadsheet);
    const frontendBaseUrl = normalizeFrontendBaseUrl_(
      getRequiredSetting_(settings, 'FRONTEND_BASE_URL')
    );
    const rawToken = generateTableToken_();
    const nextVersion = previousVersion + 1;
    const now = new Date();
    updateObjectRowBySchema_(spreadsheet, 'Tables', rowNumber, {
      token_hash: sha256Hex_(getRequiredTokenPepper_() + ':' + rawToken),
      token_version: nextVersion,
      updated_at: now,
    });

    exported = {
      tableId: String(table.table_id),
      displayName: String(table.display_name),
      tokenVersion: nextVersion,
      url: buildTableQrUrl_(frontendBaseUrl, table.table_id, rawToken),
    };
    appendAuditLogsSafely_(spreadsheet, [tableAuditLog_(
      'TABLE_TOKEN_ROTATED', exported.tableId,
      String(previousVersion), String(nextVersion), now
    )]);
  } finally {
    lock.releaseLock();
  }

  showQrExportDialog_([exported], '테이블 token 재발급 완료');
  return { tableId: exported.tableId, tokenVersion: exported.tokenVersion };
}

function assertCanonicalHeaders_(spreadsheet, sheetNames) {
  sheetNames.forEach(sheetName => {
    const table = readSheetTable_(spreadsheet, sheetName);
    if (!valuesEqual_(table.headers, Array.from(getSchema_(sheetName).headers))) {
      throw new Error(sheetName + ' header가 canonical schema와 다릅니다. bootstrap을 먼저 실행하세요.');
    }
  });
}

function formatTableId_(number) {
  return 'T' + String(number).padStart(2, '0');
}

function generateTableToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function buildTableQrUrl_(frontendBaseUrl, tableId, rawToken) {
  return normalizeFrontendBaseUrl_(frontendBaseUrl) + '/t/' +
    encodeURIComponent(String(tableId)) + '?token=' + encodeURIComponent(String(rawToken));
}

function tableAuditLog_(action, tableId, fromValue, toValue, occurredAt) {
  let actorId = '';
  try {
    actorId = Session.getEffectiveUser().getEmail() || '';
  } catch (error) {
    actorId = '';
  }
  return {
    log_id: Utilities.getUuid(),
    occurred_at: occurredAt,
    actor_type: 'STAFF',
    actor_id: actorId,
    action: action,
    entity_type: 'TABLE',
    entity_id: tableId,
    from_value: fromValue,
    to_value: toValue,
    request_id: '',
    detail_json: JSON.stringify({ tokenVersion: Number(toValue) }),
  };
}

function appendAuditLogsSafely_(spreadsheet, logs) {
  try {
    appendObjectsBySchema_(spreadsheet, 'AuditLogs', logs);
  } catch (error) {
    console.warn('Audit log append failed after table token update: ' + (error.message || String(error)));
  }
}

function csvCell_(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function htmlEscape_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showQrExportDialog_(exports, title) {
  const csvRows = [['table_id', 'display_name', 'token_version', 'url']]
    .concat(exports.map(item => [item.tableId, item.displayName, item.tokenVersion, item.url]));
  const csv = '\uFEFF' + csvRows.map(row => row.map(csvCell_).join(',')).join('\r\n');
  const csvBase64 = Utilities.base64Encode(csv, Utilities.Charset.UTF_8);
  const filename = 'table-qr-' + Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'
  ) + '.csv';
  const tableRows = exports.map(item => {
    return '<tr><td>' + htmlEscape_(item.tableId) + '</td><td>' +
      htmlEscape_(item.displayName) + '</td><td>' + htmlEscape_(item.tokenVersion) +
      '</td><td class="url">' + htmlEscape_(item.url) + '</td></tr>';
  }).join('');
  const html = '<!doctype html><html><head><base target="_top"><style>' +
    'body{font-family:Arial,sans-serif;padding:18px;color:#202124}' +
    '.warning{background:#fff4e5;border:1px solid #f9ab00;padding:12px;margin-bottom:14px}' +
    'button{background:#1a73e8;color:white;border:0;border-radius:4px;padding:10px 16px;cursor:pointer}' +
    'table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12px}' +
    'th,td{border:1px solid #dadce0;padding:7px;text-align:left;vertical-align:top}' +
    '.url{word-break:break-all;font-family:monospace}</style></head><body>' +
    '<div class="warning"><strong>중요:</strong> 원본 token은 이 화면에서 한 번만 제공됩니다. ' +
    'CSV를 지금 내려받아 안전하게 보관하세요. 창을 닫은 뒤에는 복구할 수 없고 token 재발급이 필요합니다.</div>' +
    '<button onclick="downloadCsv()">CSV 다운로드</button>' +
    '<table><thead><tr><th>table_id</th><th>표시명</th><th>버전</th><th>QR URL</th></tr></thead>' +
    '<tbody>' + tableRows + '</tbody></table><script>' +
    'function downloadCsv(){var b=atob(' + JSON.stringify(csvBase64) + ');' +
    'var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++){a[i]=b.charCodeAt(i);}' +
    'var u=URL.createObjectURL(new Blob([a],{type:"text/csv;charset=utf-8"}));' +
    'var l=document.createElement("a");l.href=u;l.download=' + JSON.stringify(filename) + ';' +
    'document.body.appendChild(l);l.click();l.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000);}' +
    '</script></body></html>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(900).setHeight(560),
    title
  );
}
