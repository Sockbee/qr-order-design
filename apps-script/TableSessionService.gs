/** Table session lifecycle, legacy backfill, and billing group helpers. */

function ensureOpenTableSession_(spreadsheet, tableId, openedAt) {
  const normalizedTableId = String(tableId);
  const sessions = readSheetTable_(spreadsheet, 'TableSessions').rows;
  const currentMatches = sessions.filter(session => {
    return session.status === 'OPEN' && String(session.table_id) === normalizedTableId;
  });
  if (currentMatches.length > 1) throw new Error('Multiple OPEN sessions use the same table.');
  if (currentMatches.length === 1) return currentMatches[0];

  const originMatches = sessions.filter(session => {
    return session.status === 'OPEN' && String(session.origin_table_id) === normalizedTableId;
  });
  if (originMatches.length > 1) throw new Error('Multiple OPEN sessions use the same origin table.');
  if (originMatches.length === 1) return originMatches[0];

  const now = openedAt ? new Date(openedAt) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Session opened_at is invalid.');
  const session = {
    session_id: Utilities.getUuid(),
    table_id: normalizedTableId,
    origin_table_id: normalizedTableId,
    status: 'OPEN',
    discount_rate: 0,
    merged_into_session_id: '',
    payment_status: 'UNPAID',
    subtotal_amount: '',
    discount_amount: '',
    final_amount: '',
    opened_at: now,
    closed_at: '',
    paid_at: '',
    updated_at: now,
  };
  const result = appendObjectsBySchema_(spreadsheet, 'TableSessions', [session]);
  session.__rowNumber = result.startRow;
  return session;
}

function migrateLegacyOrdersToSessions_(spreadsheet) {
  const orders = readSheetTable_(spreadsheet, 'Orders').rows;
  const legacyOrders = orders.filter(order => isBlankValue_(order.session_id));
  if (!legacyOrders.length) return { migratedOrderCount: 0, createdSessionCount: 0 };

  const sessions = readSheetTable_(spreadsheet, 'TableSessions').rows;
  const byTable = groupRows_(legacyOrders, 'table_id');
  let createdSessionCount = 0;
  let migratedOrderCount = 0;

  byTable.forEach((tableOrders, tableId) => {
    const paidOrders = tableOrders.filter(order => order.payment_status === 'PAID');
    const unpaidOrders = tableOrders.filter(order => order.payment_status !== 'PAID');

    if (paidOrders.length) {
      const paidSession = createLegacyTableSession_(spreadsheet, tableId, paidOrders, true);
      paidSession.__rowNumber = paidSession.__rowNumber || sessions.length + 2;
      sessions.push(paidSession);
      createdSessionCount += 1;
      migratedOrderCount += assignOrdersToSession_(spreadsheet, paidOrders, paidSession);
    }

    if (unpaidOrders.length) {
      let openSession = sessions.find(candidate => {
        return candidate.status === 'OPEN' && String(candidate.table_id) === tableId;
      });
      if (!openSession) {
        openSession = createLegacyTableSession_(spreadsheet, tableId, unpaidOrders, false);
        sessions.push(openSession);
        createdSessionCount += 1;
      }
      migratedOrderCount += assignOrdersToSession_(spreadsheet, unpaidOrders, openSession);
    }
  });
  return {
    migratedOrderCount: migratedOrderCount,
    createdSessionCount: createdSessionCount,
  };
}

function createLegacyTableSession_(spreadsheet, tableId, orders, paid) {
  const openedAt = earliestDate_(orders.map(order => order.created_at));
  const paidAt = paid ? latestDate_(orders.map(order => order.paid_at)) : null;
  const subtotal = orders.filter(order => order.status !== 'CANCELLED')
    .reduce((sum, order) => sum + Number(order.total_amount), 0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new Error('Legacy order subtotal is invalid.');
  }
  const now = new Date();
  const session = {
    session_id: Utilities.getUuid(),
    table_id: tableId,
    origin_table_id: tableId,
    status: paid ? 'CLOSED' : 'OPEN',
    discount_rate: 0,
    merged_into_session_id: '',
    payment_status: paid ? 'PAID' : 'UNPAID',
    subtotal_amount: paid ? subtotal : '',
    discount_amount: paid ? 0 : '',
    final_amount: paid ? subtotal : '',
    opened_at: openedAt,
    closed_at: paid ? (paidAt || now) : '',
    paid_at: paid ? (paidAt || now) : '',
    updated_at: now,
  };
  const result = appendObjectsBySchema_(spreadsheet, 'TableSessions', [session]);
  session.__rowNumber = result.startRow;
  return session;
}

