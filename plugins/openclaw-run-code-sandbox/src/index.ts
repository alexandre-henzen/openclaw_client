// Run Code Sandbox — native gateway tool (RUN_CODE_TOOL_SPEC).
// Registers a single tool `run_code` that executes generated python/node/bash
// in an isolated sandbox and returns stdout/stderr/exit + emitted files.
//
// Backend is pluggable via SANDBOX_BACKEND (resolver.ts). `piston` is the
// default self-hosted backend; `e2b` is an optional SaaS backend.

import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import process from "node:process";

import { LIMITS, type PluginConfig } from "./types.js";
import { resolveSandboxBackend } from "./resolver.js";
import { safeRelativePath } from "./paths.js";

const ConfigSchema = Type.Object({
  SANDBOX_BACKEND: Type.Union(
    [
      Type.Literal("piston"),
      Type.Literal("e2b"),
      Type.Literal("docker"),
      Type.Literal("daytona-oss"),
    ],
    { default: "piston" },
  ),
  PISTON_URL: Type.String({ default: "http://piston:2000/api/v2" }),
  PISTON_RUN_TIMEOUT_MS: Type.Integer({
    minimum: LIMITS.minTimeoutMs,
    maximum: LIMITS.maxTimeoutMs,
    default: LIMITS.defaultTimeoutMs,
  }),
  E2B_API_KEY: Type.String({ default: "" }),
  E2B_TEMPLATE: Type.String({ default: "" }),
  E2B_SANDBOX_TIMEOUT_MS: Type.Integer({
    minimum: LIMITS.minTimeoutMs,
    maximum: 3_600_000,
    default: 300_000,
  }),
  SANDBOX_NETWORK: Type.Union(
    [Type.Literal("none"), Type.Literal("egress")],
    { default: "none" },
  ),
  SANDBOX_ALLOW_NETWORK: Type.Boolean({ default: false }),
});

const FileInput = Type.Object({
  path: Type.String({ maxLength: 256 }),
  content: Type.String({ maxLength: LIMITS.maxFileBytes }),
  encoding: Type.Optional(
    Type.Union([Type.Literal("utf8"), Type.Literal("base64")]),
  ),
});

const RunCodeParams = Type.Object({
  language: Type.Union([
    Type.Literal("python"),
    Type.Literal("node"),
    Type.Literal("bash"),
  ]),
  source: Type.String({ minLength: 1, maxLength: LIMITS.maxSourceBytes }),
  files: Type.Optional(Type.Array(FileInput, { maxItems: LIMITS.maxFiles })),
  collectOutputs: Type.Optional(
    Type.Array(Type.String({ maxLength: 128 }), {
      maxItems: LIMITS.maxCollectGlobs,
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      minimum: LIMITS.minTimeoutMs,
      maximum: LIMITS.maxTimeoutMs,
    }),
  ),
});

export default defineToolPlugin({
  id: "openclaw-run-code-sandbox",
  name: "Run Code Sandbox",
  description:
    "Execute generated python/node/bash in an isolated sandbox (run_code tool).",
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: "run_code",
      label: "Run Code",
      description: [
        "Run generated source code in an isolated sandbox.",
        "USE FOR any code execution, chart/visualization generation, HTML report,",
        "or file produced for the user. Do NOT use exec, canvas, or write for code.",
        "Write artifacts under out/<name>.<ext> by calling emit_file(path, content)",
        "(python) or emitFile(path, content) (node); the tool collects them",
        "automatically into the result's files[] array.",
      ].join(" "),
      parameters: RunCodeParams,
      async execute(params, config, ctx) {
        ctx.signal?.throwIfAborted();
        const cfg = resolveRuntimeConfig(config as PluginConfig);
        const runId = randomId();
        const backend = resolveSandboxBackend(cfg);

        const files = (params.files ?? []).map((f) => ({
          path: safeRelativePath(f.path),
          content: f.content,
          encoding: f.encoding ?? "utf8",
        }));

        const networkAllowed =
          cfg.SANDBOX_NETWORK === "egress" && cfg.SANDBOX_ALLOW_NETWORK;

        return backend.exec({
          runId,
          language: params.language,
          source: params.source,
          files,
          collectOutputs: params.collectOutputs ?? [],
          timeoutMs: params.timeoutMs ?? cfg.PISTON_RUN_TIMEOUT_MS,
          networkAllowed,
          signal: ctx.signal,
        });
      },
    }),
  ],
});

export function resolveRuntimeConfig(config: PluginConfig): PluginConfig {
  const env = process.env;
  return {
    ...config,
    SANDBOX_BACKEND: parseBackend(env.SANDBOX_BACKEND) ?? config.SANDBOX_BACKEND,
    PISTON_URL: env.PISTON_URL ?? config.PISTON_URL,
    PISTON_RUN_TIMEOUT_MS: parseInteger(env.PISTON_RUN_TIMEOUT_MS) ?? config.PISTON_RUN_TIMEOUT_MS,
    E2B_API_KEY: env.E2B_API_KEY ?? config.E2B_API_KEY,
    E2B_TEMPLATE: env.E2B_TEMPLATE ?? config.E2B_TEMPLATE,
    E2B_SANDBOX_TIMEOUT_MS: parseInteger(env.E2B_SANDBOX_TIMEOUT_MS) ?? config.E2B_SANDBOX_TIMEOUT_MS,
    SANDBOX_NETWORK: parseNetwork(env.SANDBOX_NETWORK) ?? config.SANDBOX_NETWORK,
    SANDBOX_ALLOW_NETWORK: parseBoolean(env.SANDBOX_ALLOW_NETWORK) ?? config.SANDBOX_ALLOW_NETWORK,
  };
}

function parseBackend(value: string | undefined): PluginConfig["SANDBOX_BACKEND"] | undefined {
  if (value === "piston" || value === "e2b" || value === "docker" || value === "daytona-oss") return value;
  return undefined;
}

function parseNetwork(value: string | undefined): PluginConfig["SANDBOX_NETWORK"] | undefined {
  if (value === "none" || value === "egress") return value;
  return undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function randomId(): string {
  return (
    "run_" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
