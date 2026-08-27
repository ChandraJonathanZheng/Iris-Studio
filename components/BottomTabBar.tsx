'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/app', label: 'Home' },
  { href: '/app/students', label: 'Students' },
  { href: '/app/homework', label: 'Homework' },
  { href: '/app/fees', label: 'Fees' },
  { href: '/app/studio', label: 'Studio' },
] as const

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 border-t border-black/10 bg-white">
      <ul className="flex justify-between px-2 py-2">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 text-xs ${
                  isActive ? 'text-plum-light' : 'text-black/40'
                }`}
              >
                <span
                  className={`h-6 w-6 rounded-md ${isActive ? 'bg-plum-light' : 'border border-black/20'}`}
                />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
