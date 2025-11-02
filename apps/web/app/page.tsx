export default function Home() {
  const API =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://gmail-app-w-sq-g.fly.dev'
      : 'http://localhost:4000');
  
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-5xl font-bold text-gray-900">Gmail AI Sorter</h1>
        <p className="text-xl text-gray-600">Automatically sort, summarize, and manage your Gmail with AI</p>
        <a 
          href={`${API}/auth/google`}
          className="inline-block px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
        >
          Sign in with Google
        </a>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-2xl mb-2">🤖</div>
            <h3 className="font-semibold mb-2">AI Categorization</h3>
            <p className="text-sm text-gray-600">Automatically sort emails into custom categories using Google Gemini (gemini-flash-latest)</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-2xl mb-2">📝</div>
            <h3 className="font-semibold mb-2">Smart Summaries</h3>
            <p className="text-sm text-gray-600">Get concise 2-3 sentence summaries of each email</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-2xl mb-2">🚫</div>
            <h3 className="font-semibold mb-2">Auto-Unsubscribe</h3>
            <p className="text-sm text-gray-600">One-click bulk unsubscribe with Playwright automation</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 max-w-3xl mx-auto">
          Note: Due to API quotas and model usage, each ingest run fetches up to 50 recent emails from the last 30 days by default.
        </p>
      </div>
    </main>
  );
}
