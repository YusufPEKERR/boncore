import React, { useState, useEffect } from 'react';
import { Shield, Search, Save, CheckCircle2, HelpCircle } from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

export interface PermissionItem {
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

export const initialPermissions: PermissionItem[] = [
  // ===================== 1. MUTFAK YETKİLENDİRMELERİ =====================
  {
    id: 'kds_view',
    title: 'Mutfak ekranı görüntüleme,sipariş hazırlama.',
    description: 'Kullanıcının mutfak ekranını görüntülemesini ve siparişleri hazırlanıyor ya da hazır olarak işaretlemesini sağlar.',
    group: 'Mutfak Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },

  // ===================== 2. KURYE YETKİLENDİRMELERİ =====================
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
    description: 'Kullanıcının tahsil edilmiş bir siparişin ödeme tipini (nakit, kart vb.) değiştirmesini ve entegrasyon siparişlerinde kilitli gelen ödeme tipini düzenlemesini sağlar.',
    group: 'Kurye Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },

  // ===================== 3. RAPOR YETKİLENDİRMELERİ =====================
  {
    id: 'reports_view',
    title: 'Tüm raporlamaları görüntüleyebilir.',
    description: 'Kullanıcının ana sayfa ve rapor ekranlarının tamamını görüntülemesini sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_z_close',
    title: 'Gün sonu işlemleri',
    description: 'Kullanıcının gün sonu raporunu görüntülemesini ve gün sonu kapanışını yapmasını sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_expense',
    title: 'Gider / Masraf işlemleri',
    description: 'Kullanıcının gider ve zayi kayıtlarını görüntülemesini ve gider türü tanımlamasını sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'reports_register_edit',
    title: 'Kasa açılış ve kapanış tutarlarını değiştirebilir.',
    description: 'Kullanıcının kapanmış vardiyanın kasa açılış ve kapanış tutarlarını düzeltmesini sağlar.',
    group: 'Rapor Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },

  // ===================== 4. ÜRÜN YETKİLENDİRMELERİ =====================
  {
    id: 'prod_manage_menu',
    title: 'Ürün, özellik, menü, reçete, birim tanımlayabilir ve düzenleyebilir',
    description: 'Kullanıcının menü yapısını yönetmesini sağlar: ürün, kategori, özellik, birim, mutfak grubu, reçete ve dijital menü tanımları.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'prod_edit_prices',
    title: 'Ürün fiyatlarını düzenleyebilir',
    description: 'Kullanıcının ürünlerin menüdeki satış fiyatını değiştirmesini sağlar.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'prod_integration_manage',
    title: 'Entegrasyon ürünlerini yönetebilir.',
    description: 'Kullanıcının entegrasyonlarda hangi ürünlerin satışa açık olacağını yönetmesini sağlar.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'prod_integration_prices',
    title: 'Entegrasyon ürünlerinin fiyatlarını yönetebilir.',
    description: 'Kullanıcının entegrasyonlardaki ürün fiyatlarını değiştirmesini sağlar.',
    group: 'Ürün Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },

  // ===================== 5. SİPARİŞ YETKİLENDİRMELERİ =====================
  {
    id: 'order_general',
    title: 'Genel sipariş işlemleri. Sipariş alabilir vb..',
    description: 'Kullanıcının sipariş oluşturmasını, siparişe ürün eklemesini ve siparişi kapatmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_remove_item',
    title: 'Siparişten ürün çıkarabilir.',
    description: 'Kullanıcının adisyona eklenmiş bir ürünü silmesini veya adedini azaltmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_discount',
    title: 'Ödeme sırasında indirim yapabilir.',
    description: 'Kullanıcının adisyonun tamamına indirim uygulamasını ve ödeme adımında tutar ya da yüzde girmesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_predefined_discount_only',
    title: 'Sadece ön tanımlı indirim kullanabilir.',
    description: 'Kullanıcıyı önceden tanımlanmış indirimlerle sınırlar ve tutarı elle girmesini engeller.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: false, call_center: false }
  },
  {
    id: 'order_item_treat',
    title: 'Siparişteki herhangi bir ürünü ikram yapabilir.',
    description: 'Kullanıcının adisyondaki tek bir ürünü ikram etmesini veya o satıra indirim uygulamasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_take_payment',
    title: 'Ödeme alabilir.',
    description: 'Kullanıcının adisyona ödeme işlemesini, alınan ödemeyi silmesini ve ÖKC ile POS cihazından tahsilat yapmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_cancel',
    title: 'Siparişi iptal edebilir.',
    description: 'Kullanıcının açık bir siparişi iptal etmesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_refund',
    title: 'Siparişi iade edebilir.',
    description: 'Kullanıcının kapatılmış bir siparişi iade etmesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_delivery',
    title: 'Paket siparişi alabilir.',
    description: 'Kullanıcının paket (adrese teslim) siparişi oluşturmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_takeaway',
    title: 'Gel-Al siparişi alabilir.',
    description: 'Kullanıcının Gel-Al (tezgahtan teslim) siparişi oluşturmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_transfer_item',
    title: 'Siparişteki ürünü taşıyabilir',
    description: 'Kullanıcının bir adisyondaki ürünü başka bir adisyona veya yeni bir adisyona taşımasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_view_closed_cancelled',
    title: 'Kapatılmış veya iptal edilmiş siparişi görüntüleyebilir.',
    description: 'Kullanıcının kapatılmış ve iptal edilmiş siparişlerin detayını görüntülemesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_open_account_transfer',
    title: 'Ödenecek tutarı açık hesaba aktarabilir.',
    description: 'Kullanıcının tahsil edilmeyen tutarı müşterinin açık hesabına (veresiye) aktarmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_table_move_merge',
    title: 'Masa değiştirme, masa birleştirme ve adisyon aktarma işlemleri yapabilir.',
    description: 'Kullanıcının açık adisyonu başka bir masaya taşımasını, masaları birleştirmesini veya ayırmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_edit_item_price',
    title: 'Sipariş içindeki ürünün fiyatını değiştirebilir.',
    description: 'Kullanıcının adisyondaki ürünün birim fiyatını yalnızca o siparişe özel olarak değiştirmesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_edit_item_qty',
    title: 'Sipariş içindeki ürünün miktarını değiştirebilir.',
    description: 'Kullanıcının adisyondaki ürünün adedini artırmasını veya azaltmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_manual_print',
    title: 'Manuel sipariş yazdırabilir',
    description: 'Kullanıcının adisyon veya hesap fişini elle yazdırmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_manual_kitchen_print',
    title: 'Manuel mutfak çıktısı alabilir',
    description: 'Kullanıcının mutfak fişini elle yeniden yazdırmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_open_cash_drawer',
    title: 'Para çekmecesini manuel olarak açabilir.',
    description: 'Kullanıcının satış işlemi olmadan para çekmecesini açmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: false, call_center: false }
  },
  {
    id: 'order_add_kuver_service',
    title: 'Siparişe kuver veya garsoniye ücreti ekleyebilir.',
    description: 'Kullanıcının adisyona kuver veya garsoniye ücreti eklemesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'order_close_complimentary',
    title: 'Adisyonu ödenmez olarak kapatabilir.',
    description: 'Kullanıcının adisyonu ödenmez olarak kapatmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_add_tip',
    title: 'Siparişe Bahşiş Ekleyebilir',
    description: 'Kullanıcının siparişe bahşiş eklemesini sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },

  // ===================== 6. RESTAURANT TANIM YETKİLENDİRMELERİ =====================
  {
    id: 'def_table_area',
    title: 'Masa ve Bölge İşlemleri.',
    description: 'Kullanıcının salon düzenini yönetmesini; bölge ve masa eklemesini, düzenlemesini ve silmesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_general_settings',
    title: 'Restoran ile ilgili genel tanımlamalar.',
    description: 'Kullanıcının işletmenin temel tanımlarını yönetmesini sağlar: KDV oranları, indirimler, müşteriler, kuver/garsoniye, yazıcılar ve cihazlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_users_manage',
    title: 'Genel kullanıcı işlemleri.',
    description: 'Kullanıcının yeni kullanıcı eklemesini, mevcut kullanıcıları düzenlemesini, silmesini ve şifrelerini yenilemesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_permissions_manage',
    title: 'Yetkilendirme işlemleri',
    description: 'Kullanıcının rollere yetki tanımlamasını veya mevcut yetkileri kaldırmasını sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_stock_entry_count',
    title: 'Stok girişi,stok sayımı işlemleri.',
    description: 'Kullanıcının stok girişi yapmasını, sayım kaydetmesini ve açılış maliyeti girmesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: true, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_delivery_integration_status',
    title: 'Paket Sipariş Entegrasyon durumunu değiştirebilir',
    description: 'Kullanıcının Yemeksepeti ve Trendyol gibi satış kanallarını sipariş almaya açmasını veya kapatmasını sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_stock_view',
    title: 'Stok Miktarlarını görüntüleyebilir.',
    description: 'Kullanıcının ürünlerin kalan stok miktarını görüntülemesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'def_integrations_appstore',
    title: 'Entegrasyonlar ekranını görebilir ve işlem yapabilir',
    description: 'Kullanıcının Uygulama Mağazası ekranını açmasını ve entegrasyon ayarlarını kaydetmesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: true, kitchen: true, courier: true, cashier: true, manager: true, call_center: true }
  },

  // ===================== 7. GİDER/MASRAF İŞLEMLER =====================
  {
    id: 'expense_add',
    title: 'Gider ekleyebilir.',
    description: 'Kullanıcının yeni gider kaydı oluşturmasını sağlar.',
    group: 'Gider/Masraf İşlemler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'expense_edit_delete',
    title: 'Gider düzenleyebilir ve silebilir.',
    description: 'Kullanıcının mevcut gider kaydını değiştirmesini veya silmesini sağlar.',
    group: 'Gider/Masraf İşlemler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  }
];

function mergeWithInitialPermissions(savedList: any[] | null | undefined): PermissionItem[] {
  if (!Array.isArray(savedList) || savedList.length === 0) {
    return initialPermissions;
  }
  const savedMap = new Map<string, any>();
  savedList.forEach(item => {
    if (item && item.id) {
      savedMap.set(item.id, item);
    }
  });

  return initialPermissions.map(defItem => {
    const existing = savedMap.get(defItem.id);
    if (existing && existing.roles) {
      return {
        ...defItem,
        roles: {
          waiter: Boolean(existing.roles.waiter),
          kitchen: Boolean(existing.roles.kitchen),
          courier: Boolean(existing.roles.courier),
          cashier: Boolean(existing.roles.cashier),
          manager: Boolean(existing.roles.manager),
          call_center: Boolean(existing.roles.call_center),
        }
      };
    }
    return defItem;
  });
}

export const RightsManagement: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionItem[]>(() => {
    try {
      const saved = localStorage.getItem('boncore_role_permissions');
      return saved ? mergeWithInitialPermissions(JSON.parse(saved)) : initialPermissions;
    } catch {
      return initialPermissions;
    }
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const settings = await api.getSettings();
        if (settings?.role_permissions && Array.isArray(settings.role_permissions)) {
          const merged = mergeWithInitialPermissions(settings.role_permissions);
          setPermissions(merged);
          localStorage.setItem('boncore_role_permissions', JSON.stringify(merged));
        } else {
          localStorage.setItem('boncore_role_permissions', JSON.stringify(initialPermissions));
        }
      } catch (err) {
        console.warn('Failed to load settings permissions', err);
      }
    };
    loadPermissions();
  }, []);

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

  const handleSave = async () => {
    sound.beep();
    try {
      localStorage.setItem('boncore_role_permissions', JSON.stringify(permissions));
      await api.updateSettings({ role_permissions: permissions });
    } catch (e) {
      console.warn('Failed to save permissions to backend', e);
    }
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
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-4">
        {/* Header (Matching Frame 110) */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Yetki / İzin Ekranı</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kullanıcılarınızın yetkilerini/izinlerini buradan güncelleyebilirsiniz ({permissions.length} Yetki Tanımı).
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="px-5 sm:px-6 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Kaydet</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 sm:px-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Yetki veya grup ara..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {savedSuccess && (
          <div className="mx-4 sm:mx-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Personel yetkileri ve kilit erişimleri başarıyla güncellendi.</span>
          </div>
        )}

        {/* Permissions Table by Group */}
        <div className="p-4 sm:p-6 pt-0 space-y-6 overflow-x-auto">
          <div className="min-w-[680px] space-y-6">
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
    </div>
  );
};
