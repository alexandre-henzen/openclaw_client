/** Mirror of api/src/services/artifacts/sanitize-media-text.ts */
export function sanitizeAssistantMediaText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*MEDIA:/i.test(line))
    .filter((line) => !/\bmedia\s+failed\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function assistantTextHasBrokenMedia(text: string): boolean {
  return /\bmedia\s+failed\b/i.test(text) || /^\s*MEDIA:/im.test(text);
}
