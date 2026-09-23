import type { PortalData } from '../types'

/**
 * Persistence seam for the portal. Kept intentionally small so a real backend
 * could replace the mock without touching state or pages.
 */
export interface PortalRepository {
  load(): Promise<PortalData | undefined>
  save(data: PortalData): Promise<void>
  clear(): Promise<void>
  createDemoData(now: Date): PortalData
}
