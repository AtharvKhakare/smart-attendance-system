import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, Notice, PageHeading } from '../components/UI.jsx';
import { api, getApiError } from '../services/api.js';

export default function AuditPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/audit', { params: { per_page: 50 } }).then(({ data }) => active && setItems(data.items)).catch((reason) => active && setError(getApiError(reason))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  return <>
    <PageHeading eyebrow="Security & accountability" title="Audit history" description="Administrative changes, attendance actions, and biometric-data events recorded by the API." />
    <Notice>{error}</Notice>
    <section className="surface card-shadow overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f6f2] text-[#188274]"><Activity size={17} /></span><div><h2 className="font-bold">Recent admin actions</h2><p className="text-xs text-slate-500">Newest first</p></div></div>
      {loading ? <Loading label="Loading audit records…" /> : items.length ? <div className="table-wrap"><table className="table-base"><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Details</th><th>When</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.action}</span></td><td>{row.actor?.email || 'System'}</td><td>{row.resource_type}{row.resource_id ? ` · ${row.resource_id}` : ''}</td><td className="max-w-[260px] truncate text-xs text-slate-500">{JSON.stringify(row.details)}</td><td className="whitespace-nowrap text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <EmptyState title="No audit events yet" description="Admin actions will appear here as the application is used." />}
    </section>
  </>;
}
