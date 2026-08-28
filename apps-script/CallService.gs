/** Customer call creation, cancellation, idempotency, and frequency limiting. */

function createCall(payload, requestId) {
  validateCreateCallRequest_(payload);
  const clientRequestId = String(payload.clientRequestId).toLowerCase();
  const tableId = String(payload.tableId);
  const reason = String(payload.reason);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '주문이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }

  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    const table = validateTable_(tableId, payload.tableToken, false, spreadsheet);
    const calls = readSheetTable_(spreadsheet, 'Calls').rows;
    const existing = calls.find(call => {
      return String(call.client_request_id).toLowerCase() === clientRequestId;
    });

    if (existing) {
      if (String(existing.table_id) !== tableId || String(existing.reason) !== reason) {
        throw new ApiError(
          'DUPLICATE_REQUEST',
          '이전 호출 요청과 정보가 달라 처리할 수 없습니다.',
          false
        );
      }
      return callResponse_(existing, true);
    }

    if (table.active !== true) {
      throw new ApiError('INACTIVE_TABLE', '현재 이 테이블에서는 주문할 수 없습니다.', false);
    }
    const settings = settingsMap_(spreadsheet);
    assertEventOpen_(settings);
    const intervalSeconds = Number(getRequiredSetting_(settings, 'CALL_MIN_INTERVAL_SECONDS'));
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 0) {
      throw new Error('CALL_MIN_INTERVAL_SECONDS must be a non-negative integer.');
    }

    const latestCall = calls
      .filter(call => String(call.table_id) === tableId)
      .reduce((latest, call) => {
        const timestamp = new Date(call.created_at).getTime();
        if (!Number.isFinite(timestamp)) throw new Error('Calls.created_at is invalid.');
        return !latest || timestamp > latest.timestamp ? { call: call, timestamp: timestamp } : latest;
      }, null);
    const now = new Date();
    if (latestCall && now.getTime() - latestCall.timestamp < intervalSeconds * 1000) {
      appendCallAuditSafely_(spreadsheet, 'CALL_THROTTLED', tableId, requestId, {
        clientRequestId: clientRequestId,
      });
      throw new ApiError(
        'CALL_TOO_FREQUENT',
        '방금 호출했어요. 잠시 후 다시 시도해 주세요.',
        true
      );
    }

    const callId = Utilities.getUuid();
    const row = {
      call_id: callId,
      table_id: tableId,
      reason: reason,
      status: 'PENDING',
      client_request_id: clientRequestId,
      created_at: now,
      acknowledged_at: '',
      acknowledged_by: '',
      cancelled_at: '',
      updated_at: now,
    };
    appendObjectsBySchema_(spreadsheet, 'Calls', [row]);
    appendCallAuditSafely_(spreadsheet, 'CALL_CREATED', callId, requestId, {
      tableId: tableId,
      reason: reason,
    });
    return callResponse_(row, false);
  } finally {
    lock.releaseLock();
  }
}

function cancelCall(payload, requestId) {
  validateCancelCallRequest_(payload);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '주문이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }

  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    const table = validateTable_(payload.tableId, payload.tableToken, false, spreadsheet);
    const call = readSheetTable_(spreadsheet, 'Calls').rows.find(candidate => {
      return String(candidate.call_id) === String(payload.callId) &&
        String(candidate.table_id) === String(table.table_id);
    });
    if (!call) {
      throw new ApiError('CALL_NOT_FOUND', '호출 정보를 찾을 수 없습니다.', false);
    }
    if (call.status !== 'PENDING') {
      throw new ApiError(
        'CALL_ALREADY_RESOLVED',
        '이미 직원이 확인한 호출입니다.',
        false
      );
    }

    const now = new Date();
    updateObjectRowBySchema_(spreadsheet, 'Calls', call.__rowNumber, {
      status: 'CANCELLED',
      cancelled_at: now,
      updated_at: now,
    });
    appendCallAuditSafely_(spreadsheet, 'CALL_CANCELLED', String(call.call_id), requestId, {
      tableId: String(table.table_id),
    });
    return null;
  } finally {
    lock.releaseLock();
  }
}

function validateCreateCallRequest_(payload) {
  assertCallAllowedFields_(payload, [
    'apiVersion', 'tableId', 'tableToken', 'reason', 'clientRequestId',
  ]);
  validateCallTableCredentials_(payload);
  if (!QR_ORDER_ENUMS.CALL_REASON.includes(String(payload.reason))) {
    throw new ApiError('INVALID_REQUEST', '호출 사유를 확인해 주세요.', false);
  }
  if (!isUuid_(payload.clientRequestId)) {
    throw new ApiError('INVALID_REQUEST', '호출 요청 ID를 확인해 주세요.', false);
  }
}

function validateCancelCallRequest_(payload) {
  assertCallAllowedFields_(payload, [
    'apiVersion', 'tableId', 'tableToken', 'callId',
  ]);
  validateCallTableCredentials_(payload);
  if (!isUuid_(payload.callId)) {
    throw new ApiError('INVALID_REQUEST', '호출 ID를 확인해 주세요.', false);
  }
}

function validateCallTableCredentials_(payload) {
  if (typeof payload.tableId !== 'string' || !/^T\d{2,}$/.test(payload.tableId) ||
      typeof payload.tableToken !== 'string' || !/^[0-9a-f]{64}$/i.test(payload.tableToken)) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
}

function assertCallAllowedFields_(payload, allowedFields) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(payload || {}).filter(field => !allowed.has(field)).sort();
  if (unexpected.length) {
    throw new ApiError('INVALID_REQUEST', '지원하지 않는 호출 정보가 포함되어 있습니다.', false, {
      fields: unexpected,
    });
  }
}

function isUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function callResponse_(call, replay) {
  const createdAt = new Date(call.created_at);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Calls.created_at is invalid.');
  return {
    callId: String(call.call_id),
    tableId: String(call.table_id),
    reason: String(call.reason),
    status: String(call.status),
    createdAt: createdAt.toISOString(),
    idempotentReplay: replay === true,
  };
}

function appendCallAuditSafely_(spreadsheet, action, entityId, requestId, detail) {
  try {
    appendObjectsBySchema_(spreadsheet, 'AuditLogs', [{
      log_id: Utilities.getUuid(),
      occurred_at: new Date(),
      actor_type: 'CLIENT',
      actor_id: '',
      action: action,
      entity_type: action === 'CALL_THROTTLED' ? 'TABLE' : 'CALL',
      entity_id: String(entityId),
      from_value: '',
      to_value: '',
      request_id: String(requestId || ''),
      detail_json: detail ? JSON.stringify(detail) : '',
    }]);
  } catch (error) {
    console.error('Failed to append call audit log: ' + action);
  }
}
