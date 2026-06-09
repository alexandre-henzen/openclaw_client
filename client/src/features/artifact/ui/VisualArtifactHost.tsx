import { Box, Typography } from '@mui/material';
import { API_BASE_URL } from '../../../shared/api/baseApi';
import { preferDownloadCard } from '../lib/artifact-display';
import ArtifactDownloadCard from './ArtifactDownloadCard';

type ArtifactRef = {
  id: number;
  artifactId: string;
  protocol: string;
  mimeType?: string;
  title?: string;
  downloadAvailable?: boolean;
  sizeBytes?: number;
};

type Props = {
  artifact: ArtifactRef;
  appSessionToken: string;
};

const IFRAME_PROTOCOLS = new Set(['mcp-app', 'html-sandbox', 'a2ui', 'markdown', 'file']);

export default function VisualArtifactHost({ artifact, appSessionToken }: Props) {
  if (preferDownloadCard(artifact.protocol, artifact.mimeType, artifact.title)) {
    return (
      <ArtifactDownloadCard
        id={artifact.id}
        title={artifact.title ?? artifact.artifactId}
        mimeType={artifact.mimeType}
        appSessionToken={appSessionToken}
        downloadAvailable={artifact.downloadAvailable !== false}
        sizeBytes={artifact.sizeBytes}
      />
    );
  }

  if (IFRAME_PROTOCOLS.has(artifact.protocol)) {
    const frameUrl = `${API_BASE_URL}/artifacts/${artifact.id}/frame?st=${encodeURIComponent(appSessionToken)}`;
    return (
      <Box
        component="iframe"
        data-testid="artifact-iframe"
        src={frameUrl}
        title={artifact.title ?? artifact.artifactId}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        sx={{
          width: '100%',
          minHeight: 280,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          my: 1,
          bgcolor: '#fff',
        }}
      />
    );
  }

  return (
    <Box sx={{ my: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="caption">
        Artefato desconhecido ({artifact.protocol})
      </Typography>
    </Box>
  );
}
