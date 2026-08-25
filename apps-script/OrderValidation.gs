/** Pure request and catalog validation for order creation. */

function validateClientOrderRequest_(payload) {
  assertAllowedFields_(payload, [
    'apiVersion', 'tableId', 'tableToken', 'clientRequestId', 'note', 'items',
  ], 'request');

  if (typeof payload.tableId !== 'string' || !/^T\d{2,}$/.test(payload.tableId) ||
      typeof payload.tableToken !== 'string' || !/^[0-9a-f]{64}$/i.test(payload.tableToken)) {
    throw new ApiError('INVALID_TABLE_TOKEN', '유효하지 않은 테이블 QR입니다.', false);
  }
  const clientRequestId = String(payload.clientRequestId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(clientRequestId)) {
    throw new ApiError('INVALID_REQUEST', '주문 요청 ID를 확인해 주세요.', false);
  }
  if (payload.note !== undefined && payload.note !== null && typeof payload.note !== 'string') {
    throw new ApiError('INVALID_REQUEST', '요청 메모를 확인해 주세요.', false);
  }
  if (String(payload.note || '').length > QR_ORDER_LIMITS.MAX_NOTE_LENGTH) {
    throw new ApiError('INVALID_REQUEST', '요청 메모가 너무 깁니다.', false);
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 ||
      payload.items.length > QR_ORDER_LIMITS.HARD_MAX_ORDER_LINES) {
    throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false);
  }

  payload.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError('INVALID_REQUEST', '주문 항목을 확인해 주세요.', false,
        { lineNo: index + 1 });
    }
    assertAllowedFields_(item, ['menuId', 'quantity', 'selectedOptionIds'], 'items[' + index + ']');
    if (typeof item.menuId !== 'string' || !item.menuId || item.menuId.length > 100) {
      throw new ApiError('INVALID_REQUEST', '메뉴 정보를 확인해 주세요.', false,
        { lineNo: index + 1 });
    }
    if (!Number.isInteger(item.quantity)) {
      throw new ApiError('INVALID_QUANTITY', '주문 수량을 확인해 주세요.', false,
        { lineNo: index + 1 });
    }
    if (item.selectedOptionIds !== undefined && !Array.isArray(item.selectedOptionIds)) {
      throw new ApiError('INVALID_OPTION_SELECTION', '옵션 정보를 다시 선택해 주세요.', false,
        { lineNo: index + 1 });
    }
    const selectedOptionIds = item.selectedOptionIds || [];
    if (selectedOptionIds.length > QR_ORDER_LIMITS.HARD_MAX_OPTIONS_PER_LINE) {
      throw new ApiError('INVALID_OPTION_SELECTION', '선택한 옵션 수를 확인해 주세요.', false,
        { lineNo: index + 1 });
    }
    selectedOptionIds.forEach(optionId => {
      if (typeof optionId !== 'string' || !optionId || optionId.length > 100) {
        throw new ApiError('INVALID_OPTION_SELECTION', '옵션 정보를 다시 선택해 주세요.', false,
          { lineNo: index + 1 });
      }
    });
  });
}

function assertAllowedFields_(object, allowedFields, location) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(object || {}).filter(field => !allowed.has(field)).sort();
  if (unexpected.length) {
    throw new ApiError('INVALID_REQUEST', '지원하지 않는 주문 정보가 포함되어 있습니다.', false, {
      location: location,
      fields: unexpected,
    });
  }
}

function requestFingerprint_(payload) {
  const canonical = {
    tableId: String(payload.tableId),
    note: String(payload.note || ''),
    items: payload.items.map(item => ({
      menuId: String(item.menuId),
      quantity: item.quantity,
      selectedOptionIds: (item.selectedOptionIds || []).map(String).slice().sort(),
    })),
  };
  return sha256Hex_(JSON.stringify(canonical));
}

function validateOrderItems_(items, catalog, maxOrderLines) {
  if (!Number.isInteger(maxOrderLines) || maxOrderLines < 1 ||
      !Array.isArray(items) || items.length < 1 || items.length > maxOrderLines) {
    throw new ApiError('INVALID_REQUEST', '주문 항목 수를 확인해 주세요.', false, {
      maxOrderLines: maxOrderLines,
    });
  }

  const menuById = new Map(catalog.items.map(item => [String(item.menuId), item]));
  return items.map((input, index) => validateOrderLine_(input, index, menuById));
}

function validateOrderLine_(input, index, menuById) {
  const lineNo = index + 1;
  const menu = menuById.get(String(input.menuId));
  if (!menu) {
    throw new ApiError('MENU_NOT_FOUND', '메뉴 정보를 다시 불러와 주세요.', false,
      { menuIds: [String(input.menuId)] });
  }
  if (menu.available !== true) {
    throw new ApiError('MENU_SOLD_OUT', '품절된 메뉴가 포함되어 있습니다.', false,
      { menuIds: [menu.menuId] });
  }
  if (!Number.isInteger(input.quantity) || input.quantity < menu.minQuantity ||
      input.quantity > menu.maxQuantity) {
    throw new ApiError('INVALID_QUANTITY', '주문 수량을 확인해 주세요.', false, {
      menuId: menu.menuId,
      min: menu.minQuantity,
      max: menu.maxQuantity,
    });
  }

  const selectedIds = (input.selectedOptionIds || []).map(String);
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new ApiError('INVALID_OPTION_SELECTION', '옵션 정보를 다시 선택해 주세요.', false,
      { lineNo: lineNo });
  }

  const optionById = new Map();
  menu.optionGroups.forEach(group => {
    group.options.forEach(option => {
      optionById.set(String(option.optionId), { option: option, group: group });
    });
  });
  const selected = selectedIds.map(optionId => {
    const entry = optionById.get(optionId);
    if (!entry) {
      throw new ApiError('OPTION_NOT_FOUND', '옵션 정보를 다시 선택해 주세요.', false,
        { optionIds: [optionId] });
    }
    if (entry.option.available !== true) {
      throw new ApiError('OPTION_SOLD_OUT', '품절된 옵션이 포함되어 있습니다.', false,
        { optionIds: [optionId] });
    }
    return entry;
  });

  menu.optionGroups.forEach(group => {
    const selectedCount = selected.filter(entry => {
      return entry.group.optionGroupId === group.optionGroupId;
    }).length;
    if (selectedCount < group.minSelections || selectedCount > group.maxSelections) {
      throw new ApiError('INVALID_OPTION_SELECTION', '필수 옵션을 확인해 주세요.', false, {
        optionGroupId: group.optionGroupId,
        min: group.minSelections,
        max: group.maxSelections,
      });
    }
  });

  const optionDelta = selected.reduce((sum, entry) => sum + entry.option.priceDelta, 0);
  const unitPrice = menu.basePrice + optionDelta;
  const lineTotal = unitPrice * input.quantity;
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 ||
      !Number.isSafeInteger(lineTotal) || lineTotal < 0) {
    throw new Error('Invalid catalog price or order line total.');
  }

  return {
    lineNo: lineNo,
    menuId: menu.menuId,
    menuName: menu.name,
    basePrice: menu.basePrice,
    unitPrice: unitPrice,
    quantity: input.quantity,
    lineTotal: lineTotal,
    selectedOptions: selected.map((entry, optionIndex) => ({
      sortOrder: optionIndex + 1,
      optionId: entry.option.optionId,
      groupName: entry.group.label,
      name: entry.option.name,
      priceDelta: entry.option.priceDelta,
    })),
  };
}

function calculateOrderTotal_(lines) {
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid order total.');
  return total;
}
