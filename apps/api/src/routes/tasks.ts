import { Router } from 'express';
import { prisma } from '@pkg/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGmailClient } from '../utils/gmail-auth';

const router = Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function extractUnsubscribeLinks(raw: string, headers: Record<string, string | undefined>): Promise<string[]> {
  const urls = new Set<string>();
  const headerList = headers['list-unsubscribe'];
  if (headerList) {
    const matches = headerList.match(/<([^>]+)>/g) || [];
    matches.forEach((m) => urls.add(m.replace(/[<>]/g, '')));
    const mailtoMatches = headerList.match(/mailto:[^,>\s]+/g) || [];
    mailtoMatches.forEach((u) => urls.add(u));
  }
  const bodyUrls = raw.match(/https?:\/\/[^\s"']+/g) || [];
  bodyUrls.filter(u => /unsubscribe|optout|opt-out|preferences/i.test(u)).forEach(u => urls.add(u));
  return Array.from(urls);
}

type CatOption = { id: string; name: string; description: string };

function normalize(s?: string) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

function isGenericCategoryName(name?: string) {
  const s = normalize(name);
  return ['test', 'test1', 'misc', 'general', 'uncategorized', 'other', 'default'].includes(s);
}

async function ensureCategory(userId: string, name: string, description: string) {
  // Try to find by case-insensitive/similar name first
  const existingExact = await prisma.category.findFirst({ where: { userId, name } });
  if (existingExact) return existingExact;

  // Fuzzy reuse by token similarity to avoid near-duplicate categories
  const existingAll = await prisma.category.findMany({ where: { userId } });
  const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
  const a = tokens(name);
  function jaccard(A: Set<string>, B: Set<string>) {
    const inter = new Set([...A].filter(x => B.has(x)));
    const union = new Set([...A, ...B]);
    return union.size === 0 ? 0 : inter.size / union.size;
  }
  let best: any = null;
  let bestSim = 0;
  for (const c of existingAll) {
    if (isGenericCategoryName(c.name)) continue;
    const sim = jaccard(a, tokens(c.name));
    if (sim > bestSim) { bestSim = sim; best = c; }
  }
  if (best && bestSim >= 0.6) {
    // Reuse the most similar existing category
    return best;
  }
  // Use upsert on the compound unique (userId, name)
  return prisma.category.upsert({
    where: { userId_name: { userId, name } },
    update: { description },
    create: { userId, name, description }
  });
}

function bestCategoryMatch(name: string | undefined, options: CatOption[]): { id?: string; name?: string } {
  const n = normalize(name);
  if (!n) return {};
  // Exact name match (case-insensitive)
  const exact = options.find(o => normalize(o.name) === n);
  if (exact) return { id: exact.id, name: exact.name };
  // Contains match
  const contains = options.find(o => n.includes(normalize(o.name)) || normalize(o.name).includes(n));
  if (contains) return { id: contains.id, name: contains.name };
  // Simple heuristic keywords
  const keywords: Record<string, string[]> = {
    promotions: ['deal', 'sale', 'offer', 'promo', 'discount', 'coupon'],
    newsletters: ['newsletter', 'digest', 'update', 'roundup', 'recap'],
    social: ['follow', 'like', 'comment', 'mention'],
    finance: ['invoice', 'receipt', 'payment', 'billing', 'statement'],
    travel: ['flight', 'hotel', 'booking', 'itinerary', 'reservation']
  };
  for (const opt of options) {
    const on = normalize(opt.name);
    for (const [key, words] of Object.entries(keywords)) {
      if (on.includes(key) && words.some(w => n.includes(w))) {
        return { id: opt.id, name: opt.name };
      }
    }
  }
  return {};
}

function suggestCategoryByKeywords(content: string): { name: string; description: string } | undefined {
  const text = (content || '').toLowerCase();
  const tests: Array<{ name: string; description: string; patterns: RegExp[] }> = [
    { name: 'Receipts', description: 'Purchase confirmations, invoices, and payment receipts', patterns: [/receipt|invoice|payment|order|subtotal|total|purchased|stripe|paypal|thanks for your purchase/gi] as any },
    { name: 'Verification', description: 'Email verifications, activations, and security confirmations', patterns: [/verify|verification|confirm|activate|activation|one-time code|otp|2fa|action required/gi] as any },
    { name: 'Jobs', description: 'Job applications, interview invites, and career opportunities', patterns: [/job|career|interview|application|role|hiring|position/gi] as any },
    { name: 'Marketing', description: 'Promotions, newsletters, and offers', patterns: [/newsletter|unsubscribe|promo|offer|sale|discount|deal|limited time/gi] as any },
    { name: 'Shipping', description: 'Delivery updates and tracking notifications', patterns: [/shipped|delivered|tracking|on the way|carrier|courier/gi] as any },
    { name: 'Finance', description: 'Bank statements, billing, and subscription updates', patterns: [/statement|billing|invoice|subscription|charge|payment/gi] as any },
  ];
  for (const t of tests) {
    if (t.patterns.some((re) => re.test(text))) {
      return { name: t.name, description: t.description };
    }
  }
  return undefined;
}

function sanitizeSummary(input?: string): string | undefined {
  if (!input) return undefined;
  let text = input.replace(/\s+/g, ' ').trim();
  const banned = /(because|indicat|fits?\s+best|given that|therefore|we (decided|classif)|classified|category|best (match|fit)|rationale|reason|this (suggests|indicates)|due to)/i;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !banned.test(s));
  text = (kept[0] ? kept[0] + (kept[1] ? ' ' + kept[1] : '') : sentences[0] || '').trim();
  if (text.length > 200) text = text.slice(0, 200).replace(/[\s,;]+[^\s]*$/, '');
  return text;
}

// Very lightweight fallback summarizer when AI is unavailable.
function simpleSummaryFromContent(content: string): string {
  try {
    const MAX = 180;
    const lines = (content || '')
      .replace(/\r/g, '')
      .split(/\n+/)
      .map(l => l.trim())
      .filter(Boolean);
    // Prefer subject line if present (first non-empty line that isn't From/To)
    let subject = lines.find(l => !/^from:/i.test(l) && !/^to:/i.test(l)) || '';
    // Build a body text excluding common footers/disclaimers
    const body = lines
      .filter(l => !/^from:/i.test(l) && !/^to:/i.test(l))
      .join(' ')
      .replace(/https?:\/\/\S+/g, '') // strip links
      .replace(/unsubscribe|opt\s*out|privacy\s*policy|view\s*in\s*browser/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Take first sentence-like chunk
    const sentences = body.split(/(?<=[.!?])\s+/).filter(s => s.length >= 8);
    let first = (sentences[0] || body.slice(0, MAX)).trim();
    // If subject duplicates first words, avoid repetition
    if (subject && first.toLowerCase().startsWith(subject.toLowerCase())) subject = '';
    let summary = subject ? `${subject} — ${first}` : first;
    if (summary.length > MAX) summary = summary.slice(0, MAX).replace(/[\s,;]+[^\s]*$/, '');
    // Final cleanup
    summary = summary.replace(/\s+/g, ' ').trim();
    return summary || 'Recent email update';
  } catch {
    return 'Recent email update';
  }
}

async function proposeCategoryFromContent(
  content: string,
  userId: string,
  categories: CatOption[]
): Promise<{ id: string; name: string; description: string } | undefined> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: 'You name email categories. Output JSON only.',
    generationConfig: { responseMimeType: 'application/json' }
  });
  const prompt = `Derive a concise, human-friendly category name for this single email. Base only on content. Avoid generic names like test/misc/other/general. Return JSON only:
{
  "name": "<1-3 words, e.g., Receipts, Email Verification>",
  "description": "<short description of what belongs here>"
}

Email:\n${content.slice(0, 8000)}`;
  try {
    const r = await model.generateContent(prompt);
    const t = r.response.text();
    const m = t.match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : t);
    const name = (p.name || '').toString().trim();
    const description = (p.description || '').toString().trim();
    if (!name) return undefined;
  const existing = categories.find(c => normalize(c.name) === normalize(name));
  if (existing) return { id: existing.id, name: existing.name, description: existing.description } as any;
  const created = await ensureCategory(userId, name, description);
    console.log(`Created AI-derived category: ${created.name} (${created.id})`);
    return { id: created.id, name: created.name, description: created.description } as any;
  } catch (e) {
    console.error('proposeCategoryFromContent error:', (e as any)?.message || e);
    return undefined;
  }
}

