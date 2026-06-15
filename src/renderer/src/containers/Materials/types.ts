// Domain types — imported by both actions.ts and reducer.ts to avoid circular deps

export interface MaterialsStatus {
  // TODO: define status fields
  version: string
  uptime: number
}

export interface MaterialsStreamEvent {
  type: string
  data: unknown
  timestamp: number
}
