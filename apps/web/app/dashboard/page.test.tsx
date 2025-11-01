import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './page';

// Basic smoke test for unauthenticated state

describe('Dashboard', () => {
  it('shows sign-in prompt when not authenticated', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Gmail AI Sorter')).toBeInTheDocument();
      expect(screen.getByText('You need to sign in to access the dashboard.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Sign in with Google/i })).toBeInTheDocument();
    });
  });
});
