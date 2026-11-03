import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Search, Save, CheckCircle2, HelpCircle, Check, X, Play, Lock, Unlock, LayoutGrid, Sliders } from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { StaffUser } from '../../types';
import {
  PermissionItem,
  initialPermissions,
  mergeWithInitialPermissions,
  broadcastPermissionsUpdate,
  normalizeRoleKey
} from '../../services/permissions';

export type { PermissionItem };
export { initialPermissions, mergeWithInitialPermissions };

interface RightsManagementProps {
  currentUser?: StaffUser | null;
}

export const RightsManagement: React.FC<RightsManagementProps> = ({ currentUser }) => {
  const [permissions, setPermissions] = useState<PermissionItem[]>(() => {
    try {
      const saved = localStorage.getItem('boncore_role_permissions');
      return saved ? mergeWithInitialPermissions(JSON.parse(saved)) : initialPermissions;
    } catch {
      return initialPermissions;
    }
  });
  const [activeSectionTab, setActiveSectionTab] = useState<'actions' | 'tabs'>('actions');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [activeTestRole, setActiveTestRole] = useState<string>('waiter');
  const [isTestPanelOpen, setIsTestPanelOpen] = useState<boolean>(false);

  const effectiveRoleKey = useMemo(() => {
    if (currentUser?.role) {
      return normalizeRoleKey(currentUser.role);
    }
    try {
      const raw = localStorage.getItem('boncore_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role) return normalizeRoleKey(parsed.role);
      }
    } catch {}
    return 'manager';
  }, [currentUser?.role]);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const settings = await api.getSettings();
        if (settings?.role_permissions && Array.isArray(settings.role_permissions)) {
          const merged = mergeWithInitialPermissions(settings.role_permissions);
          setPermissions(merged);
          broadcastPermissionsUpdate(merged);
        } else {
          broadcastPermissionsUpdate(initialPermissions);
        }
      } catch (err) {
        console.warn('Failed to load settings permissions', err);
      }
    };
    loadPermissions();
  }, []);

  // Yetkiler ekranı sadece yöneticide (manager) gözükür ve yönetilir
  if (effectiveRoleKey !== 'manager') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto font-black text-2xl">
            🔒
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Yetkiler Ekranı Sadece Yöneticiye Özeldir
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Garson ve diğer personel rollerinin yetkilerini ve hangi sekmeleri görebileceğini yalnızca <strong>Yönetici (Müdür)</strong> rolündeki kullanıcılar görüntüleyebilir ve değiştirebilir.
          </p>
        </div>
      </div>
    );
  }

  const roles = [
    { key: 'waiter', label: 'Garson' },
    { key: 'kitchen', label: 'Mutfak' },
    { key: 'courier', label: 'Kurye' },
    { key: 'cashier', label: 'Kasa' },
    { key: 'manager', label: 'Müdür' },
    { key: 'call_center', label: 'Çağrı Merkezi' }
  ];

  const handleToggle = (permId: string, roleKey: string) => {
    // Müdür (Yönetici) sekme ve yetkileri her zaman açıktır (order_predefined_discount_only hariç)
    if (roleKey === 'manager' && permId !== 'order_predefined_discount_only') {
      return;
    }
    if (permId === 'def_permissions_manage' && roleKey !== 'manager') {
      return;
    }
    sound.beep();
    setPermissions(prev => {
      const next = prev.map(p => {
        if (p.id === permId) {
          return {
            ...p,
            roles: {
              ...p.roles,
              [roleKey]: !p.roles[roleKey as keyof typeof p.roles]
            }
          };
        }
        return p;
      });
      try {
        broadcastPermissionsUpdate(next);
        api.updateSettings({ role_permissions: next }).catch(() => {});
      } catch {}
      return next;
    });
  };

  const handleBulkRoleToggle = (
    roleKey: keyof PermissionItem['roles'],
    enableAll: boolean,
    scope: 'all' | 'tabs' | 'actions' = 'all'
  ) => {
    if (roleKey === 'manager') return;
    sound.beep();
    setPermissions(prev => {
      const next = prev.map(p => {
        const isTabPerm = p.group === 'Sekmeler' || p.id.startsWith('tab_');
        if (scope === 'tabs' && !isTabPerm) return p;
        if (scope === 'actions' && isTabPerm) return p;
        if (p.id === 'def_permissions_manage') {
          return { ...p, roles: { ...p.roles, [roleKey]: false } };
        }
        return {
          ...p,
          roles: {
            ...p.roles,
            [roleKey]: p.id === 'order_predefined_discount_only' ? false : enableAll
          }
        };
      });
      try {
        broadcastPermissionsUpdate(next);
        api.updateSettings({ role_permissions: next }).catch(() => {});
      } catch {}
      return next;
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleWaiterDefaultTabs = () => {
    sound.beep();
    setPermissions(prev => {
      const next = prev.map(p => {
        if (p.group === 'Sekmeler' || p.id.startsWith('tab_')) {
          const isWaiterBasic = p.id === 'tab_tables' || p.id === 'tab_profile';
          return {
            ...p,
            roles: {
              ...p.roles,
              waiter: isWaiterBasic
            }
          };
        }
        return p;
      });
      try {
        broadcastPermissionsUpdate(next);
        api.updateSettings({ role_permissions: next }).catch(() => {});
      } catch {}
      return next;
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSave = async () => {
    sound.beep();
    try {
      broadcastPermissionsUpdate(permissions);
      await api.updateSettings({ role_permissions: permissions });
    } catch (e) {
      console.warn('Failed to save permissions to backend', e);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const actionPermissions = useMemo(
    () => permissions.filter(p => p.group !== 'Sekmeler' && !p.id.startsWith('tab_')),
    [permissions]
  );

  const tabPermissions = useMemo(
    () => permissions.filter(p => p.group === 'Sekmeler' || p.id.startsWith('tab_')),
    [permissions]
  );

  const filteredActions = actionPermissions.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.group.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedActions = filteredActions.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {} as Record<string, PermissionItem[]>);

  const filteredTabs = tabPermissions.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-4">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Yetki / İzin Ekranı</h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  🔒 Sadece Yönetici
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Garson ve diğer rollerin işlem yetkilerini ve hangi sekmeleri görebileceğini buradan yönetebilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { sound.beep(); setIsTestPanelOpen(!isTestPanelOpen); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shrink-0 cursor-pointer border ${
                isTestPanelOpen
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Rol Yetki Simülatörü</span>
            </button>

            <button
              onClick={handleSave}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs shadow-md transition flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Kaydet</span>
            </button>
          </div>
        </div>

        {/* Main Section Switcher Tabs: [İşlem Yetkileri] | [Sekmeler] */}
        <div className="px-4 sm:px-6 pt-1">
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 gap-1">
            <button
              type="button"
              onClick={() => { sound.beep(); setActiveSectionTab('actions'); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeSectionTab === 'actions'
                  ? 'bg-white dark:bg-slate-900 text-[#338d35] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>İşlem Yetkileri ({actionPermissions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { sound.beep(); setActiveSectionTab('tabs'); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeSectionTab === 'tabs'
                  ? 'bg-white dark:bg-slate-900 text-[#338d35] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Sekmeler ({tabPermissions.length})</span>
              <span className="bg-[#338d35] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
                Menü Görünürlüğü
              </span>
            </button>
          </div>
        </div>

        {/* Search Input & Quick Controls */}
        <div className="px-4 sm:px-6 space-y-3">
          {activeSectionTab === 'actions' ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Garsonlarda "ÖDE", "HIZLI ÖDE" ve "SİPARİŞ İPTAL" Yetkileri</span>
                </div>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                  Garson rolündeki kullanıcıların sipariş ekranında <strong>Öde</strong>, <strong>Hızlı Öde</strong> butonlarını görüp göremeyeceğini ve <strong>Siparişi İptal</strong> edip edemeyeceğini buradan seçebilirsiniz.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(() => {
                  const payPerm = permissions.find(p => p.id === 'order_take_payment');
                  const fastPayPerm = permissions.find(p => p.id === 'order_fast_pay');
                  const cancelPerm = permissions.find(p => p.id === 'order_cancel');
                  const waiterCanPay = payPerm?.roles.waiter ?? true;
                  const waiterCanFastPay = fastPayPerm?.roles.waiter ?? true;
                  const waiterCanCancel = cancelPerm?.roles.waiter ?? false;
                  return (
                    <>
                      <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer transition select-none ${
                        waiterCanPay
                          ? 'bg-[#27ae60] text-white border-[#219653] shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        <input
                          type="checkbox"
                          checked={waiterCanPay}
                          onChange={() => handleToggle('order_take_payment', 'waiter')}
                          className="w-3.5 h-3.5 rounded accent-white cursor-pointer"
                        />
                        <span>Garson: "ÖDE" Butonu {waiterCanPay ? 'Açık' : 'Gizli'}</span>
                      </label>

                      <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer transition select-none ${
                        waiterCanFastPay
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        <input
                          type="checkbox"
                          checked={waiterCanFastPay}
                          onChange={() => handleToggle('order_fast_pay', 'waiter')}
                          className="w-3.5 h-3.5 rounded accent-white cursor-pointer"
                        />
                        <span>Garson: "HIZLI ÖDE" Butonu {waiterCanFastPay ? 'Açık' : 'Gizli'}</span>
                      </label>

                      <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer transition select-none ${
                        waiterCanCancel
                          ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        <input
                          type="checkbox"
                          checked={waiterCanCancel}
                          onChange={() => handleToggle('order_cancel', 'waiter')}
                          className="w-3.5 h-3.5 rounded accent-white cursor-pointer"
                        />
                        <span>Garson: "SİPARİŞ İPTAL" {waiterCanCancel ? 'Açık' : 'Kapalı'}</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleBulkRoleToggle('waiter', true, 'all')}
                        className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                        title="Garson rolü için tüm yetkileri ve sekmeleri aç"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Garson: Tümünü Aç</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBulkRoleToggle('waiter', false, 'all')}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                        title="Garson rolü için tüm yetkileri ve sekmeleri kaldır"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Garson: Tümünü Kaldır</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <LayoutGrid className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Sekme & Menü Görünürlüğü Yönetimi (Sadece Yönetici)</span>
                </div>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400 mt-0.5">
                  Garson ve diğer yetki gruplarındaki kullanıcıların sol menüde ve uygulama içinde hangi sekmeleri görebileceğini buradan tek tek açıp kapatabilirsiniz. <strong>Yetkiler Ekranı</strong> ise her zaman sadece yöneticide gözükür.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleBulkRoleToggle('waiter', true, 'tabs')}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Garson: Tüm Sekmeleri Aç</span>
                </button>
                <button
                  type="button"
                  onClick={handleWaiterDefaultTabs}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Garson: Sadece Masalar & Profil</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkRoleToggle('waiter', false, 'tabs')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Garson: Tüm Sekmeleri Kapat</span>
                </button>
              </div>
            </div>
          )}

          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeSectionTab === 'tabs' ? 'Sekme ara (örn: Mutfak, Kasa, Rapor, Stok)...' : 'Yetki veya grup ara...'}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Live Role Permission Simulator Panel */}
        {isTestPanelOpen && (
          <div className="mx-4 sm:mx-6 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-900/40 pb-2.5">
              <div>
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wide flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span>Rol Bazlı Canlı Yetki & Sekme Denetimi</span>
                </h4>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">
                  Bir rol seçerek bu role ait açık ve engellenen tüm yetki ve sekmeleri canlı olarak inceleyebilirsiniz.
                </p>
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-xs overflow-x-auto">
                {roles.map((r) => {
                  const allowedCount = permissions.filter(p => p.roles[r.key as keyof typeof p.roles]).length;
                  return (
                    <button
                      key={r.key}
                      onClick={() => { sound.beep(); setActiveTestRole(r.key); }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        activeTestRole === r.key
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>{r.label}</span>
                      <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${activeTestRole === r.key ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {allowedCount}/{permissions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 shadow-xs">
                <div className="font-extrabold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center justify-between pb-1.5 border-b border-emerald-100 dark:border-emerald-900/30">
                  <span className="flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                    <span>AÇIK YETKİ & SEKMELER ({permissions.filter(p => p.roles[activeTestRole as keyof typeof p.roles]).length})</span>
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950 text-emerald-600 px-1.5 py-0.5 rounded">Aktif</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-medium text-slate-700 dark:text-slate-300">
                  {permissions
                    .filter(p => p.roles[activeTestRole as keyof typeof p.roles])
                    .map(p => (
                      <div key={p.id} className="p-1.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 text-[11px] flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{p.title}</div>
                          <div className="text-[10px] text-slate-400">{p.group}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 shadow-xs">
                <div className="font-extrabold text-brand-700 dark:text-emerald-400 mb-2 flex items-center justify-between pb-1.5 border-b border-emerald-100 dark:border-emerald-900/30">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-500" />
                    <span>GİZLİ / KİLİTLİ YETKİ & SEKMELER ({permissions.filter(p => !p.roles[activeTestRole as keyof typeof p.roles]).length})</span>
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950 text-brand-600 px-1.5 py-0.5 rounded">Engelli</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-medium text-slate-700 dark:text-slate-300">
                  {permissions
                    .filter(p => !p.roles[activeTestRole as keyof typeof p.roles])
                    .map(p => (
                      <div key={p.id} className="p-1.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 text-[11px] flex items-start gap-1.5">
                        <X className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{p.title}</div>
                          <div className="text-[10px] text-slate-400">{p.group}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {savedSuccess && (
          <div className="mx-4 sm:mx-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Personel yetkileri ve sekme görünürlükleri başarıyla güncellendi.</span>
          </div>
        )}

        {/* TAB 1: İŞLEM YETKİLERİ */}
        {activeSectionTab === 'actions' && (
          <div className="p-4 sm:p-6 pt-0 space-y-6 overflow-x-auto">
            <div className="min-w-[680px] space-y-6">
              {Object.entries(groupedActions).map(([groupTitle, perms]) => (
                <div key={groupTitle} className="space-y-2">
                  <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    <div className="col-span-6 font-black uppercase text-slate-900 dark:text-white">{groupTitle}</div>
                    {roles.map(r => (
                      <div key={r.key} className="col-span-1 text-center text-[11px] truncate">
                        {r.label}
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {perms.map((p) => {
                      const isManagerOnlyRow = p.id === 'def_permissions_manage';
                      return (
                        <div key={p.id} className="grid grid-cols-12 py-3 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition items-center text-xs">
                          <div className="col-span-6 pr-4">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span>{p.title}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                              {p.description}
                            </div>
                          </div>

                          {roles.map(r => {
                            const isChecked = isManagerOnlyRow ? r.key === 'manager' : p.roles[r.key as keyof typeof p.roles];
                            const isDisabled = isManagerOnlyRow || (r.key === 'manager' && p.id !== 'order_predefined_discount_only');
                            return (
                              <div key={r.key} className="col-span-1 flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => handleToggle(p.id, r.key)}
                                  className={`w-4 h-4 rounded text-brand-600 focus:ring-brand-500 accent-brand-600 ${
                                    isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: SEKMELER (MENÜ & EKRAN GÖRÜNÜRLÜĞÜ) */}
        {activeSectionTab === 'tabs' && (
          <div className="p-4 sm:p-6 pt-0 space-y-4 overflow-x-auto">
            <div className="min-w-[680px] space-y-2">
              {/* Header with Role Columns + Quick Column Toggle */}
              <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-300 items-center">
                <div className="col-span-6 font-black uppercase text-slate-900 dark:text-white flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-[#338d35]" />
                  <span>SEKMELER (UYGULAMA MENÜLERİ VE EKRANLAR)</span>
                </div>
                {roles.map(r => {
                  const isManager = r.key === 'manager';
                  const allEnabledForRole = !isManager && tabPermissions.every(tp => tp.roles[r.key as keyof typeof tp.roles]);
                  return (
                    <div key={r.key} className="col-span-1 flex flex-col items-center gap-1 text-center">
                      <span className="text-[11px] truncate font-extrabold">{r.label}</span>
                      {!isManager ? (
                        <button
                          type="button"
                          onClick={() => handleBulkRoleToggle(r.key as keyof PermissionItem['roles'], !allEnabledForRole, 'tabs')}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                            allEnabledForRole
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-200'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'
                          }`}
                          title={`${r.label} için tüm sekmeleri ${allEnabledForRole ? 'kapat' : 'aç'}`}
                        >
                          {allEnabledForRole ? 'Tümünü Kapat' : 'Tümünü Aç'}
                        </button>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                          Tam Yetki
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Locked Manager-Only Row for "Yetki / İzin Ekranı" */}
              <div className="grid grid-cols-12 py-3 px-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 rounded-xl items-center text-xs">
                <div className="col-span-6 pr-4">
                  <div className="font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Yetki / İzin Ekranı Sekmesi (Sadece Yönetici)</span>
                  </div>
                  <div className="text-[10px] text-amber-700/80 dark:text-amber-400 mt-0.5 leading-snug">
                    Yetkiler ekranı güvenlik gereği sadece Yönetici (Müdür) rolünde gözükür; diğer rollere açılamaz.
                  </div>
                </div>
                {roles.map(r => (
                  <div key={r.key} className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      checked={r.key === 'manager'}
                      disabled
                      className="w-4 h-4 rounded opacity-50 cursor-not-allowed accent-amber-600"
                    />
                  </div>
                ))}
              </div>

              {/* Configurable Tab Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredTabs.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 py-3 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition items-center text-xs">
                    <div className="col-span-6 pr-4">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>{p.title}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        {p.description}
                      </div>
                    </div>

                    {roles.map(r => {
                      const isManager = r.key === 'manager';
                      const isChecked = isManager ? true : p.roles[r.key as keyof typeof p.roles];
                      return (
                        <div key={r.key} className="col-span-1 flex justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isManager}
                            onChange={() => handleToggle(p.id, r.key)}
                            className={`w-4 h-4 rounded text-brand-600 focus:ring-brand-500 accent-brand-600 ${
                              isManager ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
