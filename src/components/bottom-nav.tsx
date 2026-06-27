'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, HandCoins, Settings } from 'lucide-react'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/emprestimos', label: 'Empréstimos', icon: HandCoins },
  { href: '/configuracoes', label: 'Config', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-stretch border-t md:hidden z-50"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-all duration-150 cursor-pointer hover:bg-primary/5 hover:text-primary active:bg-primary/10 ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.8} />
            <span className={active ? 'font-semibold' : ''}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
