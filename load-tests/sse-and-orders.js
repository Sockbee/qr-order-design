import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    reads: { executor: 'constant-vus', vus: 80, duration: '2m', exec: 'readOrders' },
    writes: { executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '2m', preAllocatedVUs: 20, exec: 'createOrder' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{operation:read}': ['p(95)<300'],
    'http_req_duration{operation:write}': ['p(95)<800'],
  },
}

const base = __ENV.API_BASE_URL
const tableId = __ENV.TABLE_ID
const tableToken = __ENV.TABLE_TOKEN

export function readOrders() {
  const response = http.post(`${base}/api/v1/customer/orders/list`, JSON.stringify({ tableId, tableToken }), {
    headers: { 'Content-Type': 'application/json' }, tags: { operation: 'read' },
  })
  check(response, { 'orders read succeeds': (result) => result.status === 200 })
  sleep(1)
}

export function createOrder() {
  const response = http.post(`${base}/api/v1/customer/orders/create`, JSON.stringify({
    tableId,
    tableToken,
    clientRequestId: crypto.randomUUID(),
    note: '',
    items: [{ menuId: 'cola', quantity: 1, selectedOptionIds: [] }],
  }), { headers: { 'Content-Type': 'application/json' }, tags: { operation: 'write' } })
  check(response, { 'order create succeeds': (result) => result.status === 200 })
}
