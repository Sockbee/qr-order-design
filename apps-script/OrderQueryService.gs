/** Authenticated order lookup APIs backed only by committed order snapshots. */

function getOrder(payload) {
  validateOrderLookupRequest_(payload);
  const spreadsheet = getConfiguredSpreadsheet_();
  const table = validateTable_(payload.tableId, payload.tableToken, false, spreadsheet);
  const snapshot = readOrderSnapshotTables_(spreadsheet);
  const order = snapshot.orders.find(row => {
    if (row.write_state !== 'COMMITTED' || String(row.table_id) !== String(table.table_id)) {
      return false;
    }
    return payload.orderId
      ? String(row.order_id) === String(payload.orderId).toLowerCase()
      : String(row.display_code) === String(payload.displayCode);
  });
  if (!order) {
    throw new ApiError('ORDER_NOT_FOUND', '주문 정보를 찾을 수 없습니다.', false);
  }
  return buildOrderResponseFromSnapshot_(order, table, snapshot.items, snapshot.options);
}

function listOrders(payload) {
  validateOrderListRequest_(payload);
  const spreadsheet = getConfiguredSpreadsheet_();
  const table = validateTable_(payload.tableId, payload.tableToken, false, spreadsheet);
  const snapshot = readOrderSnapshotTables_(spreadsheet);
  const rows = snapshot.orders
    .filter(row => row.write_state === 'COMMITTED' &&
      String(row.table_id) === String(table.table_id))
    .slice()
    .sort(compareOrdersNewestFirst_);
  const fullOrders = rows.map(order => {
    return buildOrderResponseFromSnapshot_(order, table, snapshot.items, snapshot.options);
  });
  const active = fullOrders.filter(order => order.status !== 'CANCELLED');

  return {
    table: {
      tableId: String(table.table_id),
      displayName: String(table.display_name),
    },
    orders: fullOrders.map(orderListItemResponse_),
    latestPublicStatus: active.length ? active[0].publicStatus : null,
    sessionTotalAmount: calculateSessionTotal_(active),
  };
}

function validateOrderLookupRequest_(payload) {
  assertAllowedFields_(payload, [
    'apiVersion', 'tableId', 'tableToken', 'orderId', 'displayCode',
  ], 'request');
  validateOrderQueryCredentials_(payload);
  const hasOrderId = typeof payload.orderId === 'string' && payload.orderId.length > 0;
  const hasDisplayCode = typeof payload.displayCode === 'string' && payload.displayCode.length > 0;
  if (hasOrderId === hasDisplayCode) {
    throw new ApiError(
      'INVALID_REQUEST',
      'orderId 또는 displayCode 중 하나가 필요합니다.',
      false
    );
  }
  if (hasOrderId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(payload.orderId)) {
    throw new ApiError('INVALID_REQUEST', '주문 ID를 확인해 주세요.', false);
  }
  if (hasDisplayCode && (payload.displayCode.length > 100 || /[\u0000-\u001f]/.test(payload.displayCode))) {
    throw new ApiError('INVALID_REQUEST', '주문번호를 확인해 주세요.', false);
  }
}

function validateOrderListRequest_(payload) {
  assertAllowedFields_(payload, ['apiVersion', 'tableId', 'tableToken'], 'request');
  validateOrderQueryCredentials_(payload);
}

function validateOrderQueryCredentials_(payload) {
  if (typeof payload.tableId !== 'string' || !/^T\d{2,}$/.test(payload.tableId) ||
      typeof payload.tableToken !== 'string' || !/^[0-9a-f]{64}$/i.test(payload.tableToken)) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
}

function compareOrdersNewestFirst_(left, right) {
  const leftTime = new Date(left.created_at).getTime();
  const rightTime = new Date(right.created_at).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    throw new Error('Order created_at is invalid.');
  }
  return rightTime - leftTime || Number(right.display_number) - Number(left.display_number);
}

function orderListItemResponse_(order) {
  return {
    orderId: order.orderId,
    displayCode: order.displayCode,
    status: order.status,
    publicStatus: order.publicStatus,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      selectedOptions: item.selectedOptions.map(option => option.name),
    })),
  };
}

function calculateSessionTotal_(orders) {
  const total = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid session total.');
  return total;
}
