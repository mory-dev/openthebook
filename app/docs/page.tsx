import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '../structured-data';
import { SHORTCUT_GROUPS } from '../../reader/lib/shortcuts';

export const metadata: Metadata = {
  title: 'Docs — OpenTheBook',
  description: 'Get started with OpenTheBook: install, open PDF/EPUB/AZW3/MOBI files, use the keyboard shortcuts, and manage settings, file associations, and updates.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Docs — OpenTheBook',
    description: 'A quick, visual guide to reading with OpenTheBook.',
    url: 'https://openthebook.lol/docs',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'OpenTheBook — Just open a book.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Docs — OpenTheBook',
    description: 'A quick, visual guide to reading with OpenTheBook.',
    images: ['/og.png'],
  },
};

const formats = [
  { name: 'PDF', note: 'Fixed-layout documents, rendered page by page.' },
  { name: 'EPUB', note: 'Reflowable books that adapt to your text size.' },
  { name: 'AZW3', note: 'Kindle books, read without a Kindle app.' },
  { name: 'MOBI', note: 'Older Kindle and PocketBook files.' },
];

export default function DocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': 'https://openthebook.lol/docs#webpage',
        url: 'https://openthebook.lol/docs',
        name: 'Docs — OpenTheBook',
        isPartOf: { '@id': 'https://openthebook.lol/#website' },
        inLanguage: 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'OpenTheBook', item: 'https://openthebook.lol/' },
          { '@type': 'ListItem', position: 2, name: 'Docs', item: 'https://openthebook.lol/docs' },
        ],
      },
    ],
  };

  return (
    <><StructuredData data={structuredData} /><main>
      <nav className="site-nav docs-nav" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="OpenTheBook home">
          <span className="brand-mark"><img src="/logo.png" alt="" width="44" height="44" /></span>
          <span>OpenTheBook</span>
        </Link>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/#faq">FAQ</Link>
        </div>
        <Link className="nav-cta" href="/#download">Get it free <span aria-hidden="true">↗</span></Link>
      </nav>

      <section className="docs-hero section-shell">
        <p className="eyebrow"><span className="eyebrow-dot" /> Documentation</p>
        <h1>Reading should be<br /><em>this simple.</em></h1>
        <p className="docs-lede">OpenTheBook is a file reader, not a library. Here is everything you need — install, open, read.</p>
      </section>

      <section className="docs-body section-shell">
        <div className="docs-grid">
          <article className="docs-card docs-card-steps">
            <div className="docs-card-head"><span className="docs-number">01</span><h2>Get started</h2></div>
            <ol className="docs-steps">
              <li><b>Install once.</b> During setup, choose the file types OpenTheBook should open — PDF, EPUB, AZW3, and MOBI are all selected by default.</li>
              <li><b>Double-click a book.</b> Your reading file opens directly in OpenTheBook. No import, no library, no account.</li>
              <li><b>Pick up where you left off.</b> Your highlights and preferences are stored quietly on your computer.</li>
            </ol>
          </article>

          <article className="docs-card docs-card-shortcuts">
            <div className="docs-card-head"><span className="docs-number">02</span><h2>Shortcuts</h2></div>
            <div className="shortcut-groups">
              {SHORTCUT_GROUPS.map((group) => <section key={group.title} className="shortcut-group" aria-labelledby={`shortcut-${group.title.toLowerCase().replaceAll(' ', '-')}`}>
                <h3 id={`shortcut-${group.title.toLowerCase().replaceAll(' ', '-')}`}>{group.title}</h3>
                <div className="shortcut-list">
                  {group.items.map((shortcut) => <div className="shortcut-row" key={shortcut.label}>
                    <div className="shortcut-bindings">{shortcut.bindings.map((binding, index) => <span className="key-combo" key={`${shortcut.label}-${index}`}>
                      {binding.map((key) => <kbd key={key}>{key}</kbd>)}
                    </span>)}</div>
                    <div><b>{shortcut.label}</b><small>{shortcut.detail}</small></div>
                  </div>)}
                </div>
              </section>)}
            </div>
            <p className="docs-note">Use Ctrl on Windows and Linux; the same commands use Cmd on macOS. Search and navigation shortcuts apply only in their stated context.</p>
          </article>

          <article className="docs-card docs-card-formats">
            <div className="docs-card-head"><span className="docs-number">03</span><h2>Formats</h2></div>
            <div className="format-docs-list">
              {formats.map((format) => (
                <div className="format-docs-row" key={format.name}><b>{format.name}</b><small>{format.note}</small></div>
              ))}
            </div>
            <p className="docs-note">DRM-protected files cannot be opened. Your own, freely readable books work great.</p>
          </article>

          <article className="docs-card docs-card-settings">
            <div className="docs-card-head"><span className="docs-number">04</span><h2>Settings</h2></div>
            <ul className="docs-list">
              <li><b>Fullscreen</b> — the reader opens fullscreen by default and remembers how you left it, including window size and position.</li>
              <li><b>Display full book</b> — read the whole book in one continuous scroll (default). Turn it off for single-chapter paging.</li>
              <li><b>Theme</b> — light, dark, or follow your system.</li>
              <li><b>Text size</b> — adjust with Ctrl + / Ctrl −, the A− / A+ buttons, or in Settings.</li>
              <li><b>File associations</b> — choose which formats OpenTheBook registers, then use “Open default apps” to confirm your choices.</li>
              <li><b>Updates</b> — signed updates are checked quietly after launch and installed when you close the reader.</li>
            </ul>
          </article>

          <article className="docs-card docs-card-privacy">
            <div className="docs-card-head"><span className="docs-number">05</span><h2>Your data</h2></div>
            <p className="docs-paragraph">Books stay wherever you keep them on your computer. Highlights and preferences live in a single folder, <code className="inline-code">.openthebook</code>, in your user directory. Nothing is uploaded anywhere.</p>
          </article>

          <article className="docs-card docs-card-help">
            <div className="docs-card-head"><span className="docs-number">06</span><h2>Still stuck?</h2></div>
            <p className="docs-paragraph">If a file still opens in another app, open OpenTheBook, go to Settings, and choose <b>Open default apps</b> to switch the file type over.</p>
            <p className="docs-paragraph">Questions or ideas? <a className="docs-link" href="mailto:hello@openthebook.lol">Write to us</a>.</p>
          </article>
        </div>
      </section>

      <section className="docs-closing section-shell">
        <div className="docs-closing-card">
          <div><p className="eyebrow">Ready when you are</p><h2>Open a book.<br /><em>Start reading.</em></h2></div>
          <Link className="button button-primary" href="/#download">Get OpenTheBook <span className="button-arrow" aria-hidden="true">↓</span></Link>
        </div>
      </section>

      <footer className="site-footer section-shell"><Link className="brand" href="/"><span className="brand-mark"><img src="/logo.png" alt="" width="34" height="34" /></span><span>OpenTheBook</span></Link><span className="footer-note">Simple software for people who like books.</span><div className="footer-links"><Link href="/docs">Docs</Link><Link href="/#faq">FAQ</Link><a href="mailto:hello@openthebook.lol">Contact</a></div></footer>
    </main></>
  );
}
