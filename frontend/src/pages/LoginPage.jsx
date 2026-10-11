import { ArrowRight, Eye, EyeOff, Fingerprint, GraduationCap, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Notice } from '../components/UI.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getApiError, missingProductionApiUrl } from '../services/api.js';

export default function LoginPage({ audience = 'admin' }) {
  const isStudent = audience === 'student';
  const { login, logout, busy } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const portals = [
    { role: 'admin', title: 'Admin Portal', description: 'Manage students, classes, attendance, and reports.', icon: ShieldCheck, path: '/login' },
    { role: 'student', title: 'Student Portal', description: 'View your attendance history and profile.', icon: GraduationCap, path: '/student/login' },
  ];

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      if (user.role !== (isStudent ? 'student' : 'admin')) {
        await logout();
        setError(isStudent ? 'This account is not set up as a student account.' : 'This portal is for administrators. Use the student login link if you are a student.');
        return;
      }
      navigate(isStudent ? '/student/attendance' : location.state?.from?.pathname || '/', { replace: true });
    } catch (reason) {
      setError(getApiError(reason));
    }
  }

  return <div className="min-h-screen bg-[#172033] lg:grid lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
      <div className="absolute -left-28 top-24 h-80 w-80 rounded-full bg-[#36b9a5]/15 blur-3xl" /><div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#477ee8]/15 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#42c4ad] text-[#14252e]"><Fingerprint size={24} /></div><div><p className="font-bold">Attendly</p><p className="text-xs text-slate-400">Smart attendance</p></div></div>
      <div className="relative max-w-xl pb-10"><p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#9be5d6]"><ShieldCheck size={14} /> Verified attendance, thoughtfully managed</p><h1 className="text-5xl font-bold leading-[1.12] tracking-tight xl:text-[58px]">Attendance that keeps the focus on <span className="text-[#62d2bc]">learning.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-400">Manage student records, start class sessions, and review attendance from one clear workspace.</p></div>
      <p className="relative text-xs text-slate-500">Face matching is performed by the protected API. Raw image files are not kept as application records.</p>
    </section>
    <section className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3 lg:hidden"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#dff6f1] text-[#187c72]"><Fingerprint size={24} /></div><div><p className="text-sm font-extrabold tracking-wide text-[#172033]">SMART ATTENDANCE SYSTEM</p><p className="text-xs text-slate-500">Face Recognition Attendance Portal</p></div></div>
        <div className="mb-7">
          <p className="mb-3 text-xs font-bold uppercase tracking-[.15em] text-[#238f84]">Choose your portal</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {portals.map(({ role, title, description, icon: Icon, path }) => {
              const selected = audience === role;
              return <button key={role} type="button" aria-pressed={selected} onClick={() => { setError(''); navigate(path, { replace: true }); }} className={`group rounded-2xl border-2 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-[#238f84] bg-[#eaf8f5] shadow-sm' : 'border-slate-200 bg-white hover:border-[#a8d9d1]'}`}>
                <div className="flex items-start justify-between gap-2"><div className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? 'bg-[#187f75] text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-[#eaf8f5] group-hover:text-[#187f75]'}`}><Icon size={19} /></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${selected ? 'bg-[#187f75] text-white' : 'bg-slate-100 text-slate-500'}`}>{selected ? 'Selected' : 'Select'}</span></div>
                <h3 className="mt-3 font-bold text-[#172033]">{title}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
              </button>;
            })}
          </div>
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.15em] text-[#238f84]">{isStudent ? 'Student access' : 'Administrator access'}</p><h2 className="text-3xl font-bold tracking-tight text-[#172033]">Welcome back</h2><p className="mt-2 text-sm text-slate-500">{isStudent ? 'Sign in to view your attendance and student details.' : 'Sign in with your college administrator account.'}</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          {missingProductionApiUrl && <Notice>Production configuration is incomplete. Set VITE_API_BASE_URL to your HTTPS Flask API URL in the Vercel project settings.</Notice>}
          <Notice>{error}</Notice>
          <label className="block text-sm font-semibold text-slate-700">Email address<input required autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-control mt-2" placeholder={isStudent ? 'student@college.edu' : 'admin@college.edu'} /></label>
          <label className="block text-sm font-semibold text-slate-700">Password<div className="relative mt-2"><input required autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="input-control pr-12" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <button disabled={busy} className="btn-primary w-full py-3">{busy ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button>
        </form>
        {isStudent && <p className="mt-4 text-center text-xs leading-5 text-slate-500">First time here? Ask your college administrator to create your student login and temporary password.</p>}
        <div className="mt-7 flex items-start gap-2 rounded-xl border border-[#e7ebf1] bg-white p-3 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#238f84]" /><p>Your access token is held in memory and clears when you close this tab. Face data and database credentials never enter the browser.</p></div>
      </div>
    </section>
  </div>;
}
