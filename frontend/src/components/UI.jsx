import { AlertCircle, Check, X } from 'lucide-react';

export function PageHeading({ eyebrow, title, description, action }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-[#238f84]">{eyebrow}</p>}<h1 className="text-2xl font-bold tracking-tight text-[#172033] sm:text-[30px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>;
}

export function Notice({ type = 'error', children, onClose }) {
  if (!children) return null;
  const positive = type === 'success';
  return <div role="status" className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${positive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
    {positive ? <Check size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
    <span className="flex-1">{children}</span>{onClose && <button aria-label="Dismiss" onClick={onClose}><X size={16} /></button>}
  </div>;
}

export function Loading({ label = 'Loading…' }) {
  return <div className="grid min-h-40 place-items-center text-sm text-slate-500"><div className="flex items-center gap-3"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#ccebe5] border-t-[#238f84]" />{label}</div></div>;
}

export function EmptyState({ title, description }) {
  return <div className="grid min-h-48 place-items-center px-6 text-center"><div><p className="font-semibold text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div></div>;
}
