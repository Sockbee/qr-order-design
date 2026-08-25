/** Order creation, idempotency, snapshot writes, and interrupted-write recovery. */

function createOrder(payload, requestId) {
  validateClientOrderRequest_(payload);
  const clientRequestId = String(payload.clientRequestId).toLowerCase();
  const idempotencyKey = String(payload.tableId) + ':' + clientRequestId;
  const fingerprint = requestFingerprint_(payload);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '주문이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }

  let spreadsheet;
  let table;
  let orderId;
  let replay = false;
  let createdRowNumber = null;
  let repairRowNumber = null;
  let failureFromState = 'WRITING';
  try {
    spreadsheet = getConfiguredSpreadsheet_();
    table = validateTable_(payload.tableId, payload.tableToken, false, spreadsheet);
    const existing = readSheetTable_(spreadsheet, 'Orders').rows.find(order => {
      return String(order.idempotency_key) === idempotencyKey;
    });

    if (existing) {
      if (String(existing.request_fingerprint) !== fingerprint) {
        throw new ApiError(
          'DUPLICATE_REQUEST',
          '이전 주문 요청과 정보가 달라 처리할 수 없습니다.',
          false
        );
      }
      orderId = String(existing.order_id);
      if (existing.write_state === 'COMMITTED') {
        replay = true;
      } else if (existing.write_state === 'WRITING' && isRecentOrderWrite_(existing.updated_at)) {
        throw new ApiError(
          'ORDER_WRITE_IN_PROGRESS',
          '주문 처리 결과를 확인하고 있습니다.',
          true
        );
      } else if (existing.write_state === 'WRITING' || existing.write_state === 'FAILED') {
        repairRowNumber = existing.__rowNumber;
        failureFromState = String(existing.write_state);
        repairOrderWrite_(spreadsheet, existing, requestId);
        repairRowNumber = null;
        replay = true;
      } else {
        throw new Error('Unknown order write_state.');
      }
    } else {
      if (table.active !== true) {
        throw new ApiError('INACTIVE_TABLE', '현재 이 테이블에서는 주문할 수 없습니다.', false);
      }
      const settings = settingsMap_(spreadsheet);
      assertEventOpen_(settings);
      const maxOrderLines = Number(getRequiredSetting_(settings, 'MAX_ORDER_LINES'));
      if (!Number.isInteger(maxOrderLines) || maxOrderLines < 1 ||
          maxOrderLines > QR_ORDER_LIMITS.HARD_MAX_ORDER_LINES) {
        throw new Error('MAX_ORDER_LINES is outside the supported range.');
      }
      const catalog = getCatalogForOrder_(spreadsheet);
      const lines = validateOrderItems_(payload.items, catalog, maxOrderLines);
      const totalAmount = calculateOrderTotal_(lines);
      const display = allocateDisplayNumber_(spreadsheet);
      const now = new Date();
      orderId = Utilities.getUuid();
      const appendResult = appendObjectsBySchema_(spreadsheet, 'Orders', [{
        order_id: orderId,
        display_number: display.value,
        display_code: display.prefix + display.value,
        client_request_id: clientRequestId,
        idempotency_key: idempotencyKey,
        request_fingerprint: fingerprint,
        table_id: String(table.table_id),
        status: 'RECEIVED',
        public_status: QR_ORDER_STATUS_TO_PUBLIC.RECEIVED,
        payment_status: 'UNPAID',
        total_amount: totalAmount,
        note: String(payload.note || ''),
        write_payload_json: JSON.stringify(lines),
        write_state: 'WRITING',
        status_updated_at: now,
        created_at: now,
        updated_at: now,
        paid_at: '',
        cancelled_at: '',
        cancel_reason: '',
      }]);
      createdRowNumber = appendResult.startRow;

      writeOrderChildren_(spreadsheet, orderId, lines, now, false);
      updateObjectRowBySchema_(spreadsheet, 'Orders', createdRowNumber, {
        write_state: 'COMMITTED',
        updated_at: new Date(),
      });
      appendOrderAuditSafely_(spreadsheet, 'ORDER_CREATED', orderId, requestId,
        'WRITING', 'COMMITTED', null);
      createdRowNumber = null;
    }
  } catch (error) {
    const failedRowNumber = createdRowNumber || repairRowNumber;
    if (spreadsheet && failedRowNumber) {
      try {
        updateObjectRowBySchema_(spreadsheet, 'Orders', failedRowNumber, {
          write_state: 'FAILED',
          updated_at: new Date(),
        });
        appendOrderAuditSafely_(spreadsheet, 'ORDER_WRITE_FAILED', orderId || '', requestId,
          failureFromState, 'FAILED', {
            errorCode: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
          });
      } catch (markError) {
        console.error('Failed to mark order write failure.');
      }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }

  const response = buildOrderResponseById_(spreadsheet, orderId, table);
  response.idempotentReplay = replay;
  return response;
}

function isRecentOrderWrite_(updatedAt) {
  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < QR_ORDER_LIMITS.WRITING_STALE_MS;
}

function allocateDisplayNumber_(spreadsheet) {
  const settings = readSheetTable_(spreadsheet, 'Settings');
  const next = settings.rows.find(row => String(row.key) === 'NEXT_DISPLAY_NUMBER');
  const prefix = settings.rows.find(row => String(row.key) === 'ORDER_PREFIX');
  const value = next ? Number(next.value) : NaN;
  if (!next || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('NEXT_DISPLAY_NUMBER must be a positive integer.');
  }
  if (!prefix || !String(prefix.value)) throw new Error('ORDER_PREFIX is missing.');

  updateObjectRowBySchema_(spreadsheet, 'Settings', next.__rowNumber, {
    value: String(value + 1),
    updated_at: new Date(),
  });
  return { value: value, prefix: String(prefix.value) };
}

function writeOrderChildren_(spreadsheet, orderId, lines, createdAt, onlyMissing) {
  const desired = buildOrderChildRows_(orderId, lines, createdAt);
  let itemRows = desired.items;
  let optionRows = desired.options;

  if (onlyMissing) {
    const currentItems = readSheetTable_(spreadsheet, 'OrderItems').rows.filter(row => {
      return String(row.order_id) === String(orderId);
    });
    const currentOptions = readSheetTable_(spreadsheet, 'OrderItemOptions').rows.filter(row => {
      return String(row.order_id) === String(orderId);
    });
    assertStoredChildrenMatch_(currentItems, desired.items, 'order_item_id', [
      'order_id', 'line_no', 'menu_id', 'menu_name_snapshot', 'base_price_snapshot',
      'unit_price_snapshot', 'quantity', 'line_total',
    ]);
    assertStoredChildrenMatch_(currentOptions, desired.options, 'order_item_option_id', [
      'order_item_id', 'order_id', 'option_id', 'option_group_name_snapshot',
      'option_name_snapshot', 'price_delta_snapshot', 'sort_order',
    ]);
    const itemIds = new Set(currentItems.map(row => String(row.order_item_id)));
    const optionIds = new Set(currentOptions.map(row => String(row.order_item_option_id)));
    itemRows = desired.items.filter(row => !itemIds.has(row.order_item_id));
    optionRows = desired.options.filter(row => !optionIds.has(row.order_item_option_id));
  }

  appendObjectsBySchema_(spreadsheet, 'OrderItems', itemRows);
  appendObjectsBySchema_(spreadsheet, 'OrderItemOptions', optionRows);
}

function buildOrderChildRows_(orderId, lines, createdAt) {
  const items = [];
  const options = [];
  lines.forEach(line => {
    const itemId = String(orderId) + '-' + String(line.lineNo).padStart(2, '0');
    items.push({
      order_item_id: itemId,
      order_id: String(orderId),
      line_no: line.lineNo,
      menu_id: line.menuId,
      menu_name_snapshot: line.menuName,
      base_price_snapshot: line.basePrice,
      unit_price_snapshot: line.unitPrice,
      quantity: line.quantity,
      line_total: line.lineTotal,
      created_at: createdAt,
    });
    line.selectedOptions.forEach((option, optionIndex) => {
      const sortOrder = optionIndex + 1;
      options.push({
        order_item_option_id: itemId + '-' + String(sortOrder).padStart(2, '0'),
        order_item_id: itemId,
        order_id: String(orderId),
        option_id: option.optionId,
        option_group_name_snapshot: option.groupName,
        option_name_snapshot: option.name,
        price_delta_snapshot: option.priceDelta,
        sort_order: sortOrder,
        created_at: createdAt,
      });
    });
  });
  return { items: items, options: options };
}

function repairOrderWrite_(spreadsheet, order, requestId) {
  const lines = parseStoredOrderLines_(order.write_payload_json);
  const total = calculateOrderTotal_(lines);
  if (total !== Number(order.total_amount)) throw new Error('Stored order total is inconsistent.');
  const createdAt = new Date(order.created_at);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Stored order created_at is invalid.');

  writeOrderChildren_(spreadsheet, String(order.order_id), lines, createdAt, true);
  updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
    write_state: 'COMMITTED',
    updated_at: new Date(),
  });
  appendOrderAuditSafely_(spreadsheet, 'ORDER_WRITE_REPAIRED', String(order.order_id), requestId,
    String(order.write_state), 'COMMITTED', null);
}

