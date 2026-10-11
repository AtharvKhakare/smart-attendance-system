import { Activity, BookOpenCheck, GraduationCap, LayoutDashboard, LogOut, ScanFace, ShieldCheck, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.jsx';

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/classes', label: 'Classes & subjects', icon: GraduationCap },
  { to: '/attendance', label: 'Take attendance', icon: ScanFace },
  { to: '/reports', label: 'Reports', icon: BookOpenCheck },
  { to: '/audit', label: 'Audit history', icon: Activity },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }
  return (
    <div className="min-h-screen bg-[#f6f7fb] lg:flex">
      <aside className="flex w-full flex-col bg-[#172033] text-white lg:fixed lg:inset-y-0 lg:w-[250px]">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#42c4ad] text-[#14252e]"><ScanFace size={22} /></div>
          <div><p className="font-bold tracking-tight">Attendly</p><p className="text-xs text-slate-400">Smart attendance</p></div>
        </div>
        <div className="px-4 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Workspace</div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-white/10 font-semibold text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 pb-5 lg:block">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#72d5c0]"><ShieldCheck size={15} /> Privacy first</div>
            <p className="text-xs leading-5 text-slate-400">Face matching happens on the secure API. Raw camera frames are not saved.</p>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-[250px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e8ebf2] bg-white/85 px-5 backdrop-blur-xl sm:px-8">
          <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Admin workspace</div>
          <div className="flex w-full items-center justify-end gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e5f6f2] text-sm font-bold text-[#187c72]">{user?.email?.[0]?.toUpperCase() || 'A'}</div>
            <div className="mr-2 text-right"><p className="max-w-40 truncate text-sm font-semibold">{user?.email}</p><p className="text-[11px] capitalize text-slate-500">{user?.role}</p></div>
            <button onClick={handleLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-5 sm:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
