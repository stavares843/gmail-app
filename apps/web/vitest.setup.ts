import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock axios to avoid real network calls from components during tests
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(async (url: string) => {
        if (url.endsWith('/auth/me')) return { data: { user: null } };
        if (url.endsWith('/auth/accounts')) return { data: { accounts: [] } };
        if (url.includes('/categories/with-counts')) return { data: { categories: [] } };
        if (url.includes('/emails/')) return { data: { emails: [] } };
        return { data: {} };
      }),
      post: vi.fn(async () => ({ data: {} })),
    }
  }
});

// jsdom doesn't implement scrollTo; mock it to avoid errors in tests
// @ts-ignore
if (typeof window !== 'undefined' && !('scrollTo' in window)) {
  // @ts-ignore
  window.scrollTo = vi.fn();
}
