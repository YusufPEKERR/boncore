import { useState, useEffect, useCallback, useMemo } from 'react';
import { StaffUser } from '../types';
import { api } from './api';
import { isTabLicensed, loadLocalFeatures, TenantFeatures } from './licensedFeatures';

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

export type RoleKey = keyof PermissionItem['roles'];

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
    title: 'Ödeme alabilir ("ÖDE" butonunu görebilir ve ödeme işlemi yapabilir).',
    description: 'Kullanıcının sipariş ekranında "ÖDE" kısmını görmesini, adisyona ödeme işlemesini, alınan ödemeyi silmesini ve tahsilat yapmasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_fast_pay',
    title: 'Hızlı Öde ("HIZLI ÖDE" butonunu görebilir ve tek tıkla tahsilat yapabilir).',
    description: 'Kullanıcının sipariş ekranında "HIZLI ÖDE" kısmını görmesini ve nakit/kredi kartı ile tek tıkla hızlı ödeme almasını sağlar.',
    group: 'Sipariş Yetkilendirmeleri',
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'order_cancel',
    title: 'Siparişi iptal edebilir ("Siparişi İptal Et" ve ürün iptal işlemlerini yapabilir).',
    description: 'Kullanıcının açık bir siparişi veya adisyondaki kaydedilmiş ürünleri iptal etmesini sağlar.',
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
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
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
    roles: { waiter: true, kitchen: true, courier: false, cashier: true, manager: true, call_center: true }
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
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
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
    title: 'Yetkilendirme işlemleri (Sadece Yönetici)',
    description: 'Kullanıcının rollere yetki tanımlamasını veya mevcut yetkileri kaldırmasını sağlar. (Sadece Yönetici erişebilir)',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: true, call_center: false }
  },
  {
    id: 'def_stock_entry_count',
    title: 'Stok girişi,stok sayımı işlemleri.',
    description: 'Kullanıcının stok girişi yapmasını, sayım kaydetmesini ve açılış maliyeti girmesini sağlar.',
    group: 'Restaurant Tanım Yetkilendirmeleri',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: false }
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
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
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
  },

  // ===================== 8. SEKMELER (MENÜ & EKRAN GÖRÜNÜRLÜĞÜ) =====================
  {
    id: 'tab_dashboard',
    title: 'Ana Sayfa (Dashboard)',
    description: 'Sol menüdeki "Ana Sayfa" genel özet ekranını görmesini ve açmasını sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_tables',
    title: 'Masalar & Sipariş Ekranı (POS)',
    description: 'Masalar, açık siparişler ve POS sipariş alma ekranını görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: true, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'tab_kds',
    title: 'Mutfak (KDS) Sekmesi',
    description: 'Sol menü ve alt bardaki "Mutfak (KDS)" ekran sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_delivery',
    title: 'Paket Servis & Kurye (Caller ID) Sekmesi',
    description: 'Üst bar ve sol menüdeki "Paket Servis & Kurye" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: true, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'tab_cashier',
    title: 'Gider / Masraf & Kasa Sekmesi',
    description: 'İşlemler altındaki "Gider / Masraf İşlemleri" ve mobil alt bardaki "Kasa" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_integration_menu',
    title: 'Entegrasyon İşlemleri & Ürün Eşleştirme Sekmesi',
    description: 'Sol menüdeki "Entegrasyon İşlemleri" açılır menüsünü ve ekranını görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'tab_qr',
    title: 'Dijital Menü (QR) Sekmesi',
    description: 'Sol menüdeki "Dijital Menü (QR)" yönetim sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_settings',
    title: 'Restaurant Tanımlamaları Sekmesi',
    description: 'Tanımlamalar altındaki "Restaurant Tanımlamaları" (KDV, servis, yazıcı, indirim) sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_table_definition',
    title: 'Masa / Bölgeler Tanımlama Sekmesi',
    description: 'Tanımlamalar altındaki "Masa / Bölgeler" düzenleme sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_product_definition',
    title: 'Menü / Ürünler Tanımlama Sekmesi',
    description: 'Tanımlamalar altındaki "Menü / Ürünler" yönetim sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_inventory',
    title: 'Stok, Birimler, Reçeteler & Zayi Sekmesi',
    description: 'Tanımlamalar ve İşlemler altındaki "Birimler & Reçeteler", "Stok İşlemleri" ve "Zayi / Fire" sekmelerini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_kitchen_groups',
    title: 'Mutfak Grupları Sekmesi',
    description: 'Tanımlamalar altındaki "Mutfak Grupları" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: true, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_customers',
    title: 'Müşteri Sadakat & Cari (CRM) Sekmesi',
    description: 'Sol menüdeki "Müşteri Sadakat & Cari" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'tab_reservations',
    title: 'Masa Rezervasyon Sekmesi',
    description: 'Sol menüdeki "Masa Rezervasyon" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: true }
  },
  {
    id: 'tab_kiosk',
    title: 'Kiosk & Çağrı Ekranı (CFD) Sekmesi',
    description: 'Sol menüdeki "Kiosk & Çağrı Ekranı" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_hotel',
    title: 'Otel Yönetim (PMS) Sekmesi',
    description: 'Sol menüdeki "Otel Yönetim (PMS)" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_audit',
    title: 'Denetim İzi (Audit Log) Sekmesi',
    description: 'İşlemler altındaki "Denetim İzi (Audit Log)" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: true, call_center: false }
  },
  {
    id: 'tab_users',
    title: 'Kullanıcılar Sekmesi',
    description: 'Kullanıcılar menüsü altındaki "Kullanıcılar" personel listesi sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: true, call_center: false }
  },
  {
    id: 'tab_restaurant_statistics',
    title: 'Restaurant İstatistikleri Raporu Sekmesi',
    description: 'Raporlar altındaki "Restaurant İstatistikleri" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_closed_bills_report',
    title: 'Kapatılan Adisyonlar Raporu Sekmesi',
    description: 'Raporlar altındaki "Kapatılan Adisyonlar" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_product_sales_report',
    title: 'Ürün Satış Raporu Sekmesi',
    description: 'Raporlar altındaki "Ürün Satış Raporu" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_day_end_report',
    title: 'Gün Sonu Raporu (Z) Sekmesi',
    description: 'Raporlar altındaki "Gün Sonu Raporu (Z)" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: true, manager: true, call_center: false }
  },
  {
    id: 'tab_cost_profit',
    title: 'Maliyet & Rapor Sihirbazı Sekmesi',
    description: 'Raporlar altındaki "Maliyet & Rapor Sihirbazı" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: true, call_center: false }
  },
  {
    id: 'tab_app_store',
    title: 'Uygulama Mağazası Sekmesi',
    description: 'Sol menüdeki "Uygulama Mağazası" sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: false, kitchen: false, courier: false, cashier: false, manager: true, call_center: false }
  },
  {
    id: 'tab_profile',
    title: 'Profil & Kullanıcı Bilgisi Sekmesi',
    description: 'Kullanıcının kendi profil ve hesap bilgisi sekmesini görmesini sağlar.',
    group: 'Sekmeler',
    roles: { waiter: true, kitchen: true, courier: true, cashier: true, manager: true, call_center: true }
  }
];

