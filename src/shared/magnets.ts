import { BodyId } from '@/shared/ids'

export type WellPolarity = 'attract' | 'repel'

export interface WellState {
  id: string
  label: string
  chargeMs: number
  polarity: WellPolarity
  /** bonus 在进行时被对调的极性，结束后还原 */
  swapped: boolean
  dwellMs: number
  /** 自动推出冷却剩余时间；>0 时停止吸回并持续轻推 */
  ejectMs: number
  armed: boolean
  field: number
  core: number
}

export interface MagnetState {
  wells: [WellState, WellState]
}

/** 磁力井几何与默认参数，台面上中部左右各一口 */
export const WELL_LAYOUT = [
  { id: BodyId.wellL, label: '左磁力井', x: 128, y: 462 },
  { id: BodyId.wellR, label: '右磁力井', x: 272, y: 462 },
] as const

/** 磁力作用范围半径，球进入这个圆才会被拉 */
export const WELL_FIELD_RADIUS = 46
/** 井心软核半径：进入后改用向心的软弹簧，避免一帧吸到井底重叠 */
export const WELL_CORE_RADIUS = 14
/** 落靶给井供电的持续时间 */
export const WELL_CHARGE_MS = 9000
/** 球在井内停留超过这个时长就被轻轻推出 */
export const WELL_DWELL_LIMIT_MS = 2600
/** 自动推出后的冷却：这段时间不再吸回、持续轻推，确保球能离开井，避免死循环 */
export const WELL_EJECT_MS = 650

export function createWell(id: string, label: string): WellState {
  return {
    id,
    label,
    chargeMs: 0,
    polarity: 'attract',
    swapped: false,
    dwellMs: 0,
    ejectMs: 0,
    armed: false,
    field: WELL_FIELD_RADIUS,
    core: WELL_CORE_RADIUS,
  }
}

export function createMagnetState(): MagnetState {
  return {
    wells: [
      createWell(WELL_LAYOUT[0].id, WELL_LAYOUT[0].label),
      createWell(WELL_LAYOUT[1].id, WELL_LAYOUT[1].label),
    ],
  }
}

/** 一口井当前的实际极性（奖励期间会被对调） */
export function effectivePolarity(well: WellState): WellPolarity {
  if (!well.swapped) return well.polarity
  return well.polarity === 'attract' ? 'repel' : 'attract'
}
