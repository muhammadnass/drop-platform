'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }

const STATUS_STYLES: Record<string, string> = {
  DELIVERED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  FAILED: 'bg-red-500/20 text-red-400',
};

export default function RiderHistoryPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.orderHistory(page, token)
      .then((res: any) => { setDeliveries(res.data ?? []); setTotalPages(res.totalPages ?? 1); })
      .catch(() => setDeliveries([]))
      .finally(() => setLoading(false));
  }, [token, page]);

  return (
    <div className="min-h-screen text-white pb-16" style={{ background: 'linear-gradient(135deg, #0A1628 0%, #0D2040 100%)' }}>
      <div className="bg-[#221810] px-4 pb-4 flex items-center gap-3 sticky top-0 z-10 border-b border-white/10" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <p className="text-white font-bold flex-1">Delivery History</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {loading && (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0E7BC4 transparent transparent transparent' }} /></div>
        )}

        {!loading && deliveries.length === 0 && (
          <div className="text-center py-16 text-white/40">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">No completed deliveries yet</p>
          </div>
        )}

        {deliveries.map((d) => (
          <div key={d.id} className="bg-[#221810] border border-white/10 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[d.status] ?? 'bg-white/10 text-white/60'}`}>
                {d.status.replace(/_/g, ' ')}
              </span>
              <span className="text-white/30 text-xs">{new Date(d.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5 text-xs">⬤</span><p className="text-white/70 text-sm flex-1 truncate">{d.pickupAddress}</p></div>
            <div className="flex items-start gap-2"><span className="mt-0.5 text-xs" style={{ color: '#0E7BC4' }}>⬤</span><p className="text-white/70 text-sm flex-1 truncate">{d.dropoffAddress}</p></div>
            <div className="flex justify-between pt-1 border-t border-white/10">
              <span className="text-white/40 text-xs">{d.distanceKm?.toFixed(1)} km</span>
              <span className="text-green-400 font-bold text-sm">{fmt(d.riderEarningsNgn)}</span>
            </div>
          </div>
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
