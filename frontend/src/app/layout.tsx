import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'MUSE CRM',
  description: '繆思精工 — 智能客服管理系統',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100`}
        style={{ fontFamily: 'var(--font-inter), system-ui, -apple-system, sans-serif' }}
      >
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