function assignOrdersToSession_(spreadsheet, orders, session) {
  orders.forEach(order => {
    updateObjectRowBySchema_(spreadsheet, 'Orders', order.__rowNumber, {
      session_id: String(session.session_id),
    });
  });
  return orders.length;
}

function earliestDate_(values) {
  return extremumDate_(values, Math.min);
}

function latestDate_(values) {
  const present = values.filter(value => !isBlankValue_(value));
  return present.length ? extremumDate_(present, Math.max) : null;
}

function extremumDate_(values, reducer) {
  const timestamps = values.map(value => new Date(value).getTime());
  if (!timestamps.length || timestamps.some(timestamp => !Number.isFinite(timestamp))) {
    throw new Error('Legacy order timestamp is invalid.');
  }
  return new Date(timestamps.reduce((result, timestamp) => reducer(result, timestamp)));
}

function getOpenSessionByTable_(spreadsheet, tableId) {
  const matches = readSheetTable_(spreadsheet, 'TableSessions').rows.filter(session => {
    return session.status === 'OPEN' && String(session.table_id) === String(tableId);
  });
  if (matches.length > 1) throw new Error('Multiple OPEN sessions use the same table.');
  if (!matches.length) {
    throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  }
  return matches[0];
}

function getLatestSessionByTable_(spreadsheet, tableId) {
  const sessions = readSheetTable_(spreadsheet, 'TableSessions').rows.filter(session => {
    return String(session.table_id) === String(tableId);
  });
  if (!sessions.length) {
    throw new ApiError('SESSION_NOT_FOUND', '테이블 세션을 찾을 수 없습니다.', false);
  }
  return sessions.slice().sort((left, right) => {
    return new Date(right.opened_at).getTime() - new Date(left.opened_at).getTime();
  })[0];
}

function resolvePrimarySession_(session, allSessions) {
  if (isBlankValue_(session.merged_into_session_id)) return session;
  const primary = allSessions.find(candidate => {
    return String(candidate.session_id) === String(session.merged_into_session_id);
  });
  if (!primary || !isBlankValue_(primary.merged_into_session_id)) {
    throw new Error('Invalid merged session chain.');
  }
  return primary;
}

function billingGroup_(spreadsheet, session) {
  const sessions = readSheetTable_(spreadsheet, 'TableSessions').rows;
  const primary = resolvePrimarySession_(session, sessions);
  const members = sessions.filter(candidate => {
    return String(candidate.session_id) === String(primary.session_id) ||
      String(candidate.merged_into_session_id) === String(primary.session_id);
  });
  return { primary: primary, members: members, allSessions: sessions };
}

function calculateSessionBill_(spreadsheet, session) {
  const group = billingGroup_(spreadsheet, session);
  const memberIds = new Set(group.members.map(member => String(member.session_id)));
  const allOrders = readSheetTable_(spreadsheet, 'Orders').rows.filter(order => {
    return memberIds.has(String(order.session_id));
  });
  const orders = allOrders.filter(order => {
    return order.write_state === 'COMMITTED' && order.status !== 'CANCELLED';
  });
  const subtotalAmount = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount < 0) {
    throw new Error('Session subtotal is invalid.');
  }
  const discountRate = Number(group.primary.discount_rate);
  if (!Number.isInteger(discountRate) || discountRate < 0 || discountRate > 100) {
    throw new Error('Session discount rate is invalid.');
  }
  let effectiveSubtotal = subtotalAmount;
  let discountAmount = Math.floor(subtotalAmount * discountRate / 100);
  let finalAmount = subtotalAmount - discountAmount;
  if (group.primary.payment_status === 'PAID') {
    effectiveSubtotal = Number(group.primary.subtotal_amount);
    discountAmount = Number(group.primary.discount_amount);
    finalAmount = Number(group.primary.final_amount);
    if (![effectiveSubtotal, discountAmount, finalAmount].every(Number.isSafeInteger) ||
        effectiveSubtotal < 0 || discountAmount < 0 || finalAmount < 0 ||
        finalAmount !== effectiveSubtotal - discountAmount) {
      throw new Error('Paid session snapshot is invalid.');
    }
  }
  return {
    primary: group.primary,
    members: group.members,
    orders: orders,
    allOrders: allOrders,
    discountRate: discountRate,
    subtotalAmount: effectiveSubtotal,
    discountAmount: discountAmount,
    finalAmount: finalAmount,
  };
}
