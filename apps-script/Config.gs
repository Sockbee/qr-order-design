/**
 * Canonical bootstrap configuration.
 * Keep this file aligned with docs/qr-order/google-sheets-schema.md.
 */
const QR_ORDER_APP = Object.freeze({
  BOOTSTRAP_VERSION: '1.2.0',
  PROTECTION_PREFIX: 'QR Order bootstrap:',
  HEADER_BACKGROUND: '#1b64da',
  HEADER_FOREGROUND: '#ffffff',
  DATE_FORMAT: 'yyyy-mm-dd hh:mm:ss',
  INTEGER_FORMAT: '0',
  MONEY_FORMAT: '#,##0',
  TEXT_FORMAT: '@',
});

const QR_ORDER_LIMITS = Object.freeze({
  MAX_NOTE_LENGTH: 200,
  HARD_MAX_ORDER_LINES: 100,
  HARD_MAX_OPTIONS_PER_LINE: 50,
  LOCK_TIMEOUT_MS: 10000,
  WRITING_STALE_MS: 30000,
});

const QR_ORDER_ENUMS = Object.freeze({
  SELECTION_TYPE: Object.freeze(['SINGLE', 'MULTIPLE']),
  ORDER_STATUS: Object.freeze([
    'RECEIVED',
    'CONFIRMED',
    'PREPARING',
    'SERVING',
    'COMPLETED',
    'CANCELLED',
  ]),
  PUBLIC_STATUS: Object.freeze(['accepted', 'preparing', 'served', 'closed', 'cancelled']),
  PAYMENT_STATUS: Object.freeze(['UNPAID', 'PAID', 'WAIVED', 'REFUNDED']),
  WRITE_STATE: Object.freeze(['WRITING', 'COMMITTED', 'FAILED']),
  SETTING_TYPE: Object.freeze(['STRING', 'INTEGER', 'BOOLEAN']),
  ACTOR_TYPE: Object.freeze(['SYSTEM', 'STAFF', 'CLIENT']),
});

const QR_ORDER_STATUS_TO_PUBLIC = Object.freeze({
  RECEIVED: 'accepted',
  CONFIRMED: 'accepted',
  PREPARING: 'preparing',
  SERVING: 'served',
  COMPLETED: 'closed',
  CANCELLED: 'cancelled',
});

const QR_ORDER_SHEET_ORDER = Object.freeze([
  'Tables',
  'Categories',
  'Menu',
  'MenuOptionGroups',
  'MenuOptions',
  'Orders',
  'OrderItems',
  'OrderItemOptions',
  'Settings',
  'AuditLogs',
]);

