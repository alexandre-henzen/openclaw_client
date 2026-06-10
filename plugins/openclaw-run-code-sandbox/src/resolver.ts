import type { PluginConfig, SandboxBackend } from "./types.js";
import { PistonBackend } from "./backends/piston.js";
import { E2BBackend } from "./backends/e2b.js";

// Indirection per AGENTS invariant #25: the tool handler does not import a
// specific backend SDK. Adding a backend = new file under backends/ + entry
// here.
export function resolveSandboxBackend(config: PluginConfig): SandboxBackend {
  switch (config.SANDBOX_BACKEND) {
    case "piston":
      return new PistonBackend({
        baseUrl: config.PISTON_URL,
        runTimeoutMs: config.PISTON_RUN_TIMEOUT_MS,
      });
    case "e2b":
      return new E2BBackend({
        apiKey: config.E2B_API_KEY,
        template: config.E2B_TEMPLATE,
        sandboxTimeoutMs: config.E2B_SANDBOX_TIMEOUT_MS,
      });
    case "docker":
    case "daytona-oss":
      throw new Error(
        `backend_not_implemented:${config.SANDBOX_BACKEND} (tracked in RUN_CODE_TOOL_SPEC §2)`,
      );
    default:
      throw new Error(`invalid_sandbox_backend:${String(config.SANDBOX_BACKEND)}`);
  }
}
