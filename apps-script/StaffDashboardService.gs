/** Staff table snapshots, station queues, menu operations, and order status. */

const QR_ORDER_STAFF_REMOTE_TO_ORDER_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  COOKING: 'PREPARING',
  READY: 'SERVING',
  SERVED: 'COMPLETED',
});

const QR_ORDER_STAFF_ORDER_STATUS_TO_REMOTE = Object.freeze({
  RECEIVED: 'RECEIVED',
  CONFIRMED: 'RECEIVED',
  PREPARING: 'COOKING',
  SERVING: 'READY',
  COMPLETED: 'SERVED',
});

function listStaffTables(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken']);
  const spreadsheet = getConfiguredSpreadsheet_();
  const snapshot = readStaffDashboardSnapshot_(spreadsheet);
  const now = new Date();
  const tables = snapshot.tables.slice().sort((left, right) => {
    return Number(left.sort_order) - Number(right.sort_order) ||
      String(left.table_id).localeCompare(String(right.table_id));
  }).map(table => staffTableListItem_(snapshot, table));
  return {
    tables: tables,
    stationCounts: staffStationCounts_(snapshot, now),
    serverTime: now.toISOString(),
  };
}

function getStaffTableDetail(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken', 'tableId']);
  const tableId = validateStaffTableId_(payload.tableId);
  const spreadsheet = getConfiguredSpreadsheet_();
  const snapshot = readStaffDashboardSnapshot_(spreadsheet);
  const table = snapshot.tables.find(candidate => String(candidate.table_id) === tableId);
  if (!table) throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  const session = staffCurrentOrLatestSession_(snapshot.sessions, tableId);
  if (!session) throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  const bill = staffBillFromSnapshot_(snapshot, session);
  const detailOrders = bill.allOrders.filter(order => order.write_state === 'COMMITTED');
  const orderIds = new Set(detailOrders.map(order => String(order.order_id)));
  const orderById = new Map(detailOrders.map(order => [String(order.order_id), order]));
  const optionsByItem = groupRows_(snapshot.itemOptions.filter(option => {
    return orderIds.has(String(option.order_id));
  }), 'order_item_id');
  const items = snapshot.items.filter(item => orderIds.has(String(item.order_id)))
    .sort((left, right) => {
      const leftOrder = orderById.get(String(left.order_id));
      const rightOrder = orderById.get(String(right.order_id));
      return new Date(leftOrder.created_at).getTime() - new Date(rightOrder.created_at).getTime() ||
        Number(left.line_no) - Number(right.line_no);
    })
    .map(item => {
      const order = orderById.get(String(item.order_id));
      const selected = (optionsByItem.get(String(item.order_item_id)) || [])
        .slice().sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
      return {
        itemId: String(item.order_item_id),
        name: String(item.menu_name_snapshot),
        selectedOptions: selected.map(option => String(option.option_name_snapshot)),
        quantity: staffSafeInteger_(item.quantity, 'OrderItems.quantity'),
        lineTotal: staffSafeInteger_(item.line_total, 'OrderItems.line_total'),
        status: orderItemIsActive_(item) ? 'ACTIVE' : 'CANCELLED',
        note: Number(item.line_no) === 1 && !isBlankValue_(order.note)
          ? String(order.note)
          : null,
      };
    });
  const pendingCalls = snapshot.calls.filter(call => {
    return call.status === 'PENDING' && String(call.table_id) === tableId;
  }).sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
  const reasons = [];
  pendingCalls.forEach(call => {
    const reason = String(call.reason);
    if (!reasons.includes(reason)) reasons.push(reason);
  });
  const notes = detailOrders.filter(order => !isBlankValue_(order.note))
    .sort((left, right) => {
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }).map(order => ({
      noteId: String(order.order_id) + '-note',
      audience: staffRemoteNoteAudience_(order.note_audience),
      text: String(order.note),
    }));
  return {
    tableId: tableId,
    displayName: String(table.display_name),
    orderStatus: staffAggregateRemoteStatus_(bill.orders),
    openedAt: staffIsoDate_(bill.primary.opened_at, 'TableSessions.opened_at'),
    mergedTableIds: bill.members.filter(member => {
      return String(member.session_id) !== String(bill.primary.session_id);
    }).map(member => String(member.table_id)),
    originTableId: String(bill.primary.origin_table_id),
    subtotalAmount: bill.subtotalAmount,
    discountRate: bill.discountRate,
    discountAmount: bill.discountAmount,
    finalAmount: bill.finalAmount,
    paymentStatus: bill.primary.payment_status === 'UNPAID' ? 'UNPAID' : 'PAID',
    items: items,
    notes: notes,
    call: pendingCalls.length ? {
      count: pendingCalls.length,
      reasons: reasons,
      firstCalledAt: staffIsoDate_(pendingCalls[0].created_at, 'Calls.created_at'),
      lastCalledAt: staffIsoDate_(pendingCalls[pendingCalls.length - 1].created_at,
        'Calls.created_at'),
      callIds: pendingCalls.map(call => String(call.call_id)),
    } : null,
  };
}

