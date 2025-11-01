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
    console.log('Deserializing user:', id);
    const user = await prisma.user.findUnique({ where: { id } });
    console.log('Found user:', user?.email);
    done(null, user);
  } catch (e) {
    console.error('Deserialize error:', e);
    done(e);
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
    'https://www.googleapis.com/auth/gmail.readonly'
  ],
  passReqToCallback: true
}, async (req, accessToken, refreshToken, params, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value || '';
    const newAccountEmail = email;
    let user;
    
    console.log('OAuth callback - Current session user:', (req.user as any)?.email, 'New account:', newAccountEmail);
    
    // If a user is already logged in, link the new Google account to that user
    if (req.user) {
      console.log('Linking new account to existing user:', (req.user as any).email);
      user = await prisma.user.findUnique({ where: { id: (req.user as any).id } });
      if (!user) {
        console.error('Session user not found in database!');
        // Fallback: find or create by email
        user = await prisma.user.upsert({
          where: { email: (req.user as any).email },
          create: { email: (req.user as any).email, name: (req.user as any).name },
          update: {}
        });
      }
    } else {
      // First-time login flow or separate session
      console.log('No session user, creating/finding user for:', newAccountEmail);
      user = await prisma.user.upsert({
        where: { email },
        create: { email, name: profile.displayName, image: profile.photos?.[0]?.value },
        update: { name: profile.displayName, image: profile.photos?.[0]?.value }
      });
    }

    // Store/Update account
    console.log('Upserting account for user:', user!.email, 'account email:', newAccountEmail);
    const account = await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.id } },
      create: {
        userId: user!.id,
        provider: 'google',
        providerAccountId: profile.id,
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt: params?.expires_in ? new Date(Date.now() + (params.expires_in as number) * 1000) : null,
        emailAddress: email
      },
      update: {
        userId: user!.id, // Ensure it's linked to the current user
        accessToken,
        refreshToken: refreshToken || '',
        scope: (params as any)?.scope || '',
        tokenExpiresAt: params?.expires_in ? new Date(Date.now() + (params.expires_in as number) * 1000) : null,
        emailAddress: email
      }
    });
    
    console.log('Account upserted:', account.id, 'for user:', user!.id);

    return done(null, user!);
  } catch (err) {
    console.error('OAuth callback error:', err);
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
