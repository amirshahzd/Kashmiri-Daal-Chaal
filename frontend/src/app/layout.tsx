import type { Metadata } from 'next';
import './globals.css';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { NavTooltips } from '@/components/NavTooltips';

export const metadata: Metadata = {
  title: {
    default: 'Kashmiri Daal Chawal — Halal Kashmiri Comfort Food',
    template: '%s · Kashmiri Daal Chawal',
  },
  description:
    'Eat in, take away, and order online. Boiled rice, daal, chicken pulao, biryani, shami kebab and soft drinks from Hall Road, Lahore, Pakistan.',
  openGraph: {
    title: 'Kashmiri Daal Chawal',
    description: 'Authentic Kashmiri comfort food on Hall Road, Lahore.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased kdc-grain"
        suppressHydrationWarning
      >
        <NavTooltips />
        <SiteHeader />
        <main className="min-h-[70vh]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
