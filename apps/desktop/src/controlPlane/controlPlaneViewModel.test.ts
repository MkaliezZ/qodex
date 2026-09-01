import { describe, expect, it } from "vitest";
import {
  failedControlPlaneView,
  governanceFactLabel,
  runningControlPlaneView,
} from "./controlPlaneViewModel";

describe("control-plane view model", () => {
  it("renders only independently observed false as NO", () => {
    expect(governanceFactLabel({ value: false, provenance: "observed" })).toBe("NO");
    expect(governanceFactLabel({ value: false, provenance: "derived" })).toBe("UNKNOWN");
    expect(governanceFactLabel({ value: "unknown", provenance: "unknown" })).toBe("UNKNOWN");
    expect(governanceFactLabel({ value: true, provenance: "observed" })).toBe("YES");
  });

  it("settles a failed admission view without leaving workers running", () => {
    const failed = failedControlPlaneView(runningControlPlaneView("task", "Review", {}));

    expect(failed.status).toBe("failed");
    expect(failed.workers.map((worker) => worker.status)).toEqual(["failed", "failed"]);
  });
});
