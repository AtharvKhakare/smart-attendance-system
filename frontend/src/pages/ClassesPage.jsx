import { BookOpen, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

const initial = { department: '', class_name: '', section: 'A', subject: '' };

export default function ClassesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/classes');
      setItems(data.items);
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/classes', form);
      setForm(initial);
      setNotice({ type: 'success', message: 'Class and subject created.' });
      await load();
    } catch (error) { setNotice({ type: 'error', message: getApiError(error) }); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeading eyebrow="Academic structure" title="Classes & subjects" description="Set up the class, section, and subject combinations used by attendance sessions." />
    {notice && <Notice type={notice.type}>{notice.message}</Notice>}
    <div className="grid items-start gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={submit} className="surface card-shadow p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f6f2] text-[#188274]"><Plus size={18} /></span><div><h2 className="font-bold">Add a class subject</h2><p className="text-xs text-slate-500">Each subject gets its own attendance sessions.</p></div></div>
        <div className="space-y-4">
          {[['department', 'Department', 'Computer Science'], ['class_name', 'Class name', 'BSc CS Year 3'], ['section', 'Section', 'A'], ['subject', 'Subject', 'Database Systems']].map(([name, label, placeholder]) => <label key={name} className="block text-sm font-semibold text-slate-700">{label}<input className="input-control mt-2" name={name} value={form[name]} onChange={(event) => setForm((state) => ({ ...state, [name]: event.target.value }))} placeholder={placeholder} maxLength={name === 'section' ? 30 : name === 'subject' ? 120 : 100} required /></label>)}
        </div>
        <button disabled={saving} className="btn-primary mt-5 w-full">{saving ? 'Saving…' : <><Plus size={16} /> Create class subject</>}</button>
      </form>
      <section className="surface card-shadow overflow-hidden">
        <div className="flex items-center justify-between px-5 py-5 sm:px-6"><div><h2 className="font-bold">Registered class subjects</h2><p className="mt-1 text-xs text-slate-500">{items.length} total</p></div><BookOpen size={18} className="text-slate-400" /></div>
        {loading ? <Loading label="Loading classes…" /> : items.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Class / section</th><th>Department</th><th>Subject</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="font-semibold">{item.class_name}<span className="ml-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{item.section}</span></td><td>{item.department}</td><td>{item.subject}</td></tr>)}</tbody></table></div> : <EmptyState title="No classes yet" description="Add your first class and subject to schedule attendance." />}
      </section>
    </div>
  </>;
}
