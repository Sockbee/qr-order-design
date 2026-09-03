import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { StaffServicePage } from './StaffServicePage'
import type { ServiceDraftLine } from './StaffServicePage'
import { StaffStationPage } from './StaffStationPage'
import { ServiceChargeDialog } from '../../components/staff/ServiceChargeDialog'
import { SettlementCard } from '../../components/staff/SettlementCard'
import { SettlementDialog } from '../../components/staff/SettlementDialog'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { hasStaffApi } from '../../api/staff/client'
import { createServiceOrder, staffServiceCharge } from '../../api/staff/service'
import { useStaffMembers } from '../../hooks/useStaffMembers'
import { useStaffMenu } from '../../hooks/useStaffMenu'
import { useStaffSettlements } from '../../hooks/useStaffSettlements'
import { formatStaffAmount } from '../../utils/price'

/**
 * A10 — Service Grant. Like A03 this is a full screen rather than a dialog:
 * picking dishes needs the menu grid, and the grant carries two extra
 * required decisions (who pays, and why).
 */
export function StaffServiceRoute() {
  const { tableId = '' } = useParams()
  const navigate = useNavigate()
  const menu = useStaffMenu()
  const roster = useStaffMembers()
  const [draft, setDraft] = useState<ServiceDraftLine[]>([])
  const [chargedStaffId, setChargedStaffId] = useState<string | null>(null)
  const [serviceMessage, setServiceMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => navigate(`/staff/tables/${tableId}`)

  const grossAmount = draft.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  )
  const charge = useMemo(() => staffServiceCharge(grossAmount), [grossAmount])

  const add = (itemId: string) => {
    const item = menu.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    setDraft((current) => {
      const existing = current.find((line) => line.itemId === itemId)
      if (existing) {
        return current.map((line) =>
          line.itemId === itemId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        )
      }
      return [
        ...current,
        { itemId, name: item.name, unitPrice: item.price, quantity: 1 },
      ]
    })
  }

  const changeQuantity = (itemId: string, quantity: number) => {
    setDraft((current) =>
      quantity <= 0
        ? current.filter((line) => line.itemId !== itemId)
        : current.map((line) =>
            line.itemId === itemId ? { ...line, quantity } : line,
          ),
    )
  }

  const submit = () => {
    if (!chargedStaffId) return
    if (!hasStaffApi()) {
      close()
      return
    }
    setSubmitting(true)
    void createServiceOrder(
      tableId,
      chargedStaffId,
      serviceMessage.trim() || null,
      draft.map((line) => ({
        menuId: line.itemId,
        quantity: line.quantity,
      })),
    )
      .then(close)
      .catch(() => {
        setConfirming(false)
        setError(
          '서비스 지급을 저장하지 못했어요. 담은 항목은 그대로 남아 있습니다.',
        )
      })
      .finally(() => setSubmitting(false))
  }

  const selectedMember = roster.members.find(
    (member) => member.staffId === chargedStaffId,
  )

  return (
    <>
      <StaffServicePage
        tableId={tableId}
        categories={menu.categories}
        items={menu.items}
        members={roster.members}
        membersLoading={roster.loading}
        draft={draft}
        chargedStaffId={chargedStaffId}
        serviceMessage={serviceMessage}
        charge={charge}
        submitting={submitting}
        onAdd={add}
        onQuantityChange={changeQuantity}
        onSelectStaff={setChargedStaffId}
        onMessageChange={setServiceMessage}
        onSubmit={() => setConfirming(true)}
        onClose={close}
      />

      {error && (
        <div className="staff-operation-error">
          <StaffInlineAlert
            title="서비스 지급을 완료하지 못했어요"
            detail={error}
            actionLabel="닫기"
            onAction={() => setError(null)}
          />
        </div>
      )}

      {confirming && selectedMember && (
        <ServiceChargeDialog
          tableId={tableId}
          staffName={selectedMember.name}
          serviceMessage={serviceMessage.trim() || null}
          charge={charge}
          lineCount={draft.length}
          submitting={submitting}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

/**
 * B04 — Service Settlement. Reuses the B03 shell verbatim: two titled card
 * sections, one card per person, the same 342px card geometry.
 *
 * B03 has no inspector pane, so the per-person grant list opens in the wide
 * operation dialog rather than in a new panel shell.
 */
export function StaffSettlementRoute() {
  const settlements = useStaffSettlements()
  const navigate = useNavigate()
  const [openStaffId, setOpenStaffId] = useState<string | null>(null)

  useEffect(() => {
    if (settlements.unauthorized) navigate('/staff/login', { replace: true })
  }, [navigate, settlements.unauthorized])

  /*
   * §4.21 returns the whole roster, zero-balance members included, because
   * the roster is the settlement's domain. The screen does not list them:
   * someone who granted nothing owes nothing, and nine cards of ₩0 bury the
   * three people the treasurer actually has to find tonight.
   *
   * Sorted by what they owe, largest first — the same reason B01 sorts by
   * elapsed time rather than by table number.
   */
  const unsettled = settlements.members
    .filter((member) => !member.settled && member.chargeAmount > 0)
    .sort((a, b) => b.chargeAmount - a.chargeAmount)
  const settled = settlements.members.filter((member) => member.settled)
  const unsettledTotal = unsettled.reduce(
    (sum, member) => sum + member.chargeAmount,
    0,
  )
  const open = settlements.members.find(
    (member) => member.staffId === openStaffId,
  )

  return (
    <>
      <StaffStationPage
        title="서비스 정산"
        summary={
          settlements.loading
            ? null
            : `미정산 ${unsettled.length}명 · ${formatStaffAmount(
                unsettledTotal,
              )} · 완료 ${settled.length}명`
        }
        counts={null}
        serviceCount={unsettled.length}
        loading={settlements.loading}
        errorMessage={settlements.error?.message}
        onRetry={settlements.retry}
        sections={[
          {
            id: 'unsettled',
            title: '미정산',
            count: unsettled.length,
            empty: {
              title: '수금할 인원이 없어요',
              body: '서비스 지급이 생기면 여기에 표시됩니다',
            },
            cards: unsettled.map((member) => (
              <SettlementCard
                key={member.staffId}
                member={member}
                onOpen={setOpenStaffId}
              />
            )),
          },
          {
            id: 'settled',
            title: '정산 완료',
            count: settled.length,
            empty: {
              title: '아직 정산 완료된 인원이 없어요',
              body: '수금을 기록하면 여기로 옮겨집니다',
            },
            cards: settled.map((member) => (
              <SettlementCard
                key={member.staffId}
                member={member}
                onOpen={setOpenStaffId}
              />
            )),
          },
        ]}
      />

      {open && (
        <SettlementDialog
          member={open}
          submitting={settlements.busyId === open.staffId}
          onConfirm={(staffId, expected) =>
            settlements.confirm(staffId, expected, () => setOpenStaffId(null))
          }
          onCancel={() => setOpenStaffId(null)}
        />
      )}
    </>
  )
}
