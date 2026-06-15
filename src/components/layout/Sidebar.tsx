'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, BarChart2, Building2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Jobs', href: '/jobs', icon: Briefcase },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
  { label: 'Companies', href: '/companies', icon: Building2 },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-slate-100 flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-base font-bold">Job Tracker</h1>
        <p className="text-xs text-slate-400 mt-0.5">Personal search dashboard</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">v0.1.0</p>
      </div>
    </aside>
  )
}
