// Client-generated node id. The client owns ids (we send them to the backend),
// so grouping can build a new group id locally without a round-trip.
export const newGeoId = (): string => `geo-${crypto.randomUUID()}`
