import { Router } from 'express';
import { prisma } from '@pkg/db';
import { z } from 'zod';

const router = Router();

router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

router.get('/uncategorized', async (req: any, res) => {
  const userId = req.user.id;
  const accountId = req.query.accountId as string | undefined;
  const emails = await prisma.email.findMany({
    where: { userId, categoryId: null, deleted: false, ...(accountId ? { accountId } : {}) },
    orderBy: { receivedAt: 'desc' }
  });
  res.json({ emails });
});

router.get('/by-category/:categoryId', async (req: any, res) => {
  const userId = req.user.id;
  const categoryId = req.params.categoryId;
  const accountId = req.query.accountId as string | undefined;
  const emails = await prisma.email.findMany({
    where: { userId, categoryId, deleted: false, ...(accountId ? { accountId } : {}) },
    orderBy: { receivedAt: 'desc' }
  });
  res.json({ emails });
});

router.post('/bulk-delete', async (req: any, res) => {
  const userId = req.user.id;
  const schema = z.object({ emailIds: z.array(z.string()) });
  const { emailIds } = schema.parse(req.body);
  await prisma.email.updateMany({ where: { id: { in: emailIds }, userId }, data: { deleted: true } });
  res.json({ ok: true });
});

router.post('/bulk-unsubscribe', async (req: any, res) => {
  const userId = req.user.id;
  const schema = z.object({ emailIds: z.array(z.string()) });
  const { emailIds } = schema.parse(req.body);
  const emails = await prisma.email.findMany({ where: { id: { in: emailIds }, userId } });
  // TODO: enqueue unsubscribe jobs
  res.json({ queued: emails.length });
});

router.get('/:id', async (req: any, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  const email = await prisma.email.findFirst({ where: { id, userId } });
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json({ email });
});

export default router;