function updateStaffOrderStatus(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'tableId', 'orderId', 'status',
  ]);
  const hasTableId = typeof payload.tableId === 'string' && payload.tableId.length > 0;
  const hasOrderId = typeof payload.orderId === 'string' && payload.orderId.length > 0;
  if (hasTableId === hasOrderId) {
    throw new ApiError('INVALID_REQUEST', 'tableId 또는 orderId 중 하나가 필요합니다.', false);
  }
  const remoteStatus = String(payload.status || '');
  const status = QR_ORDER_STAFF_REMOTE_TO_ORDER_STATUS[remoteStatus];
  if (!status) {
    throw new ApiError('INVALID_ORDER_STATUS_TRANSITION', '주문 상태를 변경할 수 없습니다.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    let orders;
    let entityType;
    let entityId;
    if (hasTableId) {
      const tableId = validateStaffTableId_(payload.tableId);
      const session = getOpenSessionByTable_(spreadsheet, tableId);
      const bill = calculateSessionBill_(spreadsheet, session);
      if (bill.members.some(member => member.payment_status === 'PAID')) {
        throw sessionAlreadyPaidError_();
      }
      orders = bill.allOrders.filter(order => {
        return order.write_state === 'COMMITTED' && order.status !== 'CANCELLED';
      });
      entityType = 'TABLE_SESSION';
      entityId = String(bill.primary.session_id);
    } else {
      if (payload.orderId.length > 100 || /[\u0000-\u001f]/.test(payload.orderId)) {
        throw new ApiError('INVALID_REQUEST', '주문 ID를 확인해 주세요.', false);
      }
      const order = readSheetTable_(spreadsheet, 'Orders').rows.find(candidate => {
        return candidate.write_state === 'COMMITTED' &&
          String(candidate.order_id) === String(payload.orderId);
      });
      if (!order || order.status === 'CANCELLED') {
        throw new ApiError('ORDER_NOT_FOUND', '주문 정보를 찾을 수 없습니다.', false);
      }
      if (order.payment_status === 'PAID') throw sessionAlreadyPaidError_();
      orders = [order];
      entityType = 'ORDER';
      entityId = String(order.order_id);
    }
    if (!orders.length) {
      throw new ApiError('ORDER_NOT_FOUND', '주문 정보를 찾을 수 없습니다.', false);
    }
    const now = new Date();
    const previous = Array.from(new Set(orders.map(order => String(order.status)))).sort();
    orders.forEach(order => {
      updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
        status: status,
        public_status: QR_ORDER_STATUS_TO_PUBLIC[status],
        status_updated_at: now,
        updated_at: now,
      });
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'ORDER_STATUS_CHANGED', entityType,
      entityId, requestId, previous.join('|'), status, { orderCount: orders.length });
    return null;
  });
}

