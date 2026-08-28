/** Staff item quantity, item cancellation, memo, and whole-order cancellation. */

const QR_ORDER_STAFF_NOTE_AUDIENCE = Object.freeze({
  general: 'GENERAL',
  kitchen: 'KITCHEN',
  serving: 'SERVING',
});

function updateStaffOrder(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'operation', 'itemId', 'quantity',
    'tableId', 'note', 'audience',
  ]);
  const operation = String(payload.operation || '');
  if (!['quantity', 'cancel-item', 'note'].includes(operation)) {
    throw new ApiError('INVALID_REQUEST', '주문 수정 작업을 확인해 주세요.', false);
  }
  const operationFields = operation === 'quantity'
    ? ['apiVersion', 'staffToken', 'operation', 'itemId', 'quantity']
    : (operation === 'cancel-item'
      ? ['apiVersion', 'staffToken', 'operation', 'itemId']
      : ['apiVersion', 'staffToken', 'operation', 'tableId', 'note', 'audience']);
  assertStaffAllowedFields_(payload, operationFields);
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    if (operation === 'note') {
      return updateStaffOrderNote_(spreadsheet, payload, requestId, staff);
    }
    return updateStaffOrderItem_(spreadsheet, payload, operation, requestId, staff);
  });
}

function cancelStaffTableOrders(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken', 'tableId']);
  const tableId = validateStaffTableId_(payload.tableId);
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    assertKnownTable_(spreadsheet, tableId);
    const session = getOpenOrPaidSession_(spreadsheet, tableId);
    const bill = calculateSessionBill_(spreadsheet, session);
    if (bill.primary.payment_status === 'PAID' ||
        bill.members.some(member => member.payment_status === 'PAID')) {
      throw sessionAlreadyPaidError_();
    }
    const orders = bill.orders.filter(order => order.write_state === 'COMMITTED');
    if (!orders.length) {
      throw new ApiError('ORDER_NOT_FOUND', '취소할 주문이 없습니다.', false);
    }
    const orderIds = new Set(orders.map(order => String(order.order_id)));
    const items = readSheetTable_(spreadsheet, 'OrderItems').rows.filter(item => {
      return orderIds.has(String(item.order_id));
    });
    const now = new Date();
    items.forEach(item => {
      updateObjectRowBySchema_(spreadsheet, 'OrderItems', item.__rowNumber, {
        status: 'CANCELLED',
        updated_at: now,
      });
    });
    const cancelledAmount = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    orders.forEach(order => {
      const payloadLines = buildStoredOrderLinesFromRows_(spreadsheet, order);
      updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
        status: 'CANCELLED',
        public_status: QR_ORDER_STATUS_TO_PUBLIC.CANCELLED,
        total_amount: 0,
        write_payload_json: JSON.stringify(payloadLines.map(line => {
          return Object.assign({}, line, { cancelled: true });
        })),
        status_updated_at: now,
        updated_at: now,
        cancelled_at: now,
        cancel_reason: '운영진 전체 취소',
      });
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'TABLE_ORDERS_CANCELLED',
      'TABLE_SESSION', String(bill.primary.session_id), requestId, 'ACTIVE', 'CANCELLED', {
        tableId: tableId,
        orderCount: orders.length,
        itemCount: items.length,
        cancelledAmount: cancelledAmount,
      });
    return null;
  });
}

function updateStaffOrderItem_(spreadsheet, payload, operation, requestId, staff) {
  if (typeof payload.itemId !== 'string' || !payload.itemId || payload.itemId.length > 140 ||
      /[\u0000-\u001f]/.test(payload.itemId)) {
    throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false);
  }
  if (operation === 'quantity' &&
      (!Number.isSafeInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 99)) {
    throw new ApiError('INVALID_REQUEST', '수량은 1~99 사이여야 합니다.', false);
  }
  const item = readSheetTable_(spreadsheet, 'OrderItems').rows.find(candidate => {
    return String(candidate.order_item_id) === String(payload.itemId);
  });
  if (!item || !orderItemIsActive_(item)) {
    throw new ApiError('ORDER_NOT_FOUND', '주문 항목을 찾을 수 없습니다.', false);
  }
  const order = readSheetTable_(spreadsheet, 'Orders').rows.find(candidate => {
    return String(candidate.order_id) === String(item.order_id) &&
      candidate.write_state === 'COMMITTED' && candidate.status !== 'CANCELLED';
  });
  if (!order) throw new ApiError('ORDER_NOT_FOUND', '주문 정보를 찾을 수 없습니다.', false);
  assertStaffOrderUnpaid_(spreadsheet, order);

  const now = new Date();
  const before = operation === 'quantity' ? String(item.quantity) : 'ACTIVE';
  const itemPatch = operation === 'quantity'
    ? {
      quantity: payload.quantity,
      line_total: Number(item.unit_price_snapshot) * payload.quantity,
      status: 'ACTIVE',
      updated_at: now,
    }
    : { status: 'CANCELLED', updated_at: now };
  if (operation === 'quantity' && !Number.isSafeInteger(itemPatch.line_total)) {
    throw new ApiError('INVALID_REQUEST', '주문 금액을 계산할 수 없습니다.', false);
  }
  updateObjectRowBySchema_(spreadsheet, 'OrderItems', item.__rowNumber, itemPatch);
  const lines = buildStoredOrderLinesFromRows_(spreadsheet, order);
  const totalAmount = calculateOrderTotal_(lines);
  const allCancelled = lines.every(line => line.cancelled === true);
  const orderPatch = {
    total_amount: totalAmount,
    write_payload_json: JSON.stringify(lines),
    updated_at: now,
  };
  if (allCancelled) {
    orderPatch.status = 'CANCELLED';
    orderPatch.public_status = QR_ORDER_STATUS_TO_PUBLIC.CANCELLED;
    orderPatch.status_updated_at = now;
    orderPatch.cancelled_at = now;
    orderPatch.cancel_reason = '운영진 항목 전체 취소';
  }
  updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, orderPatch);
  appendStaffAuditSafely_(spreadsheet, staff,
    operation === 'quantity' ? 'ORDER_ITEM_QUANTITY_CHANGED' : 'ORDER_ITEM_CANCELLED',
    'ORDER_ITEM', String(item.order_item_id), requestId, before,
    operation === 'quantity' ? String(payload.quantity) : 'CANCELLED', {
      orderId: String(order.order_id),
      totalAmount: totalAmount,
      orderCancelled: allCancelled,
    });
  return null;
}

