import React, { useState, useEffect, useCallback } from 'react';
import {
  ChefHat, Utensils, Flame, Wine, Cake, Coffee, Pizza,
  Plus, Edit3, Trash2, GripVertical, CheckCircle2, AlertCircle,
  Clock, Printer, Bell, Layers, Package, ArrowUp, ArrowDown,
  X, Save, RefreshCw, ChevronRight, Eye, EyeOff, ExternalLink, Check
} from 'lucide-react';
import { Category, Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';

export interface KitchenGroupItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  printer_name: string;
  target_prep_minutes: number;
  sound_alert: boolean;
  auto_print: boolean;
  is_active: boolean;
  display_order: number;
  product_count?: number;
  active_kds_count?: number;
}

interface KitchenGroupsDefinitionsProps {
  categories: Category[];
  onRefreshData?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const ICON_OPTIONS = [
  { id: 'utensils', label: 'Mutfak / Çatal-Bıçak', icon: Utensils },
  { id: 'flame', label: 'Izgara / Ateş', icon: Flame },
  { id: 'wine', label: 'Bar / İçecek', icon: Wine },
  { id: 'cake', label: 'Tatlı / Pasta', icon: Cake },
  { id: 'coffee', label: 'Kahve / Sıcak İçecek', icon: Coffee },
  { id: 'pizza', label: 'Fırın / Pizza / Pide', icon: Pizza },
  { id: 'chef', label: 'Şef / Özel İstasyon', icon: ChefHat },
];

const COLOR_OPTIONS = [
  { id: 'red', label: 'Kırmızı', bg: 'bg-red-600', soft: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900' },
  { id: 'amber', label: 'Turuncu / Kehribar', bg: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900' },
  { id: 'blue', label: 'Mavi', bg: 'bg-blue-600', soft: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900' },
  { id: 'purple', label: 'Mor', bg: 'bg-purple-600', soft: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900' },
  { id: 'emerald', label: 'Yeşil', bg: 'bg-emerald-600', soft: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900' },
  { id: 'indigo', label: 'Çivit Mavi', bg: 'bg-indigo-600', soft: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900' },
];

export const renderStationIcon = (iconKey: string, className: string = 'w-5 h-5') => {
  switch (iconKey) {
    case 'flame': return <Flame className={className} />;
    case 'wine': return <Wine className={className} />;
    case 'cake': return <Cake className={className} />;
    case 'coffee': return <Coffee className={className} />;
    case 'pizza': return <Pizza className={className} />;
    case 'chef': return <ChefHat className={className} />;
    default: return <Utensils className={className} />;
  }
};

export const KitchenGroupsDefinitions: React.FC<KitchenGroupsDefinitionsProps> = ({
  categories,
  onRefreshData,
  onNavigateTab,
}) => {
  const [groups, setGroups] = useState<KitchenGroupItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGroup, setEditingGroup] = useState<KitchenGroupItem | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formCode, setFormCode] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formIcon, setFormIcon] = useState<string>('utensils');
  const [formColor, setFormColor] = useState<string>('red');
  const [formPrinter, setFormPrinter] = useState<string>('');
  const [formPrepMins, setFormPrepMins] = useState<number>(15);
  const [formSoundAlert, setFormSoundAlert] = useState<boolean>(true);
  const [formAutoPrint, setFormAutoPrint] = useState<boolean>(true);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Category / Product Assignment Modal State
  const [assignModalGroup, setAssignModalGroup] = useState<KitchenGroupItem | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [assigning, setAssigning] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getKitchenGroups();
      if (Array.isArray(data)) {
        setGroups(data);
      }
    } catch (e: any) {
      showToast(e.message || 'Mutfak grupları yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useWebSocket('all', (type) => {
    if (type === 'KITCHEN_GROUPS_UPDATED' || type === 'MENU_UPDATED') {
      loadGroups();
    }
  });

  const handleOpenAddModal = () => {
    sound.beep();
    setEditingGroup(null);
    setFormName('');
    setFormCode('');
    setFormDesc('');
    setFormIcon('utensils');
    setFormColor('red');
    setFormPrinter('');
    setFormPrepMins(15);
    setFormSoundAlert(true);
    setFormAutoPrint(true);
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (group: KitchenGroupItem) => {
    sound.beep();
    setEditingGroup(group);
    setFormName(group.name);
    setFormCode(group.id);
    setFormDesc(group.description || '');
    setFormIcon(group.icon || 'utensils');
    setFormColor(group.color || 'red');
    setFormPrinter(group.printer_name || '');
    setFormPrepMins(group.target_prep_minutes || 15);
    setFormSoundAlert(group.sound_alert !== false);
    setFormAutoPrint(group.auto_print !== false);
    setFormIsActive(group.is_active !== false);
    setIsModalOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Lütfen mutfak grubu adını giriniz.', 'error');
      return;
    }

    setSaving(true);
    sound.beep();
    try {
      if (editingGroup) {
        await api.updateKitchenGroup(editingGroup.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          icon: formIcon,
          color: formColor,
          printer_name: formPrinter.trim(),
          target_prep_minutes: Number(formPrepMins) || 15,
          sound_alert: formSoundAlert,
          auto_print: formAutoPrint,
          is_active: formIsActive,
        });
        showToast(`"${formName.trim()}" mutfak grubu güncellendi.`, 'success');
      } else {
        await api.createKitchenGroup({
          id: formCode.trim() || undefined,
          name: formName.trim(),
          description: formDesc.trim(),
          icon: formIcon,
          color: formColor,
          printer_name: formPrinter.trim(),
          target_prep_minutes: Number(formPrepMins) || 15,
          sound_alert: formSoundAlert,
          auto_print: formAutoPrint,
          is_active: formIsActive,
        });
        showToast(`"${formName.trim()}" mutfak grubu oluşturuldu.`, 'success');
      }
      setIsModalOpen(false);
      await loadGroups();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      sound.warning();
      showToast(err.message || 'Kaydetme başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (group: KitchenGroupItem) => {
    sound.beep();
    const nextState = !group.is_active;
    try {
      await api.updateKitchenGroup(group.id, { is_active: nextState });
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_active: nextState } : g));
      showToast(`"${group.name}" KDS ekranında ${nextState ? 'Aktif edildi' : 'Pasife alındı'}.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Durum değiştirilemedi.', 'error');
    }
  };

  const handleDeleteGroup = async (group: KitchenGroupItem) => {
    if (groups.length <= 1) {
      showToast('Sistemde en az 1 mutfak grubu bulunmalıdır.', 'error');
      return;
    }
    const confirmMsg = `"${group.name}" mutfak grubunu silmek istediğinize emin misiniz?\nBu gruba bağlı ürünler otomatik olarak ilk mutfak grubuna aktarılacaktır.`;
    if (!confirm(confirmMsg)) return;

    sound.beep();
    try {
      await api.deleteKitchenGroup(group.id);
      showToast(`"${group.name}" mutfak grubu silindi.`, 'success');
      await loadGroups();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      sound.warning();
      showToast(err.message || 'Silme işlemi başarısız.', 'error');
    }
  };

  const handleReorder = async (newGroups: KitchenGroupItem[]) => {
    setGroups(newGroups);
    try {
      await api.reorderKitchenGroups(newGroups.map(g => g.id));
      showToast('Mutfak grupları KDS sıralaması güncellendi.', 'success');
    } catch (err: any) {
      showToast('Sıralama kaydedilemedi.', 'error');
      loadGroups();
    }
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= groups.length) return;
    sound.beep();
    const copy = [...groups];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    handleReorder(copy);
  };

  const handleDropGroup = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = groups.findIndex(g => g.id === draggedId);
    const toIdx = groups.findIndex(g => g.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    sound.beep();
    const copy = [...groups];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setDraggedId(null);
    setDragOverId(null);
    handleReorder(copy);
  };

  const handleOpenAssignModal = (group: KitchenGroupItem) => {
    sound.beep();
    setAssignModalGroup(group);
    setSelectedCategoryIds([]);
    // Pre-select products already assigned to this group
    const existingProdIds: number[] = [];
    categories.forEach(cat => {
      (cat.products || []).forEach((p: Product) => {
        if ((p.station || 'kitchen') === group.id) {
          existingProdIds.push(p.id);
        }
      });
    });
    setSelectedProductIds(existingProdIds);
  };

  const handleToggleAssignCategory = (cat: Category) => {
    sound.beep();
    const catProdIds = (cat.products || []).map(p => p.id);
    const isCatSelected = selectedCategoryIds.includes(cat.id);
    if (isCatSelected) {
      setSelectedCategoryIds(prev => prev.filter(id => id !== cat.id));
      setSelectedProductIds(prev => prev.filter(id => !catProdIds.includes(id)));
    } else {
      setSelectedCategoryIds(prev => [...prev, cat.id]);
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...catProdIds])));
    }
  };

  const handleSaveAssignment = async () => {
    if (!assignModalGroup) return;
    setAssigning(true);
    sound.beep();
    try {
      const res = await api.assignCategoriesToKitchenGroup(assignModalGroup.id, {
        category_ids: selectedCategoryIds,
        product_ids: selectedProductIds,
      });
      showToast(`${res.updated_count || selectedProductIds.length} ürün "${assignModalGroup.name}" grubuna bağlandı.`, 'success');
      setAssignModalGroup(null);
      await loadGroups();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Atama yapılamadı.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const activeGroupsCount = groups.filter(g => g.is_active).length;
  const totalAssignedProducts = groups.reduce((s, g) => s + (g.product_count || 0), 0);
  const totalActiveKdsItems = groups.reduce((s, g) => s + (g.active_kds_count || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5 text-slate-900 dark:text-slate-100 select-none font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-extrabold animate-slideDown ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <span>Tanımlamalar</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-red-600 font-bold">Mutfak Grupları (KDS)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <ChefHat className="w-6 h-6 text-red-600" />
            <span>Mutfak Grupları & KDS İstasyon Yönetimi</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
            Mutfak (KDS) ekranındaki Mutfak, Izgara, Bar, Tatlı gibi hazırlama bölümlerini ekleyin, sıralayın, aktif/pasif yapın ve ürünleri bölümlere bağlayın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => { sound.beep(); onNavigateTab('kds'); }}
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-blue-500" />
              <span>Mutfak (KDS) Ekranını Aç</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-md shadow-red-600/20 cursor-pointer active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Mutfak Grubu Ekle</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>TOPLAM MUTFAK GRUBU</span>
            <Layers className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
            {groups.length} <span className="text-xs font-bold text-slate-400">Bölüm</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>AKTİF KDS İSTASYONU</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {activeGroupsCount} / {groups.length} <span className="text-xs font-bold text-slate-400">Aktif</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>BAĞLI MENÜ ÜRÜNÜ</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
            {totalAssignedProducts} <span className="text-xs font-bold text-slate-400">Ürün</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>ANLIK KDS SİPARİŞ KALEMİ</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            {totalActiveKdsItems} <span className="text-xs font-bold text-slate-400">Bekleyen</span>
          </div>
        </div>
      </div>

      {/* Live Preview of KDS Station Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-600 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Mutfak (KDS) Üst Menü Önizlemesi (Sürükleyerek Sıralayabilirsiniz):</span>
        </div>
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold gap-1 overflow-x-auto no-scrollbar">
          <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white shadow-xs">Tümü</span>
          {groups.filter(g => g.is_active).map((g) => (
            <span
              key={g.id}
              className="px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 flex items-center gap-1.5 whitespace-nowrap"
            >
              {renderStationIcon(g.icon, 'w-3.5 h-3.5 text-red-500')}
              <span>{g.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Kitchen Groups Cards Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
          <span className="text-xs font-bold">Mutfak grupları yükleniyor...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group, idx) => {
            const colorObj = COLOR_OPTIONS.find(c => c.id === group.color) || COLOR_OPTIONS[0];
            const isBeingDragged = draggedId === group.id;
            const isDragTarget = dragOverId === group.id && draggedId !== group.id;

            // Categories that have products in this group
            const groupCategories = categories
              .map(c => ({
                id: c.id,
                name: c.name,
                count: (c.products || []).filter((p: Product) => (p.station || 'kitchen') === group.id).length
              }))
              .filter(c => c.count > 0);

            return (
              <div
                key={group.id}
                draggable
                onDragStart={() => setDraggedId(group.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverId !== group.id) setDragOverId(group.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === group.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropGroup(group.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between gap-4 ${
                  isBeingDragged
                    ? 'opacity-40 scale-95 border-dashed border-red-400'
                    : isDragTarget
                    ? 'border-2 border-blue-500 ring-2 ring-blue-400/20'
                    : group.is_active
                    ? 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    : 'border-slate-200/60 dark:border-slate-800/60 opacity-70 bg-slate-50/60 dark:bg-slate-900/40'
                }`}
              >
                {/* Card Top */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                        title="Sıralamak için sürükleyin"
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>

                      <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${colorObj.soft}`}>
                        {renderStationIcon(group.icon, 'w-6 h-6')}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-slate-900 dark:text-white">
                            {group.name}
                          </h3>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                            #{group.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          {group.description || 'KDS hazırlama bölümü'}
                        </p>
                      </div>
                    </div>

                    {/* Active / Passive Pill + Up/Down Order */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'up')}
                        disabled={idx === 0}
                        title="Yukarı Taşı"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'down')}
                        disabled={idx === groups.length - 1}
                        title="Aşağı Taşı"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(group)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1.5 transition cursor-pointer ${
                          group.is_active
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {group.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{group.is_active ? 'Aktif' : 'Pasif'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Specs Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 text-xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Bağlı Ürün</div>
                      <div className="font-mono font-black text-slate-900 dark:text-white mt-0.5">
                        {group.product_count || 0} Ürün
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 text-xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Hedef Süre</div>
                      <div className="font-mono font-black text-slate-900 dark:text-white mt-0.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>{group.target_prep_minutes || 15} dk</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 text-xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Mutfak Yazıcısı</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate flex items-center gap-1">
                        <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{group.printer_name || 'Tanımsız'}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 text-xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Sesli Zil</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                        <Bell className={`w-3.5 h-3.5 ${group.sound_alert ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <span>{group.sound_alert ? 'Açık' : 'Kapalı'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Categories Preview */}
                  <div className="pt-1">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1.5">
                      Bu Bölüme Bağlı Kategoriler:
                    </div>
                    {groupCategories.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {groupCategories.map(gc => (
                          <span
                            key={gc.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold"
                          >
                            {gc.name} <span className="font-mono text-slate-400">({gc.count})</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        Henüz bu gruba atanmış ürün bulunmuyor.
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAssignModal(group)}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Kategori / Ürün Bağla</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(group)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition cursor-pointer"
                      title="Mutfak Grubunu Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= ADD / EDIT KITCHEN GROUP MODAL ================= */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ChefHat className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-black">
                  {editingGroup ? `Mutfak Grubunu Düzenle: ${editingGroup.name}` : 'Yeni Mutfak Grubu (KDS İstasyonu) Ekle'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mutfak Grubu / Bölüm Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Örn: Mutfak, Izgara, Bar, Tatlı, Taş Fırın"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    İstasyon Kodu
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    disabled={!!editingGroup}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="Otomatik"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 font-mono font-bold text-slate-700 dark:text-slate-300 disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açıklama
                </label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Örn: Izgara, kebap ve et ürünleri hazırlama bölümü"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Bölüm İkonu
                  </label>
                  <select
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  >
                    {ICON_OPTIONS.map(ic => (
                      <option key={ic.id} value={ic.id}>{ic.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Renk Teması
                  </label>
                  <select
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  >
                    {COLOR_OPTIONS.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hedef Hazırlama Süresi (Dakika)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={formPrepMins}
                    onChange={(e) => setFormPrepMins(Number(e.target.value) || 15)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Eşleşen Mutfak Yazıcısı
                  </label>
                  <input
                    type="text"
                    value={formPrinter}
                    onChange={(e) => setFormPrinter(e.target.value)}
                    placeholder="Örn: Bar Yazıcısı / Mutfak Yazıcısı"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200">KDS Ekranında Aktif Göster</div>
                    <div className="text-[11px] text-slate-500">İşaretli ise Mutfak (KDS) ekranında sekme olarak yer alır.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200">Yeni Siparişte Sesli Zil Çalsın</div>
                    <div className="text-[11px] text-slate-500">Bu bölüme yeni sipariş düştüğünde mutfak ekranında zil sesi verir.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formSoundAlert}
                    onChange={(e) => setFormSoundAlert(e.target.checked)}
                    className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200">Otomatik Mutfak Fişi Yazdır</div>
                    <div className="text-[11px] text-slate-500">Sipariş girildiğinde bu bölümün yazıcısından otomatik bilgi fişi çıkar.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formAutoPrint}
                    onChange={(e) => setFormAutoPrint(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= CATEGORY / PRODUCT BULK ASSIGN MODAL ================= */}
      {assignModalGroup && (
        <div
          onClick={() => setAssignModalGroup(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  <span>"{assignModalGroup.name}" Bölümüne Kategori & Ürün Bağla</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Seçtiğiniz kategorilerdeki veya ürünlerdeki siparişler Mutfak (KDS) ekranında "{assignModalGroup.name}" sekmesine düşer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalGroup(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              <div>
                <h4 className="font-extrabold uppercase text-slate-500 mb-2">
                  1. Hızlı Kategori Seçimi (Tüm Kategoriyi Bağla)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleToggleAssignCategory(cat)}
                        className={`p-3 rounded-xl border text-left font-bold flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 text-blue-700 dark:text-blue-300'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="truncate">{cat.name}</div>
                          <div className="text-[10px] text-slate-400">{(cat.products || []).length} Ürün</div>
                        </div>
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-600'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="font-extrabold uppercase text-slate-500 mb-2">
                  2. Ürün Bazlı Seçim ({selectedProductIds.length} Ürün Seçili)
                </h4>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {categories.map((cat) => (
                    <div key={cat.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
                      <div className="font-extrabold text-slate-800 dark:text-slate-200 mb-2">{cat.name}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(cat.products || []).map((prod: Product) => {
                          const isChecked = selectedProductIds.includes(prod.id);
                          return (
                            <label
                              key={prod.id}
                              className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between cursor-pointer ${
                                isChecked
                                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold'
                                  : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <span className="truncate pr-2">{prod.name}</span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedProductIds(prev => [...prev, prod.id]);
                                  } else {
                                    setSelectedProductIds(prev => prev.filter(id => id !== prod.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer shrink-0"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-500">
                Toplam <b className="text-slate-900 dark:text-white">{selectedProductIds.length}</b> ürün "{assignModalGroup.name}" bölümüne atanacak
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalGroup(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="button"
                  disabled={assigning}
                  onClick={handleSaveAssignment}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{assigning ? 'Atanıyor...' : 'Seçili Ürünleri Bağla'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
