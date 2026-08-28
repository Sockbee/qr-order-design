/** Operational billing, discount, table movement, merge, split, and payment. */

function getStaffTableBill(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken', 'tableId']);
  const tableId = validateStaffTableId_(payload.tableId);
  const spreadsheet = getConfiguredSpreadsheet_();
  assertKnownTable_(spreadsheet, tableId);
  let session;
  try {
    session = getOpenSessionByTable_(spreadsheet, tableId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'SESSION_NOT_FOUND') throw error;
    session = getLatestSessionByTable_(spreadsheet, tableId);
  }
  return staffBillResponse_(spreadsheet, session);
}

function staffBillResponse_(spreadsheet, session) {
  const bill = calculateSessionBill_(spreadsheet, session);
  const merged = bill.members.filter(member => {
    return String(member.session_id) !== String(bill.primary.session_id);
  }).map(member => String(member.table_id));
  return {
    sessionId: String(bill.primary.session_id),
    tableId: String(bill.primary.table_id),
    originTableId: String(bill.primary.origin_table_id),
    mergedTableIds: merged,
    discountRate: bill.discountRate,
    subtotalAmount: bill.subtotalAmount,
    discountAmount: bill.discountAmount,
    finalAmount: bill.finalAmount,
    paymentStatus: String(bill.primary.payment_status),
    orderCount: bill.orders.length,
  };
}

function setStaffTableDiscount(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'tableId', 'discountRate',
  ]);
  const tableId = validateStaffTableId_(payload.tableId);
  if (!Number.isInteger(payload.discountRate)) {
    throw new ApiError('INVALID_DISCOUNT_RATE', '허용되지 않은 할인율입니다.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const session = getOpenOrPaidSession_(spreadsheet, tableId);
    if (!isBlankValue_(session.merged_into_session_id)) {
      throw new ApiError('SESSION_NOT_PRIMARY', '합석된 테이블입니다. 대표 테이블에서 진행해 주세요.', false);
    }
    if (session.payment_status === 'PAID') throw sessionAlreadyPaidError_();
    const settings = settingsMap_(spreadsheet);
    const configuredRate = Number(getRequiredSetting_(settings, 'TABLE_DISCOUNT_RATE'));
    if (!Number.isInteger(configuredRate) || configuredRate < 0 || configuredRate > 100) {
      throw new Error('TABLE_DISCOUNT_RATE must be an integer from 0 to 100.');
    }
    if (![0, configuredRate].includes(payload.discountRate)) {
      throw new ApiError('INVALID_DISCOUNT_RATE', '허용되지 않은 할인율입니다.', false);
    }
    const previous = Number(session.discount_rate);
    const now = new Date();
    updateObjectRowBySchema_(spreadsheet, 'TableSessions', session.__rowNumber, {
      discount_rate: payload.discountRate,
      updated_at: now,
    });
    appendStaffAuditSafely_(spreadsheet, staff,
      payload.discountRate === 0 ? 'DISCOUNT_CLEARED' : 'DISCOUNT_APPLIED',
      'TABLE_SESSION', String(session.session_id), requestId,
      String(previous), String(payload.discountRate), { tableId: tableId });
    return null;
  });
}

function moveStaffTable(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'fromTableId', 'toTableId',
  ]);
  const fromTableId = validateStaffTableId_(payload.fromTableId);
  const toTableId = validateStaffTableId_(payload.toTableId);
  if (fromTableId === toTableId) {
    throw new ApiError('INVALID_REQUEST', '이동할 테이블을 다시 선택해 주세요.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    assertKnownTable_(spreadsheet, fromTableId);
    assertKnownTable_(spreadsheet, toTableId);
    const session = getOpenSessionByTable_(spreadsheet, fromTableId);
    const occupied = readSheetTable_(spreadsheet, 'TableSessions').rows.some(candidate => {
      return candidate.status === 'OPEN' && String(candidate.table_id) === toTableId;
    });
    if (occupied) {
      throw new ApiError('DESTINATION_OCCUPIED', '이동할 테이블이 사용 중입니다.', false);
    }
    updateObjectRowBySchema_(spreadsheet, 'TableSessions', session.__rowNumber, {
      table_id: toTableId,
      updated_at: new Date(),
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'TABLE_MOVED', 'TABLE_SESSION',
      String(session.session_id), requestId, fromTableId, toTableId, null);
    return null;
  });
}

function mergeStaffTables(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'primaryTableId', 'secondaryTableId',
  ]);
  const primaryTableId = validateStaffTableId_(payload.primaryTableId);
  const secondaryTableId = validateStaffTableId_(payload.secondaryTableId);
  if (primaryTableId === secondaryTableId) {
    throw new ApiError('INVALID_REQUEST', '합석할 테이블을 다시 선택해 주세요.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const primary = getOpenOrPaidSession_(spreadsheet, primaryTableId);
    const secondary = getOpenOrPaidSession_(spreadsheet, secondaryTableId);
    const sessions = readSheetTable_(spreadsheet, 'TableSessions').rows;
    const primaryHasParent = !isBlankValue_(primary.merged_into_session_id);
    const secondaryHasParent = !isBlankValue_(secondary.merged_into_session_id);
    const secondaryHasChildren = sessions.some(session => {
      return String(session.merged_into_session_id) === String(secondary.session_id);
    });
    if (primaryHasParent || secondaryHasParent || secondaryHasChildren) {
      throw new ApiError('MERGE_CHAIN_NOT_ALLOWED', '이미 합석된 테이블은 다시 합칠 수 없습니다.', false);
    }
    const primaryGroup = billingGroup_(spreadsheet, primary);
    const secondaryGroup = billingGroup_(spreadsheet, secondary);
    if (primaryGroup.members.concat(secondaryGroup.members)
      .some(session => session.payment_status === 'PAID')) {
      throw sessionAlreadyPaidError_();
    }
    updateObjectRowBySchema_(spreadsheet, 'TableSessions', secondary.__rowNumber, {
      merged_into_session_id: String(primary.session_id),
      updated_at: new Date(),
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'TABLES_MERGED', 'TABLE_SESSION',
      String(primary.session_id), requestId, '', String(secondary.session_id), {
        primaryTableId: primaryTableId,
        secondaryTableId: secondaryTableId,
      });
    return null;
  });
}

