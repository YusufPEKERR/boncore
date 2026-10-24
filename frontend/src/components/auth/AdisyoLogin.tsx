import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Utensils,
  MonitorCheck,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface AdisyoLoginProps {
  onLoginSuccess: (user: StaffUser, token?: string) => void;
  staffList?: StaffUser[];
}

const QUICK_ACCOUNTS = [
  { label: 'Yönetici / Müdür', username: 'admin', role: 'Tam Yetki', badgeColor: 'bg-rose-50 text-rose-600 border-rose-200' },
  { label: 'Kasa Sorumlusu', username: 'kasiyer', role: 'Tahsilat & Z Raporu', badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { label: 'Salon Garsonu', username: 'garson', role: 'Masa & Sipariş', badgeColor: 'bg-blue-50 text-blue-600 border-blue-200' },
  { label: 'Mutfak Şefi', username: 'sef', role: 'KDS Mutfak', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
];

export const AdisyoLogin: React.FC<AdisyoLoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('123456');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [remember, setRemember] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [nowTime, setNowTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Lütfen kullanıcı adı ve parolanızı girin.');
      return;
    }

    sound.beep();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await api.login(username.trim(), password, remember);
      sound.cashDrawer();
      onLoginSuccess(res.user, res.access_token);
    } catch (err: any) {
      sound.warning();
      setErrorMsg(err.message || 'Kullanıcı adı veya parola hatalı.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (accUsername: string) => {
    sound.beep();
    setUsername(accUsername);
    setPassword('123456');
    setErrorMsg('');
  };

  return (
    <div className="h-[100dvh] w-full bg-slate-50 text-slate-900 flex items-start lg:items-center justify-center p-3 sm:p-5 md:p-8 select-none font-sans relative overflow-y-auto">
      {/* Soft Light Ambient Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-indigo-200/40 blur-[130px]" />
        <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-emerald-200/35 blur-[130px]" />
        <div className="absolute -bottom-40 left-1/3 w-[480px] h-[480px] rounded-full bg-rose-200/35 blur-[140px]" />
      </div>

      {/* Main Split Container (Pure White Card) */}
      <div className="relative z-10 w-full max-w-5xl my-auto grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200/90 rounded-3xl sm:rounded-[32px] shadow-2xl shadow-slate-300/70 overflow-hidden">
        {/* Left Brand & System Showcase Panel (7 cols on desktop, second on mobile) */}
        <div className="order-2 lg:order-1 lg:col-span-7 p-5 sm:p-8 md:p-10 bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col justify-between space-y-6 sm:space-y-8">
          {/* Top Brand Bar (Desktop) */}
          <div className="hidden lg:flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/25">
                B
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-slate-900">BonCore</span>
                  <span className="text-xs font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200">
                    POS v2.0
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Yeni Nesil Restoran, KDS & Adisyon Yönetim Platformu
                </p>
              </div>
            </div>

            {/* Live Clock Pill */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700 font-bold">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {nowTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Center Value Proposition & Feature Cards */}
          <div className="space-y-4 sm:space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] sm:text-[11px] font-extrabold mb-2 sm:mb-3">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>GÜVENLİ BULUT & YEREL HİBRİT MİMARİ</span>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-snug">
                Operasyonunuzu tek ekrandan hızla ve güvenle yönetin.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <Utensils className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                <div className="text-xs font-extrabold text-slate-900">Canlı Salon & POS</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Masa taşıma, birleştirme, kuver ve hızlı ödeme akışı.
                </p>
              </div>
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                <div className="text-xs font-extrabold text-slate-900">Otomatik Termal Fiş</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  GİB E-Adisyon ve 80mm ESC/POS fiş yazdırma desteği.
                </p>
              </div>
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <MonitorCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                <div className="text-xs font-extrabold text-slate-900">KDS & Stok Reçete</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Anlık mutfak ekranı ve otomatik reçete stok düşümü.
                </p>
              </div>
            </div>

            {/* Quick Account Switcher for Instant Demo/Shift Access (Desktop view) */}
            <div className="hidden lg:block pt-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Hızlı Hesap Seçimi (Tek Tıkla Doldur)
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Varsayılan Parola: <strong className="text-slate-900">123456</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {QUICK_ACCOUNTS.map((acc) => {
                  const isSelected = username.toLowerCase() === acc.username;
                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleQuickSelect(acc.username)}
                      className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/90 border-indigo-600 text-slate-900 shadow-sm ring-1 ring-indigo-600/20'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 shadow-sm'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-extrabold truncate">{acc.label}</div>
                        <div className="text-[11px] font-mono text-slate-500">@{acc.username}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${acc.badgeColor}`}>
                        {acc.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Status Footer */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>BonCore API & WebSocket Motoru Aktif</span>
            </div>
            <span className="font-medium">{nowTime.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Right Login Form Panel (5 cols on desktop, FIRST on mobile!) */}
        <div className="order-1 lg:order-2 lg:col-span-5 p-5 sm:p-8 md:p-10 bg-white flex flex-col justify-center">
          <div className="space-y-5">
            {/* Mobile Compact Brand Bar */}
            <div className="flex lg:hidden items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-md">
                  B
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-black text-slate-900">BonCore</span>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                      POS v2.0
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold">Mobil & Masaüstü POS Terminali</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700 font-bold">
                <Clock className="w-3 h-3 text-emerald-600" />
                <span>{nowTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 lg:block lg:space-y-1.5">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 lg:mb-3">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Kullanıcı Girişi</h1>
                <p className="text-xs text-slate-500 font-medium">
                  Devam etmek için kullanıcı adınızı ve parolanızı girin.
                </p>
              </div>
            </div>

            {/* Mobile Quick Account Pills */}
            <div className="lg:hidden space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                <span>HIZLI HESAP SEÇİMİ:</span>
                <span className="font-mono">Şifre: <strong className="text-slate-900">123456</strong></span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACCOUNTS.map((acc) => {
                  const isSelected = username.toLowerCase() === acc.username;
                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleQuickSelect(acc.username)}
                      className={`p-2 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-600 text-slate-900 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-extrabold truncate">{acc.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">@{acc.username}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Alert */}
            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Username & Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Kullanıcı Adı
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Örn: admin, kasiyer, garson"
                    required
                    className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-600 rounded-2xl pl-10 pr-4 py-3 sm:py-3.5 text-sm text-slate-900 placeholder-slate-400 font-semibold focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Parola
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-600 rounded-2xl pl-10 pr-11 py-3 sm:py-3.5 text-sm text-slate-900 placeholder-slate-400 font-mono focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    title={showPassword ? 'Parolayı Gizle' : 'Parolayı Göster'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-0 accent-indigo-600"
                  />
                  <span>Beni Hatırla (7 Gün)</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  PBKDF2 + Token
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 hover:from-indigo-500 hover:via-blue-500 hover:to-emerald-500 disabled:opacity-50 text-white font-black text-sm shadow-xl shadow-indigo-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] mt-1"
              >
                <span>{loading ? 'GİRİŞ YAPILIYOR...' : 'SİSTEME GİRİŞ YAP'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Security Note */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Yetkili kullanıcı ve parola yönetimi &quot;Kullanıcılar&quot; panelinden yapılır.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