function listStaffOrderQueues(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken']);
  const spreadsheet = getConfiguredSpreadsheet_();
  const snapshot = readStaffDashboardSnapshot_(spreadsheet);
  const itemGroups = groupRows_(snapshot.items, 'order_id');
  const activeOrders = snapshot.orders.filter(order => {
    return order.write_state === 'COMMITTED' && order.status !== 'CANCELLED';
  });
  const kitchen = activeOrders.filter(order => {
    return ['RECEIVED', 'CONFIRMED', 'PREPARING'].includes(String(order.status));
  }).map(order => ({
    orderId: String(order.order_id),
    tableId: staffCurrentTableIdForOrder_(snapshot, order),
    status: order.status === 'PREPARING' ? 'COOKING' : 'RECEIVED',
    createdAt: staffIsoDate_(order.created_at, 'Orders.created_at'),
    items: staffQueueItems_(itemGroups.get(String(order.order_id)) || []),
    kitchenNote: staffStationNote_(order, 'KITCHEN'),
  }));
  const serving = activeOrders.filter(order => order.status === 'SERVING').map(order => ({
    orderId: String(order.order_id),
    tableId: staffCurrentTableIdForOrder_(snapshot, order),
    readyAt: staffIsoDate_(order.status_updated_at, 'Orders.status_updated_at'),
    items: staffQueueItems_(itemGroups.get(String(order.order_id)) || []),
    servingNote: staffStationNote_(order, 'SERVING'),
  }));
  const payment = staffPaymentRows_(snapshot);
  return {
    kitchen: kitchen,
    serving: serving,
    payment: payment,
    counts: staffStationCounts_(snapshot, new Date()),
  };
}

function listStaffMenu(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'staffToken']);
  const spreadsheet = getConfiguredSpreadsheet_();
  const categories = readSheetTable_(spreadsheet, 'Categories').rows
    .filter(category => category.active === true)
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  const categoryIds = new Set(categories.map(category => String(category.category_id)));
  const items = readSheetTable_(spreadsheet, 'Menu').rows
    .filter(item => categoryIds.has(String(item.category_id)))
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  return {
    categories: categories.map(category => ({
      id: String(category.category_id),
      label: String(category.label),
      heading: isBlankValue_(category.heading) ? undefined : String(category.heading),
    })),
    items: items.map(item => ({
      itemId: String(item.menu_id),
      categoryId: String(item.category_id),
      name: String(item.name),
      price: staffSafeInteger_(item.base_price, 'Menu.base_price'),
      soldOut: item.available !== true,
    })),
  };
}

function setStaffMenuAvailability(payload, requestId, staff) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'itemId', 'soldOut',
  ]);
  if (typeof payload.itemId !== 'string' || !payload.itemId || payload.itemId.length > 100 ||
      typeof payload.soldOut !== 'boolean') {
    throw new ApiError('INVALID_REQUEST', '메뉴 품절 정보를 확인해 주세요.', false);
  }
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const item = readSheetTable_(spreadsheet, 'Menu').rows.find(candidate => {
      return String(candidate.menu_id) === String(payload.itemId);
    });
    if (!item) throw new ApiError('MENU_NOT_FOUND', '메뉴 정보를 다시 불러와 주세요.', false);
    const available = !payload.soldOut;
    updateObjectRowBySchema_(spreadsheet, 'Menu', item.__rowNumber, {
      available: available,
      updated_at: new Date(),
    });
    appendStaffAuditSafely_(spreadsheet, staff, 'MENU_AVAILABILITY_CHANGED', 'MENU',
      String(item.menu_id), requestId, String(item.available), String(available), null);
    return null;
  });
}

