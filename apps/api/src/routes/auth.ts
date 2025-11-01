import { Router } from 'express';
import passport from 'passport';
import { prisma } from '@pkg/db';

const router = Router();

router.get('/google', passport.authenticate('google'));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/failure', session: true }),
  (req, res) => {
    console.log('OAuth callback - User:', (req.user as any)?.email, 'Session:', req.session?.id);
    res.redirect((process.env.WEB_URL || 'http://localhost:3000') + '/dashboard');
  }
);

router.get('/me', (req, res) => {
  console.log('GET /auth/me - Session:', req.session?.id, 'User:', (req.user as any)?.email || 'none');
  res.json({ user: req.user || null });
});

// List connected accounts for the current user
router.get('/accounts', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const accounts = await prisma.account.findMany({ where: { userId: req.user.id }, select: { id: true, emailAddress: true, provider: true } });
  res.json({ accounts });
});

router.get('/logout', (req, res, next) => {
  req.logout(function(err){
    if (err) return next(err);
    res.redirect('/');
  });
});

export default router;
