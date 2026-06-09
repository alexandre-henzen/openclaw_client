const DENY = ['authorization', 'cookie', 'clawg_ui_device_token', 'operator_token', 'x-openclaw-session-key'];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DENY.some((d) => k.toLowerCase().includes(d))) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logEvent(payload: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...redact(payload),
  });
  console.log(line);
}
