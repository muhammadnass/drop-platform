'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, Save, RefreshCw, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Config {
  BASE_FARE_NGN:         number;
  RATE_PER_KM_NGN:       number;
  COMMISSION_PCT:        number;
  RIDER_ACCEPT_TIMEOUT:  number;
}

export default function AdminSettingsPage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<Config>({
    BASE_FARE_NGN:        200,
    RATE_PER_KM_NGN:      80,
    COMMISSION_PCT:       8,
    RIDER_ACCEPT_TIMEOUT: 30,
  });
  const [loading, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  useEffect(() => {
    if (!token) return;
    api.platformConfig(token)
      .then((d) => {
        if (d) setConfig((prev) => ({ ...prev, ...d }));
      })
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [token]);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    try {
      await api.updatePlatformConfig(config, token);
      setSaved(true);
      toast.success('Settings saved!');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  if (!isHydrated || !user) return <Spin />;

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  const FIELDS: { key: keyof Config; label: string; desc: string; unit: string; min: number; max: number; step: number }[] = [
    { key: 'BASE_FARE_NGN',        label: 'Base Fare',            desc: 'Flat fee charged on every delivery, before distance',    unit: '₦',   min: 0,  max: 5000, step: 50  },
    { key: 'RATE_PER_KM_NGN',      label: 'Rate per KM',          desc: 'Additional charge per kilometre of distance',            unit: '₦/km', min: 0,  max: 500,  step: 10  },
    { key: 'COMMISSION_PCT',       label: 'Platform Commission',  desc: 'Percentage of fare kept by Drop as platform fee',        unit: '%',   min: 0,  max: 30,   step: 0.5 },
    { key: 'RIDER_ACCEPT_TIMEOUT', label: 'Rider Accept Timeout', desc: 'Seconds a rider has to accept before the order expires', unit: 's',   min: 10, max: 120,  step: 5   },
  ];

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/admin')} className="text-white/40 hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <div className="font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-syne)' }}><Settings size={16} /> Platform Settings</div>
          <div className="text-white/40 text-xs">Fare, commission & delivery timeout</div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-6 space-y-5">
        {!isSuperAdmin && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-sm">
            <AlertCircle size={15} /> You can view settings but only Super Admins can save changes.
          </div>
        )}

        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm">{f.label}</div>
                <div className="font-bold text-[#E8420A]">
                  {fetching ? <span className="w-12 h-5 bg-white/10 rounded animate-pulse inline-block" /> : `${config[f.key]}${f.unit}`}
                </div>
              </div>
              <p className="text-white/40 text-xs mb-3">{f.desc}</p>
              <input
                type="range"
                min={f.min} max={f.max} step={f.step}
                value={config[f.key]}
                disabled={!isSuperAdmin || fetching}
                onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                className="w-full accent-[#E8420A] disabled:opacity-40"
              />
              <div className="flex justify-between text-white/30 text-xs mt-1">
                <span>{f.min}{f.unit}</span><span>{f.max}{f.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {isSuperAdmin && (
          <button
            onClick={handleSave}
            disabled={loading || fetching}
            className="w-full py-4 rounded-2xl bg-[#E8420A] text-white font-bold disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}
          >
            {saved ? <><CheckCircle2 size={18} className="text-white" /> Saved!</> :
             loading ? <><RefreshCw size={18} className="animate-spin" /> Saving…</> :
             <><Save size={18} /> Save Settings</>}
          </button>
        )}

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-xs text-white/30 space-y-1">
          <p className="font-semibold text-white/50">How fare is calculated</p>
          <p>Total = (Base Fare + Distance × Rate/km) × Tier Multiplier</p>
          <p>Platform Fee = Total × Commission%</p>
          <p>Rider Earnings = Total − Platform Fee</p>
          <p>Tier multipliers: Mini ×1.0 · Tri ×1.3 · Flex ×1.5 · Max ×2.2</p>
        </div>
      </div>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}
