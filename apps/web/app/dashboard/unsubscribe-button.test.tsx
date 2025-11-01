import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Dashboard from './page';

// We'll override the axios mock from vitest.setup per test
import axios from 'axios';

describe('Dashboard Unsubscribe button visibility', () => {
  beforeEach(() => {
    // Reset mocks before each test
    (axios as any).get.mockReset();
    (axios as any).post?.mockReset?.();
  });

  it('shows Unsubscribe when selected emails have unsubscribe links', async () => {
    // Arrange mocked responses
    (axios as any).get.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) return { data: { user: { id: 'u1', name: 'Test', email: 'test@example.com' } } };
      if (url.endsWith('/auth/accounts')) return { data: { accounts: [] } };
      if (url.includes('/categories/with-counts')) return { data: { categories: [] } };
      if (url.includes('/emails/uncategorized')) return { data: { emails: [
        { id: 'e1', subject: 'A', receivedAt: new Date().toISOString(), unsubscribeUrls: ['https://unsub'], aiSummary: 's' },
        { id: 'e2', subject: 'B', receivedAt: new Date().toISOString(), unsubscribeUrls: [], aiSummary: 's' },
      ] } };
      return { data: {} };
    });

    render(<Dashboard />);

    // Wait until emails render
    await waitFor(() => {
      expect(screen.getAllByText('Uncategorized').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    // Select the first email which has an unsubscribe link
  const checkboxes = screen.getAllByRole('checkbox');
  // Index 0 is the 'Select all' checkbox in the toolbar; pick the first email row checkbox
  fireEvent.click(checkboxes[1]);

    // Action bar should display unsubscribe button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Unsubscribe/i })).toBeInTheDocument();
    });
  });

  it('hides Unsubscribe when selected emails do not have unsubscribe links', async () => {
    (axios as any).get.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) return { data: { user: { id: 'u1', name: 'Test', email: 'test@example.com' } } };
      if (url.endsWith('/auth/accounts')) return { data: { accounts: [] } };
      if (url.includes('/categories/with-counts')) return { data: { categories: [] } };
      if (url.includes('/emails/uncategorized')) return { data: { emails: [
        { id: 'e3', subject: 'C', receivedAt: new Date().toISOString(), unsubscribeUrls: [], aiSummary: 's' },
      ] } };
      return { data: {} };
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('C')).toBeInTheDocument();
    });

    // Select the only email (no unsub links)
  const checkboxes = screen.getAllByRole('checkbox');
  // Index 0: select-all; Index 1: only email row
  fireEvent.click(checkboxes[1]);

    // Unsubscribe button should not appear
    await waitFor(() => {
      const unsub = screen.queryByRole('button', { name: /Unsubscribe/i });
      expect(unsub).toBeNull();
    });
  });
});
