import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'SRE Investigator',
  description: 'AI-powered incident investigation powered by Coral + Kimi K2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        <nav className="border-b border-gray-800 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold text-white tracking-tight">
              SRE Investigator
            </Link>
            <span className="text-xs text-gray-600">
              Coral · Kimi K2 · Supabase
            </span>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
