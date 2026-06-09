import { Box } from '@mui/material';
import { useListArtifactsQuery } from '../../copilot/api';
import VisualArtifactHost from './VisualArtifactHost';

type Props = {
  conversationId: number;
  appSessionToken: string;
};

/** Artefatos no fluxo do chat (após a última resposta do assistente). */
export default function InlineArtifacts({ conversationId, appSessionToken }: Props) {
  const { data } = useListArtifactsQuery(
    { conversationId, appSessionToken },
    { pollingInterval: 1500, skip: !appSessionToken }
  );

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Box className="inline-artifacts" data-testid="inline-artifacts">
      {items.map((a) => (
        <VisualArtifactHost key={a.id} artifact={a} appSessionToken={appSessionToken} />
      ))}
    </Box>
  );
}
