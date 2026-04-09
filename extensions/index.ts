import type { PiRuntime } from "./runtime.ts";
import { initializeProtocolProjection } from "./projection.ts";
import { initializeProtocolRuntime } from "./runtime.ts";

export default function activate(pi: PiRuntime) {
  const fabric = initializeProtocolRuntime(pi);
  initializeProtocolProjection(pi, fabric);
  return fabric;
}
