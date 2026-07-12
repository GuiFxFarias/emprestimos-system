'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  HandCoins,
  Settings,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/emprestimos', label: 'Empréstimos', icon: HandCoins },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success('Sessão encerrada');
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      className='hidden md:flex flex-col w-60 h-screen sticky top-0 border-r'
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div
        className='flex items-center gap-3 px-6 py-6 border-b'
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className='flex items-center justify-center w-9 h-9 rounded-xl'
          style={{ background: 'var(--primary)' }}
        >
          <TrendingUp
            className='w-5 h-5'
            style={{ color: 'var(--primary-foreground)' }}
          />
        </div>
        <span
          className='font-bold text-base'
          style={{ color: 'var(--foreground)' }}
        >
          Empréstimos
        </span>
      </div>

      <nav className='flex flex-col gap-1 p-4 flex-1'>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer hover:bg-primary/10 hover:text-primary active:bg-primary/15 ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'bg-transparent text-muted-foreground'
              }`}
            >
              <Icon className='w-5 h-5' strokeWidth={active ? 2.5 : 1.8} />
              <span className={active ? 'font-semibold' : ''}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className='p-4 border-t' style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={handleLogout}
          className='flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15'
        >
          <LogOut className='w-5 h-5' />
          Sair
        </button>
      </div>
    </aside>
  );
}
