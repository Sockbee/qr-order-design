/**
 * HTTP helpers for the Apps Script web app adapter.
 * ContentService cannot set arbitrary HTTP status codes, so callers must inspect success.
 */

const QR_ORDER_API_VERSION = 'v1';
const QR_ORDER_MAX_BODY_CHARS = 50000;

class ApiError extends Error {
  constructor(code, message, retryable, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable === true;
    if (details !== undefined) this.details = details;
  }
}

function apiResponse_(handler) {
  const requestId = Utilities.getUuid();
  try {
    return jsonOutput_(successEnvelope_(handler(), requestId));
  } catch (error) {
    const safeError = normalizeApiError_(error);
    console.error(JSON.stringify({
      requestId: requestId,
      code: safeError.code,
      message: safeError.message,
    }));
    return jsonOutput_(failureEnvelope_(safeError, requestId));
  }
}

function successEnvelope_(data, requestId) {
  return {
    success: true,
    data: data,
    meta: responseMeta_(requestId),
  };
}

function failureEnvelope_(error, requestId) {
  const publicError = {
    code: error.code,
    message: error.message,
    retryable: error.retryable === true,
  };
  if (error.details !== undefined) publicError.details = error.details;
  return {
    success: false,
    error: publicError,
    meta: responseMeta_(requestId),
  };
}

function responseMeta_(requestId) {
  return {
    apiVersion: QR_ORDER_API_VERSION,
    requestId: requestId,
    serverTime: new Date().toISOString(),
  };
}

function normalizeApiError_(error) {
  if (error instanceof ApiError) return error;
  return new ApiError(
    'INTERNAL_ERROR',
    '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    true
  );
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseJsonBody_(event) {
  const contents = event && event.postData ? String(event.postData.contents || '') : '';
  if (!contents) {
    throw new ApiError('INVALID_REQUEST', '요청 본문이 비어 있습니다.', false);
  }
  if (contents.length > QR_ORDER_MAX_BODY_CHARS) {
    throw new ApiError('REQUEST_TOO_LARGE', '요청 본문이 너무 큽니다.', false);
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new ApiError('INVALID_JSON', 'JSON 요청 본문을 확인해 주세요.', false);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('INVALID_REQUEST', '요청 본문은 JSON object여야 합니다.', false);
  }
  if (parsed.apiVersion !== QR_ORDER_API_VERSION) {
    throw new ApiError('UNSUPPORTED_API_VERSION', '지원하지 않는 API 버전입니다.', false);
  }
  return parsed;
}

function apiRoute_(event) {
  const pathInfo = event && event.pathInfo ? String(event.pathInfo) : '';
  const action = event && event.parameter && event.parameter.action
    ? String(event.parameter.action)
    : '';
  return (pathInfo || action)
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}