function parseStoredOrderLines_(value) {
  let lines;
  try {
    lines = JSON.parse(String(value));
  } catch (error) {
    throw new Error('Stored order payload is invalid JSON.');
  }
  if (!Array.isArray(lines) || !lines.length) throw new Error('Stored order payload is invalid.');
  lines.forEach((line, index) => {
    if (!line || line.lineNo !== index + 1 || !String(line.menuId || '') ||
        !String(line.menuName || '') || !Number.isSafeInteger(line.basePrice) ||
        !Number.isSafeInteger(line.unitPrice) || !Number.isSafeInteger(line.quantity) ||
        !Number.isSafeInteger(line.lineTotal) || !Array.isArray(line.selectedOptions) ||
        line.basePrice < 0 || line.unitPrice < 0 || line.quantity < 1 || line.lineTotal < 0 ||
        line.lineTotal !== line.unitPrice * line.quantity) {
      throw new Error('Stored order line snapshot is invalid.');
    }
    let optionDelta = 0;
    line.selectedOptions.forEach((option, optionIndex) => {
      if (!option || !String(option.optionId || '') || !String(option.groupName || '') ||
          !String(option.name || '') || !Number.isSafeInteger(option.priceDelta) ||
          option.sortOrder !== optionIndex + 1) {
        throw new Error('Stored order option snapshot is invalid.');
      }
      optionDelta += option.priceDelta;
    });
    if (!Number.isSafeInteger(optionDelta) || line.basePrice + optionDelta !== line.unitPrice) {
      throw new Error('Stored order price snapshot is inconsistent.');
    }
  });
  return lines;
}

