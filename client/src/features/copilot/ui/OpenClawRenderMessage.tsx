import type { ComponentType } from 'react';
import { useMemo } from 'react';
import {
  UserMessage as DefaultUserMessage,
  ImageRenderer as DefaultImageRenderer,
} from '@copilotkit/react-ui';
import type { AssistantMessageProps, RenderMessageProps } from '@copilotkit/react-ui';
import InlineArtifacts from '../../artifact/ui/InlineArtifacts';

type Props = RenderMessageProps & {
  conversationId: number;
  appSessionToken: string;
  AssistantMessage?: ComponentType<AssistantMessageProps>;
};

function lastAssistantIndex(messages: RenderMessageProps['messages']): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return i;
  }
  return -1;
}

function CopilotDefaultRenderMessage({
  UserMessage = DefaultUserMessage,
  AssistantMessage,
  ImageRenderer = DefaultImageRenderer,
  message,
  messages,
  inProgress,
  index,
  isCurrentMessage,
  onRegenerate,
  onCopy,
  onThumbsUp,
  onThumbsDown,
  messageFeedback,
  markdownTagRenderers,
}: RenderMessageProps & {
  AssistantMessage: ComponentType<AssistantMessageProps>;
}) {
  switch (message.role) {
    case 'user':
      return (
        <UserMessage
          key={index}
          rawData={message}
          data-message-role="user"
          message={message}
          ImageRenderer={ImageRenderer}
        />
      );
    case 'assistant':
      return (
        <AssistantMessage
          key={index}
          data-message-role="assistant"
          subComponent={message.generativeUI?.()}
          rawData={message}
          message={message}
          messages={messages}
          isLoading={inProgress && isCurrentMessage && !message.content}
          isGenerating={inProgress && isCurrentMessage && !!message.content}
          isCurrentMessage={isCurrentMessage}
          onRegenerate={() => onRegenerate?.(message.id)}
          onCopy={onCopy}
          onThumbsUp={onThumbsUp}
          onThumbsDown={onThumbsDown}
          feedback={messageFeedback?.[message.id] || null}
          markdownTagRenderers={markdownTagRenderers}
          ImageRenderer={ImageRenderer}
        />
      );
    default:
      return null;
  }
}

export default function OpenClawRenderMessage({
  conversationId,
  appSessionToken,
  AssistantMessage,
  messages,
  index,
  ...props
}: Props) {
  const lastIdx = useMemo(() => lastAssistantIndex(messages), [messages]);

  if (!AssistantMessage) {
    return null;
  }

  const node = (
    <CopilotDefaultRenderMessage
      {...props}
      messages={messages}
      index={index}
      AssistantMessage={AssistantMessage}
    />
  );

  if (props.message.role !== 'assistant' || index !== lastIdx) {
    return node;
  }

  return (
    <>
      {node}
      <InlineArtifacts conversationId={conversationId} appSessionToken={appSessionToken} />
    </>
  );
}
