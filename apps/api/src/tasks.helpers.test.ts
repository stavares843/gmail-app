import { describe, it, expect } from 'vitest';
import { sanitizeSummary, simpleSummaryFromContent, extractUnsubscribeLinks } from './routes/tasks';

describe('sanitizeSummary', () => {
  it('removes reasoning phrases and truncates', () => {
    const input = 'This email is about your invoice. We classify this as Finance because it indicates billing. Another sentence with details.';
    const out = sanitizeSummary(input)!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.toLowerCase()).not.toContain('because');
    expect(out.toLowerCase()).not.toContain('classif');
    expect(out).toMatch(/invoice|billing/i);
  });

  it('handles empty input', () => {
    expect(sanitizeSummary(undefined)).toBeUndefined();
    expect(sanitizeSummary('')).toBeUndefined();
  });
});

describe('simpleSummaryFromContent', () => {
  it('creates a concise summary from body and subject', () => {
    const content = 'Subject: Your Order Receipt\nFrom: shop@example.com\nTo: me@example.com\n\nThanks for your purchase! View in browser. Unsubscribe here: https://example.com/unsub';
    const out = simpleSummaryFromContent(content);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.toLowerCase()).not.toContain('unsubscribe');
  });
});

describe('extractUnsubscribeLinks', () => {
  it('extracts from List-Unsubscribe header and body', async () => {
    const headers = { 'list-unsubscribe': '<mailto:unsubscribe@example.com>, <https://example.com/unsub>' } as any;
    const body = '... visit https://example.com/unsubscribe/now to opt out';
    const urls = await extractUnsubscribeLinks(body, headers);
    expect(urls).toEqual(expect.arrayContaining([
      'mailto:unsubscribe@example.com',
      'https://example.com/unsub',
      'https://example.com/unsubscribe/now'
    ]));
  });
});
