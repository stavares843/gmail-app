import { Router } from 'express';
import { google } from 'googleapis';
import { prisma } from '@pkg/db';

const router = Router();

router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

router.post('/sync', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const accounts = await prisma.account.findMany({ 
      where: { userId, provider: 'google' }
    });

    let totalEmails = 0;

    for (const account of accounts) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Get list of emails
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 100 // Start with a smaller batch
      });

      const messages = response.data.messages || [];
      
      for (const message of messages) {
        try {
          // Get full message details
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full'
          });

          const headers = fullMessage.data.payload?.headers || [];
          const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
          const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          const to = headers.find(h => h.name?.toLowerCase() === 'to')?.value;
          const threadId = fullMessage.data.threadId || message.id!;
          const date = new Date(parseInt(fullMessage.data.internalDate || '0'));

          // Extract unsubscribe URLs if available
          const unsubscribeHeader = headers.find(h => h.name?.toLowerCase() === 'list-unsubscribe')?.value || '';
          const unsubscribeUrls = unsubscribeHeader
            .split(',')
            .map(url => url.trim().replace(/[<>]/g, ''))
            .filter(url => url.startsWith('http'));

          // Check if email already exists
          const existingEmail = await prisma.email.findFirst({
            where: {
              accountId: account.id,
              gmailId: message.id!
            }
          });

          if (!existingEmail) {
            // Store new email
            await prisma.email.create({
              data: {
                gmailId: message.id!,
                threadId,
                subject,
                fromAddress: from,
                toAddress: to,
                snippet: fullMessage.data.snippet || '',
                receivedAt: date,
                unsubscribeUrls,
                accountId: account.id,
                userId: req.user.id,
              }
            });
            totalEmails++;
          }
        } catch (messageError) {
          console.error('Error processing message:', message.id, messageError);
          continue;
        }
      }
    }

    res.json({ status: 'success', emailsIngested: totalEmails });
  } catch (error) {
    console.error('Email sync error:', error);
    res.status(500).json({ error: 'Failed to sync emails' });
  }
});

export default router;