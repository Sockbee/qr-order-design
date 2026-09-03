import { useEffect, useMemo, useState } from 'react'
import { hasStaffApi } from '../api/staff/client'
import { listStaffMembers, mapStaffMembers } from '../api/staff/service'
import { staffMembers as fallbackMembers } from '../data/staff'
import type { StaffMember } from '../types/staff'

interface StaffMembersState {
  members: StaffMember[]
  loading: boolean
}

/**
 * The 학생회 roster behind the 부담 스태프 picker (schema §19).
 *
 * Not polled. The roster is registered before the event and does not change
 * during it, so one fetch per mount is the whole lifecycle — unlike the menu,
 * which staff edit mid-service.
 */
export function useStaffMembers(): StaffMembersState {
  const configured = hasStaffApi()
  const [remote, setRemote] = useState<StaffMember[] | null>(null)

  useEffect(() => {
    if (!configured) return
    let disposed = false
    const controller = new AbortController()
    listStaffMembers(controller.signal)
      .then((response) => {
        if (!disposed) setRemote(mapStaffMembers(response))
      })
      .catch(() => {
        // The picker renders its empty state; the page owns the alert.
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [configured])

  const members = useMemo(() => {
    const base = configured ? remote : fallbackMembers
    // Inactive members stay chargeable historically but cannot be picked.
    return (base ?? []).filter((member) => member.active)
  }, [configured, remote])

  return { members, loading: configured && remote === null }
}
