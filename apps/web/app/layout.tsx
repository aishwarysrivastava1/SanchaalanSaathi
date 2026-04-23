import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '../components/ui/ToastProvider'
import { AuthProvider } from '../lib/auth'
import { ThemeProvider } from '../components/ui/ThemeProvider'
import { CookieConsentBanner } from '../components/ui/CookieConsentBanner'
import { validateProductionEnv } from '../lib/env'

const font = Outfit({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#115E54',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className={`${font.className} bg-[#F5F6F1] dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
              <CookieConsentBanner />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
