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
  const spreadsheet = getConfiguredSpreadsheet_();
  const table = validateTable_(payload.tableId, payload.tableToken, true, spreadsheet);
  const settings = settingsMap_(spreadsheet);
  assertEventOpen_(settings);

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
