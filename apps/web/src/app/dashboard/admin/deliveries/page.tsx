'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#EAB308', ACCEPTED: '#3B82F6', ARRIVED_PICKUP: '#8B5CF6',
  IN_TRANSIT: '#E8420A', DELIVERED: '#22C55E', CANCELLED: '#EF4444', FAILED: '#6B7280',
};

export default function AdminDeliveriesPage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState('');
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const PER_PAGE = 20;

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PER_PAGE) });
      if (search) p.set('search', search);
      if (status) p.set('status', status);
      const res = await api.adminDeliveries(p.toString(), token);
      setDeliveries(res.data?.deliveries ?? res.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch { } finally { setLoading(false); }
  }, [token, page, search, status]);

  useEffect(() => { load(); }, [load]);

  if (!isHydrated || !user) return <Spin />;

  const pages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/admin')} className="text-white/40 hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>All Deliveries</div>
          <div className="text-white/40 text-xs">{total} total</div>
        </div>
        <button onClick={load} className="text-white/40 hover:text-white"><RefreshCw size={16} /></button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by address or customer…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-[#E8420A] transition-colors" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm outline-none focus:border-[#E8420A] appearance-none">
            <option value="">All statuses</option>
            {['PENDING','ACCEPTED','ARRIVED_PICKUP','IN_TRANSIT','DELIVERED','CANCELLED','FAILED'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {loading ? <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div> :
           deliveries.length === 0 ? <div className="text-center py-12 text-white/30">No deliveries found</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10">
                  {['Customer','Route','Tier','Fare','Status','Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/5">
                  {deliveries.map((d: any) => (
                    <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-xs">{d.customer?.name ?? '—'}</div>
                        <div className="text-white/30 text-xs">{d.customer?.email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs max-w-36 truncate text-white/70">{d.pickupAddress}</div>
                        <div className="text-xs max-w-36 truncate text-white/40">→ {d.dropoffAddress}</div>
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">{d.vehicleTier?.replace('DROP_', '') ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-xs">₦{(d.totalFareNgn ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${STATUS_COLOR[d.status] ?? '#888'}20`, color: STATUS_COLOR[d.status] ?? '#888' }}>
                          {d.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs">
                        {new Date(d.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30"><ChevronLeft size={15} /></button>
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)} className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}
