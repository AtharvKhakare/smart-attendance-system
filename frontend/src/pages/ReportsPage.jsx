import { CalendarDays, Download, Filter } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const today = indiaDate();
const [year, month, day] = today.split('-').map(Number);
const initialFrom = new Date(Date.UTC(year, month - 1, day - 6)).toISOString().slice(0, 10);

export default function ReportsPage() {
  const [classes, setClasses] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(today);
  const [classId, setClassId] = useState('');
  const [department, setDepartment] = useState('');
  const [studentId, setStudentId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const params = { from_date: fromDate, to_date: toDate, class_id: classId || undefined, department: department || undefined, student_id: studentId || undefined };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsResponse, reportResponse] = await Promise.all([
        api.get('/attendance/records', { params: { ...params, page, per_page: 15 } }),
        api.get('/attendance/reports', { params }),
      ]);
      setRecords(recordsResponse.data.items);
      setPagination(recordsResponse.data.pagination);
      setSummary(reportResponse.data);
      setNotice(null);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setLoading(false); }
  }, [fromDate, toDate, classId, department, studentId, page]);

  useEffect(() => { api.get('/classes').then(({ data }) => setClasses(data.items)).catch((error) => setNotice({ type: 'error', message: getApiError(error) })); }, []);
  useEffect(() => { load(); }, [load]);

  async function exportCsv() {
    setExporting(true);
    try {
      const { data } = await api.get('/attendance/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'attendance-records.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setExporting(false); }
  }

  return <>
    <PageHeading eyebrow="Attendance insights" title="Reports" description="Review verified attendance, filter records, and export CSV data." action={<button onClick={exportCsv} disabled={exporting || !pagination.total} className="btn-primary"><Download size={16} /> {exporting ? 'Preparing…' : 'Export CSV'}</button>} />
    {notice && <Notice type={notice.type}>{notice.message}</Notice>}
    <section className="surface card-shadow p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Filter size={16} className="text-[#188274]" /> Filters</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-500">From date<input type="date" className="input-control mt-1.5" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} /></label>
        <label className="text-xs font-semibold text-slate-500">To date<input type="date" className="input-control mt-1.5" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} /></label>
        <label className="text-xs font-semibold text-slate-500">Class & subject<select className="input-control mt-1.5" value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1); }}><option value="">All classes</option>{classes.map((row) => <option key={row.id} value={row.id}>{row.class_name} · {row.section} — {row.subject}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">Department<input className="input-control mt-1.5" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} placeholder="All departments" /></label>
        <label className="text-xs font-semibold text-slate-500">Student ID<input type="number" min="1" className="input-control mt-1.5" value={studentId} onChange={(event) => { setStudentId(event.target.value); setPage(1); }} placeholder="All students" /></label>
      </div>
    </section>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Sessions', summary?.summary.sessions ?? 0], ['Expected', summary?.summary.expected ?? 0], ['Present', summary?.summary.present ?? 0], ['Attendance rate', `${summary?.summary.attendance_percentage ?? 0}%`],
    ].map(([label, value]) => <div key={label} className="surface card-shadow p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="surface card-shadow overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Class summary</h2><p className="mt-1 text-xs text-slate-500">Expected and present counts across sessions</p></div>{summary?.by_class?.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Class</th><th>Present</th><th>Rate</th></tr></thead><tbody>{summary.by_class.map((row) => <tr key={row.class_id}><td><p className="font-semibold">{row.class_name} · {row.section}</p><p className="text-xs text-slate-500">{row.subject}</p></td><td>{row.present}/{row.expected}</td><td><span className="rounded-full bg-[#e9f7f3] px-2.5 py-1 text-xs font-bold text-[#187c72]">{row.attendance_percentage}%</span></td></tr>)}</tbody></table></div> : <EmptyState title="No completed attendance sessions" description="Create sessions and mark attendance to build reports." />}</section>
      <section className="surface card-shadow overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Attendance records</h2><p className="mt-1 text-xs text-slate-500">{pagination.total} records</p></div><CalendarDays size={18} className="text-slate-400" /></div>
        {loading ? <Loading label="Loading report…" /> : records.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Student</th><th>Session / class</th><th>Date</th><th>Time</th><th>Similarity</th></tr></thead><tbody>{records.map((row) => <tr key={row.id}><td><p className="font-semibold">{row.student.full_name}</p><p className="text-xs text-slate-500">{row.student.roll_number}</p></td><td><p className="font-medium">{row.session_title}</p><p className="text-xs text-slate-500">{row.class.class_name} · {row.class.section}</p></td><td className="whitespace-nowrap">{row.session_date}</td><td className="whitespace-nowrap text-slate-500">{new Date(row.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>{row.similarity.toFixed(3)}</td></tr>)}</tbody></table></div> : <EmptyState title="No records for these filters" description="Adjust the filters or run an attendance session." />}
        {!loading && pagination.pages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages}</span><div className="flex gap-2"><button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-secondary">Previous</button><button onClick={() => setPage(Math.min(pagination.pages, page + 1))} disabled={page >= pagination.pages} className="btn-secondary">Next</button></div></div>}
      </section>
    </div>
  </>;
}
