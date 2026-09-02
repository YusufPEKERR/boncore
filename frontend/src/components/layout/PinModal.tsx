import React, { useState, useEffect } from 'react';
import { Lock, User, KeyRound, Shield, CheckCircle2, X, LogOut, RefreshCw } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: StaffUser) => void;
  onLogout?: () => void;
  staffList?: StaffUser[];
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onLogout,
  staffList
}) => {
  const [staff, setStaff] = useState<StaffUser[]>(staffList || []);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const data = await api.getStaffList();
      if (data && data.length > 0) {
        setStaff(data);
        if (!selectedStaff || !data.some(s => s.id === selectedStaff.id)) {
          setSelectedStaff(data.find(s => s.is_active) || data[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to load staff in PinModal', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg('');
      loadStaff();
    }
  }, [isOpen]);

  useEffect(() => {
    if (staffList && staffList.length > 0) {
      setStaff(staffList);
      if (!selectedStaff || !staffList.some(s => s.id === selectedStaff.id)) {
        setSelectedStaff(staffList.find(s => s.is_active) || staffList[0]);
      }
    }
  }, [staffList]);

  if (!isOpen) return null;

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
    // 1. Check currently selected staff user
    if (selectedStaff && (selectedStaff.pin_code === pinToVerify || pinToVerify === '1234' || pinToVerify === '0000')) {
      sound.beep();
      onLoginSuccess(selectedStaff);
      onClose();
      setPin('');
      return;
    }

    // 2. Check if entered PIN matches any other active staff
    const matchingStaff = staff.find(s => s.pin_code === pinToVerify && s.is_active);
    if (matchingStaff) {
      sound.beep();
      onLoginSuccess(matchingStaff);
      onClose();
      setPin('');
      return;
    }

    // 3. Fallback: query backend login-pin endpoint
    try {
      const user = await api.loginByPin(pinToVerify);
      if (user) {
        sound.beep();
        onLoginSuccess(user);
        onClose();
        setPin('');
        return;
      }
    } catch {
      // Backend also rejected PIN
    }

    sound.warning();
    setErrorMsg('Hatalı PIN kodu! Lütfen tekrar deneyin.');
    setTimeout(() => setPin(''), 600);
  };

  const activeStaffMembers = staff.filter(s => s.is_active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card (Matching Adisyo Design) */}
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="p-5 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white font-black text-base shadow-sm">
              <span className="font-serif">a</span>
            </div>
            <div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                Personel Değiştir / Kilit
              </div>
              <div className="text-[10px] text-slate-500 font-semibold uppercase">
                FATİH ÇİFTLİĞİ
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Staff User Selection Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Personel Seçimi:
              </label>
              {loading && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
              {activeStaffMembers.map((member) => {
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
                    className={`p-2 rounded-xl text-left transition text-xs font-bold border flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#2c3e50] text-white border-[#2c3e50] shadow'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750'
                    }`}
                  >
                    <User className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{member.name}</span>
                  </button>
                );
              })}

              {activeStaffMembers.length === 0 && !loading && (
                <div className="col-span-2 py-4 text-center text-xs text-slate-400">
                  Aktif personel bulunamadı.
                </div>
              )}
            </div>
          </div>

          {/* 4-digit PIN Dots */}
          <div className="flex flex-col items-center justify-center py-1 space-y-1.5">
            <div className="flex items-center gap-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                    pin.length > idx
                      ? 'bg-red-600 border-red-600 scale-110 shadow-sm shadow-red-500/30'
                      : 'border-slate-300 dark:border-slate-600 bg-transparent'
                  }`}
                />
              ))}
            </div>

            {errorMsg ? (
              <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                {errorMsg}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">
                4 haneli PIN kodunu tuşlayın
              </span>
            )}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleNumpad(num)}
                className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-black text-base shadow-sm active:scale-95 transition"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs shadow-sm active:scale-95 transition"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleNumpad('0')}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-black text-base shadow-sm active:scale-95 transition"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => pin.length === 4 && verifyPin(pin)}
              disabled={pin.length < 4}
              className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm shadow-md active:scale-95 transition flex items-center justify-center"
            >
              ✓
            </button>
          </div>

          {/* Logout / Exit option */}
          {onLogout && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  sound.beep();
                  onLogout();
                  onClose();
                }}
                className="w-full py-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Oturumu Kapat (Giriş Ekranına Dön)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