async function summarizeAndCategorize(
  content: string,
  categories: CatOption[],
  userId: string
): Promise<{ categoryId?: string; category?: string; summary?: string; newCategory?: { name: string; description: string } }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: `You are a categorization service. Do not include your reasoning. Output JSON only and nothing else.`,
    generationConfig: { responseMimeType: 'application/json' }
  });
  
  const prompt = `Analyze this email and either:
1. Match it to an existing category (if there's a good fit), OR
2. Suggest a NEW category to create (if no good match exists)

Existing categories (if none are relevant, choose create):
${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, description: c.description })))}

Email to categorize:
${content.slice(0, 8000)}

Avoid selecting generic buckets like "test", "misc", "other", or "general". If only generic categories exist, prefer creating a new category with a meaningful name.

Return JSON only (no extra text) with ONE of these structures. The summary MUST describe the email's content in neutral terms, not your reasoning or classification logic. Avoid phrases like "this indicates", "fits best", "because", "we classify". Keep it to 1-2 sentences, max 180 characters.

Return JSON with ONE of these structures:

Option A (existing category match):
{
  "action": "match",
  "categoryId": "<id from existing list>",
  "summary": "<2 sentences>"
}

Option B (suggest new category):
{
  "action": "create",
  "newCategory": {
    "name": "<short category name like 'Receipts' or 'Jobs'>",
    "description": "<what types of emails belong here>"
  },
  "summary": "<2 sentences>"
}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    // If model chose to create a new category, or matched a poor/generic category, prefer smart creation/reuse
    const poorNames = new Set(['test', 'test1', 'misc', 'general', 'uncategorized', 'other']);
    const matched = parsed.categoryId ? categories.find(c => c.id === parsed.categoryId) : undefined;

    if (parsed.action === 'create' && parsed.newCategory) {
      // Create or reuse the new category
      const newCat = await ensureCategory(userId, parsed.newCategory.name, parsed.newCategory.description);
      console.log(`Created new category: ${newCat.name} (${newCat.id})`);
      return {
        categoryId: newCat.id,
        category: newCat.name,
        summary: sanitizeSummary(parsed.summary),
        newCategory: parsed.newCategory
      };
    } else {
      // If matched to an existing generic bucket (e.g., 'test'), run a second-pass AI naming to derive a better category
      if (matched && poorNames.has(normalize(matched.name))) {
        const createdOrExisting = await proposeCategoryFromContent(content, userId, categories);
        if (createdOrExisting) {
          return {
            categoryId: createdOrExisting.id,
            category: createdOrExisting.name,
            summary: sanitizeSummary(parsed.summary as string | undefined),
            newCategory: { name: createdOrExisting.name, description: createdOrExisting.description }
          };
        }
        // Fallback if AI naming fails: derive by keywords
        const keywordSuggestion = suggestCategoryByKeywords(content);
        if (keywordSuggestion) {
          const created = await ensureCategory(userId, keywordSuggestion.name, keywordSuggestion.description);
          console.log(`Created keyword-derived category: ${created.name} (${created.id})`);
          return {
            categoryId: created.id,
            category: created.name,
            summary: sanitizeSummary(parsed.summary as string | undefined),
            newCategory: keywordSuggestion
          };
        }
      }
      return {
        categoryId: parsed.categoryId as string | undefined,
        category: matched?.name,
        summary: sanitizeSummary(parsed.summary as string | undefined)
      };
    }
  } catch (err: any) {
    console.error('Gemini error:', err.message);
    // Fallback to rule-based
    const lower = content.toLowerCase();
    for (const cat of categories) {
      const keywords = [...cat.name.toLowerCase().split(/\W+/), ...cat.description.toLowerCase().split(/\W+/)];
      if (keywords.some(kw => kw.length > 3 && lower.includes(kw))) {
        return { categoryId: cat.id, category: cat.name, summary: simpleSummaryFromContent(content) };
      }
    }
    return { categoryId: undefined, category: undefined, summary: simpleSummaryFromContent(content) };
  }
}

router.post('/ingest', async (req: any, res) => {
  const daysReq = Math.max(1, Math.min(30, Number(req.body?.days) || 30));
  const maxReq = Math.max(1, Math.min(50, Number(req.body?.max) || 50));
  console.log(`POST /tasks/ingest - Starting ingestion... days=${daysReq}, max=${maxReq}`);
  // Poll all accounts for new emails, categorize, summarize, store, archive
  const accounts = await prisma.account.findMany();
  console.log(`Found ${accounts.length} accounts to process`);
  const results: any[] = [];
  for (const account of accounts) {
    try {
      console.log(`Processing account ${account.id} (${account.emailAddress})`);
      const gmail = await getGmailClient(account.id);
      console.log('Gmail client created');
      
      // Check for existing cursor (history-based incremental ingestion)
      const cursor = await prisma.ingestCursor.findUnique({ where: { accountId: account.id } });
      let query = `newer_than:${daysReq}d -in:drafts -in:spam -in:trash`;
      
      // For MVP, still use date-based query, but store historyId for future
      console.log(`Fetching messages with query: ${query} (max=${maxReq})`);
      let list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: maxReq });
      let messages = list.data.messages || [];
      if ((messages?.length || 0) === 0 && daysReq < 30) {
        // Retry with 30d if initial window returned no results
        query = `newer_than:30d -in:drafts -in:spam -in:trash`;
        console.log(`No messages with ${daysReq}d. Retrying with query: ${query}`);
        list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: maxReq });
        messages = list.data.messages || [];
      }
      const user = await prisma.user.findUnique({ where: { id: account.userId } });
      const categories = await prisma.category.findMany({ where: { userId: account.userId } });
      console.log(`Found ${messages.length} messages to process`);
      for (const m of messages) {
        if (!m.id) continue;
        const exists = await prisma.email.findUnique({ where: { accountId_gmailId: { accountId: account.id, gmailId: m.id } } });
        // If already imported and categorized, skip; if uncategorized, try to categorize now
        if (exists && exists.categoryId) continue;
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
        const payload = msg.data.payload;
        const headers: Record<string, string | undefined> = {};
        payload?.headers?.forEach(h => { if (h.name && h.value) headers[h.name.toLowerCase()] = h.value; });
        const subject = headers['subject'];
        const from = headers['from'];
        const to = headers['to'];
        const snippet = msg.data.snippet || '';
        // extract bodies
        function getBody(p?: any): { text?: string; html?: string } {
          if (!p) return {};
          const mime = p.mimeType;
          if (p.parts) {
            let res: { text?: string; html?: string } = {};
            for (const part of p.parts) {
              const child = getBody(part);
              res = { text: res.text || child.text, html: res.html || child.html };
            }
            return res;
          }
          const data = p.body?.data ? Buffer.from(p.body.data, 'base64').toString('utf8') : undefined;
          if (!data) return {};
          if (mime?.includes('text/plain')) return { text: data };
          if (mime?.includes('text/html')) return { html: data };
          return {};
        }
        const bodies = getBody(payload);
        const rawBody = bodies.text || '';
        const htmlBody = bodies.html || undefined;

        const unsubUrls = await extractUnsubscribeLinks((rawBody || '') + '\n' + (htmlBody || ''), headers);

        const contentForAI = `${subject || ''}\nFrom: ${from || ''}\nTo: ${to || ''}\n\n${rawBody || ''}`;
        const ai = await summarizeAndCategorize(contentForAI, categories.map(c => ({ id: c.id, name: c.name, description: c.description })), account.userId);
        let categoryId: string | undefined = ai.categoryId;
        if (!categoryId && ai.category) {
          const best = bestCategoryMatch(ai.category, categories as any);
          categoryId = best.id;
        }

        if (!exists) {
          const created = await prisma.email.create({ data: {
            userId: account.userId,
            accountId: account.id,
            gmailId: m.id,
            threadId: msg.data.threadId || '',
            subject: subject || null,
            fromAddress: from || null,
            toAddress: to || null,
            receivedAt: new Date(Number(msg.data.internalDate) || Date.now()),
            snippet,
            rawBody,
            htmlBody,
            unsubscribeUrls: unsubUrls,
            categoryId: categoryId || null,
            aiCategory: ai.category || null,
            aiSummary: ai.summary || null,
            archived: false,
          }});
          // Archive email
          await gmail.users.messages.modify({ userId: 'me', id: m.id, requestBody: { removeLabelIds: ['INBOX'] } });
          await prisma.email.update({ where: { id: created.id }, data: { archived: true } });
        } else {
          // Update existing uncategorized email with new category/summary
          await prisma.email.update({ where: { id: exists.id }, data: {
            categoryId: categoryId || null,
            aiCategory: ai.category || exists.aiCategory,
            aiSummary: ai.summary || exists.aiSummary,
          }});
        }
      }
      
      // Update cursor with latest historyId (for future incremental ingestion via History API)
      if (messages.length > 0) {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const latestHistoryId = profile.data.historyId;
        if (latestHistoryId) {
          await prisma.ingestCursor.upsert({
            where: { accountId: account.id },
            create: { accountId: account.id, historyId: latestHistoryId, lastCheckedAt: new Date() },
            update: { historyId: latestHistoryId, lastCheckedAt: new Date() }
          });
        }
      }
      
      results.push({ accountId: account.id, imported: messages.length, queryUsed: query });
      console.log(`Account ${account.id} completed: ${messages.length} imported (queryUsed=${query})`);
    } catch (e: any) {
      console.error(`Error processing account ${account.id}:`, e.message);
      results.push({ accountId: account.id, error: e.message });
    }
  }
  console.log('Ingestion complete, sending response');
  res.json({ results });
});

router.post('/unsubscribe', async (req: any, res) => {
  const { emailIds } = req.body;
  if (!Array.isArray(emailIds)) return res.status(400).json({ error: 'emailIds must be an array' });
  
  const emails = await prisma.email.findMany({ where: { id: { in: emailIds } } });
  const results: any[] = [];
  
  for (const email of emails) {
    if (email.unsubscribeUrls.length === 0) {
      results.push({ emailId: email.id, status: 'no-urls' });
      continue;
    }
    
    // Mark as pending
    await prisma.email.update({ where: { id: email.id }, data: { unsubscribeStatus: 'pending' } });
    
    try {
      // Simple immediate processing for MVP (no queue)
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      
      let success = false;
      for (const url of email.unsubscribeUrls) {
        if (url.startsWith('mailto:')) continue; // Skip mailto links for MVP
        
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
          
          // Heuristics: look for unsubscribe/opt-out buttons
          const selectors = [
            'button:has-text("unsubscribe")',
            'button:has-text("opt out")',
            'a:has-text("unsubscribe")',
            'a:has-text("opt out")',
            'input[type="submit"]:has-text("unsubscribe")',
            'button:has-text("confirm")',
            'button:has-text("yes")'
          ];
          
          for (const selector of selectors) {
            try {
              const element = await page.locator(selector).first();
              if (await element.isVisible({ timeout: 2000 })) {
                await element.click();
                await page.waitForTimeout(2000); // Wait for action to complete
                success = true;
                break;
              }
            } catch {}
          }
          
          if (success) break;
        } catch (e: any) {
          console.error(`Failed to process ${url}:`, e.message);
        }
      }
      
      await browser.close();
      
      await prisma.email.update({
        where: { id: email.id },
        data: {
          unsubscribedAt: success ? new Date() : null,
          unsubscribeStatus: success ? 'success' : 'failed'
        }
      });
      
      results.push({ emailId: email.id, status: success ? 'success' : 'failed' });
    } catch (e: any) {
      await prisma.email.update({
        where: { id: email.id },
        data: { unsubscribeStatus: 'failed' }
      });
      results.push({ emailId: email.id, status: 'error', error: e.message });
    }
  }
  
  res.json({ results });
});

// Re-categorize existing uncategorized emails for the current user without fetching Gmail
router.post('/recategorize', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = req.user.id as string;
  const limit = Math.max(1, Math.min(500, Number(req.body?.limit) || 200));
  try {
    const categories = await prisma.category.findMany({ where: { userId } });
    const poorCatIds = categories.filter(c => isGenericCategoryName(c.name)).map(c => c.id);
    const emails = await prisma.email.findMany({
      where: {
        userId,
        OR: [
          { categoryId: null },
          poorCatIds.length > 0 ? { categoryId: { in: poorCatIds } } : undefined
        ].filter(Boolean) as any
      },
      orderBy: { receivedAt: 'desc' },
      take: limit
    });
    let updated = 0;
    for (const email of emails) {
      const contentForAI = `${email.subject || ''}\nFrom: ${email.fromAddress || ''}\nTo: ${email.toAddress || ''}\n\n${email.rawBody || ''}`;
      const ai = await summarizeAndCategorize(contentForAI, categories.map(c => ({ id: c.id, name: c.name, description: c.description })), req.user!.id);
      let categoryId: string | undefined = ai.categoryId;
      if (!categoryId && ai.category) {
        const best = bestCategoryMatch(ai.category, categories as any);
        categoryId = best.id;
      }
      await prisma.email.update({ where: { id: email.id }, data: {
        categoryId: categoryId || null,
        aiCategory: ai.category || email.aiCategory,
        aiSummary: ai.summary || email.aiSummary,
      }});
      updated++;
    }
    return res.json({ updated });
  } catch (e: any) {
    console.error('Recategorize error:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
