import { CalendarDays, Camera, CheckCircle2, CircleAlert, Play, Plus, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CameraDialog from '../components/CameraDialog.jsx';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function AttendancePage() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [title, setTitle] = useState('');
  const [sessionDate, setSessionDate] = useState(todayInIndia());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [classResponse, sessionResponse] = await Promise.all([api.get('/classes'), api.get('/attendance/sessions')]);
      setClasses(classResponse.data.items);
      setSessions(sessionResponse.data.items);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeSession = useMemo(() => sessions.find((item) => String(item.id) === String(sessionId)) || sessions.find((item) => item.status === 'active'), [sessions, sessionId]);
  const todaySessions = sessions.filter((item) => item.session_date === todayInIndia());

  useEffect(() => {
    if (!activeSession) { setRecords([]); return; }
    let alive = true;
    api.get('/attendance/records', { params: { session_id: activeSession.id, per_page: 100 } })
      .then(({ data }) => alive && setRecords(data.items))
      .catch((error) => alive && setNotice({ type: 'error', message: getApiError(error) }));
    return () => { alive = false; };
  }, [activeSession?.id, sessions]);

  async function createSession(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/sessions', { course_class_id: Number(classId), title, session_date: sessionDate });
      setSessionId(String(data.session.id));
      setTitle('');
      setNotice({ type: 'success', message: 'Attendance session created.' });
      await load();
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setBusy(false); }
  }

  async function changeSessionState(session, action) {
    try {
      await api.post(`/attendance/sessions/${session.id}/${action}`);
      setSessionId(String(session.id));
      setNotice({ type: 'success', message: action === 'start' ? 'Attendance session started.' : 'Attendance session ended.' });
      await load();
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
  }

  async function verifyAndMark(frames) {
    const data = new FormData();
    data.append('session_id', String(activeSession.id));
    data.append('image', frames[0], 'attendance-frame.jpg');
    try {
      const response = await api.post('/attendance/mark', data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 });
      const result = response.data;
      const messages = {
        marked: `Attendance recorded for ${result.record.student.full_name} (${result.record.student.roll_number}).`,
        already_marked: `${result.record.student.full_name} is already marked in this session.`,
        unknown: result.message || 'No registered student matched this face.',
        ambiguous: result.message || 'This image matched more than one student. Try again.',
        class_mismatch: result.message || 'This student is not on the selected class roster.',
      };
      const success = result.status === 'marked' || result.status === 'already_marked';
      setNotice({ type: success ? 'success' : 'error', message: messages[result.status] || result.message || 'The face could not be verified.' });
      if (success) {
        const { data: recordData } = await api.get('/attendance/records', { params: { session_id: activeSession.id, per_page: 100 } });
        setRecords(recordData.items);
      }
    } catch (error) { throw new Error(getApiError(error)); }
  }

  if (loading) return <Loading label="Loading attendance sessions…" />;
  return <>
    <PageHeading eyebrow="Live session" title="Take attendance" description="Start a class session, then verify one camera capture at a time. No automatic frame-by-frame marking." />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.message}</Notice>}
    <div className="grid items-start gap-5 xl:grid-cols-[.82fr_1.18fr]">
      <div className="space-y-5">
        <form onSubmit={createSession} className="surface card-shadow p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f6f2] text-[#188274]"><Plus size={18} /></span><div><h2 className="font-bold">Create session</h2><p className="text-xs text-slate-500">Choose a class, subject, and date.</p></div></div>
          <div className="space-y-4"><label className="block text-sm font-semibold">Class & subject<select className="input-control mt-2" required value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Choose a class</option>{classes.map((row) => <option key={row.id} value={row.id}>{row.class_name} · {row.section} — {row.subject}</option>)}</select></label><label className="block text-sm font-semibold">Session title<input className="input-control mt-2" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Morning lecture" /></label><label className="block text-sm font-semibold">Date<input type="date" className="input-control mt-2" required value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} /></label></div>
          <button disabled={busy || classes.length === 0} className="btn-primary mt-5 w-full">{busy ? 'Creating…' : <><CalendarDays size={16} /> Create session</>}</button>
          {classes.length === 0 && <p className="mt-3 text-xs text-amber-700">Create a class and subject before scheduling attendance.</p>}
        </form>
        <section className="surface card-shadow overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Today's sessions</h2><p className="mt-1 text-xs text-slate-500">{todaySessions.length} scheduled or active</p></div>
          {todaySessions.length ? <div className="divide-y divide-slate-100">{todaySessions.map((session) => <div key={session.id} className={`p-4 ${activeSession?.id === session.id ? 'bg-[#f2faf8]' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{session.title}</p><p className="mt-1 text-xs text-slate-500">{session.course_class.class_name} · {session.course_class.section} · {session.course_class.subject}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${session.status === 'active' ? 'bg-emerald-100 text-emerald-800' : session.status === 'ended' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{session.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{session.status === 'scheduled' && <button onClick={() => changeSessionState(session, 'start')} className="btn-primary !py-2 !text-xs"><Play size={14} /> Start</button>}{session.status === 'active' && <><button onClick={() => { setSessionId(String(session.id)); setCameraOpen(true); }} className="btn-primary !py-2 !text-xs"><Camera size={14} /> Verify a student</button><button onClick={() => changeSessionState(session, 'end')} className="btn-secondary !py-2 !text-xs"><Square size={13} /> End session</button></>}{session.status !== 'scheduled' && <button onClick={() => setSessionId(String(session.id))} className="btn-secondary !py-2 !text-xs">View records</button>}</div></div>)}</div> : <EmptyState title="No session scheduled for today" description="Create a session above, then start it when class begins." />}
        </section>
      </div>
      <div className="space-y-5">
        {activeSession?.status === 'active' ? <section className="rounded-3xl bg-[#172033] p-5 text-white shadow-lg sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#75d9c4]">Active now</p><h2 className="mt-2 text-xl font-bold">{activeSession.title}</h2><p className="mt-1 text-sm text-slate-400">{activeSession.course_class.class_name} · {activeSession.course_class.section} · {activeSession.course_class.subject}</p></div><span className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Live</span></div><div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.05] p-4"><div><p className="font-semibold">Manual camera verification</p><p className="mt-1 text-xs text-slate-400">The API checks identity and class roster before marking.</p></div><button onClick={() => setCameraOpen(true)} className="btn-primary shrink-0"><Camera size={15} /> Capture</button></div></section> : <section className="surface card-shadow p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><CircleAlert size={18} /></span><div><h2 className="font-bold">Select an active session</h2><p className="mt-1 text-sm leading-6 text-slate-500">Camera access is only requested after you start a session and choose Verify a student.</p></div></div></section>}
        <section className="surface card-shadow overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Marked in this session</h2><p className="mt-1 text-xs text-slate-500">{records.length} present</p></div><CheckCircle2 className="text-[#188274]" size={19} /></div>
          {records.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Student</th><th>Verified at</th><th>Similarity</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><p className="font-semibold">{record.student.full_name}</p><p className="text-xs text-slate-500">{record.student.roll_number}</p></td><td className="text-sm text-slate-500">{new Date(record.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{record.similarity.toFixed(3)}</span></td></tr>)}</tbody></table></div> : <EmptyState title="No attendance marks yet" description="Verified students will appear here as the session runs." />}
        </section>
      </div>
    </div>
    {cameraOpen && activeSession?.status === 'active' && <CameraDialog mode="mark" title={`Verify a student · ${activeSession.title}`} onClose={() => setCameraOpen(false)} onSubmit={verifyAndMark} />}
  </>;
}
