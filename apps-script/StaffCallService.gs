/** Operational call grouping and acknowledgement. */

function listStaffCalls(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken']);
  const spreadsheet = getConfiguredSpreadsheet_();
  const tables = new Map(readSheetTable_(spreadsheet, 'Tables').rows.map(table => {
    return [String(table.table_id), table];
  }));
  const pending = readSheetTable_(spreadsheet, 'Calls').rows
    .filter(call => call.status === 'PENDING')
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const grouped = groupRows_(pending, 'table_id');
  const groups = [];
  grouped.forEach((calls, tableId) => {
    const table = tables.get(tableId);
    if (!table) throw new Error('Pending call references a missing table.');
    const reasons = [];
    calls.forEach(call => {
      const reason = String(call.reason);
      if (!reasons.includes(reason)) reasons.push(reason);
    });
    groups.push({
      tableId: tableId,
      displayName: String(table.display_name),
      count: calls.length,
      reasons: reasons,
      firstCalledAt: staffIsoDate_(calls[0].created_at, 'Calls.created_at'),
      lastCalledAt: staffIsoDate_(calls[calls.length - 1].created_at, 'Calls.created_at'),
      callIds: calls.map(call => String(call.call_id)),
    });
  });
  groups.sort((left, right) => Date.parse(left.firstCalledAt) - Date.parse(right.firstCalledAt));
  return { groups: groups, tableCount: groups.length };
}

function acknowledgeStaffCalls(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken', 'tableId']);
  const tableId = validateStaffTableId_(payload.tableId);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }
  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    assertKnownTable_(spreadsheet, tableId);
    const calls = readSheetTable_(spreadsheet, 'Calls').rows.filter(call => {
      return call.status === 'PENDING' && String(call.table_id) === tableId;
    });
    const now = new Date();
    calls.forEach(call => {
      updateObjectRowBySchema_(spreadsheet, 'Calls', call.__rowNumber, {
        status: 'ACKNOWLEDGED',
        acknowledged_at: now,
        acknowledged_by: staff.deviceLabel,
        updated_at: now,
      });
    });
    if (calls.length) {
      appendStaffAuditSafely_(spreadsheet, staff, 'CALL_ACKNOWLEDGED', 'TABLE', tableId,
        requestId, '', 'ACKNOWLEDGED', {
          callIds: calls.map(call => String(call.call_id)),
          count: calls.length,
        });
    }
    return {
      tableId: tableId,
      acknowledgedCount: calls.length,
      acknowledgedAt: now.toISOString(),
    };
  } finally {
    lock.releaseLock();
  }
}

function staffIsoDate_(value, fieldName) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(fieldName + ' is invalid.');
  return date.toISOString();
}
