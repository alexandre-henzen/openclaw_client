import { API_BASE_URL } from '../../../shared/api/baseApi';

export function artifactDownloadHref(artifactRowId: number, appSessionToken: string): string {
  return `${API_BASE_URL}/artifacts/${artifactRowId}/download?st=${encodeURIComponent(appSessionToken)}`;
}