function createStaffOrder(payload, requestId, staff) {
  validateStaffOrderCreateRequest_(payload);
  return withStaffLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    const table = assertKnownTable_(spreadsheet, payload.tableId);
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
    const convertedItems = payload.items.map(item => ({
      menuId: String(item.itemId),
      quantity: item.quantity,
      selectedOptionIds: item.selectedOptionIds || [],
    }));
    const lines = validateOrderItems_(convertedItems, getCatalogForOrder_(spreadsheet),
      maxOrderLines);
    const totalAmount = calculateOrderTotal_(lines);
    const display = allocateDisplayNumber_(spreadsheet);
    const now = new Date();
    const session = ensureOpenTableSession_(spreadsheet, String(table.table_id), now);
    const orderId = Utilities.getUuid();
    const clientRequestId = Utilities.getUuid();
    const fingerprint = requestFingerprint_({
      tableId: String(table.table_id),
      note: String(payload.note || ''),
      items: convertedItems,
    });
    const appendResult = appendObjectsBySchema_(spreadsheet, 'Orders', [{
      order_id: orderId,
      display_number: display.value,
      display_code: display.prefix + display.value,
      client_request_id: clientRequestId,
      idempotency_key: String(table.table_id) + ':' + clientRequestId,
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
      session_id: String(session.session_id),
      note_audience: 'GENERAL',
    }]);
    try {
      writeOrderChildren_(spreadsheet, orderId, lines, now, false);
      updateObjectRowBySchema_(spreadsheet, 'Orders', appendResult.startRow, {
        write_state: 'COMMITTED',
        updated_at: new Date(),
      });
    } catch (error) {
      updateObjectRowBySchema_(spreadsheet, 'Orders', appendResult.startRow, {
        write_state: 'FAILED',
        updated_at: new Date(),
      });
      throw error;
    }
    appendStaffAuditSafely_(spreadsheet, staff, 'STAFF_ORDER_CREATED', 'ORDER', orderId,
      requestId, '', 'COMMITTED', { tableId: String(table.table_id) });
    return { orderId: orderId, displayCode: display.prefix + display.value };
  });
}

function validateStaffOrderCreateRequest_(payload) {
  assertStaffAllowedFields_(payload, [
    'apiVersion', 'staffToken', 'tableId', 'items', 'note',
  ]);
  validateStaffTableId_(payload.tableId);
  if (payload.note !== null && payload.note !== undefined && typeof payload.note !== 'string') {
    throw new ApiError('INVALID_REQUEST', '주문 메모를 확인해 주세요.', false);
  }
  if (String(payload.note || '').length > QR_ORDER_LIMITS.MAX_NOTE_LENGTH ||
      !Array.isArray(payload.items) || !payload.items.length ||
      payload.items.length > QR_ORDER_LIMITS.HARD_MAX_ORDER_LINES) {
    throw new ApiError('INVALID_REQUEST', '주문 정보를 확인해 주세요.', false);
  }
  payload.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false);
    }
    assertStaffAllowedFields_(item, ['itemId', 'quantity', 'selectedOptionIds']);
    if (typeof item.itemId !== 'string' || !item.itemId || item.itemId.length > 100 ||
        !Number.isInteger(item.quantity) ||
        (item.selectedOptionIds !== undefined && !Array.isArray(item.selectedOptionIds))) {
      throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false,
        { lineNo: index + 1 });
    }
    (item.selectedOptionIds || []).forEach(optionId => {
      if (typeof optionId !== 'string' || !optionId || optionId.length > 100) {
        throw new ApiError('INVALID_OPTION_SELECTION', '옵션 정보를 다시 선택해 주세요.', false,
          { lineNo: index + 1 });
      }
    });
  });
}

function readStaffDashboardSnapshot_(spreadsheet) {
  return {
    tables: readSheetTable_(spreadsheet, 'Tables').rows,
    sessions: readSheetTable_(spreadsheet, 'TableSessions').rows,
    orders: readSheetTable_(spreadsheet, 'Orders').rows,
    items: readSheetTable_(spreadsheet, 'OrderItems').rows,
    itemOptions: readSheetTable_(spreadsheet, 'OrderItemOptions').rows,
    calls: readSheetTable_(spreadsheet, 'Calls').rows,
  };
}

