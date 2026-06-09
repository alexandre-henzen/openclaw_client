import Router from 'express';
import auth from './auth';
import user from './user';
import agent from './agent';
import conversation from './conversation';
import message from './message';
import channel from './channel';
import plugin from './plugin';
import skill from './skill';
import cron from './cron';
import update from './update';
import gateway from './gateway';
import copilotkit from './copilotkit';
import agui from './agui';
import openclawPairing from './openclaw/pairing';
import artifacts from './artifacts';
import runs from './runs';

const router = Router();

router.use(user);
router.use(agent);
router.use(conversation);
router.use(message);
router.use(channel);
router.use(plugin);
router.use(skill);
router.use(cron);
router.use(auth);
router.use(update);
router.use(gateway);
router.use(copilotkit);
router.use(agui);
router.use(openclawPairing);
router.use(artifacts);
router.use(runs);

export default router;
