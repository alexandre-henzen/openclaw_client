import { List } from '../../@types/skill';
import * as ocService from '../../services/openclaw';

export const list: List = async (_req, res, next) => {
  try {
    return res.json(ocService.listSkills());
  } catch (error) {
    return next(error);
  }
};
