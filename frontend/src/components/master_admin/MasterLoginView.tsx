import React, { useState } from 'react';
import { 
  ShieldCheck, Lock, User, ArrowRight, ArrowLeft, 
  Sparkles, KeyRound, Building2, AlertCircle 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterLoginViewProps {
  onLoginSuccess: (token: string, user: any) => void;
  onBackToLanding: () => void;
}

export const MasterLoginView: React.FC<MasterLoginViewProps> = ({
  onLoginSuccess,
  onBackToLanding
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Lütfen kullanıcı adı ve şifrenizi girin.');
      return;
    }

    sound.beep();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/master/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Geçersiz Master Admin kimlik bilgileri.');
      }

      const data = await res.json();
      sound.cashDrawer();
      try {
        localStorage.setItem('boncore_master_token', data.access_token);
        localStorage.setItem('boncore_master_user', JSON.stringify(data.user));
      } catch {}
      onLoginSuccess(data.access_token, data.user);
    } catch (err: any) {
      sound.warning();
      setErrorMsg(err.message || 'Giriş başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans relative overflow-hidden select-none">
      
      {/* Cyberpunk Dark Radial Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Top Back Link */}
        <button
          type="button"
          onClick={() => { sound.beep(); onBackToLanding(); }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Tanıtım / Web Sitesine Dön</span>
        </button>

        {/* Master Badge & Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            SaaS Platform Master Admin
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Tüm restoranları, müşteri taleplerini, kullanıcı şifrelerini ve abonelik gelirlerini yönetin.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Master Admin Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Master kullanıcı adınızı girin"
                className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Master Güvenlik Parolası
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master güvenlik parolanızı girin"
                className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 hover:from-brand-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Kimlik Doğrulanıyor...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Master Yönetim Paneline Giriş Yap</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-500 font-medium">
          🔒 Yalnızca yetkili SaaS platform yöneticileri içindir. Tüm erişimler kayıt altına alınmaktadır.
        </div>

      </div>
    </div>
  );
};
