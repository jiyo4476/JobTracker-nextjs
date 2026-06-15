import type { Metadata } from 'next'
import { Sidebar } from '@/components/layout/Sidebar'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Job Search Tracker',
  description: 'Personal job search dashboard',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-slate-50 overflow-hidden">
        <Providers>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
