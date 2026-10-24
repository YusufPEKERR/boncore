import React, { useState } from 'react';
import { 
  Plus, Search, Edit3, Trash2, Layers, 
  Square, Circle, CheckCircle2, AlertTriangle, Sparkles 
} from 'lucide-react';
import { Area, Table } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface TableAreaDefinitionsProps {
  areas: Area[];
  onRefreshAreas: () => void;
}

export const TableAreaDefinitions: React.FC<TableAreaDefinitionsProps> = ({
  areas,
  onRefreshAreas
}) => {
  const [activeAreaId, setActiveAreaId] = useState<number>(areas[0]?.id || 1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Modals state
  const [isAddAreaModalOpen, setIsAddAreaModalOpen] = useState<boolean>(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaNameInput, setAreaNameInput] = useState<string>('');

  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState<boolean>(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableNameInput, setTableNameInput] = useState<string>('');
  const [tableShapeInput, setTableShapeInput] = useState<'square' | 'round' | 'rectangle' | 'bar'>('square');
  const [tableAreaSelect, setTableAreaSelect] = useState<number>(activeAreaId);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkPrefix, setBulkPrefix] = useState<string>('Masa ');
  const [bulkStartNum, setBulkStartNum] = useState<number>(1);
  const [bulkCount, setBulkCount] = useState<number>(10);

  const currentArea = areas.find(a => a.id === activeAreaId) || areas[0];
  const displayedTables = currentArea?.tables?.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  React.useEffect(() => {
    if (areas.length > 0 && !areas.some(a => a.id === activeAreaId)) {
      setActiveAreaId(areas[0].id);
    }
  }, [areas]);

  // --- Area Actions ---
  const handleOpenAddArea = () => {
    setEditingArea(null);
    setAreaNameInput('');
    setIsAddAreaModalOpen(true);
  };

  const handleOpenEditArea = (a: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingArea(a);
    setAreaNameInput(a.name);
    setIsAddAreaModalOpen(true);
  };

  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaNameInput.trim()) return;
    sound.beep();
    try {
      if (editingArea) {
        await api.updateArea(editingArea.id, areaNameInput);
        showToast('Bölge başarıyla güncellendi.', 'success');
      } else {
        await api.createArea(areaNameInput);
        showToast('Yeni bölge başarıyla oluşturuldu.', 'success');
      }
      onRefreshAreas();
      setIsAddAreaModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Bölge kaydedilemedi.', 'error');
      sound.warning();
    }
  };

  const handleDeleteArea = async (a: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`"${a.name}" bölgesini ve boş masalarını silmek istediğinize emin misiniz?`)) {
      sound.beep();
      try {
        await api.deleteArea(a.id);
        showToast(`"${a.name}" bölgesi silindi.`, 'success');
        onRefreshAreas();
      } catch (err: any) {
        showToast(err.message || 'Bölge silinemedi.', 'error');
        sound.warning();
      }
    }
  };

  // --- Table Actions ---
  const handleOpenAddTable = () => {
    setEditingTable(null);
    setTableNameInput(`Masa ${(currentArea?.tables?.length || 0) + 1}`);
    setTableShapeInput('square');
    setTableAreaSelect(currentArea?.id || 1);
    setIsAddTableModalOpen(true);
  };

  const handleOpenEditTable = (t: Table) => {
    setEditingTable(t);
    setTableNameInput(t.name);
    setTableShapeInput(t.shape || 'square');
    setTableAreaSelect(t.area_id);
    setIsAddTableModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNameInput.trim()) return;
    sound.beep();
    try {
      if (editingTable) {
        await api.updateTable(editingTable.id, {
          area_id: tableAreaSelect,
          name: tableNameInput,
          seats: 0,
          shape: tableShapeInput
        });
        showToast('Masa bilgileri güncellendi.', 'success');
      } else {
        await api.createTable({
          area_id: tableAreaSelect,
          name: tableNameInput,
          seats: 0,
          shape: tableShapeInput
        });
        showToast('Yeni masa oluşturuldu.', 'success');
      }
      onRefreshAreas();
      setIsAddTableModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Masa kaydedilemedi.', 'error');
      sound.warning();
    }
  };

  const handleDeleteTable = async (t: Table) => {
    if (confirm(`"${t.name}" masasını silmek istediğinize emin misiniz?`)) {
      sound.beep();
      try {
        await api.deleteTable(t.id);
        showToast(`"${t.name}" masası silindi.`, 'success');
        onRefreshAreas();
      } catch (err: any) {
        showToast(err.message || 'Masa silinemedi.', 'error');
        sound.warning();
      }
    }
  };

  // --- Bulk Create Action ---
  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    try {
      await api.bulkCreateTables({
        area_id: currentArea.id,
        prefix: bulkPrefix,
        start_num: Number(bulkStartNum),
        count: Number(bulkCount),
        seats: 0,
        shape: 'square'
      });
      showToast('Toplu masalar başarıyla eklendi.', 'success');
      onRefreshAreas();
      setIsBulkModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Toplu masa eklenemedi.', 'error');
      sound.warning();
    }
  };

  return (
    <div className="relative flex-1 flex flex-col md:flex-row h-full min-h-0 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 right-4 z-50 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-2xl transition-all animate-slideDown ${
          toast.type === 'success' 
            ? 'bg-emerald-600/95 text-white border border-emerald-500' 
            : 'bg-rose-600/95 text-white border border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Left Sidebar: Areas List (Horizontal on mobile, ~280px sidebar on desktop) */}
      <div className="w-full md:w-72 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10 shrink-0">
        {/* Top Button: + Bölge Ekle */}
        <div className="p-2.5 sm:p-3.5 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={handleOpenAddArea}
            className="w-full py-2 sm:py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-black text-xs border border-red-200 dark:border-red-900/60 flex items-center justify-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Bölge Ekle</span>
          </button>
        </div>

        {/* Scrollable Areas List */}
        <div className="flex md:flex-col md:flex-1 overflow-x-auto md:overflow-y-auto p-2 gap-1.5 md:gap-0 md:space-y-1 no-scrollbar">
          {areas.map((area) => {
            const isActive = area.id === activeAreaId;
            return (
              <div
                key={area.id}
                onClick={() => { sound.beep(); setActiveAreaId(area.id); }}
                className={`p-2.5 sm:p-3 rounded-xl cursor-pointer transition flex items-center justify-between gap-2 text-xs font-bold shrink-0 ${
                  isActive
                    ? 'bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-white border-b-2 md:border-b-0 md:border-l-4 border-red-600 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="truncate">
                    <div className="uppercase font-black text-xs truncate">{area.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{area.tables?.length || 0} Masa</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleOpenEditArea(area, e)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded"
                    title="Bölge Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteArea(area, e)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                    title="Bölge Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Content: Tables in Active Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0">
        {/* Top Toolbar */}
        <div className="min-h-14 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shadow-sm shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[160px] max-w-md">
            <span className="hidden sm:inline text-xs font-black text-slate-900 dark:text-white uppercase whitespace-nowrap">
              {currentArea?.name} ({currentArea?.tables?.length || 0} Masa)
            </span>
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Masa ara..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => { sound.beep(); setIsBulkModalOpen(true); }}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap border border-slate-200 dark:border-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden xs:inline">Toplu Masa</span>
              <span className="xs:hidden">Toplu</span>
            </button>

            <button
              onClick={handleOpenAddTable}
              className="px-3 sm:px-4 py-2 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Masa</span>
            </button>
          </div>
        </div>

        {/* Tables Definition Cards Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 content-start">
          {displayedTables.map((t) => (
            <div
              key={t.id}
              className="h-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition relative group"
            >
              {/* Card Top: Shape */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  {t.shape === 'round' ? <Circle className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{t.shape || 'Kare'}</span>
                </div>
              </div>

              {/* Card Center: Table Name */}
              <div className="text-center my-auto">
                <h4 className="font-black text-base text-slate-900 dark:text-white tracking-tight">
                  {t.name}
                </h4>
                <span className="text-[10px] text-slate-400 font-semibold uppercase">
                  {currentArea?.name}
                </span>
              </div>

              {/* Card Bottom: Edit & Delete Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Aktif Masa"></span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditTable(t)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTable(t)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {displayedTables.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 text-xs font-semibold">
              Bu bölgede henüz masa tanımlanmamış. "Yeni Masa Ekle" veya "Toplu Masa Ekle" butonunu kullanarak masa oluşturabilirsiniz.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Yeni Bölge Ekle / Düzenle */}
      {isAddAreaModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">
              {editingArea ? 'Bölge Düzenle' : 'Yeni Bölge Ekle'}
            </h3>
            <form onSubmit={handleSaveArea} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Bölge Adı:</label>
                <input
                  type="text"
                  value={areaNameInput}
                  onChange={(e) => setAreaNameInput(e.target.value)}
                  placeholder="Örn: BAHÇE 2, TERAS, VIP"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white uppercase font-bold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddAreaModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black shadow"
                >
                  {editingArea ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Yeni Masa Ekle / Düzenle */}
      {isAddTableModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">
              {editingTable ? 'Masa Düzenle' : 'Yeni Masa Ekle'}
            </h3>
            <form onSubmit={handleSaveTable} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Masa Adı:</label>
                <input
                  type="text"
                  value={tableNameInput}
                  onChange={(e) => setTableNameInput(e.target.value)}
                  placeholder="Örn: Masa 14 veya Loca 2"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Bulunduğu Bölge:</label>
                <select
                  value={tableAreaSelect}
                  onChange={(e) => setTableAreaSelect(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                >
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Masa Şekli:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'square', label: 'Kare' },
                    { id: 'round', label: 'Yuvarlak' },
                    { id: 'rectangle', label: 'Dikdörtgen' }
                  ].map(s => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setTableShapeInput(s.id as any)}
                      className={`py-2 rounded-xl border text-xs font-bold transition ${
                        tableShapeInput === s.id
                          ? 'bg-red-600 text-white border-red-500 shadow'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddTableModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black shadow"
                >
                  {editingTable ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Toplu Masa Ekle */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Toplu Masa Oluştur ({currentArea?.name})</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Belirttiğiniz aralıkta otomatik olarak sıralı masalar oluşturulur.
            </p>

            <form onSubmit={handleBulkCreate} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Masa İsim Öneki:</label>
                <input
                  type="text"
                  value={bulkPrefix}
                  onChange={(e) => setBulkPrefix(e.target.value)}
                  placeholder="Masa "
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1">Başlangıç No:</label>
                  <input
                    type="number"
                    min={1}
                    value={bulkStartNum}
                    onChange={(e) => setBulkStartNum(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Masa Sayısı:</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
                Oluşturulacak masalar: <span className="font-mono font-bold text-red-600">{bulkPrefix}{bulkStartNum} ... {bulkPrefix}{Number(bulkStartNum) + Number(bulkCount) - 1}</span>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black shadow"
                >
                  Toplu Oluştur ({bulkCount} Masa)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
