import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Weather Arbitrage Bot Dashboard',
  description: 'Monitor your weather prediction market arbitrage bot',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
