export interface ProctorFeedEvent {
  id: string;
  attemptId: string;
  type: string;
  timestamp: string;
}

/** HTTP snapshots and socket deliveries may overlap or arrive out of order. */
export function mergeProctorEvents(attemptId: string, ...batches: ProctorFeedEvent[][]): ProctorFeedEvent[] {
  const byId = new Map<string, ProctorFeedEvent>();
  for (const batch of batches) {
    for (const event of batch) {
      if (event.attemptId === attemptId) byId.set(event.id, event);
    }
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

type Signals = { trustScore: number; flaggedAt?: string | null };

/** Recording an event only lowers trust and never clears an existing flag. */
export function mergeProctorSignals(current: Signals, incoming: Signals): Signals {
  return { trustScore: Math.min(current.trustScore, incoming.trustScore), flaggedAt: incoming.flaggedAt ?? current.flaggedAt };
}
