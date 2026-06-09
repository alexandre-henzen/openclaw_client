import { Box, Link, Typography } from '@mui/material';
import { useListArtifactsQuery } from '../../copilot/api';
import { artifactDownloadHref } from '../lib/artifact-download-href';

type Props = {
  conversationId: number;
  appSessionToken: string;
};

export default function RunCodeArtifactHint({ conversationId, appSessionToken }: Props) {
  const { data } = useListArtifactsQuery(
    { conversationId, appSessionToken },
    { pollingInterval: 2000, skip: !appSessionToken }
  );

  const downloads = (data?.items ?? []).filter(
    (a) => a.protocol === 'download' && a.downloadAvailable !== false
  );

  if (downloads.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        data-testid="run-code-artifact-hint"
        sx={{ mt: 1, fontSize: 13 }}
      >
        O gateway não conseguiu anexar o arquivo na mensagem. Se o export foi gerado, o cartão de
        download aparecerá logo abaixo desta resposta em alguns segundos.
      </Typography>
    );
  }

  return (
    <Box data-testid="run-code-artifact-hint" sx={{ mt: 1.25, fontSize: 13 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        O anexo automático falhou; use os links abaixo ou o cartão abaixo desta resposta:
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
        {downloads.map((a) => (
          <Box component="li" key={a.id}>
            <Link
              href={artifactDownloadHref(a.id, appSessionToken)}
              download
              rel="noopener noreferrer"
            >
              Baixar {a.title ?? 'arquivo'}
            </Link>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
