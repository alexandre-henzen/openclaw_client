import { CopilotKit } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import type { AssistantMessageProps } from '@copilotkit/react-ui';
import { AssistantMessage as DefaultAssistantMessage } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import '../copilot-chat-layout.css';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../../../shared/api/baseApi';
import RunCodeArtifactHint from '../../artifact/ui/RunCodeArtifactHint';
import { useListArtifactsQuery } from '../api';
import {
  assistantTextHasBrokenMedia,
  sanitizeAssistantMediaText,
} from '../lib/sanitizeMediaText';
import CopilotChatHistoryLoader from './CopilotChatHistoryLoader';
import OpenClawRenderMessage from './OpenClawRenderMessage';

type Props = {
  conversationId: string;
  title: string;
  threadId: string;
  appSessionToken: string;
};

const RUN_CODE_INSTRUCTIONS = [
  'Charts, dashboards (HTML), data-analysis scripts, and user-visible files (CSV, HTML tables, exports) → use `run_code` (E2B/Piston sandbox).',
  'Files reach the artifact tray via `emit_file`/`emitFile` — not via workspace `write`.',
  'CRITICAL: call `emit_file(path, content)` (Python) or `emitFile(path, content)` (Node). Do NOT use `fs.writeFileSync`, `open(path,"w")`, or similar — those are not captured.',
  'HTML must be 100% self-contained: inline SVG, inline CSS, inline JS only. No CDN, no unpkg, no external fonts.',
  'For pie/bar/line charts, hand-roll inline SVG. Ignore framework names (React/D3/Chart.js) — deliver the visual with inline SVG.',
  'After `run_code`, check `files[]`: if empty, fix the script and retry. Read `diagnostics` (e.g. `no_file_emitted`, `external_resources_blocked`) and obey them.',
  'Never use `write`, `write_file`, or `canvas` for HTML/chart generation — only `run_code` + `emit_file`/`emitFile` creates renderable artifacts below your reply.',
].join(' ');

export default function OpenClawCopilotChat({
  conversationId,
  title,
  threadId,
  appSessionToken,
}: Props) {
  const jwt = localStorage.getItem('token') ?? '';
  const convNum = Number(conversationId);

  return (
    <CopilotKit
      key={`${conversationId}:${threadId}`}
      runtimeUrl={`${API_BASE_URL}/copilotkit`}
      agent="openclaw"
      threadId={threadId}
      showDevConsole={false}
      headers={{
        Authorization: `Bearer ${jwt}`,
        'X-App-Session-Id': appSessionToken,
      }}
    >
      <CopilotChatHistoryLoader conversationId={conversationId} />
      <Box
        data-testid="copilot-chat-surface"
        className="openclaw-copilot-shell copilot-chat-light"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          width: '100%',
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <strong>{title}</strong>
          <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: 12 }}>
            thread {threadId.slice(0, 12)}…
          </Box>
        </Box>
        <Box className="openclaw-copilot-surface">
          <CopilotChatWithInlineArtifacts
            conversationId={convNum}
            title={title}
            appSessionToken={appSessionToken}
          />
        </Box>
      </Box>
    </CopilotKit>
  );
}

function CopilotChatWithInlineArtifacts({
  conversationId,
  title,
  appSessionToken,
}: {
  conversationId: number;
  title: string;
  appSessionToken: string;
}) {
  const AssistantMessage = (props: AssistantMessageProps) => (
    <AssistantWithArtifactHint
      {...props}
      conversationId={conversationId}
      appSessionToken={appSessionToken}
    />
  );

  return (
    <CopilotChat
      instructions={RUN_CODE_INSTRUCTIONS}
      labels={{ title, initial: 'Envie uma mensagem para o agente OpenClaw.' }}
      RenderMessage={(props) => (
        <OpenClawRenderMessage
          {...props}
          conversationId={conversationId}
          appSessionToken={appSessionToken}
          AssistantMessage={AssistantMessage}
        />
      )}
      AssistantMessage={AssistantMessage}
    />
  );
}

function AssistantWithArtifactHint({
  conversationId,
  appSessionToken,
  ...props
}: AssistantMessageProps & { conversationId: number; appSessionToken: string }) {
  const rawContent =
    typeof props.message?.content === 'string' ? props.message.content : '';
  const { data } = useListArtifactsQuery(
    { conversationId, appSessionToken },
    { pollingInterval: 1500, skip: !appSessionToken }
  );

  const hasTrayArtifacts = (data?.items ?? []).length > 0;
  const hadBrokenMedia = assistantTextHasBrokenMedia(rawContent);
  let displayContent = rawContent;
  if (/^\s*MEDIA:/im.test(displayContent)) {
    displayContent = sanitizeAssistantMediaText(displayContent);
  }
  if (hasTrayArtifacts && /\bmedia\s+failed\b/i.test(displayContent)) {
    displayContent = sanitizeAssistantMediaText(displayContent);
  }

  const message =
    displayContent !== rawContent && props.message
      ? { ...props.message, content: displayContent }
      : props.message;

  return (
    <>
      <DefaultAssistantMessage {...props} message={message} />
      {hadBrokenMedia && !hasTrayArtifacts ? (
        <RunCodeArtifactHint conversationId={conversationId} appSessionToken={appSessionToken} />
      ) : null}
    </>
  );
}
