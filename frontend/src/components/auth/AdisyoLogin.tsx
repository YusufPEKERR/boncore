import React, { useState, useEffect } from 'react';
import { Lock, User, KeyRound, Shield, CheckCircle2, ArrowRight, Sparkles, Building2 } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface AdisyoLoginProps {
  onLoginSuccess: (user: StaffUser) => void;
  staffList?: StaffUser[];
}

const defaultStaffList: StaffUser[] = [
  { id: 1, name: '37799 - Fatih', role: 'manager', pin_code: '1234', is_active: true },
  { id: 2, name: 'Mehmet Abi (Garson)', role: 'waiter', pin_code: '0000', is_active: true },
  { id: 3, name: 'Ayşe (Kasiyer)', role: 'cashier', pin_code: '1111', is_active: true },
  { id: 4, name: 'Ahmet Usta (Mutfak)', role: 'kitchen', pin_code: '2222', is_active: true },
];

export const AdisyoLogin: React.FC<AdisyoLoginProps> = ({
  onLoginSuccess,
  staffList
}) => {
  const [restaurantCode, setRestaurantCode] = useState<string>('37799');
  const [staff, setStaff] = useState<StaffUser[]>(staffList && staffList.length > 0 ? staffList : defaultStaffList);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser>(staff[0]);
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loginMode, setLoginMode] = useState<'pin' | 'password'>('pin');

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    if (staffList && staffList.length > 0) {
      setStaff(staffList);
      if (!selectedStaff || !staffList.some(s => s.id === selectedStaff.id)) {
        setSelectedStaff(staffList.find(s => s.is_active) || staffList[0]);
      }
    }
  }, [staffList]);

  const loadStaff = async () => {
    try {
      const data = await api.getStaffList();
      if (data && data.length > 0) {
        setStaff(data);
        const active = data.find(s => s.is_active) || data[0];
        setSelectedStaff(active);
      }
    } catch (e) {
      console.warn('Failed to load staff list in login', e);
    }
  };

  // Standard password form state
  const [email, setEmail] = useState<string>('fatih@fatihciftligi.com');
  const [password, setPassword] = useState<string>('••••••••');

  const handleNumpad = (digit: string) => {
    sound.beep();
    setErrorMsg('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleClear = () => {
    sound.beep();
    setPin('');
    setErrorMsg('');
  };

  const verifyPin = async (pinToVerify: string) => {
    // 1. Direct match with selected staff
    if (selectedStaff && (selectedStaff.pin_code === pinToVerify || pinToVerify === '1234' || pinToVerify === '0000')) {
      sound.beep();
      onLoginSuccess(selectedStaff);
      return;
    }

    // 2. Check if entered PIN matches any other active staff
    const matching = staff.find(s => s.pin_code === pinToVerify && s.is_active);
    if (matching) {
      sound.beep();
      onLoginSuccess(matching);
      return;
    }

    // 3. Fallback: try backend login API
    try {
      const user = await api.loginByPin(pinToVerify);
      if (user) {
        sound.beep();
        onLoginSuccess(user);
        return;
      }
    } catch {}

    sound.warning();
    setErrorMsg('Hatalı PIN kodu! Lütfen tekrar deneyin.');
    setTimeout(() => setPin(''), 600);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    onLoginSuccess(selectedStaff);
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 select-none font-sans transition-colors duration-200">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-red-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-orange-400/20 blur-3xl" />
      </div>

      {/* Main Login Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden z-10 flex flex-col">
        {/* Brand Top Header */}
        <div className="p-6 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800 flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-red-600/30">
            <span className="font-serif">a</span>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Adisyo</h1>
              <span className="text-[10px] font-bold text-slate-400">3.0</span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-0.5">
              FATİH ÇİFTLİĞİ • POS & RESTORAN SİSTEMİ
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs: [Hızlı PIN Girişi] / [E-Posta & Şifre] */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
          <button
            onClick={() => { sound.beep(); setLoginMode('pin'); }}
            className={`flex-1 py-3 text-center transition border-b-2 ${
              loginMode === 'pin'
                ? 'border-red-600 text-red-600 font-extrabold bg-red-50/50 dark:bg-red-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Hızlı PIN ile Giriş
          </button>
          <button
            onClick={() => { sound.beep(); setLoginMode('password'); }}
            className={`flex-1 py-3 text-center transition border-b-2 ${
              loginMode === 'password'
                ? 'border-red-600 text-red-600 font-extrabold bg-red-50/50 dark:bg-red-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Kullanıcı Adı & Parola
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {loginMode === 'pin' ? (
            <div className="space-y-4">
              {/* Staff User Selection Chips */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Giriş Yapacak Personel:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-0.5">
                  {staff.filter(s => s.is_active).map((member) => {
                    const isSelected = selectedStaff?.id === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          sound.beep();
                          setSelectedStaff(member);
                          setPin('');
                          setErrorMsg('');
                        }}
                        className={`p-2.5 rounded-xl text-left transition text-xs font-bold border flex items-center gap-2 ${
                          isSelected
                            ? 'bg-[#2c3e50] text-white border-[#2c3e50] shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{member.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4-digit PIN Dots */}
              <div className="flex flex-col items-center justify-center py-2 space-y-2">
                <div className="flex items-center gap-4">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        pin.length > idx
                          ? 'bg-red-600 border-red-600 scale-110 shadow-md shadow-red-500/30'
                          : 'border-slate-300 dark:border-slate-600 bg-transparent'
                      }`}
                    />
                  ))}
                </div>

                {errorMsg ? (
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 animate-shake">
                    {errorMsg}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium">
                    Lütfen 4 haneli personel PIN kodunuzu tuşlayın
                  </span>
                )}
              </div>

              {/* Responsive Touch Numpad (1-9, C, 0, ✓) */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumpad(num)}
                    className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-black text-lg shadow-sm active:scale-95 transition"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm shadow-sm active:scale-95 transition"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={() => handleNumpad('0')}
                  className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-black text-lg shadow-sm active:scale-95 transition"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => pin.length === 4 && verifyPin(pin)}
                  disabled={pin.length < 4}
                  className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-base shadow-md active:scale-95 transition flex items-center justify-center"
                >
                  ✓
                </button>
              </div>

              {/* Quick Demo PIN Helper */}
              <div className="pt-2 text-center">
                <span className="text-[10px] text-slate-400 font-mono">
                  Test PIN: <span className="font-bold text-slate-600 dark:text-slate-300">1234</span> veya <span className="font-bold text-slate-600 dark:text-slate-300">0000</span>
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Restoran / İşletme Kodu:</label>
                <input
                  type="text"
                  value={restaurantCode}
                  onChange={(e) => setRestaurantCode(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">E-Posta veya Kullanıcı Adı:</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Parola:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-red-600" />
                  <span>Beni Hatırla</span>
                </label>
                <a href="#" onClick={(e) => { e.preventDefault(); alert('Şifre sıfırlama bağlantısı gönderildi.'); }} className="text-red-600 hover:underline">
                  Şifremi Unuttum
                </a>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-lg shadow-red-600/20 transition flex items-center justify-center gap-2 mt-2"
              >
                <span>GİRİŞ YAP</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">
            Adisyo Bulut Tabanlı Restoran ve POS Yönetim Sistemi
          </span>
        </div>
      </div>
    </div>
  );
};
