import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '../components/ui/ToastProvider'
import { ThemeProvider } from '../components/ui/ThemeProvider'
import { CookieConsentBanner } from '../components/ui/CookieConsentBanner'
import ErrorBoundary from '../components/ErrorBoundary'
import { validateProductionEnv } from '../lib/env'

const font = Outfit({ subsets: ['latin'], display: 'swap' })

export const viewport: Viewport = {
  // Two theme colours so the browser chrome matches the active theme, instead
  // of painting a light-mode teal bar above a dark page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#115E54' },
    { media: '(prefers-color-scheme: dark)', color: '#072921' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Required for env(safe-area-inset-*) to resolve on notched devices;
  // the mobile bottom nav pads itself with it.
  viewportFit: 'cover',
  // `maximumScale: 1` and `userScalable: false` used to be set here. They
  // disable pinch-zoom on every mobile browser -- a WCAG 1.4.4 failure, and a
  // real problem for field volunteers reading task detail one-handed outdoors
  // on a small screen. Do not re-add them.
}

export const metadata: Metadata = {
  title: 'Sanchaalan Saathi',
  description: 'Emergency intelligence and volunteer coordination platform',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  validateProductionEnv()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of incorrect theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`,
          }}
        />
      </head>
      <body className={`${font.className} bg-canvas dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        {/* First tab stop on every page: lets keyboard and screen-reader users
            jump straight past the sidebar nav to the page content. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <div id="main-content">{children}</div>
              <CookieConsentBanner />
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
