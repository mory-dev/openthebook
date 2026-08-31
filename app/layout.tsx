import type { Metadata } from 'next';
import './globals.css';
import StructuredData from './structured-data';

export const metadata: Metadata = {
  metadataBase: new URL('https://openthebook.lol'),
  title: 'OpenTheBook — A free, simple ebook reader',
  description: 'OpenTheBook is a free, lightweight ebook reader for Windows and Linux. Open PDF, EPUB, AZW3, and MOBI files without a library, account, or clutter.',
  applicationName: 'OpenTheBook',
  authors: [{ name: 'OpenTheBook', url: 'https://openthebook.lol' }],
  creator: 'OpenTheBook',
  publisher: 'OpenTheBook',
  category: 'software',
  keywords: ['free ebook reader', 'PDF reader', 'EPUB reader', 'AZW3 reader', 'MOBI reader', 'Kindle file reader', 'Windows ebook reader', 'Linux ebook reader'],
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  openGraph: {
    title: 'OpenTheBook — Just open a book.',
    description: 'A free, lightweight reader for PDF, EPUB, AZW3, and MOBI files.',
    url: 'https://openthebook.lol',
    siteName: 'OpenTheBook',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'OpenTheBook — Just open a book.' }],
  },
  twitter: { card: 'summary_large_image', title: 'OpenTheBook — Just open a book.', description: 'A free, lightweight reader for PDF, EPUB, AZW3, and MOBI files.', images: ['/og.png'] },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
  other: { 'theme-color': '#fbfaf7' },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://openthebook.lol/#website',
      url: 'https://openthebook.lol/',
      name: 'OpenTheBook',
      description: 'A free, lightweight ebook reader for Windows and Linux.',
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://openthebook.lol/#software',
      name: 'OpenTheBook',
      url: 'https://openthebook.lol/',
      description: 'A free, lightweight ebook reader for PDF, EPUB, AZW3, and MOBI files.',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: ['Windows', 'Linux'],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<StructuredData data={structuredData} /></body></html>;
}