function updateStaffOrderNote_(spreadsheet, payload, requestId, staff) {
  const tableId = validateStaffTableId_(payload.tableId);
  const note = typeof payload.note === 'string' ? payload.note : null;
  const audience = QR_ORDER_STAFF_NOTE_AUDIENCE[String(payload.audience || '')];
  if (note === null || note.length > QR_ORDER_LIMITS.MAX_NOTE_LENGTH || !audience) {
    throw new ApiError('INVALID_REQUEST', '주문 메모를 확인해 주세요.', false);
  }
  assertKnownTable_(spreadsheet, tableId);
  const session = getOpenOrPaidSession_(spreadsheet, tableId);
  const bill = calculateSessionBill_(spreadsheet, session);
  if (bill.primary.payment_status === 'PAID' ||
      bill.members.some(member => member.payment_status === 'PAID')) {
    throw sessionAlreadyPaidError_();
  }
  const order = bill.orders.filter(candidate => candidate.write_state === 'COMMITTED')
    .sort((left, right) => {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })[0];
  if (!order) throw new ApiError('ORDER_NOT_FOUND', '메모를 저장할 주문이 없습니다.', false);
  updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
    note: note,
    note_audience: audience,
    updated_at: new Date(),
  });
  appendStaffAuditSafely_(spreadsheet, staff, 'ORDER_NOTE_CHANGED', 'ORDER',
    String(order.order_id), requestId, String(order.note || '').length,
    note.length, { audience: audience, tableId: tableId });
  return null;
}

function assertStaffOrderUnpaid_(spreadsheet, order) {
  if (order.payment_status === 'PAID') throw sessionAlreadyPaidError_();
  const session = readSheetTable_(spreadsheet, 'TableSessions').rows.find(candidate => {
    return String(candidate.session_id) === String(order.session_id);
  });
  if (!session) throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  const bill = calculateSessionBill_(spreadsheet, session);
  if (bill.primary.payment_status === 'PAID' ||
      bill.members.some(member => member.payment_status === 'PAID')) {
    throw sessionAlreadyPaidError_();
  }
}

function buildStoredOrderLinesFromRows_(spreadsheet, order) {
  const orderId = String(order.order_id);
  const items = readSheetTable_(spreadsheet, 'OrderItems').rows.filter(item => {
    return String(item.order_id) === orderId;
  }).sort((left, right) => Number(left.line_no) - Number(right.line_no));
  const optionsByItem = groupRows_(readSheetTable_(spreadsheet, 'OrderItemOptions').rows.filter(
    option => String(option.order_id) === orderId
  ), 'order_item_id');
  if (!items.length) throw new Error('Committed order has no item snapshots.');
  return items.map(item => ({
    lineNo: Number(item.line_no),
    menuId: String(item.menu_id),
    menuName: String(item.menu_name_snapshot),
    basePrice: Number(item.base_price_snapshot),
    unitPrice: Number(item.unit_price_snapshot),
    quantity: Number(item.quantity),
    lineTotal: Number(item.line_total),
    cancelled: !orderItemIsActive_(item),
    selectedOptions: (optionsByItem.get(String(item.order_item_id)) || [])
      .slice().sort((left, right) => Number(left.sort_order) - Number(right.sort_order))
      .map((option, index) => ({
        sortOrder: index + 1,
        optionId: String(option.option_id),
        groupName: String(option.option_group_name_snapshot),
        name: String(option.option_name_snapshot),
        priceDelta: Number(option.price_delta_snapshot),
      })),
  }));
}
