import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = localFont({
  src: '../../public/fonts/InterVariable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ProctoLearn — Онлайн оқыту платформасы',
  description: 'Прокторингтік онлайн оқыту жүйесі',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="kk" className={inter.variable}>
      <body className="font-sans bg-gray-50 min-h-screen antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
