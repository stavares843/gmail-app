import './globals.css';
import { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Gmail AI Sorter</h1>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
