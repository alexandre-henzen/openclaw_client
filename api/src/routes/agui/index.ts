import Router, { RequestHandler } from 'express';
import { bootstrapCopilot } from '../../services/bootstrap';
import { verifyAppSessionToken } from '../../services/security/app-session';
import { getGatewayProfile } from '../../services/gatewayProfileService';
import AppDataSource from '../../data-source';
import { Conversation } from '../../entities';
import { ensureConversationSession } from '../../services/conversationSessionService';
import { proxyToClawgUi } from '../../services/agui/clawg-ui-proxy';
import { pipeWebResponse } from '../../utils/webResponse';
import { logEvent } from '../../services/logging';

const router = Router();

const postAgui: RequestHandler = async (req, res, next) => {
  try {
    await bootstrapCopilot();

    const token =
      (req.headers['x-app-session-id'] as string) ||
      (req.headers['X-App-Session-Id'] as string);
    const conversationIdStr = verifyAppSessionToken(token);
    if (!conversationIdStr) {
      return res.status(401).json({ error: 'missing_or_invalid_app_session_token' });
    }

    const conversationId = Number(conversationIdStr);
    if (!Number.isFinite(conversationId)) {
      return res.status(401).json({ error: 'invalid_conversation_id' });
    }

    const profile = await getGatewayProfile('default');
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });
    if (profile.pairingStatus !== 'paired') {
      return res.status(412).json({
        error: 'gateway_not_paired',
        pairingStatus: profile.pairingStatus,
      });
    }

    const convRepo = AppDataSource.getRepository(Conversation);
    const conv = await convRepo.findOneBy({ _id: conversationId });
    if (!conv) return res.status(404).json({ error: 'conversation_not_found' });

    const { session } = await ensureConversationSession(conversationId, conv.createdBy);
    const input = (req.body ?? {}) as Record<string, unknown>;

    logEvent({ event: 'agui.proxy.dispatch', conversationId, agentId: session.agentId });

    const webRes = await proxyToClawgUi({
      profile,
      session,
      conversationId,
      input,
    });
    await pipeWebResponse(res, webRes);
    return undefined;
  } catch (e) {
    return next(e);
  }
};

router.post('/agui', postAgui);

export default router;
