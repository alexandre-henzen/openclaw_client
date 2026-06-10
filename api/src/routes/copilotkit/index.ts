import Router, { RequestHandler } from 'express';
import { CopilotRuntime, copilotRuntimeNodeExpressEndpoint } from '@copilotkit/runtime';
import { HttpAgent } from '@ag-ui/client';
import { bootstrapCopilot } from '../../services/bootstrap';
import auth from '../../middlewares/auth';

// HttpAgent vs AbstractAgent types diverge across @ag-ui/client versions — runtime is fine.
const copilotRuntime = new CopilotRuntime({
  agents: ({ request }: { request: Request }) => {
    const host = request.headers.get('host') ?? 'localhost:18802';
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const aguiUrl = `${proto}://${host}/api/agui`;
    return {
      openclaw: new HttpAgent({ url: aguiUrl }),
    };
  },
} as unknown as ConstructorParameters<typeof CopilotRuntime>[0]);

// Express mounts this router at /api — req.url seen by CopilotKit is /copilotkit, not /api/copilotkit.
const handler = copilotRuntimeNodeExpressEndpoint({
  runtime: copilotRuntime,
  endpoint: '/copilotkit',
});

const router = Router();

const handle: RequestHandler = async (req, res, next) => {
  try {
    await bootstrapCopilot();
    await handler(req, res);
  } catch (e) {
    next(e);
  }
};

router.all('/copilotkit', auth, handle);
router.all('/copilotkit/*', auth, handle);

export default router;
