import { Router } from 'express';
import { getPlatformStats } from '../repos/stats.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    res.json(await getPlatformStats());
  } catch (err) {
    console.error(
      '[stats] GET / failed:',
      err instanceof Error ? err.message : err
    );
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

export default router;
