'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import clsx from 'clsx';

type Category = { id: string; name: string; description: string; emailCount?: number };
type Account = { id: string; emailAddress: string; provider: string };

type Email = {
  id: string;
  subject?: string | null;
  aiSummary?: string | null;
  receivedAt: string;
  unsubscribeUrls: string[];
  unsubscribeStatus?: 'pending' | 'success' | 'failed' | null;
  unsubscribedAt?: string | null;
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [recategorizing, setRecategorizing] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | 'all'>('all');

  const API =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://gmail-app-w-sq-g.fly.dev'
      : 'http://localhost:4000');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authResponse = await axios.get(`${API}/auth/me`, { withCredentials: true });
        
        if (authResponse.data.user) {
          setUser(authResponse.data.user);
          try {
            const [accountsRes, categoriesRes] = await Promise.all([
              axios.get(`${API}/auth/accounts`, { withCredentials: true }),
              axios.get(`${API}/categories/with-counts`, { withCredentials: true })
            ]);
          // initial categories load (no account filter yet, will be re-fetched below when account filter changes)
          axios.get(`${API}/categories/with-counts`, { withCredentials: true }).then(r => {
            const cats: Category[] = r.data.categories;
            const filtered = cats
              .filter(c => c.name && c.name.trim().length > 0)
              .sort((a, b) => (b.emailCount || 0) - (a.emailCount || 0));
            // Hide empty categories by default, except keep "Uncategorized" virtual
            const nonEmpty = filtered.filter(c => (c.emailCount || 0) > 0);
            const withVirtual = [{ id: 'uncategorized', name: 'Uncategorized', description: 'No category', emailCount: 0 }, ...nonEmpty];
            setCategories(withVirtual);
            setSelectedCategory((prev) => prev || withVirtual[0]);
          });
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Auth check failed:', err);
        setLoading(false);
      });
  }, []);

  // Refetch categories when account filter changes to keep counts in sync
  useEffect(() => {
    if (!user) return;
    const url = new URL(`${API}/categories/with-counts`);
    if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
    axios.get(url.toString(), { withCredentials: true }).then(r => {
      const cats: Category[] = r.data.categories;
      const filtered = cats
        .filter(c => c.name && c.name.trim().length > 0)
        .sort((a, b) => (b.emailCount || 0) - (a.emailCount || 0));
      const nonEmpty = filtered.filter(c => (c.emailCount || 0) > 0);
      const withVirtual = [{ id: 'uncategorized', name: 'Uncategorized', description: 'No category', emailCount: 0 }, ...nonEmpty];
      setCategories(withVirtual);
      // If the previously selected category is now empty or gone, default to the first
      setSelectedCategory((prev) => {
        if (!prev) return withVirtual[0];
        const stillExists = withVirtual.find(c => c.id === prev.id);
        return stillExists || withVirtual[0];
      });
    }).catch(() => {});
  }, [selectedAccountId, user]);

  useEffect(() => {
    if (!selectedCategory) return;
    if (selectedCategory.id === 'uncategorized') {
      const url = new URL(`${API}/emails/uncategorized`);
      if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
      axios.get(url.toString(), { withCredentials: true }).then(r => setEmails(r.data.emails));
    } else {
      const url = new URL(`${API}/emails/by-category/${selectedCategory.id}`);
      if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
      axios.get(url.toString(), { withCredentials: true }).then(r => setEmails(r.data.emails));
    }
  }, [selectedCategory?.id, selectedAccountId]);

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  // Smooth scroll to top when category changes
  useEffect(() => {
    if (selectedCategory) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedCategory?.id]);

  // Poll backend health so we can show a clear outage banner and disable actions
  const [serviceHealthy, setServiceHealthy] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const r = await axios.get(`${API}/health`, { withCredentials: true });
        if (!mounted) return;
        setServiceHealthy(r.status === 200 && r.data?.ok === true);
      } catch (err) {
        if (!mounted) return;
        setServiceHealthy(false);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const allIds = emails.map(e => e.id);
  const selectedIds = allIds.filter(id => selected[id]);
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const anySelectedHasUnsub = emails.some(e => selected[e.id] && (e.unsubscribeUrls?.length || 0) > 0);
  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      for (const id of allIds) next[id] = true;
      setSelected(next);
    }
  };

  async function bulkDelete() {
    await axios.post(`${API}/emails/bulk-delete`, { emailIds: selectedIds }, { withCredentials: true });
    setEmails(es => es.filter(e => !selectedIds.includes(e.id)));
    setSelected({});
  }
  async function bulkUnsubscribe() {
    try {
      const eligibleIds = emails.filter(e => selected[e.id] && (e.unsubscribeUrls?.length || 0) > 0).map(e => e.id);
      if (eligibleIds.length === 0) {
        alert('None of the selected emails have unsubscribe links.');
        return;
      }
      await axios.post(`${API}/tasks/unsubscribe`, { emailIds: eligibleIds }, { withCredentials: true });
      alert('Unsubscribe processing completed! Refresh to see status.');
      if (selectedCategory) {
        if (selectedCategory.id === 'uncategorized') {
          const url = new URL(`${API}/emails/uncategorized`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        } else {
          const url = new URL(`${API}/emails/by-category/${selectedCategory.id}`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        }
      }
      setSelected({});
    } catch (e: any) {
      alert('Unsubscribe failed: ' + (e.response?.data?.error || e.message));
    }
  }
  async function addCategory() {
    const name = prompt('Category name?');
    if (!name) return;
    const description = prompt('Description?') || '';
    const r = await axios.post(`${API}/categories`, { name, description }, { withCredentials: true });
    setCategories(cs => [...cs, r.data.category]);
  }
  async function triggerIngest() {
    try {
      setIngesting(true);
      setIngestError(null);
      await axios.post(`${API}/tasks/ingest`, { days: 30, max: 50 }, { withCredentials: true });
      // Refresh categories with counts
      try {
        const catUrl = new URL(`${API}/categories/with-counts`);
        if (selectedAccountId && selectedAccountId !== 'all') catUrl.searchParams.set('accountId', selectedAccountId);
        const catRes = await axios.get(catUrl.toString(), { withCredentials: true });
        const cats: Category[] = catRes.data.categories;
        const filtered = cats
          .filter(c => c.name && c.name.trim().length > 0)
          .sort((a, b) => (b.emailCount || 0) - (a.emailCount || 0));
        const nonEmpty = filtered.filter(c => (c.emailCount || 0) > 0);
        const withVirtual = [{ id: 'uncategorized', name: 'Uncategorized', description: 'No category', emailCount: 0 }, ...nonEmpty];
        setCategories(withVirtual);
      } catch {}
      if (selectedCategory) {
        if (selectedCategory.id === 'uncategorized') {
          const url = new URL(`${API}/emails/uncategorized`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        } else {
          const url = new URL(`${API}/emails/by-category/${selectedCategory.id}`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        }
      }
    } catch (e: any) {
      console.error('Ingestion failed:', e.response?.data?.error || e.message);
      if (e.response?.status === 429) {
        setIngestError('Rate limit exceeded. Please wait a few minutes and try again.');
      } else if (e.response?.status === 403) {
        setIngestError('Access denied. You may need to re-authenticate with Gmail.');
      } else {
        setIngestError(e.response?.data?.error || 'Failed to ingest emails. Please try again.');
      }
    }
    finally { setIngesting(false); }
  }

  async function recategorize() {
    try {
      setRecategorizing(true);
      await axios.post(`${API}/tasks/recategorize`, { limit: 500 }, { withCredentials: true });
      if (selectedCategory) {
        if (selectedCategory.id === 'uncategorized') {
          const url = new URL(`${API}/emails/uncategorized`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        } else {
          const url = new URL(`${API}/emails/by-category/${selectedCategory.id}`);
          if (selectedAccountId && selectedAccountId !== 'all') url.searchParams.set('accountId', selectedAccountId);
          const r = await axios.get(url.toString(), { withCredentials: true });
          setEmails(r.data.emails);
        }
      }
    } catch (e: any) {
      console.error('Recategorize failed:', e.response?.data?.error || e.message);
    }
    finally { setRecategorizing(false); }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold">Gmail AI Sorter</h1>
        <p>You need to sign in to access the dashboard.</p>
        <a href={`${API}/auth/google`} className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {(ingesting || recategorizing) && (
        <div className="top-progress" style={{ width: '100%' }} />
      )}
      {serviceHealthy === false && (
        <div className="col-span-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          Service temporarily degraded — database or backend unavailable. Actions (ingest/categorize) are disabled. Please try again in a few minutes.
        </div>
      )}
      <div className="col-span-1 space-y-4">
        <div className="p-4 bg-white rounded shadow">
          <h2 className="font-semibold mb-2">Account</h2>
          <div className="text-sm mb-3">
            <div className="font-medium">{user.name || user.email}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
          </div>
          {accounts.length > 0 && (
            <div className="mb-3">
              <label className="text-xs text-gray-500">Filter by connected inbox</label>
              <select className="mt-1 w-full border rounded px-2 py-1 text-sm" value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value as any)}>
                <option value="all">All accounts</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.emailAddress}</option>
                ))}
              </select>
            </div>
          )}
          <a className="text-blue-600 underline text-sm block mb-2" href={`${API}/auth/google`}>Connect another Gmail account</a>
          <div className="mt-3">
            <button onClick={triggerIngest} disabled={ingesting || serviceHealthy === false} className={clsx("px-3 py-1 text-white rounded text-sm w-full", (ingesting || serviceHealthy === false) ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700')}>{ingesting ? 'Ingesting…' : 'Ingest Emails Now'}</button>
            {ingestError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                {ingestError}
              </div>
            )}
            <button onClick={recategorize} disabled={recategorizing} className={clsx("mt-2 px-3 py-1 text-white rounded text-sm w-full", recategorizing ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700')}>{recategorizing ? 'Categorizing…' : 'Categorize'}</button>
            <p className="text-xs text-gray-500 mt-3">
              Note: Due to API quotas and model usage, each ingest run fetches up to 50 recent emails from the last 30 days by default.
            </p>
          </div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Categories</h2>
            <button onClick={addCategory} className="text-sm px-2 py-1 bg-black text-white rounded">Add</button>
          </div>
          <ul className="divide-y">
            {categories.map(c => (
              <li key={c.id} className={clsx('py-2 cursor-pointer', selectedCategory?.id === c.id && 'font-semibold')}
                  onClick={() => setSelectedCategory(c)}>
                <div>{c.name}</div>
                <div className="text-xs text-gray-500">{c.description}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="col-span-2">
        <div className="p-4 bg-white rounded shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{selectedCategory ? selectedCategory.name : 'Select a category'}</h2>
            <div className="flex items-center gap-3">
              {allIds.length > 0 && (
                <label className="text-sm text-gray-700 flex items-center gap-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  Select all
                </label>
              )}
              {selectedIds.length > 0 && (
                <div className="space-x-2">
                  {anySelectedHasUnsub && (
                    <button onClick={bulkUnsubscribe} className="px-2 py-1 bg-yellow-600 text-white rounded text-sm">Unsubscribe</button>
                  )}
                  <button onClick={bulkDelete} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                </div>
              )}
            </div>
          </div>
          <ul className="divide-y">
            {emails.map(e => (
              <li key={e.id} className="py-3 flex gap-3">
                <input type="checkbox" checked={!!selected[e.id]} onChange={() => toggle(e.id)} />
                <div>
                  <div className="font-medium break-words">
                    <Link href={`/emails/${e.id}`} className="text-blue-700 hover:underline">
                      {e.subject || '(no subject)'}
                    </Link>{' '}
                    <span className="text-xs text-gray-500">{new Date(e.receivedAt).toLocaleString()}</span>
                    {e.unsubscribeStatus && (
                      <span className={clsx(
                        'ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                        e.unsubscribeStatus === 'success' && 'bg-green-100 text-green-800',
                        e.unsubscribeStatus === 'pending' && 'bg-yellow-100 text-yellow-800',
                        e.unsubscribeStatus === 'failed' && 'bg-red-100 text-red-800'
                      )}>
                        {e.unsubscribeStatus === 'success' && 'Unsubscribed'}
                        {e.unsubscribeStatus === 'pending' && 'Unsubscribing…'}
                        {e.unsubscribeStatus === 'failed' && 'Unsubscribe failed'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 break-words clamp-2">{e.aiSummary || 'No summary'}</div>
                  {e.unsubscribeUrls?.length > 0 && (
                    <div className="text-xs text-gray-500 break-all clamp-2" title={e.unsubscribeUrls.join(', ')}>
                      Unsub links: {e.unsubscribeUrls.join(', ')}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {selectedCategory && emails.length === 0 && (
              <li className="py-8 text-center text-gray-500">No emails yet. Try triggering ingestion from the API.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
