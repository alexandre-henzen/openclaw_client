import { useEffect, useRef } from 'react';
import { useCopilotChatInternal } from '@copilotkit/react-core';
import { usePollMessagesQuery } from '../../../entities/message/api';
import { legacyMessagesToCopilot } from '../lib/legacyMessagesToCopilot';

type Props = {
  conversationId: string;
};

/**
 * Hydrates CopilotKit message state when the user switches conversations.
 * Poll syncs OpenClaw JSONL into SQLite, then we map rows into AG-UI messages.
 */
export default function CopilotChatHistoryLoader({ conversationId }: Props) {
  const { setMessages } = useCopilotChatInternal();
  const hydratedFor = useRef<string | null>(null);

  const { data, isSuccess, isFetching } = usePollMessagesQuery(
    { conversationId },
    { skip: !conversationId }
  );

  useEffect(() => {
    hydratedFor.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !isSuccess || isFetching || !data) return;
    if (hydratedFor.current === conversationId) return;

    hydratedFor.current = conversationId;
    setMessages(legacyMessagesToCopilot(data.items));
  }, [conversationId, data, isFetching, isSuccess, setMessages]);

  return null;
}
