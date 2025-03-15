import '../styles/globals.css';
import Head from 'next/head';
import { useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  // Prevent browser back/forward navigation to improve security
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    
    // Prevent context menu on production to avoid tampering
    if (process.env.NODE_ENV === 'production') {
      document.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, []);

  // Only apply strict CSP in production
  const cspContent = process.env.NODE_ENV === 'production' 
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://docs.google.com; worker-src 'self' blob:;"
    : ""; // Empty in development to avoid conflicts with hot reloading

  return (
    <>
      <Head>
        <meta http-equiv="Content-Security-Policy" content="connect-src 'self' https://docs.google.com https://googleusercontent.com;" />

        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#FF9933" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {cspContent && <meta httpEquiv="Content-Security-Policy" content={cspContent} />}
        <title>Hindi Club QR Verification</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp; 
