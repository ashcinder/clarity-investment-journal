import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(
    'https://clarity-investment-journal.shady-crumb-2665.chatgpt.site',
  ),
  icons: { icon: '/icon.svg' },
  title: '澄明 · 投资手账',
  description:
    '把每一次投入，写进长期的答案。多账户、双币种投资记录与定投管理。',
  openGraph: {
    images: [
      {
        url: 'https://clarity-investment-journal.shady-crumb-2665.chatgpt.site/og.png',
        width: 1200,
        height: 630,
        alt: '澄明 · 投资手账',
      },
    ],
    title: '澄明 · 投资手账',
    description: '让每一笔投资，有迹可循。',
  },
  twitter: {
    images: [
      'https://clarity-investment-journal.shady-crumb-2665.chatgpt.site/og.png',
    ],
    card: 'summary_large_image',
    title: '澄明 · 投资手账',
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