const QR_ORDER_SCHEMA = Object.freeze({
  Tables: Object.freeze({
    headers: Object.freeze([
      'table_id', 'display_name', 'token_hash', 'token_version', 'active',
      'sort_order', 'created_at', 'updated_at',
    ]),
    required: Object.freeze([
      'table_id', 'display_name', 'token_hash', 'token_version', 'active',
      'sort_order', 'created_at', 'updated_at',
    ]),
    unique: Object.freeze(['table_id', 'token_hash']),
    text: Object.freeze(['table_id', 'display_name', 'token_hash']),
    integers: Object.freeze(['token_version', 'sort_order']),
    nonNegative: Object.freeze(['sort_order']),
    positive: Object.freeze(['token_version']),
    dates: Object.freeze(['created_at', 'updated_at']),
    checkboxes: Object.freeze(['active']),
    dropdowns: Object.freeze({}),
    minRows: 100,
  }),
  Categories: Object.freeze({
    headers: Object.freeze(['category_id', 'label', 'heading', 'sort_order', 'active', 'updated_at']),
    required: Object.freeze(['category_id', 'label', 'heading', 'sort_order', 'active', 'updated_at']),
    unique: Object.freeze(['category_id']),
    text: Object.freeze(['category_id', 'label', 'heading']),
    integers: Object.freeze(['sort_order']),
    nonNegative: Object.freeze(['sort_order']),
    positive: Object.freeze([]),
    dates: Object.freeze(['updated_at']),
    checkboxes: Object.freeze(['active']),
    dropdowns: Object.freeze({}),
    minRows: 50,
  }),
  Menu: Object.freeze({
    headers: Object.freeze([
      'menu_id', 'category_id', 'name', 'description', 'base_price', 'image_url',
      'available', 'min_quantity', 'max_quantity', 'allergens', 'origin',
      'badge_tags', 'sort_order', 'updated_at',
    ]),
    required: Object.freeze([
      'menu_id', 'category_id', 'name', 'description', 'base_price', 'available',
      'min_quantity', 'max_quantity', 'sort_order', 'updated_at',
    ]),
    unique: Object.freeze(['menu_id']),
    text: Object.freeze([
      'menu_id', 'category_id', 'name', 'description', 'image_url', 'allergens',
      'origin', 'badge_tags',
    ]),
    integers: Object.freeze(['base_price', 'min_quantity', 'max_quantity', 'sort_order']),
    nonNegative: Object.freeze(['base_price', 'sort_order']),
    positive: Object.freeze(['min_quantity', 'max_quantity']),
    money: Object.freeze(['base_price']),
    dates: Object.freeze(['updated_at']),
    checkboxes: Object.freeze(['available']),
    dropdowns: Object.freeze({}),
    minRows: 300,
  }),
  MenuOptionGroups: Object.freeze({
    headers: Object.freeze([
      'option_group_id', 'menu_id', 'label', 'selection_type', 'required',
      'min_select', 'max_select', 'sort_order', 'active', 'updated_at',
    ]),
    required: Object.freeze([
      'option_group_id', 'menu_id', 'label', 'selection_type', 'required',
      'min_select', 'max_select', 'sort_order', 'active', 'updated_at',
    ]),
    unique: Object.freeze(['option_group_id']),
    text: Object.freeze(['option_group_id', 'menu_id', 'label']),
    integers: Object.freeze(['min_select', 'max_select', 'sort_order']),
    nonNegative: Object.freeze(['min_select', 'max_select', 'sort_order']),
    positive: Object.freeze([]),
    dates: Object.freeze(['updated_at']),
    checkboxes: Object.freeze(['required', 'active']),
    dropdowns: Object.freeze({ selection_type: QR_ORDER_ENUMS.SELECTION_TYPE }),
    minRows: 500,
  }),
  MenuOptions: Object.freeze({
    headers: Object.freeze([
      'option_id', 'option_group_id', 'menu_id', 'name', 'price_delta',
      'available', 'default_selected', 'sort_order', 'updated_at',
    ]),
    required: Object.freeze([
      'option_id', 'option_group_id', 'menu_id', 'name', 'price_delta',
      'available', 'default_selected', 'sort_order', 'updated_at',
    ]),
    unique: Object.freeze(['option_id']),
    text: Object.freeze(['option_id', 'option_group_id', 'menu_id', 'name']),
    integers: Object.freeze(['price_delta', 'sort_order']),
    nonNegative: Object.freeze(['sort_order']),
    positive: Object.freeze([]),
    money: Object.freeze(['price_delta']),
    dates: Object.freeze(['updated_at']),
    checkboxes: Object.freeze(['available', 'default_selected']),
    dropdowns: Object.freeze({}),
    minRows: 1000,
  }),
  Orders: Object.freeze({
    headers: Object.freeze([
      'order_id', 'display_number', 'display_code', 'client_request_id',
      'idempotency_key', 'request_fingerprint', 'table_id', 'status',
      'public_status', 'payment_status', 'total_amount', 'note',
      'write_payload_json', 'write_state', 'status_updated_at', 'created_at',
      'updated_at', 'paid_at', 'cancelled_at', 'cancel_reason',
    ]),
    required: Object.freeze([
      'order_id', 'display_number', 'display_code', 'client_request_id',
      'idempotency_key', 'request_fingerprint', 'table_id', 'status',
      'public_status', 'payment_status', 'total_amount', 'write_payload_json',
      'write_state', 'status_updated_at', 'created_at', 'updated_at',
    ]),
    unique: Object.freeze(['order_id', 'display_number', 'display_code', 'idempotency_key']),
    text: Object.freeze([
      'order_id', 'display_code', 'client_request_id', 'idempotency_key',
      'request_fingerprint', 'table_id', 'note', 'write_payload_json', 'cancel_reason',
    ]),
    integers: Object.freeze(['display_number', 'total_amount']),
    nonNegative: Object.freeze(['total_amount']),
    positive: Object.freeze(['display_number']),
    money: Object.freeze(['total_amount']),
    dates: Object.freeze([
      'status_updated_at', 'created_at', 'updated_at', 'paid_at', 'cancelled_at',
    ]),
    checkboxes: Object.freeze([]),
    dropdowns: Object.freeze({
      status: QR_ORDER_ENUMS.ORDER_STATUS,
      public_status: QR_ORDER_ENUMS.PUBLIC_STATUS,
      payment_status: QR_ORDER_ENUMS.PAYMENT_STATUS,
      write_state: QR_ORDER_ENUMS.WRITE_STATE,
    }),
    minRows: 2000,
  }),
  OrderItems: Object.freeze({
    headers: Object.freeze([
      'order_item_id', 'order_id', 'line_no', 'menu_id', 'menu_name_snapshot',
      'base_price_snapshot', 'unit_price_snapshot', 'quantity', 'line_total',
      'created_at',
    ]),
    required: Object.freeze([
      'order_item_id', 'order_id', 'line_no', 'menu_id', 'menu_name_snapshot',
      'base_price_snapshot', 'unit_price_snapshot', 'quantity', 'line_total',
      'created_at',
    ]),
    unique: Object.freeze(['order_item_id']),
    text: Object.freeze(['order_item_id', 'order_id', 'menu_id', 'menu_name_snapshot']),
    integers: Object.freeze([
      'line_no', 'base_price_snapshot', 'unit_price_snapshot', 'quantity', 'line_total',
    ]),
    nonNegative: Object.freeze(['base_price_snapshot', 'unit_price_snapshot', 'line_total']),
    positive: Object.freeze(['line_no', 'quantity']),
    money: Object.freeze(['base_price_snapshot', 'unit_price_snapshot', 'line_total']),
    dates: Object.freeze(['created_at']),
    checkboxes: Object.freeze([]),
    dropdowns: Object.freeze({}),
    minRows: 5000,
  }),
  OrderItemOptions: Object.freeze({
    headers: Object.freeze([
      'order_item_option_id', 'order_item_id', 'order_id', 'option_id',
      'option_group_name_snapshot', 'option_name_snapshot', 'price_delta_snapshot',
      'sort_order', 'created_at',
    ]),
    required: Object.freeze([
      'order_item_option_id', 'order_item_id', 'order_id', 'option_id',
      'option_group_name_snapshot', 'option_name_snapshot', 'price_delta_snapshot',
      'sort_order', 'created_at',
    ]),
    unique: Object.freeze(['order_item_option_id']),
    text: Object.freeze([
      'order_item_option_id', 'order_item_id', 'order_id', 'option_id',
      'option_group_name_snapshot', 'option_name_snapshot',
    ]),
    integers: Object.freeze(['price_delta_snapshot', 'sort_order']),
    nonNegative: Object.freeze(['sort_order']),
    positive: Object.freeze([]),
    money: Object.freeze(['price_delta_snapshot']),
    dates: Object.freeze(['created_at']),
    checkboxes: Object.freeze([]),
    dropdowns: Object.freeze({}),
    minRows: 10000,
  }),
  Settings: Object.freeze({
    headers: Object.freeze(['key', 'value', 'type', 'description', 'updated_at']),
    required: Object.freeze(['key', 'value', 'type', 'description', 'updated_at']),
    unique: Object.freeze(['key']),
    text: Object.freeze(['key', 'value', 'description']),
    integers: Object.freeze([]),
    nonNegative: Object.freeze([]),
    positive: Object.freeze([]),
    dates: Object.freeze(['updated_at']),
    checkboxes: Object.freeze([]),
    dropdowns: Object.freeze({ type: QR_ORDER_ENUMS.SETTING_TYPE }),
    minRows: 100,
  }),
  AuditLogs: Object.freeze({
    headers: Object.freeze([
      'log_id', 'occurred_at', 'actor_type', 'actor_id', 'action', 'entity_type',
      'entity_id', 'from_value', 'to_value', 'request_id', 'detail_json',
    ]),
    required: Object.freeze([
      'log_id', 'occurred_at', 'actor_type', 'action', 'entity_type', 'entity_id',
    ]),
    unique: Object.freeze(['log_id']),
    text: Object.freeze([
      'log_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'from_value',
      'to_value', 'request_id', 'detail_json',
    ]),
    integers: Object.freeze([]),
    nonNegative: Object.freeze([]),
    positive: Object.freeze([]),
    dates: Object.freeze(['occurred_at']),
    checkboxes: Object.freeze([]),
    dropdowns: Object.freeze({ actor_type: QR_ORDER_ENUMS.ACTOR_TYPE }),
    minRows: 5000,
  }),
});

