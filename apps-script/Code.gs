/** Public web app entry points. */

function doGet(event) {
  return apiResponse_(() => {
    const route = apiRoute_(event);
    if (route === '' || route === 'health') {
      return { status: 'ok', apiVersion: QR_ORDER_API_VERSION };
    }
    throw new ApiError('NOT_FOUND', '지원하지 않는 API 경로입니다.', false);
  });
}

function doPost(event) {
  return apiResponse_(requestId => {
    const route = apiRoute_(event);
    const payload = parseJsonBody_(event);

    if (route === 'resolve-table') return resolveTable(payload);
    if (route === 'menu') return getMenu(payload);
    if (route === 'orders/create') return createOrder(payload, requestId);
    if (route === 'orders/get') return getOrder(payload);
    if (route === 'orders/list') return listOrders(payload);
    if (route === 'calls/create') return createCall(payload, requestId);
    if (route === 'calls/cancel') return cancelCall(payload, requestId);
    if (route === 'staff/login') return staffLogin(payload, requestId);
    if (isStaffApiRoute_(route)) {
      const staff = requireStaffAuth_(payload);
      return dispatchStaffRoute_(route, payload, requestId, staff);
    }
    throw new ApiError('NOT_FOUND', '지원하지 않는 API 경로입니다.', false);
  });
}
