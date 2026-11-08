'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  Package, Bike, BarChart2, LogOut, Settings,
  Building2, CreditCard, ChevronRight, User, Plus,
} from 'lucide-react';

function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }

export default function OwnerDashboard() {
  const { user, token, logout, isHydrated } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (isHydrated && !user) router.replace('/auth/login');
  }, [isHydrated, user, router]);

  useEffect(() => {
    if (!token) return;
    api.businessStats(token).then(setStats).catch(() => {});
    api.businessProfile(token).then(setProfile).catch(() => {});
  }, [token]);

  const isActive = profile?.subscription?.status === 'ACTIVE';

  if (!isHydrated || !user) {
    return (
      <div className="min-h-screen bg-[#1A1208] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-8">
      <header className="border-b border-white/10 px-6 pb-4 flex items-center justify-between" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden">
            <img src="/icons/logo.png" alt="Drop" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Drop</span>
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">Business</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/owner/profile')}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <User size={16} />
          </button>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }}
            className="text-white/40 hover:text-white transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
            Business Dashboard
          </h1>
          <p className="text-white/40 text-sm mt-0.5">Manage your fleet and deliveries</p>
        </div>

        {/* Subscription status */}
        <button onClick={() => router.push('/dashboard/owner/billing')}
          className="w-full bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 rounded-2xl p-5 flex items-center justify-between text-left hover:border-purple-500/40 transition-colors">
          <div>
            <div className="text-xs text-white/40 mb-1">Subscription</div>
            <div className="font-bold text-lg">$20 / month</div>
            <div className="text-xs text-white/40 mt-0.5">+ 8% commission per delivery</div>
          </div>
          <div className={`text-xs px-3 py-1.5 rounded-full font-semibold ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </div>
        </button>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active Deliveries', value: String(stats?.activeDeliveries ?? '—'), icon: Package, color: '#E8420A' },
            { label: 'My Riders',         value: String(stats?.totalRiders ?? '—'),    icon: Bike,    color: '#A855F7' },
            { label: 'This Month',        value: stats ? fmt(stats.monthSpendNgn) : '—', icon: BarChart2, color: '#22C55E' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: `${s.color}20` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-white/40 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/dashboard/owner/riders')}
            className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Bike size={18} className="text-purple-400" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">Manage Riders</div>
                <div className="text-white/40 text-xs">Add, verify, track your fleet</div>
              </div>
            </div>
            <ChevronRight size={15} className="text-white/30" />
          </button>

          <button
            onClick={() => router.push('/dashboard/owner/deliveries')}
            className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Package size={18} className="text-orange-400" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">Deliveries</div>
                <div className="text-white/40 text-xs">Track all orders live</div>
              </div>
            </div>
            <ChevronRight size={15} className="text-white/30" />
          </button>

          <button
            onClick={() => router.push('/dashboard/owner/profile')}
            className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Building2 size={18} className="text-blue-400" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">Company Profile</div>
                <div className="text-white/40 text-xs">Branding, details, workflow</div>
              </div>
            </div>
            <ChevronRight size={15} className="text-white/30" />
          </button>

          <button
            onClick={() => router.push('/dashboard/owner/billing')}
            className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CreditCard size={18} className="text-green-400" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">Billing</div>
                <div className="text-white/40 text-xs">Subscription & invoices</div>
              </div>
            </div>
            <ChevronRight size={15} className="text-white/30" />
          </button>
        </div>
      </div>
    </div>
  );
}
