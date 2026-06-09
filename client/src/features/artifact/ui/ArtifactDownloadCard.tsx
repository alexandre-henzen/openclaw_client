import { Box, Button, Typography } from '@mui/material';
import { artifactDownloadHref } from '../lib/artifact-download-href';

type Props = {
  id: number;
  title?: string;
  mimeType?: string;
  appSessionToken: string;
  downloadAvailable?: boolean;
  sizeBytes?: number;
};

function formatBytes(n: number | undefined): string {
  if (n === undefined || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function ArtifactDownloadCard({
  id,
  title,
  mimeType,
  appSessionToken,
  downloadAvailable = true,
  sizeBytes,
}: Props) {
  const label = title ?? 'Arquivo';
  const sizeLabel = formatBytes(sizeBytes);

  return (
    <Box
      data-testid="artifact-download-card"
      sx={{
        my: 1,
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        {label}
        {mimeType ? (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            · {mimeType}
          </Typography>
        ) : null}
        {sizeLabel ? (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            · {sizeLabel}
          </Typography>
        ) : null}
      </Typography>
      {downloadAvailable ? (
        <Button
          size="small"
          variant="outlined"
          sx={{ mt: 1 }}
          href={artifactDownloadHref(id, appSessionToken)}
          download
          rel="noopener noreferrer"
        >
          Baixar arquivo
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Arquivo muito grande ou truncado pelo sandbox. Peça ao agente para exportar em partes
          menores.
        </Typography>
      )}
    </Box>
  );
}
