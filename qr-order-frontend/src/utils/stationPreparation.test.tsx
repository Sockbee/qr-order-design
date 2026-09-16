import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoKitchenUnits, preparationUnitIds, transitionDemoQueues } from './stationPreparation'
import { StationOrderCard } from '../components/staff/StationOrderCard'
import type { StaffStationOrder } from '../types/staff'

const order: StaffStationOrder = { orderId: 'o1', tableId: 'T17', status: 'new', elapsedMinutes: 2,
  remainingKitchenItemCount: 3, note: null,
  items: [{ itemId: 'food', name: '짜계치', quantity: 3, preparationStatus: 'pending' }] }

describe('individual preparation', () => {
  it('starts only one of three portions and leaves the remaining portions new', () => {
    const kitchen = demoKitchenUnits([order])
    expect(kitchen[0].items.map((item) => item.quantity)).toEqual([1, 1, 1])
    const result = transitionDemoQueues({ kitchen, serving: [] }, kitchen[0], [kitchen[0].items[0].itemId], 'START', 'unused')
    expect(result.kitchen.find((card) => card.status === 'new')?.items).toHaveLength(2)
    expect(result.kitchen.find((card) => card.status === 'cooking')?.items).toHaveLength(1)
    expect(result.serving).toHaveLength(0)
  })
  it('keeps separate completion actions in separate cards and serves only the selected card', () => {
    const kitchen = demoKitchenUnits([order])
    let result = transitionDemoQueues({ kitchen, serving: [] }, kitchen[0], preparationUnitIds(kitchen[0]), 'START', 'unused')
    const cooking = result.kitchen[0]
    result = transitionDemoQueues(result, cooking, [cooking.items[0].itemId], 'COMPLETE', 'batch-a')
    result = transitionDemoQueues(result, result.kitchen[0], preparationUnitIds(result.kitchen[0]), 'COMPLETE', 'batch-b')
    expect(result.serving.map((card) => card.items.length)).toEqual([1, 2])
    expect(result.serving.map((card) => card.cardId)).toEqual(['batch-a', 'batch-b'])
    result = transitionDemoQueues(result, result.serving[0], preparationUnitIds(result.serving[0]), 'SERVE', 'unused')
    expect(result.serving.map((card) => card.cardId)).toEqual(['batch-b'])
    expect(result.serving[0].items).toHaveLength(2)
  })
  it('labels a new portion as start and a cooking portion as complete without marking it done', () => {
    const card = demoKitchenUnits([order])[0]
    const html = renderToStaticMarkup(<StationOrderCard order={card} mode="kitchen" actionLabel="전체 조리 시작" busy={false} onAction={() => {}} />)
    expect(html).toContain('짜계치 1번째 1개 조리 시작')
    expect(html).toContain('짜계치 3번째 1개 조리 시작')
    const cooking = { ...card, status: 'cooking' as const, items: card.items.map((item) => ({ ...item, preparationStatus: 'cooking' as const })) }
    const cookingHtml = renderToStaticMarkup(<StationOrderCard order={cooking} mode="kitchen" actionLabel="전체 완료" busy={false} onAction={() => {}} />)
    expect(cookingHtml).toContain('짜계치 1번째 1개 조리 완료')
    expect(cookingHtml).not.toContain('station-card__item--done')
  })
})
