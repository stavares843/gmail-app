'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function EmailPage({ params }: any) {
  const [email, setEmail] = useState<any>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000';
  useEffect(() => {
    axios.get(`${API}/emails/${params.id}`, { withCredentials: true }).then(r => setEmail(r.data.email));
  }, [params.id]);

  if (!email) return <div className="p-4 bg-white rounded shadow">Loading...</div>;
  return (
    <div className="p-4 bg-white rounded shadow space-y-3">
      <div className="text-xl font-semibold">{email.subject || '(no subject)'}</div>
      <div className="text-sm text-gray-500">From: {email.fromAddress} | To: {email.toAddress}</div>
      <div className="text-sm text-gray-600">
        <span>Received: {new Date(email.receivedAt).toLocaleString()}</span>
        {email.archived && <span className="ml-3 text-gray-500">[Archived]</span>}
        {email.deleted && <span className="ml-3 text-red-600">[Deleted]</span>}
        {email.unsubscribeStatus && (
          <span className={`ml-3 ${email.unsubscribeStatus === 'success' ? 'text-green-600' : 'text-yellow-600'}`}>
            [Unsubscribe: {email.unsubscribeStatus}]
          </span>
        )}
      </div>
      {email.aiSummary && (
        <div className="p-2 bg-blue-50 rounded text-sm">
          <strong>AI Summary:</strong> {email.aiSummary}
        </div>
      )}
      {email.unsubscribeUrls && email.unsubscribeUrls.length > 0 && (
        <div className="p-2 bg-gray-50 rounded text-sm">
          <strong>Unsubscribe URLs:</strong>
          <ul className="list-disc ml-5 mt-1">
            {email.unsubscribeUrls.map((url: string, i: number) => (
              <li key={i}><a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{url}</a></li>
            ))}
          </ul>
        </div>
      )}
      <div className="prose max-w-none">
        {email.htmlBody ? (
          <div dangerouslySetInnerHTML={{ __html: email.htmlBody }} />
        ) : (
          <pre className="whitespace-pre-wrap">{email.rawBody}</pre>
        )}
      </div>
    </div>
  );
}
