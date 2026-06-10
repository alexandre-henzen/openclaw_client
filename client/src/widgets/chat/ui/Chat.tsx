import { useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import ChatHeader from './ChatHeader';
import SessionSettingsBar from './SessionSettingsBar';
import {
  OpenClawCopilotChat,
  PairingPanel,
  useGetSessionTokenQuery,
  usePairingCheckMutation,
} from '../../../features/copilot';

interface ChatProps {
  agentId: string;
  conversationId: string;
}

/**
 * CopilotKit + AG-UI chat for a conversation. Legacy MessageList/SSE path
 * was replaced per SPEC-001 (docs/COPILOTKIT_REFACTOR_SPEC.md).
 */
export default function Chat({ agentId, conversationId }: ChatProps) {
  const [showSessionSettings, setShowSessionSettings] = useState(false);
  const [paired, setPaired] = useState<boolean | null>(null);
  const [checkPairing] = usePairingCheckMutation();

  const convId = Number(conversationId);
  const { data: sessionData, isLoading: tokenLoading } = useGetSessionTokenQuery(convId, {
    skip: !Number.isFinite(convId),
  });

  const verifyPairing = useCallback(async () => {
    try {
      const res = await checkPairing().unwrap();
      setPaired(res.status === 'paired');
    } catch {
      setPaired(false);
    }
  }, [checkPairing]);

  useEffect(() => {
    // setPaired only fires after the awaited pairing check resolves (external
    // system sync), never synchronously inside the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (paired === null) verifyPairing();
  }, [paired, verifyPairing]);

  if (paired === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <ChatHeader
        agentId={agentId}
        conversationId={conversationId}
        showSessionSettings={showSessionSettings}
        onToggleSessionSettings={() => setShowSessionSettings((v) => !v)}
      />
      {showSessionSettings && (
        <SessionSettingsBar agentId={agentId} conversationId={conversationId} />
      )}
      {!paired ? (
        <PairingPanel onPaired={() => setPaired(true)} />
      ) : tokenLoading || !sessionData?.appSessionToken ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <OpenClawCopilotChat
          key={conversationId}
          conversationId={conversationId}
          title={`Conversation ${conversationId}`}
          threadId={sessionData.threadId}
          appSessionToken={sessionData.appSessionToken}
        />
      )}
    </Box>
  );
}