function assertStoredChildrenMatch_(currentRows, desiredRows, idField, fields) {
  const desiredById = new Map(desiredRows.map(row => [String(row[idField]), row]));
  const seen = new Set();
  currentRows.forEach(current => {
    const id = String(current[idField]);
    if (seen.has(id)) throw new Error('Duplicate stored child ID.');
    seen.add(id);
    const desired = desiredById.get(id);
    if (!desired) throw new Error('Unexpected stored child row.');
    fields.forEach(field => {
      if (String(current[field]) !== String(desired[field])) {
        throw new Error('Stored child snapshot mismatch.');
      }
    });
  });
}

function buildOrderResponseById_(spreadsheet, orderId, table) {
  const order = readSheetTable_(spreadsheet, 'Orders').rows.find(row => {
    return String(row.order_id) === String(orderId) && row.write_state === 'COMMITTED';
  });
  if (!order) throw new Error('Committed order was not found after write.');
  const items = readSheetTable_(spreadsheet, 'OrderItems').rows
    .filter(row => String(row.order_id) === String(orderId))
    .sort((left, right) => Number(left.line_no) - Number(right.line_no));
  const options = readSheetTable_(spreadsheet, 'OrderItemOptions').rows
    .filter(row => String(row.order_id) === String(orderId));
  const createdAt = new Date(order.created_at);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Order created_at is invalid.');
  if (!items.length) throw new Error('Committed order has no item snapshots.');

  return {
    orderId: String(order.order_id),
    displayNumber: orderResponseInteger_(order.display_number, 'display_number'),
    displayCode: String(order.display_code),
    table: {
      tableId: String(table.table_id),
      displayName: String(table.display_name),
    },
    status: String(order.status),
    publicStatus: String(order.public_status),
    paymentStatus: String(order.payment_status),
    totalAmount: orderResponseInteger_(order.total_amount, 'total_amount'),
    createdAt: createdAt.toISOString(),
    items: items.map(item => ({
      lineNo: orderResponseInteger_(item.line_no, 'line_no'),
      menuId: String(item.menu_id),
      name: String(item.menu_name_snapshot),
      basePrice: orderResponseInteger_(item.base_price_snapshot, 'base_price_snapshot'),
      unitPrice: orderResponseInteger_(item.unit_price_snapshot, 'unit_price_snapshot'),
      quantity: orderResponseInteger_(item.quantity, 'quantity'),
      lineTotal: orderResponseInteger_(item.line_total, 'line_total'),
      selectedOptions: options
        .filter(option => String(option.order_item_id) === String(item.order_item_id))
        .sort((left, right) => Number(left.sort_order) - Number(right.sort_order))
        .map(option => ({
          optionId: String(option.option_id),
          groupName: String(option.option_group_name_snapshot),
          name: String(option.option_name_snapshot),
          priceDelta: orderResponseInteger_(option.price_delta_snapshot, 'price_delta_snapshot'),
        })),
    })),
  };
}

function orderResponseInteger_(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Invalid order response field: ' + fieldName);
  return number;
}

function appendOrderAuditSafely_(spreadsheet, action, orderId, requestId,
  fromValue, toValue, detail) {
  try {
    appendObjectsBySchema_(spreadsheet, 'AuditLogs', [{
      log_id: Utilities.getUuid(),
      occurred_at: new Date(),
      actor_type: 'SYSTEM',
      actor_id: '',
      action: action,
      entity_type: 'ORDER',
      entity_id: String(orderId),
      from_value: fromValue || '',
      to_value: toValue || '',
      request_id: String(requestId || ''),
      detail_json: detail ? JSON.stringify(detail) : '',
    }]);
  } catch (error) {
    console.warn('Order audit log append failed: ' + action + ' ' + String(orderId));
  }
}
