import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenCheck, ScanFace, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

function StatCard({ label, value, note, icon: Icon, accent = 'teal' }) {
  const palette = accent === 'blue' ? 'bg-blue-50 text-blue-600' : accent === 'orange' ? 'bg-orange-50 text-orange-600' : accent === 'purple' ? 'bg-violet-50 text-violet-600' : 'bg-[#e4f6f1] text-[#188274]';
  return <div className="surface card-shadow p-5 sm:p-6"><div className="flex items-start justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><span className={`grid h-10 w-10 place-items-center rounded-xl ${palette}`}><Icon size={19} /></span></div><p className="mt-5 text-3xl font-bold tracking-tight text-[#172033]">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/dashboard/stats'), api.get('/dashboard/recent-activity?limit=6')])
      .then(([statsResponse, activityResponse]) => {
        if (!active) return;
        setStats(statsResponse.data);
        setActivity(activityResponse.data.items);
      })
      .catch((reason) => active && setError(getApiError(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <Loading label="Preparing your overview…" />;
  return <>
    <PageHeading eyebrow="Your college at a glance" title="Attendance overview" description="A live view of attendance activity and class coverage." action={<Link to="/attendance" className="btn-primary"><ScanFace size={16} /> Take attendance</Link>} />
    <Notice>{error}</Notice>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active students" value={stats?.total_students ?? 0} note="Currently registered" icon={Users} />
      <StatCard label="Present today" value={stats?.present_today ?? 0} note={`${stats?.expected_today ?? 0} students expected today`} icon={ArrowUpRight} accent="blue" />
      <StatCard label="Absent today" value={stats?.absent_today ?? 0} note="Across classes with a session" icon={ArrowDownRight} accent="orange" />
      <StatCard label="Attendance rate" value={`${stats?.attendance_percentage ?? 0}%`} note="Unique students present today" icon={BookOpenCheck} accent="purple" />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="surface card-shadow p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-bold">Attendance trend</h2><p className="mt-1 text-xs text-slate-500">Last seven days · actual session and roster data</p></div><span className="rounded-lg bg-[#e9f7f3] px-2.5 py-1 text-xs font-semibold text-[#187c72]">7 days</span></div>
        {(stats?.attendance_trend || []).some((item) => item.expected > 0) ? <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.attendance_trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#27a997" stopOpacity={0.24} /><stop offset="100%" stopColor="#27a997" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} axisLine={false} tickLine={false} tick={{ fill: '#8992a4', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8992a4', fontSize: 11 }} allowDecimals={false} /><Tooltip labelFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString()} formatter={(value, name) => [value, name === 'present' ? 'Present' : 'Expected']} /><Area type="monotone" dataKey="expected" stroke="#a9b4c5" strokeDasharray="5 5" strokeWidth={2} fill="transparent" /><Area type="monotone" dataKey="present" stroke="#239689" strokeWidth={3} fill="url(#presentFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No attendance sessions yet" description="Start a session to see real attendance trends here." />}
      </section>
      <section className="surface card-shadow p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Class coverage</h2><p className="mt-1 text-xs text-slate-500">Sessions held today</p></div><Link to="/reports" className="text-xs font-semibold text-[#188274] hover:underline">Reports</Link></div>
        {stats?.class_summary?.length ? <div className="space-y-5">{stats.class_summary.map((item) => <div key={item.class_id}><div className="mb-2 flex justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.class_name} · {item.section}</p><p className="text-xs text-slate-500">{item.department} · {item.subject}</p></div><div className="text-right"><p className="text-sm font-bold">{item.attendance_percentage}%</p><p className="text-[11px] text-slate-500">{item.present}/{item.expected}</p></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#28a996] transition-all" style={{ width: `${Math.min(100, item.attendance_percentage)}%` }} /></div></div>)}</div> : <EmptyState title="No class sessions today" description="Create a class and start an attendance session." />}
      </section>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface card-shadow overflow-hidden"><div className="flex items-center justify-between px-5 py-5 sm:px-6"><div><h2 className="font-bold">Recent activity</h2><p className="mt-1 text-xs text-slate-500">Latest verified attendance marks</p></div><Link to="/reports" className="text-xs font-semibold text-[#188274] hover:underline">View records</Link></div>
        {activity.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Student</th><th>Class</th><th>Time</th></tr></thead><tbody>{activity.map((row) => <tr key={row.id}><td><div className="font-semibold">{row.student.full_name}</div><div className="text-xs text-slate-500">{row.student.roll_number}</div></td><td>{row.class_name} · {row.section}</td><td className="whitespace-nowrap text-slate-500">{new Date(row.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>)}</tbody></table></div> : <EmptyState title="No recent activity" description="Verified attendance marks will appear here." />}
      </section>
      <section className="rounded-3xl bg-[#e7f5f1] p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.13em] text-[#187c72]">Quick actions</p><h2 className="mt-2 text-xl font-bold">Keep things moving</h2><p className="mt-2 text-sm leading-6 text-slate-600">Add a student, prepare a class, or open an attendance session.</p><div className="mt-5 grid gap-2"><Link to="/students" className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-2"><Users size={16} className="text-[#188274]" /> Register a student</span><ArrowRight size={16} /></Link><Link to="/classes" className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-2"><BookOpenCheck size={16} className="text-[#188274]" /> Set up a class</span><ArrowRight size={16} /></Link><Link to="/attendance" className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-2"><ScanFace size={16} className="text-[#188274]" /> Start attendance</span><ArrowRight size={16} /></Link></div></section>
    </div>
  </>;
}
