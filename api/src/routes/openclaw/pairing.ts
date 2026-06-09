import Router, { RequestHandler } from 'express';
import auth from '../../middlewares/auth';
import { bootstrapCopilot } from '../../services/bootstrap';
import * as pairing from '../../services/openclaw/pairing';

const router = Router();

const start: RequestHandler = async (req, res, next) => {
  try {
    await bootstrapCopilot();
    const gatewayProfileId = (req.body?.gatewayProfileId as string) || 'default';
    const result = await pairing.startPairing(gatewayProfileId);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
};

const check: RequestHandler = async (req, res, next) => {
  try {
    await bootstrapCopilot();
    const gatewayProfileId = (req.body?.gatewayProfileId as string) || 'default';
    const result = await pairing.checkPairing(gatewayProfileId);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
};

const approve: RequestHandler = async (req, res, next) => {
  try {
    await bootstrapCopilot();
    const gatewayProfileId = (req.body?.gatewayProfileId as string) || 'default';
    const pairingCode = req.body?.pairingCode as string;
    const result = await pairing.approvePairing(gatewayProfileId, pairingCode);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
};

router.post('/openclaw/pairing/start', auth, start);
router.post('/openclaw/pairing/check', auth, check);
router.post('/openclaw/pairing/approve', auth, approve);

export default router;
