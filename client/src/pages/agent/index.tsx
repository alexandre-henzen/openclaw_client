import { useParams } from 'react-router';
import { Box, Typography } from '@mui/material';
import { Chat } from '../../widgets/chat';

export default function AgentChatPage() {
  const { agentId, conversationId } = useParams<{ agentId: string; conversationId: string }>();

  if (!agentId || !conversationId) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">Select a conversation to start chatting</Typography>
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
        minWidth: 0,
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Chat agentId={agentId} conversationId={conversationId} />
    </Box>
  );
}
