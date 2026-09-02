const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, '')
const tableId = process.env.TABLE_ID
const tableToken = process.env.TABLE_TOKEN
const connectionCount = Number(process.env.CONNECTIONS ?? 100)
const holdMs = Number(process.env.HOLD_MS ?? 120_000)

if (!baseUrl || !tableId || !tableToken) {
  console.error('API_BASE_URL, TABLE_ID and TABLE_TOKEN are required')
  process.exit(2)
}

const controllers = Array.from({ length: connectionCount }, () => new AbortController())
const startedAt = performance.now()

const connections = controllers.map(async (controller, index) => {
  const response = await fetch(`${baseUrl}/api/v1/customer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ tableId, tableToken }),
    signal: controller.signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`connection ${index} failed with HTTP ${response.status}`)
  }
  const reader = response.body.getReader()
  const first = await reader.read()
  if (first.done || !first.value?.length) throw new Error(`connection ${index} received no SSE handshake`)
  return { reader, controller }
})

let active
try {
  active = await Promise.all(connections)
  console.log(`${active.length} SSE connections opened in ${Math.round(performance.now() - startedAt)}ms`)
  await new Promise((resolve) => setTimeout(resolve, holdMs))
  console.log(`all connections remained open for ${holdMs}ms`)
} finally {
  controllers.forEach((controller) => controller.abort())
  await Promise.allSettled(active?.map(({ reader }) => reader.cancel()) ?? [])
}
