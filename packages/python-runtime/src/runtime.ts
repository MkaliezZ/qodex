import { PythonRuntimeError } from "./errors.js";
import type {
  AgentFuseSelfCheckResult,
  ManagedPythonRuntimeInfo,
  NativeManagedPythonBridge,
} from "./types.js";

export class ManagedPythonRuntime {
  constructor(private readonly native: NativeManagedPythonBridge) {}

  inspectRuntime(): Promise<ManagedPythonRuntimeInfo> {
    return this.native.inspectRuntime();
  }

  async provisionRuntime(): Promise<ManagedPythonRuntimeInfo> {
    const current = await this.native.inspectRuntime();
    if (!["NotInstalled", "Broken", "UpgradeAvailable"].includes(current.state)) {
      throw new PythonRuntimeError("invalid_state", "Runtime cannot be installed in its current state.");
    }
    return this.native.provisionRuntime();
  }

  async verifyRuntime(): Promise<ManagedPythonRuntimeInfo> {
    const current = await this.native.inspectRuntime();
    if (!["Ready", "Broken", "UpgradeAvailable"].includes(current.state)) {
      throw new PythonRuntimeError("invalid_state", "Runtime is not installed.");
    }
    return this.native.verifyRuntime();
  }

  async repairRuntime(): Promise<ManagedPythonRuntimeInfo> {
    const current = await this.native.inspectRuntime();
    if (current.state !== "Broken") {
      throw new PythonRuntimeError("invalid_state", "Only a broken runtime can be repaired.");
    }
    return this.native.provisionRuntime();
  }

  async removeRuntime(): Promise<ManagedPythonRuntimeInfo> {
    const current = await this.native.inspectRuntime();
    if (!["Ready", "Broken", "UpgradeAvailable"].includes(current.state)) {
      throw new PythonRuntimeError("invalid_state", "Runtime is not installed.");
    }
    return this.native.removeRuntime();
  }

  async selfCheck(): Promise<AgentFuseSelfCheckResult> {
    const current = await this.native.inspectRuntime();
    if (current.state !== "Ready" || current.integrity !== "verified") {
      throw new PythonRuntimeError("runtime_unavailable", "Verified managed runtime is required.");
    }
    return this.native.selfCheck();
  }
}
