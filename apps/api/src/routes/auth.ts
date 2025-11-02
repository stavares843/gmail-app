import { Router } from 'express';
import passport from 'passport';
import { prisma } from '@pkg/db';

const router = Router();

router.get('/google', passport.authenticate('google'));

router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user) => {
      if (err) {
        console.error('OAuth callback error:', {
          error: err,
          stack: err.stack,
          name: err.name,
          message: err.message,
          code: err.code
        });
        if (err.name === 'TokenError') {
          // Token error usually means expired/reused code - redirect to start fresh
          return res.redirect('/auth/google');
        }
        return res.redirect('/auth/failure');
      }
      if (!user) return res.redirect('/auth/failure');
      
      req.logIn(user, (err) => {
        if (err) {
          console.error('Login error:', {
            error: err,
            stack: err.stack,
            name: err.name,
            message: err.message,
            sessionId: req.session?.id
          });
          return res.redirect('/auth/failure');
        }
        console.log('OAuth callback success -', {
          user: (user as any).email,
          sessionId: req.session?.id
        });
        res.redirect((process.env.WEB_URL || 'http://localhost:3000') + '/dashboard');
      });
    })(req, res, next);
  }
);

// Friendly failure page for OAuth errors
router.get('/failure', (req, res) => {
  res.status(500).send('Sign-in failed. If this persists, please try again in a minute or contact support.');
});

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
