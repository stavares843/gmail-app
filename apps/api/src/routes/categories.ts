import { Router } from 'express';
import { prisma } from '@pkg/db';

const router = Router();

// Middleware to require auth
router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

router.get('/', async (req: any, res) => {
  const userId = req.user.id;
  const categories = await prisma.category.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  res.json({ categories });
});

router.get('/with-counts', async (req: any, res) => {
  const userId = req.user.id;
  const accountId = req.query.accountId as string | undefined;
  const categories = await prisma.category.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const counts = await prisma.email.groupBy({
    by: ['categoryId'],
    where: { userId, deleted: false, ...(accountId ? { accountId } : {}) },
    _count: { _all: true }
  });
  const countMap = new Map<string, number>();
  counts.forEach((c: any) => {
    if (c.categoryId) countMap.set(c.categoryId, c._count._all);
  });
  const data = categories.map(c => ({
    ...c,
    emailCount: countMap.get(c.id) || 0
  }));
  res.json({ categories: data });
});

router.post('/', async (req: any, res) => {
  const userId = req.user.id;
  const { name, description } = req.body;
  const category = await prisma.category.create({ data: { userId, name, description } });
  res.json({ category });
});

router.get('/:id', async (req: any, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) return res.status(404).json({ error: 'Not found' });
  res.json({ category });
});

export default router;
