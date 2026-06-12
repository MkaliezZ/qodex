import type { ReplayRequest, ReplayResult } from "../models/replay.js";
import type { ExecutionRecord } from "../models/archive.js";
import type { GraphEventBus } from "../events/bus.js";
import type { ArchiveManager } from "../archive/archive.js";

export class ReplayEngine {
  constructor(
    private archiveManager: ArchiveManager,
    private eventBus: GraphEventBus,
  ) {}

  async replay(request: ReplayRequest): Promise<ReplayResult | null> {
    const archive = this.archiveManager.getArchive(request.archiveId);
    if (!archive) return null;

    this.eventBus.emit({
      type: "replay.requested", archiveId: request.archiveId, replayType: request.type, timestamp: Date.now(),
    });

    const startTime = Date.now();
    let events: ExecutionRecord[] = [];

    switch (request.type) {
      case "graph":
        events = [...archive.records];
        break;
      case "node":
        events = archive.records.filter((r) => r.nodeId === request.nodeId);
        break;
      case "path":
        if (request.nodeIds) {
          events = archive.records.filter((r) => r.nodeId && request.nodeIds!.includes(r.nodeId));
        }
        break;
    }

    archive.replayCount++;

    this.eventBus.emit({
      type: "graph.replayed", graphId: archive.snapshots[0]?.graphId ?? "", replayType: request.type, timestamp: Date.now(),
    });

    this.eventBus.emit({
      type: "replay.completed", archiveId: request.archiveId, eventCount: events.length, timestamp: Date.now(),
    });

    return {
      archiveId: request.archiveId,
      type: request.type,
      events,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}
