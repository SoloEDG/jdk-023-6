import type { BallState } from '@/shared/document'
import type { WellState } from '@/shared/magnets'
import { effectivePolarity, WELL_CORE_RADIUS, WELL_DWELL_LIMIT_MS, WELL_EJECT_MS } from '@/shared/magnets'

/**
 * 磁力井物理。
 *
 * 设计要点（对应需求）：
 * - 只施加“加速度冲量”，逐子帧累加到球速上，绝不直接改位置，所以不会一帧吸到井底重叠，
 *   也保留了挡板的击球时机；不是一次性冲量，球在作用范围内会持续被拉住。
 * - 进入井心软核后改用向心软弹簧 + 阻尼，让球停在井心附近而不是与井心重叠。
 * - 停留超过 WELL_DWELL_LIMIT_MS 后给一个轻微的向外推出速度，避免永远困在井里。
 * - 极性为 repel（奖励期间对调）时改成持续向外推。
 */

/** 外圈远程吸力的向心加速度（px/s^2） */
const ATTRACT_ACCEL = 1450
/**
 * 软核内向心弹簧劲度。取较大值：球被重力拉偏时，弹簧在很小的偏移处就能抵消重力，
 * 于是球停在井心附近而不会穿出软核；挡板击球的冲量（数百 px/s）仍远大于弹簧约束力，
 * 球照样能被打出，保留击球时机。
 */
const CORE_SPRING = 1800
/**
 * 软核内的磁滞阻尼（每秒速度衰减系数）。磁铁吸住钢珠时会带来很强的拖拽，
 * 用它把入核的动能快速耗散掉，让球在井心处稳定下来；它只衰减速度、从不直接改位置。
 */
const CORE_DAMPING = 11
/** 排斥（极性对调）时的向外加速度 */
const REPEL_ACCEL = 1150
/** 自动推出冷却期间持续向外的轻推加速度 */
const EJECT_ACCEL = 900
/** 触发自动推出瞬间给的向外速度，强到弹簧不会立刻把球拉回 */
const EJECT_KICK = 260
/** 井心附近视为“被井接住”的半径 */
export const WELL_CATCH_RADIUS = WELL_CORE_RADIUS + 4

export interface WellContact {
  wellId: string
  /** 本帧球是否处在井心软核里 */
  inside: boolean
  /** 本帧是否因停留过久被推出 */
  ejected: boolean
}

/**
 * 在一个积分子帧内对球施加某口井的磁力。
 * 仅改速度，不改位置；位置仍由统一的平移步骤处理。
 */
export function applyWellForce(
  ball: BallState,
  well: WellState,
  x: number,
  y: number,
  dtSec: number,
): WellContact | null {
  if (well.chargeMs <= 0) return null
  const dx = x - ball.x
  const dy = y - ball.y
  const dist = Math.hypot(dx, dy)
  if (dist >= well.field) return null

  let nx = 0
  let ny = -1
  if (dist > 1e-4) {
    nx = dx / dist
    ny = dy / dist
  }
  const polarity = effectivePolarity(well)
  let ejected = false

  if (polarity === 'repel') {
    // 对调后变成向外推，仍然是持续力而非瞬传
    ball.vx -= nx * REPEL_ACCEL * dtSec
    ball.vy -= ny * REPEL_ACCEL * dtSec
    return { wellId: well.id, inside: dist <= WELL_CATCH_RADIUS, ejected }
  }

  // 自动推出冷却：停止吸回，沿离井方向持续轻推，让球真正离开井，而不是被弹簧立刻拉回
  if (well.ejectMs > 0) {
    ball.vx -= nx * EJECT_ACCEL * dtSec
    ball.vy -= ny * EJECT_ACCEL * dtSec
    return { wellId: well.id, inside: dist <= WELL_CATCH_RADIUS, ejected: true }
  }

  if (dist <= WELL_CORE_RADIUS) {
    // 软核：向心弹簧 + 磁滞阻尼，球停在井心附近但不与井心重叠
    ball.vx += CORE_SPRING * dx * dtSec
    ball.vy += CORE_SPRING * dy * dtSec
    ball.vx *= Math.exp(-CORE_DAMPING * dtSec)
    ball.vy *= Math.exp(-CORE_DAMPING * dtSec)
  } else {
    // 外圈：持续向心加速度，逐帧累加，球被“拉”向井心
    ball.vx += nx * ATTRACT_ACCEL * dtSec
    ball.vy += ny * ATTRACT_ACCEL * dtSec
  }

  const inside = dist <= WELL_CATCH_RADIUS
  if (inside && well.dwellMs >= WELL_DWELL_LIMIT_MS) {
    // 停留过久：进入推出冷却，由后续帧持续轻推，避免球永远困在井里
    well.ejectMs = WELL_EJECT_MS
    const away = dist > 1e-4 ? { x: -nx, y: -ny } : { x: 0, y: -1 }
    ball.vx += away.x * EJECT_KICK
    ball.vy += away.y * EJECT_KICK
    ejected = true
  }
  return { wellId: well.id, inside, ejected }
}
