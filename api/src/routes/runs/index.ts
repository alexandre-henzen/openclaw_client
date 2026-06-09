import Router, { RequestHandler } from 'express';
import auth from '../../middlewares/auth';
import { abortRun } from '../../services/agui/clawg-ui-proxy';

const router = Router();

const abort: RequestHandler = async (req, res) => {
  const runId = req.params.runId;
  const ok = abortRun(runId);
  return res.json({ aborted: ok });
};

router.delete('/runs/:runId', auth, abort);

export default router;
