'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  ACCEPTED: 'bg-blue-500/20 text-blue-400',
  ARRIVED_PICKUP: 'bg-purple-500/20 text-purple-400',
  IN_TRANSIT: 'bg-orange-500/20 text-orange-400',
  DELIVERED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
};

export default function CustomerHistoryPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.deliveries(page, token)
      .then((res: any) => { setDeliveries(res.data ?? []); setTotalPages(res.totalPages ?? 1); })
      .catch(() => setDeliveries([]))
      .finally(() => setLoading(false));
  }, [token, page]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-16">
      <div className="bg-[#1a1a1a] px-4 pb-4 flex items-center gap-3 sticky top-0 z-10" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <p className="text-white font-bold flex-1">Delivery History</p>
      </div>

      <div className="px-4 py-5 space-y-3 max-w-lg mx-auto">
        {loading && (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        )}

        {!loading && deliveries.length === 0 && (
          <div className="text-center py-16 text-white/40">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">No deliveries yet</p>
          </div>
        )}

        {deliveries.map((d) => (
          <button key={d.id} onClick={() => router.push(`/dashboard/customer`)}
            className="w-full text-left bg-[#1a1a1a] rounded-2xl p-4 space-y-2 hover:bg-[#222] transition-colors">
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[d.status] ?? 'bg-white/10 text-white/60'}`}>
                {d.status.replace(/_/g, ' ')}
              </span>
              <span className="text-white/30 text-xs">{new Date(d.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5 text-xs">⬤</span><p className="text-white/70 text-sm flex-1 truncate">{d.pickupAddress}</p></div>
            <div className="flex items-start gap-2"><span className="text-orange-400 mt-0.5 text-xs">⬤</span><p className="text-white/70 text-sm flex-1 truncate">{d.dropoffAddress}</p></div>
            <div className="flex justify-between pt-1 border-t border-white/10">
              <span className="text-white/40 text-xs">{d.distanceKm?.toFixed(1)} km</span>
              <span className="text-orange-400 font-bold text-sm">{fmt(d.totalFareNgn)}</span>
            </div>
          </button>
        ))}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-4 py-2 rounded-xl border border-white/20 text-white/60 text-sm disabled:opacity-30">← Prev</button>
            <span className="text-white/40 text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-4 py-2 rounded-xl border border-white/20 text-white/60 text-sm disabled:opacity-30">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