const QR_ORDER_SETTINGS_DEFAULTS = Object.freeze([
  Object.freeze({
    key: 'EVENT_ID', value: '2026-fall-pub', type: 'STRING',
    description: '행사/로그/캐시 namespace',
  }),
  Object.freeze({
    key: 'STORE_NAME', value: '행복식당 본점', type: 'STRING',
    description: 'S01 매장명',
  }),
  Object.freeze({
    key: 'FRONTEND_BASE_URL', value: 'https://caucse.shop', type: 'STRING',
    description: '테이블 QR URL용 Netlify production origin',
  }),
  Object.freeze({
    key: 'EVENT_OPEN', value: 'TRUE', type: 'BOOLEAN',
    description: '전체 신규 접근 및 주문 on/off',
  }),
  Object.freeze({
    key: 'NOTICE',
    value: '주문은 이 테이블로 전달됩니다. 결제는 식사 후 카운터에서 진행해 주세요.',
    type: 'STRING', description: 'S01 테이블 안내',
  }),
  Object.freeze({
    key: 'ORDER_PREFIX', value: 'A-', type: 'STRING',
    description: '고객 표시 주문번호 접두사',
  }),
  Object.freeze({
    key: 'NEXT_DISPLAY_NUMBER', value: '1042', type: 'INTEGER',
    description: '다음 주문 순번. Script Lock 안에서만 변경',
  }),
  Object.freeze({
    key: 'MAX_ORDER_LINES', value: '20', type: 'INTEGER',
    description: '주문당 최대 line 수',
  }),
  Object.freeze({
    key: 'DEFAULT_MAX_QUANTITY', value: '10', type: 'INTEGER',
    description: '메뉴별 기본 최대 수량',
  }),
  Object.freeze({
    key: 'TIME_ZONE', value: 'Asia/Seoul', type: 'STRING',
    description: '표시 시간대',
  }),
  Object.freeze({
    key: 'STATUS_POLL_SECONDS', value: '15', type: 'INTEGER',
    description: '프론트 주문 상태 polling 기본 주기',
  }),
]);