function splitStaffTable(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken', 'tableId']);
  const tableId = validateStaffTableId_(payload.tableId);
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const session = getOpenOrPaidSession_(spreadsheet, tableId);
    if (session.payment_status === 'PAID') throw sessionAlreadyPaidError_();
    if (isBlankValue_(session.merged_into_session_id)) return null;
    const group = billingGroup_(spreadsheet, session);
    if (group.members.some(member => member.payment_status === 'PAID')) {
      throw sessionAlreadyPaidError_();
    }
    const previous = String(session.merged_into_session_id);
    updateObjectRowBySchema_(spreadsheet, 'TableSessions', session.__rowNumber, {
      merged_into_session_id: '',
      updated_at: new Date(),
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'TABLES_SPLIT', 'TABLE_SESSION',
      String(session.session_id), requestId, previous, '', { tableId: tableId });
    return null;
  });
}

function confirmStaffTablePayment(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'tableId', 'expectedFinalAmount',
  ]);
  const tableId = validateStaffTableId_(payload.tableId);
  if (!Number.isSafeInteger(payload.expectedFinalAmount) || payload.expectedFinalAmount < 0) {
    throw new ApiError('INVALID_REQUEST', '확인한 결제 금액을 입력해 주세요.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const session = getOpenOrPaidSession_(spreadsheet, tableId);
    if (session.payment_status === 'PAID') throw sessionAlreadyPaidError_();
    const bill = calculateSessionBill_(spreadsheet, session);
    if (bill.members.some(member => member.payment_status === 'PAID')) {
      throw sessionAlreadyPaidError_();
    }
    if (bill.finalAmount !== payload.expectedFinalAmount) {
      throw new ApiError('BILL_AMOUNT_CHANGED', '금액이 변경되었습니다. 다시 확인해 주세요.', true, {
        finalAmount: bill.finalAmount,
      });
    }
    const now = new Date();
    bill.members.forEach(member => {
      const primary = String(member.session_id) === String(bill.primary.session_id);
      updateObjectRowBySchema_(spreadsheet, 'TableSessions', member.__rowNumber, {
        status: 'CLOSED',
        payment_status: 'PAID',
        subtotal_amount: primary ? bill.subtotalAmount : '',
        discount_amount: primary ? bill.discountAmount : '',
        final_amount: primary ? bill.finalAmount : '',
        closed_at: now,
        paid_at: now,
        updated_at: now,
      });
    });
    bill.allOrders.forEach(order => {
      updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
        payment_status: 'PAID',
        paid_at: now,
        updated_at: now,
      });
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'SESSION_PAYMENT_CONFIRMED',
      'TABLE_SESSION', String(bill.primary.session_id), requestId, 'UNPAID', 'PAID', {
        tableId: String(bill.primary.table_id),
        finalAmount: bill.finalAmount,
        orderCount: bill.orders.length,
      });
    return null;
  });
}

function withStaffLock_(handler) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }
  try {
    return handler();
  } finally {
    lock.releaseLock();
  }
}

function validateStaffTableId_(value) {
  if (typeof value !== 'string' || !/^T\d{2,}$/.test(value)) {
    throw new ApiError('INVALID_REQUEST', '테이블 정보를 확인해 주세요.', false);
  }
  return value;
}

function assertKnownTable_(spreadsheet, tableId) {
  const table = readSheetTable_(spreadsheet, 'Tables').rows.find(candidate => {
    return String(candidate.table_id) === String(tableId);
  });
  if (!table) throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  return table;
}

function getOpenOrPaidSession_(spreadsheet, tableId) {
  try {
    return getOpenSessionByTable_(spreadsheet, tableId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'SESSION_NOT_FOUND') throw error;
    const latest = getLatestSessionByTable_(spreadsheet, tableId);
    if (latest.payment_status === 'PAID') return latest;
    throw error;
  }
}

function sessionAlreadyPaidError_() {
  return new ApiError('SESSION_ALREADY_PAID', '이미 결제 완료된 테이블입니다.', false);
}

function appendStaffAuditSafely_(spreadsheet, staff, action, entityType, entityId,
  requestId, fromValue, toValue, detail) {
  try {
    appendObjectsBySchema_(spreadsheet, 'AuditLogs', [{
      log_id: Utilities.getUuid(),
      occurred_at: new Date(),
      actor_type: 'STAFF',
      actor_id: String(staff.deviceLabel),
      action: action,
      entity_type: entityType,
      entity_id: String(entityId),
      from_value: isBlankValue_(fromValue) ? '' : String(fromValue),
      to_value: isBlankValue_(toValue) ? '' : String(toValue),
      request_id: String(requestId || ''),
      detail_json: detail ? JSON.stringify(detail) : '',
    }]);
  } catch (error) {
    console.error('Failed to append staff audit log: ' + action);
  }
}