export function mergeWithInitialPermissions(savedList: any[] | null | undefined): PermissionItem[] {
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
          waiter: defItem.id === 'def_permissions_manage' ? false : Boolean(existing.roles.waiter),
          kitchen: defItem.id === 'def_permissions_manage' ? false : Boolean(existing.roles.kitchen),
          courier: defItem.id === 'def_permissions_manage' ? false : Boolean(existing.roles.courier),
          cashier: defItem.id === 'def_permissions_manage' ? false : Boolean(existing.roles.cashier),
          manager: defItem.id === 'order_predefined_discount_only' ? Boolean(existing.roles.manager) : true,
          call_center: defItem.id === 'def_permissions_manage' ? false : Boolean(existing.roles.call_center),
        }
      };
    }
    return defItem;
  });
}

export function normalizeRoleKey(role?: string | null): RoleKey {
  const raw = (role || 'waiter').toLowerCase().trim();
  if (raw === 'admin' || raw === 'müdür' || raw === 'mudur' || raw === 'manager' || raw === 'yönetici' || raw === 'yonetici') {
    return 'manager';
  }
  if (raw === 'kasa' || raw === 'kasiyer' || raw === 'cashier') {
    return 'cashier';
  }
  if (raw === 'mutfak' || raw === 'kitchen' || raw === 'chef' || raw === 'şef' || raw === 'sef') {
    return 'kitchen';
  }
  if (raw === 'kurye' || raw === 'courier') {
    return 'courier';
  }
  if (raw === 'call_center' || raw === 'çağrı merkezi' || raw === 'cagri merkezi') {
    return 'call_center';
  }
  return 'waiter';
}

export function loadLocalPermissions(): PermissionItem[] {
  try {
    const saved = localStorage.getItem('boncore_role_permissions');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return mergeWithInitialPermissions(parsed);
      }
    }
  } catch {}
  return initialPermissions;
}

