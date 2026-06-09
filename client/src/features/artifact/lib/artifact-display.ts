import { protocolForSandboxOutput, resolveOutputMime } from './mime-policy';

/** True when the tray should render ArtifactDownloadCard (not an iframe). */
export function preferDownloadCard(
  protocol: string,
  mimeType?: string,
  title?: string
): boolean {
  if (protocol === 'download') return true;
  const path = title ?? '';
  const resolved = resolveOutputMime(mimeType, path);
  return (
    protocolForSandboxOutput(mimeType, path) === 'download' ||
    resolved === 'text/csv' ||
    resolved === 'application/pdf'
  );
}
