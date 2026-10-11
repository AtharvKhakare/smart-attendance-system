import { Activity, CalendarDays, CheckCircle2, Clock3, GraduationCap, KeyRound, LogOut, RotateCcw, ShieldCheck, UsersRound, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loading, Notice } from '../components/UI.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api, getApiError } from '../services/api.js';

const initialPasswordForm = { current_password: '', new_password: '', confirm_password: '' };

function PasswordDialog({ onClose, onSave, saving }) {
  const [values, setValues] = useState(initialPasswordForm);
  const [error, setError] = useState('');
  function change(event) { setValues((state) => ({ ...state, [event.target.name]: event.target.value })); }
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (values.new_password !== values.confirm_password) {
      setError('The new passwords do not match.');
      return;
    }
    try { await onSave(values.current_password, values.new_password); }
    catch (reason) { setError(getApiError(reason)); }
  }
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#101827]/55 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="my-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.13em] text-[#238f84]">Account security</p><h2 className="text-xl font-bold">Change password</h2></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><XCircle size={18} /></button></div>
      {error && <Notice>{error}</Notice>}
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Current password<input required autoComplete="current-password" type="password" name="current_password" value={values.current_password} onChange={change} className="input-control mt-2" /></label>
        <label className="block text-sm font-semibold text-slate-700">New password<input required minLength={12} maxLength={128} autoComplete="new-password" type="password" name="new_password" value={values.new_password} onChange={change} className="input-control mt-2" /><span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span></label>
        <label className="block text-sm font-semibold text-slate-700">Confirm new password<input required minLength={12} maxLength={128} autoComplete="new-password" type="password" name="confirm_password" value={values.confirm_password} onChange={change} className="input-control mt-2" /></label>
      </div>
      <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Update password'}</button></div>
    </form>
  </div>;
}

function attendanceBadge(status) {
  if (status === 'present') return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} />Present</span>;
  if (status === 'absent') return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"><XCircle size={14} />Absent</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Clock3 size={14} />In progress</span>;
}