export function broadcastPermissionsUpdate(perms: PermissionItem[]) {
  try {
    localStorage.setItem('boncore_role_permissions', JSON.stringify(perms));
    window.dispatchEvent(new CustomEvent('boncore_permissions_updated', { detail: perms }));
  } catch {}
}

export function checkPermission(
  permissions: PermissionItem[],
  role: string | undefined | null,
  permId: string,
  defaultFallback: boolean = false
): boolean {
  const roleKey = normalizeRoleKey(role);
  if (permId === 'def_permissions_manage') {
    return roleKey === 'manager';
  }
  const perm = permissions.find(p => p.id === permId);
  if (permId === 'order_predefined_discount_only') {
    if (!perm) return false;
    return Boolean(perm.roles[roleKey]);
  }
  if (roleKey === 'manager') {
    return true;
  }
  if (!perm) {
    return defaultFallback;
  }
  return Boolean(perm.roles[roleKey]);
}

export function canAccessAppTab(
  permissions: PermissionItem[],
  role: string | undefined | null,
  tabId: string,
  features?: TenantFeatures
): boolean {
  // 1. FIRST: Check module licensing! If the restaurant has not licensed this module in SaaS,
  // NO role (including manager / admin) can view or access it!
  if (!isTabLicensed(tabId, features)) {
    return false;
  }

  const roleKey = normalizeRoleKey(role);
  // Yetkiler ekranı SADECE yöneticide (manager) gözükür ve sadece yönetici erişebilir!
  if (tabId === 'rights') {
    return roleKey === 'manager';
  }
  if (roleKey === 'manager') {
    return true;
  }

  const normalizedTab = tabId === 'pos' ? 'tables' : tabId;
  const tabPermId = `tab_${normalizedTab}`;
  const tabPerm = permissions.find(p => p.id === tabPermId);
  if (tabPerm) {
    return Boolean(tabPerm.roles[roleKey]);
  }

  return false;
}

let _inflightSettingsReq: Promise<any> | null = null;
let _lastSettingsFetchMs = 0;

export function useRolePermissions(currentUser?: StaffUser | null) {
  const [permissions, setPermissions] = useState<PermissionItem[]>(loadLocalPermissions);
  const [features, setFeatures] = useState<TenantFeatures>(loadLocalFeatures);

  const refreshPermissions = useCallback(async () => {
    const token = localStorage.getItem('boncore_token');
    if (!token || localStorage.getItem('boncore_auth') !== 'true') {
      return;
    }
    try {
      const now = Date.now();
      if (!_inflightSettingsReq && now - _lastSettingsFetchMs < 2000) {
        return;
      }
      if (!_inflightSettingsReq) {
        _lastSettingsFetchMs = now;
        _inflightSettingsReq = api.getSettings().finally(() => {
          _inflightSettingsReq = null;
        });
      }
      const settings = await _inflightSettingsReq;
      if (settings?.role_permissions && Array.isArray(settings.role_permissions)) {
        const merged = mergeWithInitialPermissions(settings.role_permissions);
        setPermissions(merged);
        localStorage.setItem('boncore_role_permissions', JSON.stringify(merged));
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshPermissions();

    const handleCustomUpdate = (e: Event) => {
      const custom = e as CustomEvent<PermissionItem[]>;
      if (custom.detail && Array.isArray(custom.detail)) {
        setPermissions(mergeWithInitialPermissions(custom.detail));
      } else {
        setPermissions(loadLocalPermissions());
      }
    };

    const handleFeaturesUpdate = (e: Event) => {
      const custom = e as CustomEvent<TenantFeatures>;
      if (custom.detail) {
        setFeatures(custom.detail);
      } else {
        setFeatures(loadLocalFeatures());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'boncore_role_permissions') {
        setPermissions(loadLocalPermissions());
      }
      if (e.key === 'boncore_licensed_features') {
        setFeatures(loadLocalFeatures());
      }
    };

    window.addEventListener('boncore_permissions_updated', handleCustomUpdate);
    window.addEventListener('boncore_features_updated', handleFeaturesUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('boncore_permissions_updated', handleCustomUpdate);
      window.removeEventListener('boncore_features_updated', handleFeaturesUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshPermissions]);

  const roleKey = useMemo(() => normalizeRoleKey(currentUser?.role), [currentUser?.role]);

  const hasPerm = useCallback(
    (permId: string, fallback: boolean = false) => checkPermission(permissions, roleKey, permId, fallback),
    [permissions, roleKey]
  );

  const canTab = useCallback(
    (tabId: string) => canAccessAppTab(permissions, roleKey, tabId, features),
    [permissions, roleKey, features]
  );

  return {
    permissions,
    roleKey,
    hasPerm,
    canTab,
    refreshPermissions
  };
}
