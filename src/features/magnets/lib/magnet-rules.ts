import type { ContactEvent } from '@/shared/contacts'
import type { BallState, PinballDocument } from '@/shared/document'
import { BodyId } from '@/shared/ids'
import { WELL_CHARGE_MS, WELL_LAYOUT, type WellState } from '@/shared/magnets'
import { applyWellForce, type WellContact } from '@/features/magnets/lib/magnet-force'

const FLIPPER_IDS = new Set<string>([BodyId.flipL, BodyId.flipR])

function wellById(doc: PinballDocument, id: string): WellState | undefined {
  return doc.magnets.wells.find((well) => well.id === id)
}

function power(well: WellState): void {
  well.chargeMs = Math.max(well.chargeMs, WELL_CHARGE_MS)
}

/**
 * 落靶打下后给对应的井供电：
 * 上落靶 -> 左井，下落靶 -> 右井，中落靶 -> 两口井一起。
 */
export function powerWellFromDrop(doc: PinballDocument, dropId: string): void {
  const [left, right] = doc.magnets.wells
  if (dropId === BodyId.dropA) power(left)
  else if (dropId === BodyId.dropC) power(right)
  else if (dropId === BodyId.dropB) {
    power(left)
    power(right)
  }
}

/** 奖励开始：两口井的磁力方向对调 */
export function swapWellPolarity(doc: PinballDocument): void {
  for (const well of doc.magnets.wells) {
    if (well.swapped) continue
    well.swapped = true
    well.dwellMs = 0
    well.ejectMs = 0
    well.armed = false
  }
  doc.ball.wellId = null
  doc.ball.wellEscapeId = null
}

/** 奖励结束：回到落靶决定的方向（取消对调） */
export function restoreWellPolarity(doc: PinballDocument): void {
  for (const well of doc.magnets.wells) {
    well.swapped = false
    well.dwellMs = 0
    well.ejectMs = 0
    well.armed = false
  }
  doc.ball.wellId = null
  doc.ball.wellEscapeId = null
}

export function tickMagnets(doc: PinballDocument, dtMs: number): void {
  for (const well of doc.magnets.wells) {
    if (well.chargeMs > 0) well.chargeMs = Math.max(0, well.chargeMs - dtMs)
    if (well.ejectMs > 0) well.ejectMs = Math.max(0, well.ejectMs - dtMs)
    if (well.chargeMs === 0) {
      well.dwellMs = 0
      well.ejectMs = 0
      well.armed = false
    }
  }
  if (!doc.ball.wellId) return
  const well = wellById(doc, doc.ball.wellId)
  if (!well || well.chargeMs === 0) {
    doc.ball.wellId = null
    return
  }
  // 推出冷却期间不累计停留时间，球已经在离井
  if (well.ejectMs === 0) well.dwellMs += dtMs
}

/**
 * 在一个积分子帧内叠加所有磁力井的吸力。
 * 只改球速，逐帧累加，球的位置仍由统一平移处理，因此不会瞬移或与井心重叠。
 * 返回本帧最深的一次接触（用于进入/推出判定）。
 */
export function applyMagnetForces(doc: PinballDocument, ball: BallState, dtSec: number): WellContact | null {
  let deepest: WellContact | null = null
  let deepestDist = Infinity
  for (let index = 0; index < WELL_LAYOUT.length; index += 1) {
    const layout = WELL_LAYOUT[index]
    if (!layout) continue
    const well = doc.magnets.wells[index]
    if (!well) continue
    const before = Math.hypot(layout.x - ball.x, layout.y - ball.y)
    const contact = applyWellForce(ball, well, layout.x, layout.y, dtSec)
    if (contact && before < deepestDist) {
      deepestDist = before
      deepest = contact
    }
  }
  return deepest
}

/**
 * 根据本帧磁力接触更新“球被井接住 / 离开井”的状态。
 * 自动推出（ejectMs>0）期间视为正在离井，不再占用井心，确保球能真正出去。
 * 返回 true 表示这一帧球从井心软核里离开了（挑战计数由调用方结合挡板事件判定）。
 */
export function trackWellOccupancy(doc: PinballDocument, contact: WellContact | null): boolean {
  const ball = doc.ball
  const contactWell = contact ? wellById(doc, contact.wellId) : undefined
  const ejecting = Boolean(contactWell && contactWell.ejectMs > 0)
  if (contact?.inside && !ejecting) {
    const well = wellById(doc, contact.wellId)
    if (well && well.chargeMs > 0) {
      if (ball.wellId !== well.id) {
        ball.wellId = well.id
        well.dwellMs = 0
      }
      // 重新进入井心，取消上一次脱出的待击打标记
      ball.wellEscapeId = null
      // 进入软核即标记为“已接住”，之后被打出才计入挑战
      well.armed = true
    }
    return false
  }
  if (!ball.wellId) return false
  const left = wellById(doc, ball.wellId)
  const wasArmed = Boolean(left && left.armed)
  ball.wellId = null
  // 从已接住的井里脱出：记下井 id，等待挡板把球打走来完成一次“井里打出”
  if (wasArmed && left) {
    ball.wellEscapeId = left.id
    left.armed = false
  }
  return wasArmed
}

/**
 * 判定一次“从磁力井里打出”：球先被井接住（armed）、脱出软核，
 * 随后在同一回合被挡板击中。计数后清除待击打标记，避免一次脱出重复计数。
 * 返回本次是否新增了计数。
 */
export function countFlipperSaves(doc: PinballDocument, events: ContactEvent[]): number {
  const escapeId = doc.ball.wellEscapeId
  if (!escapeId) return 0
  const struck = events.some((event) => FLIPPER_IDS.has(event.id))
  if (!struck) return 0
  doc.ball.wellEscapeId = null
  const well = wellById(doc, escapeId)
  if (well) well.armed = false
  doc.live.wellSaves += 1
  return 1
}