function staffTableListItem_(snapshot, table) {
  const tableId = String(table.table_id);
  const session = staffCurrentOrLatestSession_(snapshot.sessions, tableId);
  if (!session) {
    return {
      tableId: tableId,
      displayName: String(table.display_name),
      sessionStatus: 'EMPTY',
      orderStatus: null,
      paymentStatus: null,
      totalAmount: 0,
      openedAt: null,
      pendingItemCount: 0,
      hasPendingCall: snapshot.calls.some(call => {
        return call.status === 'PENDING' && String(call.table_id) === tableId;
      }),
      mergeGroupLabel: null,
      discountLabel: null,
    };
  }
  const bill = staffBillFromSnapshot_(snapshot, session);
  const pendingOrderIds = new Set(bill.orders.filter(order => order.status !== 'COMPLETED')
    .map(order => String(order.order_id)));
  const pendingItemCount = snapshot.items.filter(item => {
    return pendingOrderIds.has(String(item.order_id)) && orderItemIsActive_(item);
  }).reduce((sum, item) => sum + staffSafeInteger_(item.quantity, 'OrderItems.quantity'), 0);
  const groupTableIds = bill.members.map(member => String(member.table_id)).sort();
  return {
    tableId: tableId,
    displayName: String(table.display_name),
    sessionStatus: String(session.status),
    orderStatus: staffAggregateRemoteStatus_(bill.orders),
    paymentStatus: String(bill.primary.payment_status),
    totalAmount: bill.finalAmount,
    openedAt: staffIsoDate_(session.opened_at, 'TableSessions.opened_at'),
    pendingItemCount: pendingItemCount,
    hasPendingCall: snapshot.calls.some(call => {
      return call.status === 'PENDING' && String(call.table_id) === tableId;
    }),
    mergeGroupLabel: groupTableIds.length > 1 ? groupTableIds.join('+') + ' 합석' : null,
    discountLabel: bill.discountRate > 0 ? String(bill.discountRate) + '% 할인' : null,
  };
}

function staffCurrentOrLatestSession_(sessions, tableId) {
  const open = sessions.filter(session => {
    return session.status === 'OPEN' && String(session.table_id) === String(tableId);
  });
  if (open.length > 1) throw new Error('Multiple OPEN sessions use the same table.');
  if (open.length) return open[0];
  const closed = sessions.filter(session => String(session.table_id) === String(tableId))
    .sort((left, right) => {
      return new Date(right.opened_at).getTime() - new Date(left.opened_at).getTime();
    });
  return closed[0] || null;
}

function staffBillFromSnapshot_(snapshot, session) {
  const primary = resolvePrimarySession_(session, snapshot.sessions);
  const members = snapshot.sessions.filter(candidate => {
    return String(candidate.session_id) === String(primary.session_id) ||
      String(candidate.merged_into_session_id) === String(primary.session_id);
  });
  const memberIds = new Set(members.map(member => String(member.session_id)));
  const allOrders = snapshot.orders.filter(order => memberIds.has(String(order.session_id)));
  const orders = allOrders.filter(order => {
    return order.write_state === 'COMMITTED' && order.status !== 'CANCELLED';
  });
  let subtotalAmount = orders.reduce((sum, order) => {
    return sum + staffSafeInteger_(order.total_amount, 'Orders.total_amount');
  }, 0);
  const discountRate = staffSafeInteger_(primary.discount_rate, 'TableSessions.discount_rate');
  let discountAmount = Math.floor(subtotalAmount * discountRate / 100);
  let finalAmount = subtotalAmount - discountAmount;
  if (primary.payment_status === 'PAID') {
    subtotalAmount = staffSafeInteger_(primary.subtotal_amount, 'TableSessions.subtotal_amount');
    discountAmount = staffSafeInteger_(primary.discount_amount, 'TableSessions.discount_amount');
    finalAmount = staffSafeInteger_(primary.final_amount, 'TableSessions.final_amount');
  }
  if (discountRate < 0 || discountRate > 100 || subtotalAmount < 0 || discountAmount < 0 ||
      finalAmount < 0 || finalAmount !== subtotalAmount - discountAmount) {
    throw new Error('Table session bill is invalid.');
  }
  return {
    primary: primary,
    members: members,
    allOrders: allOrders,
    orders: orders,
    subtotalAmount: subtotalAmount,
    discountRate: discountRate,
    discountAmount: discountAmount,
    finalAmount: finalAmount,
  };
}

