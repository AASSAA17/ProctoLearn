import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

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
    <html lang="kk">
      <body className="bg-gray-50 min-h-screen">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
