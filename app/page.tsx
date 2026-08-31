'use client';

import { useState } from 'react';

type Platform = 'windows' | 'linux' | 'mac' | 'other';

const platformCopy: Record<Platform, string> = {
  windows: 'Download for Windows',
  linux: 'Download for Linux',
  mac: 'macOS coming soon',
  other: 'See all downloads',
};

const releaseVersion = '0.1.0';
const releasePage = `https://github.com/mory-dev/openthebook/releases/tag/v${releaseVersion}`;
const downloadUrls: Record<Platform, string> = {
  windows: `https://github.com/mory-dev/openthebook/releases/download/v${releaseVersion}/OpenTheBook_${releaseVersion}_x64-setup.exe`,
  linux: `https://github.com/mory-dev/openthebook/releases/download/v${releaseVersion}/OpenTheBook_${releaseVersion}_amd64.AppImage`,
  mac: releasePage,
  other: releasePage,
};

function detectPlatform(): Platform {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  if (platform.includes('mac')) return 'mac';
  return 'other';
}

export default function Home() {
  const [platform] = useState<Platform>(() => (
    typeof navigator === 'undefined' ? 'other' : detectPlatform()
  ));
  const downloadAvailable = platform !== 'mac';
  const downloadUrl = downloadUrls[platform];

  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="OpenTheBook home">
          <span className="brand-mark"><img src="/logo.png" alt="" width="44" height="44" /></span>
          <span>OpenTheBook</span>
        </a>
        <div className="nav-links">
          <a href="/docs">Docs</a>
          <a href="#why">Why OpenTheBook</a>
          <a href="#faq">FAQ</a>
        </div>
        <a className="nav-cta" href="#download">Get it free <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> A quiet place to read</p>
          <h1>Just open<br /><em>a book.</em></h1>
          <p className="hero-lede">OpenTheBook is a free, lightweight ebook reader for your computer. No library to manage. No account to create. Just your book, ready to read.</p>
          <div className="hero-actions" id="download">
            <a className={`button button-primary${downloadAvailable ? '' : ' button-disabled'}`} href={downloadAvailable ? downloadUrl : '#release'} aria-disabled={!downloadAvailable} onClick={downloadAvailable ? undefined : (event) => event.preventDefault()}>
              <span>{platformCopy[platform]}</span>
              <span className="button-arrow" aria-hidden="true">↓</span>
            </a>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">→</span></a>
          </div>
          <p className="release-note"><span className="status-dot" /> Installer available - v{releaseVersion}</p>
          <div className="format-line" aria-label="Supported formats"><span>PDF</span><i /> <span>EPUB</span><i /> <span>AZW3</span><i /> <span>MOBI</span></div>
        </div>

        <div className="hero-art" aria-label="OpenTheBook reader preview">
          <div className="hero-glow" />
          <div className="reader-window">
            <div className="window-bar">
              <div className="window-dots"><span /><span /><span /></div>
              <span className="window-title">The little things</span>
              <span className="window-page">12 / 184</span>
            </div>
            <div className="reader-body">
              <div className="book-page">
                <span className="chapter-label">CHAPTER TWO</span>
                <h2>A slower<br />kind of day</h2>
                <p>There is a particular calm that arrives when a good book is open and the rest of the world can wait.</p>
                <p>OpenTheBook keeps that moment simple. Turn the page, follow the thought, stay awhile.</p>
                <div className="page-number">12</div>
              </div>
            </div>
            <div className="reader-footer"><span>−</span><div className="progress"><i /></div><span>+</span><span className="theme-icon">☼</span></div>
          </div>
          <div className="art-logo"><img src="/logo.png" alt="" width="100" height="100" /></div>
        </div>
      </section>

      <section className="promise-strip" id="why">
        <div className="section-shell promise-grid">
          <div><span className="promise-number">01</span><h2>No library.</h2><p>Open a file, read a file. That’s the whole idea.</p></div>
          <div><span className="promise-number">02</span><h2>No clutter.</h2><p>A calm reading space with only the controls you need.</p></div>
          <div><span className="promise-number">03</span><h2>No cost.</h2><p>Free to install, free to use, and respectful of your privacy.</p></div>
        </div>
      </section>

      <section className="how section-shell" id="how-it-works">
        <div className="section-intro"><p className="eyebrow">The simple version</p><h2>One click,<br /><em>then read.</em></h2></div>
        <div className="steps">
          <div className="step"><span>01</span><div><h3>Install once</h3><p>Choose your file types during setup. PDF, EPUB, AZW3, and MOBI are ready by default.</p></div></div>
          <div className="step"><span>02</span><div><h3>Double-click a book</h3><p>OpenTheBook becomes the friendly, fast home for your reading files.</p></div></div>
          <div className="step"><span>03</span><div><h3>Pick up where you left off</h3><p>Your reading stays on your device. Updates happen quietly in the background.</p></div></div>
        </div>
      </section>

      <section className="formats section-shell">
        <div className="formats-card">
          <div><p className="eyebrow">Bring your own books</p><h2>Four formats.<br />One peaceful reader.</h2></div>
          <div className="format-pills"><span><b>PDF</b><small>Documents</small></span><span><b>EPUB</b><small>Reflowable books</small></span><span><b>AZW3</b><small>Kindle books</small></span><span><b>MOBI</b><small>Kindle files</small></span></div>
        </div>
      </section>

      <section className="faq section-shell" id="faq">
        <div className="section-intro"><p className="eyebrow">Good questions</p><h2>Keep it<br /><em>simple.</em></h2></div>
        <div className="faq-list">
          <details open><summary>Is OpenTheBook really free? <span>+</span></summary><p>Yes. OpenTheBook is free software with no subscription, account, ads, or in-app purchases.</p></details>
          <details><summary>Where are my books stored? <span>+</span></summary><p>Your books stay wherever you put them on your computer. OpenTheBook does not upload or manage your files.</p></details>
          <details><summary>Which computers can I use it on? <span>+</span></summary><p>The first release is for Windows and Ubuntu/Linux. macOS support is planned for a future release.</p></details>
          <details><summary>Will it update automatically? <span>+</span></summary><p>Yes. OpenTheBook checks quietly after opening and can prepare signed updates in the background for installation when you close the reader.</p></details>
        </div>
      </section>

      <section className="closing section-shell" id="release">
        <div className="closing-card"><img src="/logo.png" alt="" width="92" height="92" /><div><p className="eyebrow">Made for the next chapter</p><h2>Reading should feel<br /><em>like reading.</em></h2><p>Download the first free release for Windows or Linux.</p></div><a className={`button button-dark${downloadAvailable ? '' : ' button-disabled'}`} href={downloadAvailable ? downloadUrl : '#download'} aria-disabled={!downloadAvailable} onClick={downloadAvailable ? undefined : (event) => event.preventDefault()}>Get the installer <span>↓</span></a></div>
      </section>

      <footer className="site-footer section-shell"><a className="brand" href="#top"><span className="brand-mark"><img src="/logo.png" alt="" width="34" height="34" /></span><span>OpenTheBook</span></a><span className="footer-note">Simple software for people who like books.</span><div className="footer-links"><a href="/docs">Docs</a><a href="#faq">FAQ</a><a href="mailto:hello@openthebook.lol">Contact</a><a href="#release">License</a></div></footer>
    </main>
  );
}