const QR_ORDER_PROTECTIONS = Object.freeze({
  Tables: Object.freeze([
    Object.freeze({ a1: 'A:A', label: 'table id' }),
    Object.freeze({ a1: 'C:D', label: 'token hash and version' }),
    Object.freeze({ a1: 'G:H', label: 'managed timestamps' }),
  ]),
  Categories: Object.freeze([
    Object.freeze({ a1: 'A:A', label: 'category id' }),
    Object.freeze({ a1: 'F:F', label: 'managed timestamp' }),
  ]),
  Menu: Object.freeze([
    Object.freeze({ a1: 'A:A', label: 'menu id' }),
    Object.freeze({ a1: 'N:N', label: 'managed timestamp' }),
  ]),
  MenuOptionGroups: Object.freeze([
    Object.freeze({ a1: 'A:B', label: 'option group identity' }),
    Object.freeze({ a1: 'J:J', label: 'managed timestamp' }),
  ]),
  MenuOptions: Object.freeze([
    Object.freeze({ a1: 'A:C', label: 'option identity' }),
    Object.freeze({ a1: 'I:I', label: 'managed timestamp' }),
  ]),
  Orders: Object.freeze([
    Object.freeze({ a1: 'A:G', label: 'order identity and idempotency' }),
    Object.freeze({ a1: 'I:I', label: 'derived public status' }),
    Object.freeze({ a1: 'K:S', label: 'amount snapshots and managed state' }),
  ]),
  OrderItems: Object.freeze([
    Object.freeze({ a1: 'A:J', label: 'order item snapshots' }),
  ]),
  OrderItemOptions: Object.freeze([
    Object.freeze({ a1: 'A:I', label: 'order option snapshots' }),
  ]),
  Settings: Object.freeze([
    Object.freeze({ a1: 'A:A', label: 'setting key' }),
    Object.freeze({ a1: 'C:E', label: 'setting metadata' }),
  ]),
  AuditLogs: Object.freeze([
    Object.freeze({ a1: 'A:K', label: 'audit log append-only data' }),
  ]),
});
