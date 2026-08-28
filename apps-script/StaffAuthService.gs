/** Staff login, signed token issuance, throttling, and shared route middleware. */

const QR_ORDER_STAFF_TOKEN_EPOCH_CACHE_KEY = 'qr-order:staff-token-epoch';
const QR_ORDER_STAFF_TOKEN_EPOCH_CACHE_SECONDS = 60;
const QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS = 600;
const QR_ORDER_STAFF_LOGIN_MAX_FAILURES = 5;

const QR_ORDER_STAFF_API_ROUTES = Object.freeze([
  'staff/calls/list',
  'staff/calls/acknowledge',
  'staff/tables/list',
  'staff/tables/detail',
  'staff/tables/bill',
  'staff/tables/discount',
  'staff/tables/move',
  'staff/tables/merge',
  'staff/tables/split',
  'staff/tables/confirm-payment',
  'staff/orders/status',
  'staff/orders/queue',
  'staff/orders/create',
  'staff/orders/update',
  'staff/orders/cancel',
  'staff/menu/list',
  'staff/menu/availability',
]);

function isStaffApiRoute_(route) {
  return QR_ORDER_STAFF_API_ROUTES.includes(String(route));
}

function dispatchStaffRoute_(route, payload, requestId, staff) {
  if (route === 'staff/calls/list') return listStaffCalls(payload);
  if (route === 'staff/calls/acknowledge') {
    return acknowledgeStaffCalls(payload, requestId, staff);
  }
  if (route === 'staff/tables/bill') return getStaffTableBill(payload);
  if (route === 'staff/tables/discount') {
    return setStaffTableDiscount(payload, requestId, staff);
  }
  if (route === 'staff/tables/move') return moveStaffTable(payload, requestId, staff);
  if (route === 'staff/tables/merge') return mergeStaffTables(payload, requestId, staff);
  if (route === 'staff/tables/split') return splitStaffTable(payload, requestId, staff);
  if (route === 'staff/tables/confirm-payment') {
    return confirmStaffTablePayment(payload, requestId, staff);
  }
  if (route === 'staff/tables/list') return listStaffTables(payload);
  if (route === 'staff/tables/detail') return getStaffTableDetail(payload);
  if (route === 'staff/orders/status') {
    return updateStaffOrderStatus(payload, requestId, staff);
  }
  if (route === 'staff/orders/queue') return listStaffOrderQueues(payload);
  if (route === 'staff/menu/list') return listStaffMenu(payload);
  if (route === 'staff/menu/availability') {
    return setStaffMenuAvailability(payload, requestId, staff);
  }
  if (route === 'staff/orders/create') return createStaffOrder(payload, requestId, staff);
  throw new ApiError('NOT_FOUND', '지원하지 않는 API 경로입니다.', false);
}

function staffLogin(payload, requestId) {
  validateStaffLoginRequest_(payload);
  const deviceLabel = String(payload.deviceLabel);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(QR_ORDER_LIMITS.LOCK_TIMEOUT_MS)) {
    throw new ApiError('LOCK_TIMEOUT', '요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.', true);
  }

  try {
    const spreadsheet = getConfiguredSpreadsheet_();
    const currentRetryAfter = staffLoginRetryAfter_(deviceLabel);
    if (currentRetryAfter) {
      appendStaffLoginAuditSafely_(spreadsheet, 'STAFF_LOGIN_FAILED', deviceLabel, requestId, {
        errorCode: 'STAFF_LOGIN_THROTTLED',
        retryAfter: new Date(currentRetryAfter).toISOString(),
      });
      throw staffLoginThrottledError_(currentRetryAfter);
    }

    const actualHash = sha256Hex_(getRequiredTokenPepper_() + ':' + String(payload.passcode));
    const expectedHash = getRequiredStaffPasscodeHash_();
    if (!constantTimeEquals_(actualHash, expectedHash)) {
      const retryAfter = recordStaffLoginFailure_(deviceLabel);
      const error = retryAfter
        ? staffLoginThrottledError_(retryAfter)
        : staffPasscodeMismatchError_();
      appendStaffLoginAuditSafely_(spreadsheet, 'STAFF_LOGIN_FAILED', deviceLabel, requestId, {
        errorCode: error.code,
      });
      throw error;
    }

    clearStaffLoginFailures_(deviceLabel);
    const settings = settingsMap_(spreadsheet);
    const epoch = staffSettingPositiveInteger_(settings, 'STAFF_TOKEN_EPOCH');
    const sessionHours = staffSettingPositiveInteger_(settings, 'STAFF_SESSION_HOURS');
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + sessionHours * 60 * 60;
    if (!Number.isSafeInteger(expiresAt)) throw new Error('Staff token expiry is invalid.');
    const staffToken = signStaffToken_({
      deviceLabel: deviceLabel,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
      epoch: epoch,
    });
    appendStaffLoginAuditSafely_(spreadsheet, 'STAFF_LOGIN', deviceLabel, requestId, {
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      epoch: epoch,
    });
    return {
      staffToken: staffToken,
      deviceLabel: deviceLabel,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  } finally {
    lock.releaseLock();
  }
}

