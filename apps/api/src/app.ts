import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '@pkg/db';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import emailRoutes from './routes/emails.js';
import taskRoutes from './routes/tasks.js';

const app = express();

// When running behind Fly's proxy, trust it so secure cookies work
app.set('trust proxy', 1);

// Allow Vercel frontend and local development
const allowedOrigins = [
  process.env.WEB_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://gmail-app-ai.vercel.app'
];
app.use(cors({
  origin: (origin, callback) => {
    console.log('Request origin:', origin);
    if (!origin || 
        allowedOrigins.includes(origin) || 
        origin.endsWith('.vercel.app') || 
        origin.endsWith('.fly.dev')) {
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // Cache CORS preflight for 24 hours
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
// Import connect-pg-simple at the top with other imports
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';

// Create a new postgres pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: true,
  saveUninitialized: true,
  proxy: true,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none'
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
    if (!user) {
      console.error('User not found during deserialization:', id);
      return done(null, false);
    }
    done(null, user);
  } catch (e) {
    console.error('Error deserializing user:', {
      error: e,
      stack: (e as Error).stack,
      userId: id
    });
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

    // Compute token expiry as a valid Date or null
    const expiresInSec = (params as any)?.expires_in ? Number((params as any).expires_in) : undefined;
    const tokenExpiresAt = typeof expiresInSec === 'number' && !Number.isNaN(expiresInSec)
      ? new Date(Date.now() + expiresInSec * 1000)
      : null;

    await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.id } },
      create: {
        userId: user!.id,
        provider: 'google',
        providerAccountId: profile.id,
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt,
        emailAddress: newAccountEmail
      },
      update: {
        userId: user!.id,
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt,
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

// Global error handler to log unexpected errors and return a friendly message.
// This will catch errors from Passport/Prisma during OAuth callbacks and log the stack
// so we can diagnose transient DB/connectivity issues without exposing internals to users.
app.use((err: any, _req: any, res: any, _next: any) => {
  try {
    console.error('Unhandled error:', err && err.stack ? err.stack : err);
  } catch (e) {
    console.error('Error while logging error:', e);
  }
  res.status(500).send('Internal server error. Please try again in a moment.');
});

export default app;
