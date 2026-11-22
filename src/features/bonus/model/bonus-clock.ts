import { flashNote, type PinballDocument } from '@/shared/document'
import { restoreWellPolarity } from '@/features/magnets'

export function tickBonus(doc: PinballDocument, dtMs: number): void {
  if (doc.chain.bonusMs > 0) {
    doc.chain.bonusMs = Math.max(0, doc.chain.bonusMs - dtMs)
    if (doc.chain.bonusMs === 0) {
      doc.chain.multiplier = 1
      doc.chain.count = 0
      doc.chain.lastZone = null
      doc.chain.remainMs = 0
      // 奖励结束：磁力回到落靶决定的方向
      restoreWellPolarity(doc)
      flashNote(doc, '奖励结束')
    }
    return
  }
  if (doc.chain.remainMs <= 0) return
  doc.chain.remainMs = Math.max(0, doc.chain.remainMs - dtMs)
  if (doc.chain.remainMs === 0) {
    doc.chain.count = 0
    doc.chain.lastZone = null
  }
}

export function clearChain(doc: PinballDocument): void {
  const wasBonus = doc.chain.bonusMs > 0
  doc.chain.count = 0
  doc.chain.lastZone = null
  doc.chain.remainMs = 0
  doc.chain.bonusMs = 0
  doc.chain.multiplier = 1
  // 失球提前结束奖励时，同样把磁力还原回落靶决定的方向
  if (wasBonus) restoreWellPolarity(doc)
}