function validateStaffLoginRequest_(payload) {
  assertStaffAllowedFields_(payload, ['apiVersion', 'passcode', 'deviceLabel']);
  if (!QR_ORDER_ENUMS.STAFF_DEVICE_LABEL.includes(String(payload.deviceLabel))) {
    throw new ApiError('INVALID_DEVICE_LABEL', '스테이션을 다시 선택해 주세요.', false);
  }
  if (typeof payload.passcode !== 'string' || !payload.passcode || payload.passcode.length > 512) {
    throw new ApiError('INVALID_REQUEST', 'passcode를 확인해 주세요.', false);
  }
}

function requireStaffAuth_(payload) {
  if (!payload || typeof payload.staffToken !== 'string' || !payload.staffToken) {
    throw new ApiError('STAFF_AUTH_REQUIRED', '운영 인증이 필요합니다.', false);
  }
  return verifyStaffToken_(payload.staffToken);
}

function verifyStaffToken_(token) {
  const text = String(token || '');
  if (text.length > 4096) throw staffTokenInvalidError_();
  const parts = text.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] ||
      !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
    throw staffTokenInvalidError_();
  }

  const expectedSignature = staffTokenSignature_(parts[0]);
  if (!constantTimeEquals_(parts[1], expectedSignature)) throw staffTokenInvalidError_();

  let payload;
  try {
    const bytes = Utilities.base64DecodeWebSafe(padBase64Url_(parts[0]));
    const json = Utilities.newBlob(bytes).getDataAsString(Utilities.Charset.UTF_8);
    payload = JSON.parse(json);
  } catch (error) {
    throw staffTokenInvalidError_();
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !QR_ORDER_ENUMS.STAFF_DEVICE_LABEL.includes(payload.deviceLabel) ||
      !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) ||
      !Number.isSafeInteger(payload.epoch) || payload.issuedAt < 0 ||
      payload.expiresAt <= payload.issuedAt || payload.epoch < 1) {
    throw staffTokenInvalidError_();
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.expiresAt <= nowSeconds) {
    throw new ApiError(
      'STAFF_TOKEN_EXPIRED',
      '인증이 만료되었습니다. 다시 로그인해 주세요.',
      false
    );
  }
  if (payload.issuedAt > nowSeconds + 60) throw staffTokenInvalidError_();
  if (payload.epoch !== getStaffTokenEpoch_()) {
    throw new ApiError(
      'STAFF_TOKEN_REVOKED',
      '인증이 해제되었습니다. 다시 로그인해 주세요.',
      false
    );
  }
  return {
    deviceLabel: payload.deviceLabel,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    epoch: payload.epoch,
  };
}

function signStaffToken_(payload) {
  const payloadPart = stripBase64Padding_(Utilities.base64EncodeWebSafe(
    JSON.stringify(payload),
    Utilities.Charset.UTF_8
  ));
  return payloadPart + '.' + staffTokenSignature_(payloadPart);
}

function staffTokenSignature_(payloadPart) {
  const secret = getRequiredStaffScriptProperty_('STAFF_TOKEN_SECRET', 32);
  const signature = Utilities.computeHmacSha256Signature(
    String(payloadPart),
    secret,
    Utilities.Charset.UTF_8
  );
  return stripBase64Padding_(Utilities.base64EncodeWebSafe(signature));
}

function stripBase64Padding_(value) {
  return String(value).replace(/=+$/g, '');
}

function padBase64Url_(value) {
  const text = String(value);
  const remainder = text.length % 4;
  return remainder ? text + '='.repeat(4 - remainder) : text;
}

function getStaffTokenEpoch_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(QR_ORDER_STAFF_TOKEN_EPOCH_CACHE_KEY);
  if (cached !== null) {
    const value = Number(cached);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  const epoch = staffSettingPositiveInteger_(
    settingsMap_(getConfiguredSpreadsheet_()),
    'STAFF_TOKEN_EPOCH'
  );
  cache.put(
    QR_ORDER_STAFF_TOKEN_EPOCH_CACHE_KEY,
    String(epoch),
    QR_ORDER_STAFF_TOKEN_EPOCH_CACHE_SECONDS
  );
  return epoch;
}

function staffSettingPositiveInteger_(settings, key) {
  const value = Number(getRequiredSetting_(settings, key));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(key + ' must be a positive integer.');
  }
  return value;
}

function getRequiredStaffScriptProperty_(key, minimumLength) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value || value.length < minimumLength) {
    throw new Error(key + ' is missing or too short.');
  }
  return value;
}

