import React, { useState } from 'react';
import { Shield, Search, Save, CheckCircle2, UserCheck, HelpCircle } from 'lucide-react';
import { sound } from '../../services/sound';

interface PermissionItem {
  id: string;
  title: string;
  description: string;
  group: string;
  roles: {
    waiter: boolean;
    kitchen: boolean;
    courier: boolean;
    cashier: boolean;
    manager: boolean;
    call_center: boolean;
  };
}

const initialPermissions: PermissionItem[] = [
  {
    id: 'kds_view',
    title: 'Mutfak ekranı görüntüleme, sipariş hazırlama.',
    description: 'Kullanıcının mutfak ekranını görüntülemesini ve siparişleri hazırlanıyor ya da hazır olarak işaretlemesini sağlar.',
    group: 'Mutfak Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'kds_reprint',
    title: 'Mutfak fişini elle yeniden yazdırabilir.',
    description: 'Kullanıcının mutfak fişini yazıcıdan tekrar çıkartmasını sağlar.',
    group: 'Mutfak Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'courier_ops',
    title: 'Kurye işlemleri.',
    description: 'Kurye kullanıcısının paket sipariş ve teslimat akışına erişmesini sağlar.',
    group: 'Kurye Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: true, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'courier_payment_edit',
    title: 'Siparişin ödeme tipini değiştirebilir.',
    description: 'Kullanıcının tahsil edilmiş bir siparişin ödeme tipini (nakit, kart vb.) değiştirmesini ve kilitli ödeme tipini düzenlemesini sağlar.',
    group: 'Kurye Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_view',
    title: 'Tüm raporlamaları görüntüleyebilir.',
    description: 'Kullanıcının ana sayfa ve rapor ekranlarının tamamını görüntülemesini sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_z_close',
    title: 'Gün sonu işlemleri (Z-Raporu).',
    description: 'Kullanıcının gün sonu raporunu görüntülemesini ve gün sonu kapanışını yapmasını sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_expense',
    title: 'Gider / Masraf işlemleri.',
    description: 'Kullanıcının gider ve zayi kayıtlarını görüntülemesini ve gider türü tanımlamasını sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'product_discount',
    title: 'İndirim & İkram uygulayabilir.',
    description: 'Kullanıcının adisyona manuel indirim veya ürün ikramı tanımlamasını sağlar.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'product_void',
    title: 'Ürün ve Adisyon iptali yapabilir.',
    description: 'Kullanıcının kayıtlı sipariş kalemlerini iptal etmesini sağlar.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  }
];

export const RightsManagement: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionItem[]>(initialPermissions);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const roles = [
    { key: 'waiter', label: 'Garson' },
    { key: 'kitchen', label: 'Mutfak' },
    { key: 'courier', label: 'Kurye' },
    { key: 'cashier', label: 'Kasa' },
    { key: 'manager', label: 'Müdür' },
    { key: 'call_center', label: 'Çağrı Merkezi' }
  ];

  const handleToggle = (permId: string, roleKey: string) => {
    sound.beep();
    setPermissions(prev => prev.map(p => {
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
    }));
  };

  const handleSave = () => {
    sound.beep();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const filtered = permissions.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.group.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const grouped = filtered.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {} as Record<string, PermissionItem[]>);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-4">
        {/* Header (Matching Frame 110) */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Yetki / İzin Ekranı</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kullanıcılarınızın yetkilerini/izinlerini buradan güncelleyebilirsiniz.</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Kaydet</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Yetki ara..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {savedSuccess && (
          <div className="mx-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Personel yetkileri ve kilit erişimleri başarıyla güncellendi.</span>
          </div>
        )}

        {/* Permissions Table by Group */}
        <div className="p-6 pt-0 space-y-6">
          {Object.entries(grouped).map(([groupTitle, perms]) => (
            <div key={groupTitle} className="space-y-2">
              {/* Group Header with Role Columns */}
              <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                <div className="col-span-6 font-black uppercase text-slate-900 dark:text-white">{groupTitle}</div>
                {roles.map(r => (
                  <div key={r.key} className="col-span-1 text-center text-[11px] truncate">
                    {r.label}
                  </div>
                ))}
              </div>

              {/* Permission Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {perms.map((p) => (
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
                      const isChecked = p.roles[r.key as keyof typeof p.roles];
                      return (
                        <div key={r.key} className="col-span-1 flex justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(p.id, r.key)}
                            className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer accent-red-600"
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