function staffAggregateRemoteStatus_(orders) {
  const ranking = { RECEIVED: 0, CONFIRMED: 0, PREPARING: 1, SERVING: 2, COMPLETED: 3 };
  const candidates = orders.filter(order => ranking[String(order.status)] !== undefined);
  if (!candidates.length) return null;
  const selected = candidates.reduce((result, order) => {
    return ranking[String(order.status)] < ranking[String(result.status)] ? order : result;
  });
  return QR_ORDER_STAFF_ORDER_STATUS_TO_REMOTE[String(selected.status)] || null;
}

function staffStationCounts_(snapshot, now) {
  const activeOrders = snapshot.orders.filter(order => {
    return order.write_state === 'COMMITTED' && order.status !== 'CANCELLED';
  });
  const calling = new Set(snapshot.calls.filter(call => call.status === 'PENDING')
    .map(call => String(call.table_id))).size;
  const delayed = snapshot.sessions.filter(session => {
    if (session.status !== 'OPEN' || session.payment_status === 'PAID') return false;
    const opened = new Date(session.opened_at).getTime();
    return Number.isFinite(opened) && now.getTime() - opened >= 35 * 60 * 1000;
  }).length;
  return {
    tables: calling + delayed,
    kitchen: activeOrders.filter(order => {
      return ['RECEIVED', 'CONFIRMED', 'PREPARING'].includes(String(order.status));
    }).length,
    serving: activeOrders.filter(order => order.status === 'SERVING').length,
    payment: staffPaymentRows_(snapshot).filter(row => row.paymentStatus === 'UNPAID').length,
  };
}

function staffPaymentRows_(snapshot) {
  const today = staffSeoulDateKey_(new Date());
  return snapshot.sessions.filter(session => isBlankValue_(session.merged_into_session_id))
    .map(session => staffBillFromSnapshot_(snapshot, session))
    .filter(bill => {
      if (bill.primary.payment_status === 'PAID') {
        return !isBlankValue_(bill.primary.paid_at) &&
          staffSeoulDateKey_(bill.primary.paid_at) === today;
      }
      return bill.primary.status === 'OPEN' && bill.orders.length > 0 &&
        bill.orders.every(order => order.status === 'COMPLETED');
    })
    .map(bill => {
      const servedTimes = bill.orders.map(order => new Date(order.status_updated_at).getTime())
        .filter(Number.isFinite);
      return {
        tableId: String(bill.primary.table_id),
        subtotalAmount: bill.subtotalAmount,
        discountRate: bill.discountRate,
        discountAmount: bill.discountAmount,
        finalAmount: bill.finalAmount,
        paymentStatus: String(bill.primary.payment_status),
        servedAt: servedTimes.length ? new Date(Math.max.apply(null, servedTimes)).toISOString() : null,
      };
    });
}

function staffSeoulDateKey_(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Payment timestamp is invalid.');
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function staffCurrentTableIdForOrder_(snapshot, order) {
  const session = snapshot.sessions.find(candidate => {
    return String(candidate.session_id) === String(order.session_id);
  });
  return session ? String(session.table_id) : String(order.table_id);
}

function staffQueueItems_(items) {
  return items.filter(orderItemIsActive_)
    .sort((left, right) => Number(left.line_no) - Number(right.line_no))
    .map(item => ({
      name: String(item.menu_name_snapshot),
      quantity: staffSafeInteger_(item.quantity, 'OrderItems.quantity'),
    }));
}

function staffRemoteNoteAudience_(value) {
  const audience = String(value || 'GENERAL');
  if (audience === 'KITCHEN') return 'kitchen';
  if (audience === 'SERVING') return 'serving';
  return 'general';
}

function staffStationNote_(order, station) {
  if (isBlankValue_(order.note)) return null;
  const audience = String(order.note_audience || 'GENERAL');
  return audience === 'GENERAL' || audience === station ? String(order.note) : null;
}

function staffSafeInteger_(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(fieldName + ' must be an integer.');
  return number;
}
