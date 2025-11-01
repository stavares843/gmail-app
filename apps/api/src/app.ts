import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '@pkg/db';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import emailRoutes from './routes/emails';
import taskRoutes from './routes/tasks';

const app = express();

// Allow common dev origins and configured WEB_URL
const allowedOrigins = [
  process.env.WEB_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001'
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (e) {
    done(e as any);
  }
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback',
  scope: [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.readonly',
    // Needed to send unsubscribe emails for mailto: List-Unsubscribe
    'https://www.googleapis.com/auth/gmail.send'
  ],
  passReqToCallback: true
}, async (req, accessToken, refreshToken, params, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value || '';
    const newAccountEmail = email;
    let user;
    if (req.user) {
      user = await prisma.user.findUnique({ where: { id: (req.user as any).id } });
      if (!user) {
        user = await prisma.user.upsert({
          where: { email: (req.user as any).email },
          create: { email: (req.user as any).email, name: (req.user as any).name },
          update: {}
        });
      }
    } else {
      user = await prisma.user.upsert({
        where: { email },
        create: { email, name: profile.displayName, image: profile.photos?.[0]?.value },
        update: { name: profile.displayName, image: profile.photos?.[0]?.value }
      });
    }

    await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.id } },
      create: {
        userId: user!.id,
        provider: 'google',
        providerAccountId: profile.id,
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt: params?.expires_in ? new Date(Date.now() + (params.expires_in as number) * 1000) : null,
        emailAddress: newAccountEmail
      },
      update: {
        userId: user!.id,
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt: params?.expires_in ? new Date(Date.now() + (params.expires_in as number) * 1000) : null,
        emailAddress: newAccountEmail
      }
    });

    return done(null, user!);
  } catch (err) {
    return done(err as any);
  }
}));

app.use('/auth', authRoutes);
app.use('/categories', categoryRoutes);
app.use('/emails', emailRoutes);
app.use('/tasks', taskRoutes);

// Simple health check endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
