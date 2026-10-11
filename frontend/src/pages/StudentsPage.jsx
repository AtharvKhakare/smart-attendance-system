import { Camera, ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import CameraDialog from '../components/CameraDialog.jsx';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

const blank = { full_name: '', roll_number: '', department: '', class_name: '', section: 'A', email: '', phone: '' };

function StudentForm({ initial, onCancel, onSave, saving }) {
  const [values, setValues] = useState(initial || blank);
  function change(event) { setValues((state) => ({ ...state, [event.target.name]: event.target.value })); }
  async function submit(event) { event.preventDefault(); await onSave(values); }
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#101827]/55 p-3 backdrop-blur-sm sm:p-6"><form onSubmit={submit} className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
    <div className="mb-5 flex items-start justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.13em] text-[#238f84]">Student profile</p><h2 className="text-xl font-bold">{initial ? 'Edit student' : 'Register student'}</h2></div><button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {[['full_name', 'Full name', 'e.g. Asha Patil'], ['roll_number', 'Roll number', 'e.g. CS-001'], ['department', 'Department', 'e.g. Computer Science'], ['class_name', 'Class', 'e.g. BSc CS Year 3'], ['section', 'Section', 'A'], ['email', 'Email', 'student@college.edu'], ['phone', 'Phone (optional)', '9876543210']].map(([name, label, placeholder]) => <label key={name} className={`block text-sm font-semibold text-slate-700 ${name === 'phone' ? 'sm:col-span-2' : ''}`}>{label}<input name={name} type={name === 'email' ? 'email' : 'text'} required={name !== 'phone'} maxLength={name === 'full_name' ? 160 : name === 'roll_number' ? 40 : name === 'section' || name === 'phone' ? 30 : name === 'email' ? 254 : 100} value={values[name] || ''} onChange={change} placeholder={placeholder} className="input-control mt-2" /></label>)}
    </div>
    <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button disabled={saving} className="btn-primary">{saving ? 'Saving…' : initial ? 'Save changes' : 'Create student'}</button></div>
  </form></div>;
}

function PortalPasswordDialog({ student, onCancel, onSave, saving }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [problem, setProblem] = useState('');
  async function submit(event) {
    event.preventDefault();
    setProblem('');
    if (password !== confirmation) { setProblem('The passwords do not match.'); return; }
    if (password.length < 12) { setProblem('Use at least 12 characters.'); return; }
    try { await onSave(password); }
    catch (error) { setProblem(error.message); }
  }
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#101827]/55 p-4 backdrop-blur-sm"><form onSubmit={submit} className="my-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
    <div className="mb-4 flex items-start justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.13em] text-[#238f84]">Student portal</p><h2 className="text-xl font-bold">{student.portal_enabled ? 'Reset student password' : 'Create student login'}</h2></div><button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
    <p className="mb-4 text-sm leading-6 text-slate-500">The student will sign in with <strong className="text-slate-700">{student.email}</strong>. Set a temporary password and share it privately. Ask the student to change it after signing in.</p>
    {problem && <Notice>{problem}</Notice>}
    <div className="space-y-4"><label className="block text-sm font-semibold text-slate-700">Temporary password<input required minLength={12} maxLength={128} autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-control mt-2" /><span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters.</span></label><label className="block text-sm font-semibold text-slate-700">Confirm password<input required minLength={12} maxLength={128} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input-control mt-2" /></label></div>
    <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button disabled={saving} className="btn-primary">{saving ? 'Saving…' : student.portal_enabled ? 'Reset password' : 'Create login'}</button></div>
  </form></div>;
}

export default function StudentsPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [className, setClassName] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [faceStudent, setFaceStudent] = useState(null);
  const [accountStudent, setAccountStudent] = useState(null);
  const [accountSaving, setAccountSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/students', { params: { q: query, department, class_name: className, page, per_page: 15 } });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setLoading(false); }
  }, [query, department, className, page]);
  useEffect(() => { load(); }, [load]);

  async function save(values) {
    setSaving(true);
    try {
      if (form.id) await api.put(`/students/${form.id}`, values);
      else await api.post('/students', values);
      setForm(null);
      setNotice({ type: 'success', message: form.id ? 'Student details updated.' : 'Student registered.' });
      await load();
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setSaving(false); }
  }

  async function deactivate(student) {
    if (!window.confirm(`Deactivate ${student.full_name}? Their face templates will be removed and attendance history will stay.`)) return;
    try {
      await api.delete(`/students/${student.id}`);
      setNotice({ type: 'success', message: `${student.full_name} was deactivated.` });
      await load();
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
  }

  async function registerFace(frames) {
    const data = new FormData();
    frames.forEach((frame, index) => data.append('images', frame, `capture-${index + 1}.jpg`));
    try {
      await api.post(`/face/register/${faceStudent.id}`, data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 });
      setNotice({ type: 'success', message: `Face data registered for ${faceStudent.full_name}.` });
      await load();
    } catch (error) { throw new Error(getApiError(error)); }
  }

  async function savePortalPassword(password) {
    setAccountSaving(true);
    try {
      await api.post(`/students/${accountStudent.id}/account`, { password });
      setAccountStudent(null);
      setNotice({ type: 'success', message: `Student login is ready for ${accountStudent.email}. Share the temporary password privately.` });
      await load();
    } catch (error) { throw new Error(getApiError(error)); }
    finally { setAccountSaving(false); }
  }

  return <>
    <PageHeading eyebrow="Student directory" title="Students" description="Manage student details and privately enroll face templates for attendance." action={<button onClick={() => setForm({ id: null })} className="btn-primary"><Plus size={17} /> Add student</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.message}</Notice>}
    <section className="surface card-shadow p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_190px_190px_auto]">
        <div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input-control pl-10" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, roll number, or email" aria-label="Search students" /></div>
        <input className="input-control" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} placeholder="Filter department" aria-label="Filter by department" />
        <input className="input-control" value={className} onChange={(event) => { setClassName(event.target.value); setPage(1); }} placeholder="Filter class" aria-label="Filter by class" />
        <button onClick={() => { setQuery(''); setDepartment(''); setClassName(''); setPage(1); }} className="btn-secondary">Clear</button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{pagination.total} active {pagination.total === 1 ? 'student' : 'students'}</span><span>Face templates are encrypted on the server.</span></div>
    </section>
    <section className="surface card-shadow mt-5 overflow-hidden">
      {loading ? <Loading label="Loading student records…" /> : items.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Student</th><th>Roll number</th><th>Department / class</th><th>Face data</th><th>Portal</th><th className="text-right">Actions</th></tr></thead><tbody>{items.map((student) => <tr key={student.id}><td><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f6f2] text-sm font-bold text-[#187c72]">{student.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold">{student.full_name}</p><p className="truncate text-xs text-slate-500">{student.email}</p></div></div></td><td className="font-medium">{student.roll_number}</td><td><p>{student.department}</p><p className="text-xs text-slate-500">{student.class_name} · {student.section}</p></td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.face_registered ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{student.face_registered ? 'Enrolled' : 'Not enrolled'}</span></td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.portal_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{student.portal_enabled ? 'Enabled' : 'Not set up'}</span></td><td><div className="flex justify-end gap-1"><button title={student.portal_enabled ? 'Reset student portal password' : 'Create student portal login'} onClick={() => setAccountStudent(student)} className="grid h-9 w-9 place-items-center rounded-xl text-indigo-600 hover:bg-indigo-50"><KeyRound size={16} /></button><button title={student.face_registered ? 'Replace face enrollment' : 'Enroll face'} onClick={() => setFaceStudent(student)} className="grid h-9 w-9 place-items-center rounded-xl text-[#188274] hover:bg-[#e8f6f2]"><Camera size={16} /></button><button title="Edit" onClick={() => setForm({ id: student.id, full_name: student.full_name, roll_number: student.roll_number, department: student.department, class_name: student.class_name, section: student.section, email: student.email, phone: student.phone || '' })} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button><button title="Deactivate" onClick={() => deactivate(student)} className="grid h-9 w-9 place-items-center rounded-xl text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No students found" description="Try another search or register your first student." />}
      {!loading && pagination.pages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><p className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages}</p><div className="flex gap-2"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="btn-secondary !px-3 !py-2" aria-label="Previous page"><ChevronLeft size={16} /></button><button onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages} className="btn-secondary !px-3 !py-2" aria-label="Next page"><ChevronRight size={16} /></button></div></div>}
    </section>
    {form && <StudentForm initial={form.id ? form : null} saving={saving} onCancel={() => setForm(null)} onSave={save} />}
    {accountStudent && <PortalPasswordDialog student={accountStudent} saving={accountSaving} onCancel={() => setAccountStudent(null)} onSave={savePortalPassword} />}
    {faceStudent && <CameraDialog title={`Enroll face · ${faceStudent.full_name}`} onClose={() => setFaceStudent(null)} onSubmit={registerFace} />}
  </>;
}