export default function StudentPortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/student/attendance', { params: { from_date: fromDate || undefined, to_date: toDate || undefined } });
      setData(response.data);
      setNotice(null);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setLoading(false); }
  }, [fromDate, toDate]);
  useEffect(() => { load(); }, [load]);

  async function savePassword(currentPassword, newPassword) {
    setSavingPassword(true);
    try {
      await api.put('/student/password', { current_password: currentPassword, new_password: newPassword });
      setPasswordDialog(false);
      setNotice({ type: 'success', message: 'Your password was changed.' });
    } finally { setSavingPassword(false); }
  }

  async function signOut() {
    await logout();
    navigate('/student/login', { replace: true });
  }

  const student = data?.student;
  const summary = data?.summary;
  const attendanceItems = data?.items || [];
  const attendanceRate = Math.max(0, Math.min(100, Number(summary?.attendance_percentage) || 0));
  const initials = student?.full_name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'S';
  return <div className="min-h-screen bg-[#f6f7fb]">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#dff6f1] text-[#187c72] shadow-sm"><CalendarDays size={20} /></div><div><p className="font-bold tracking-tight text-[#172033]">Attendly</p><p className="text-[11px] font-medium text-slate-500">STUDENT SPACE</p></div></div>
        <div className="flex items-center gap-2"><button onClick={() => setPasswordDialog(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"><KeyRound size={16} /><span className="hidden sm:inline">Security</span></button><button onClick={signOut} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button></div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-7 sm:py-9 lg:px-10">
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.message}</Notice>}
      {loading ? <Loading label="Loading your attendance…" /> : student && <>
        <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#172033] p-6 text-white shadow-[0_24px_65px_rgba(20,32,51,.18)] sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border border-white/10" /><div className="pointer-events-none absolute -right-3 -top-14 h-56 w-56 rounded-full border border-white/[.08]" /><div className="pointer-events-none absolute bottom-0 right-32 h-40 w-40 rounded-full bg-[#40c7ac]/10 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-xs font-semibold text-[#9be5d6]"><Activity size={14} /> ATTENDANCE OVERVIEW</div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Welcome back, {student.full_name.split(' ')[0]} <span aria-hidden="true">👋</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Your learning journey, class participation, and attendance history—all in one place.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-slate-200">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2"><GraduationCap size={14} />{student.class_name}</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2"><UsersRound size={14} />Section {student.section} · {student.roll_number}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-4 md:min-w-64">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#67d8c0] to-[#168579] text-lg font-bold text-[#112a30]">{initials}</div>
              <div className="min-w-0"><p className="truncate font-semibold">{student.full_name}</p><p className="mt-0.5 truncate text-xs text-slate-300">{student.department}</p><p className="mt-1 truncate text-[11px] text-slate-400">{student.email || user?.email}</p></div>
              <div className="ml-auto grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#56cdb5]/30 bg-[#56cdb5]/10 text-[#8be2d0]"><ShieldCheck size={21} /></div>
            </div>
          </div>
        </section>
        <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Classes held', value: summary?.classes_held ?? 0, detail: 'Completed sessions', icon: CalendarDays, tint: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
            { label: 'Present', value: summary?.present ?? 0, detail: 'You attended', icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
            { label: 'Absent', value: summary?.absent ?? 0, detail: 'Missed sessions', icon: XCircle, tint: 'bg-rose-50 text-rose-700', bar: 'bg-rose-400' },
            { label: 'Attendance rate', value: `${summary?.attendance_percentage ?? 0}%`, detail: 'Of completed sessions', icon: Activity, tint: 'bg-teal-50 text-teal-700', bar: 'bg-teal-500', progress: true },
          ].map(({ label, value, detail, icon: Icon, tint, bar, progress }) => <article key={label} className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(25,39,68,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(25,39,68,.09)]">
            <div className="mb-5 flex items-start justify-between"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${tint}`}><Icon size={19} /></div><span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">This term</span></div>
            <p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-[#172033]">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p>
            {progress && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${attendanceRate}%` }} /></div>}
          </article>)}
        </section>
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_12px_38px_rgba(25,39,68,.055)]">
          <div className="flex flex-col gap-5 border-b border-slate-100 px-5 py-5 sm:px-7 sm:py-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><CalendarDays size={19} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold tracking-tight text-[#172033]">Attendance history</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">{attendanceItems.length} records</span></div><p className="mt-1 text-sm text-slate-500">Review your class-by-class attendance record.</p></div></div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end xl:w-auto">
              <label className="text-xs font-semibold text-slate-500">From date<input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input-control mt-1 !rounded-xl !py-2.5" /></label>
              <label className="text-xs font-semibold text-slate-500">To date<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input-control mt-1 !rounded-xl !py-2.5" /></label>
              <button onClick={() => { setFromDate(''); setToDate(''); }} className="btn-secondary h-[42px] !rounded-xl !py-2" aria-label="Clear date filters"><RotateCcw size={15} />Reset</button>
            </div>
          </div>
          {attendanceItems.length ? <div className="table-wrap"><table className="table-base"><thead className="bg-slate-50/80"><tr><th className="!px-6">Date</th><th>Class session</th><th>Subject</th><th>Status</th></tr></thead><tbody>{attendanceItems.map((item) => <tr key={item.session_id}><td className="whitespace-nowrap !px-6"><span className="inline-flex items-center gap-2 font-medium text-slate-600"><CalendarDays size={15} className="text-slate-400" />{new Date(`${item.session_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></td><td><p className="font-semibold text-[#172033]">{item.session_title}</p><p className="mt-0.5 text-xs text-slate-500">{item.class_name} · Section {item.section}</p></td><td className="text-slate-600">{item.subject}</td><td>{attendanceBadge(item.status)}</td></tr>)}</tbody></table></div> : <div className="grid min-h-64 place-items-center px-6 py-10 text-center"><div className="max-w-sm"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><CalendarDays size={23} /></div><p className="font-semibold text-slate-800">No attendance records yet</p><p className="mt-1 text-sm leading-6 text-slate-500">Your attendance history will appear here after your teacher records a class session.</p><button onClick={() => { setFromDate(''); setToDate(''); }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"><RotateCcw size={14} />Clear date filters</button></div></div>}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 text-xs text-slate-500 sm:px-7"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-teal-600" />Private view · only your records</span><span className="hidden sm:inline">Updated when you change the date range</span></div>
        </section>
      </>}
    </main>
    {passwordDialog && <PasswordDialog onClose={() => setPasswordDialog(false)} saving={savingPassword} onSave={savePassword} />}
  </div>;
}