function getRequiredStaffPasscodeHash_() {
  const value = PropertiesService.getScriptProperties().getProperty('STAFF_PASSCODE_HASH');
  if (!/^[0-9a-f]{64}$/i.test(String(value || ''))) {
    throw new Error('STAFF_PASSCODE_HASH must be a SHA-256 hex digest.');
  }
  return String(value).toLowerCase();
}

function staffTokenInvalidError_() {
  return new ApiError('STAFF_TOKEN_INVALID', '인증 정보가 올바르지 않습니다.', false);
}

function staffPasscodeMismatchError_() {
  return new ApiError('STAFF_PASSCODE_MISMATCH', 'passcode가 올바르지 않습니다.', false);
}

function staffLoginThrottledError_(retryAfter) {
  return new ApiError(
    'STAFF_LOGIN_THROTTLED',
    '시도가 많습니다. 잠시 후 다시 시도해 주세요.',
    true,
    { retryAfter: new Date(retryAfter).toISOString() }
  );
}

function staffLoginFailureKey_(deviceLabel) {
  return 'qr-order:staff-login-fail:' + sha256Hex_(String(deviceLabel)).slice(0, 16);
}

function staffGlobalFailureKey_() {
  return 'qr-order:staff-login-fail:global';
}

function staffLoginBlockedKey_(failureKey) {
  return failureKey + ':blocked-until';
}

function isStaffLoginThrottled_(deviceLabel) {
  return staffLoginRetryAfter_(deviceLabel) !== null;
}

function staffLoginRetryAfter_(deviceLabel) {
  const cache = CacheService.getScriptCache();
  const keys = [staffLoginFailureKey_(deviceLabel), staffGlobalFailureKey_()];
  const now = Date.now();
  const blockedUntil = keys.map(key => Number(cache.get(staffLoginBlockedKey_(key))))
    .filter(value => Number.isFinite(value) && value > now);
  return blockedUntil.length ? Math.max.apply(null, blockedUntil) : null;
}

function recordStaffLoginFailure_(deviceLabel) {
  const cache = CacheService.getScriptCache();
  const deviceKey = staffLoginFailureKey_(deviceLabel);
  const globalKey = staffGlobalFailureKey_();
  const deviceCount = staffLoginFailureCount_(cache, deviceKey) + 1;
  const globalCount = staffLoginFailureCount_(cache, globalKey) + 1;
  cache.put(deviceKey, String(deviceCount), QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS);
  cache.put(globalKey, String(globalCount), QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS);
  if (deviceCount < QR_ORDER_STAFF_LOGIN_MAX_FAILURES &&
      globalCount < QR_ORDER_STAFF_LOGIN_MAX_FAILURES) return null;

  const retryAfter = Date.now() + QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS * 1000;
  if (deviceCount >= QR_ORDER_STAFF_LOGIN_MAX_FAILURES) {
    cache.put(
      staffLoginBlockedKey_(deviceKey),
      String(retryAfter),
      QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS
    );
  }
  if (globalCount >= QR_ORDER_STAFF_LOGIN_MAX_FAILURES) {
    cache.put(
      staffLoginBlockedKey_(globalKey),
      String(retryAfter),
      QR_ORDER_STAFF_LOGIN_WINDOW_SECONDS
    );
  }
  return retryAfter;
}

function clearStaffLoginFailures_(deviceLabel) {
  const cache = CacheService.getScriptCache();
  const deviceKey = staffLoginFailureKey_(deviceLabel);
  const globalKey = staffGlobalFailureKey_();
  cache.remove(deviceKey);
  cache.remove(globalKey);
  cache.remove(staffLoginBlockedKey_(deviceKey));
  cache.remove(staffLoginBlockedKey_(globalKey));
}

function staffLoginFailureCount_(cache, key) {
  const value = Number(cache.get(key));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function assertStaffAllowedFields_(payload, allowedFields) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(payload || {}).filter(field => !allowed.has(field)).sort();
  if (unexpected.length) {
    throw new ApiError('INVALID_REQUEST', '지원하지 않는 운영 정보가 포함되어 있습니다.', false, {
      fields: unexpected,
    });
  }
}

function appendStaffLoginAuditSafely_(spreadsheet, action, deviceLabel, requestId, detail) {
  try {
    appendObjectsBySchema_(spreadsheet, 'AuditLogs', [{
      log_id: Utilities.getUuid(),
      occurred_at: new Date(),
      actor_type: 'STAFF',
      actor_id: String(deviceLabel),
      action: action,
      entity_type: 'STAFF_SESSION',
      entity_id: String(deviceLabel),
      from_value: '',
      to_value: '',
      request_id: String(requestId || ''),
      detail_json: detail ? JSON.stringify(detail) : '',
    }]);
  } catch (error) {
    console.error('Failed to append staff login audit log: ' + action);
  }
}
