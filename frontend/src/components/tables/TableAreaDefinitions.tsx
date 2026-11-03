import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Edit3, Trash2, Layers, 
  Square, Circle, CheckCircle2, AlertTriangle, Sparkles,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  GripVertical, Move, LayoutGrid, MapPin, Save, ArrowRightLeft,
  RotateCcw, Sliders
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
  const [viewMode, setViewMode] = useState<'grid' | 'kroki'>('grid');
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

  // Quick Move Table Modal
  const [quickMoveTable, setQuickMoveTable] = useState<Table | null>(null);
  const [quickMoveTargetAreaId, setQuickMoveTargetAreaId] = useState<number>(areas[0]?.id || 1);

  // Drag states for Area & Table reordering
  const [draggedAreaIndex, setDraggedAreaIndex] = useState<number | null>(null);
  const [draggedTableIndex, setDraggedTableIndex] = useState<number | null>(null);
  const [draggedTableItem, setDraggedTableItem] = useState<Table | null>(null);
  const [isAreaDropTargetId, setIsAreaDropTargetId] = useState<number | null>(null);

  // Kroki (Canvas) Drag state
  const [canvasTables, setCanvasTables] = useState<Table[]>([]);
  const [hasUnsavedPositions, setHasUnsavedPositions] = useState<boolean>(false);
  const [activeDragKrokiId, setActiveDragKrokiId] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; tableX: number; tableY: number } | null>(null);

  const currentArea = areas.find(a => a.id === activeAreaId) || areas[0];
  const displayedTables = (currentArea?.tables || []).filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (areas.length > 0 && !areas.some(a => a.id === activeAreaId)) {
      setActiveAreaId(areas[0].id);
    }
  }, [areas]);

  useEffect(() => {
    if (currentArea) {
      setCanvasTables(currentArea.tables || []);
      setHasUnsavedPositions(false);
    }
  }, [currentArea?.id, currentArea?.tables]);

  // --- Area Reordering Actions ---
  const handleMoveArea = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= areas.length) return;

    sound.beep();
    const newAreas = [...areas];
    const [moved] = newAreas.splice(index, 1);
    newAreas.splice(targetIndex, 0, moved);

    try {
      await api.reorderAreas(newAreas.map(a => a.id));
      showToast('Bölge sıralaması güncellendi.', 'success');
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Bölge sıralanamadı.', 'error');
      sound.warning();
    }
  };

  const handleAreaDragStart = (e: React.DragEvent, index: number) => {
    setDraggedAreaIndex(index);
    e.dataTransfer.setData('text/plain', `area:${index}`);
  };

  const handleAreaDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setIsAreaDropTargetId(null);

    // Check if dropping a table onto an area to move table
    if (draggedTableItem) {
      const targetArea = areas[targetIndex];
      if (targetArea && targetArea.id !== draggedTableItem.area_id) {
        sound.beep();
        try {
          await api.updateTable(draggedTableItem.id, {
            area_id: targetArea.id,
            name: draggedTableItem.name
          });
          showToast(`"${draggedTableItem.name}" masası "${targetArea.name}" bölgesine taşındı.`, 'success');
          setDraggedTableItem(null);
          onRefreshAreas();
        } catch (err: any) {
          showToast(err.message || 'Masa taşınamadı.', 'error');
          sound.warning();
        }
      }
      return;
    }

    // Reorder areas
    if (draggedAreaIndex === null || draggedAreaIndex === targetIndex) return;
    sound.beep();
    const newAreas = [...areas];
    const [moved] = newAreas.splice(draggedAreaIndex, 1);
    newAreas.splice(targetIndex, 0, moved);
    setDraggedAreaIndex(null);

    try {
      await api.reorderAreas(newAreas.map(a => a.id));
      showToast('Bölge sıralaması güncellendi.', 'success');
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Bölge sıralanamadı.', 'error');
      sound.warning();
    }
  };

  // --- Table Reordering Actions ---
  const handleMoveTable = async (tableIndex: number, direction: 'prev' | 'next') => {
    const targetIndex = direction === 'prev' ? tableIndex - 1 : tableIndex + 1;
    const tablesList = currentArea?.tables || [];
    if (targetIndex < 0 || targetIndex >= tablesList.length) return;

    sound.beep();
    const newTables = [...tablesList];
    const [moved] = newTables.splice(tableIndex, 1);
    newTables.splice(targetIndex, 0, moved);

    try {
      await api.reorderTables(currentArea.id, newTables.map(t => t.id));
      showToast('Masa sırası güncellendi.', 'success');
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Masa sırası güncellenemedi.', 'error');
      sound.warning();
    }
  };

  const handleTableDragStart = (e: React.DragEvent, table: Table, index: number) => {
    setDraggedTableIndex(index);
    setDraggedTableItem(table);
    e.dataTransfer.setData('text/plain', `table:${table.id}`);
  };

  const handleTableDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedTableIndex === null || draggedTableIndex === targetIndex) return;

    sound.beep();
    const tablesList = [...(currentArea?.tables || [])];
    const [moved] = tablesList.splice(draggedTableIndex, 1);
    tablesList.splice(targetIndex, 0, moved);
    setDraggedTableIndex(null);
    setDraggedTableItem(null);

    try {
      await api.reorderTables(currentArea.id, tablesList.map(t => t.id));
      showToast('Masa sırası güncellendi.', 'success');
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Masa sıralanamadı.', 'error');
      sound.warning();
    }
  };

  // --- Quick Move Table to Area ---
  const handleExecuteQuickMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMoveTable) return;
    sound.beep();
    try {
      await api.updateTable(quickMoveTable.id, {
        area_id: quickMoveTargetAreaId,
        name: quickMoveTable.name
      });
      const targetAreaObj = areas.find(a => a.id === quickMoveTargetAreaId);
      showToast(`"${quickMoveTable.name}" masası "${targetAreaObj?.name || 'Seçili bölgeye'}" başarıyla taşındı.`, 'success');
      setQuickMoveTable(null);
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Masa taşınamadı.', 'error');
      sound.warning();
    }
  };

  // --- Area Modal Actions ---
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
        await api.createArea(areaNameInput, areas.length);
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

  // --- Table Modal Actions ---
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
          shape: tableShapeInput,
          order_index: (currentArea?.tables?.length || 0)
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

  // --- Kroki / Layout Canvas Actions ---
  const handleKrokiMouseDown = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    setActiveDragKrokiId(table.id);
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      tableX: table.x || 50,
      tableY: table.y || 50
    };
  };

  const handleKrokiMouseMove = (e: React.MouseEvent) => {
    if (!activeDragKrokiId || !dragStartPos.current || !canvasRef.current) return;
    const deltaX = e.clientX - dragStartPos.current.mouseX;
    const deltaY = e.clientY - dragStartPos.current.mouseY;

    // 10px snap grid
    const rawX = Math.max(10, dragStartPos.current.tableX + deltaX);
    const rawY = Math.max(10, dragStartPos.current.tableY + deltaY);
    const snappedX = Math.round(rawX / 10) * 10;
    const snappedY = Math.round(rawY / 10) * 10;

    setCanvasTables(prev => prev.map(t => {
      if (t.id === activeDragKrokiId) {
        return { ...t, x: snappedX, y: snappedY };
      }
      return t;
    }));
    setHasUnsavedPositions(true);
  };

  const handleKrokiMouseUp = () => {
    if (activeDragKrokiId) {
      setActiveDragKrokiId(null);
      dragStartPos.current = null;
    }
  };

  const handleSaveKrokiPositions = async () => {
    sound.beep();
    try {
      const payload = canvasTables.map(t => ({
        id: t.id,
        x: t.x || 50,
        y: t.y || 50,
        width: t.width || 120,
        height: t.height || 120,
        shape: t.shape || 'square'
      }));
      await api.updateTablePositions(payload);
      setHasUnsavedPositions(false);
      showToast('Kroki yerleşimi başarıyla kaydedildi.', 'success');
      onRefreshAreas();
    } catch (err: any) {
      showToast(err.message || 'Yerleşim kaydedilemedi.', 'error');
      sound.warning();
    }
  };

  const handleAutoAlignKroki = () => {
    sound.beep();
    const cols = 5;
    const itemWidth = 140;
    const itemHeight = 140;
    const paddingX = 40;
    const paddingY = 40;

    const aligned = canvasTables.map((t, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        ...t,
        x: paddingX + col * itemWidth,
        y: paddingY + row * itemHeight
      };
    });

    setCanvasTables(aligned);
    setHasUnsavedPositions(true);
    showToast('Masalar otomatik ızgaraya hizalandı. Kaydetmeyi unutmayınız.', 'success');
  };

  return (
    <div className="relative flex-1 flex flex-col md:flex-row h-full min-h-0 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 right-4 z-50 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-2xl transition-all animate-slideDown ${
          toast.type === 'success' 
            ? 'bg-emerald-600/95 text-white border border-emerald-500' 
            : 'bg-brand-600/95 text-white border border-brand-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Left Sidebar: Areas List with Reordering */}
      <div className="w-full md:w-80 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10 shrink-0">
        {/* Top Button: + Bölge Ekle */}
        <div className="p-2.5 sm:p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={handleOpenAddArea}
            className="flex-1 py-2 sm:py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-brand-600 dark:text-emerald-400 font-black text-xs border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Bölge Ekle</span>
          </button>
        </div>

        {/* Areas Reordering Hint */}
        <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-slate-400 flex items-center justify-between">
          <span>BÖLGELER ({areas.length})</span>
          <span className="text-[10px] text-slate-400 font-normal">▲▼ ile sırasını değiştirin</span>
        </div>

        {/* Scrollable Areas List */}
        <div className="flex md:flex-col md:flex-1 overflow-x-auto md:overflow-y-auto p-2 gap-1.5 md:gap-0 md:space-y-1.5 no-scrollbar">
          {areas.map((area, idx) => {
            const isActive = area.id === activeAreaId;
            const isDropHighlight = isAreaDropTargetId === area.id;

            return (
              <div
                key={area.id}
                draggable
                onDragStart={(e) => handleAreaDragStart(e, idx)}
                onDragOver={(e) => { e.preventDefault(); setIsAreaDropTargetId(area.id); }}
                onDragLeave={() => setIsAreaDropTargetId(null)}
                onDrop={(e) => handleAreaDrop(e, idx)}
                onClick={() => { sound.beep(); setActiveAreaId(area.id); }}
                className={`p-2 sm:p-2.5 rounded-xl cursor-pointer transition flex items-center justify-between gap-2 text-xs font-bold shrink-0 border ${
                  isDropHighlight
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-400'
                    : isActive
                    ? 'bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-white border-brand-600 dark:border-blue-500 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900'
                }`}
              >
                {/* Drag handle & Area Name */}
                <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                  <span className="cursor-grab text-slate-300 dark:text-slate-600 hover:text-slate-500" title="Sürükleyip Sırala">
                    <GripVertical className="w-4 h-4 shrink-0" />
                  </span>
                  <div className="truncate">
                    <div className="uppercase font-black text-xs truncate flex items-center gap-1.5">
                      <span>{area.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({area.tables?.length || 0})</span>
                    </div>
                  </div>
                </div>

                {/* Reorder Buttons (Up / Down) & Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveArea(idx, 'up'); }}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 rounded hover:bg-slate-300/40 dark:hover:bg-slate-700/50"
                    title="Yukarı Taşı"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveArea(idx, 'down'); }}
                    disabled={idx === areas.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 rounded hover:bg-slate-300/40 dark:hover:bg-slate-700/50"
                    title="Aşağı Taşı"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                  <button
                    onClick={(e) => handleOpenEditArea(area, e)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    title="Bölge Adını Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteArea(area, e)}
                    className="p-1 text-slate-400 hover:text-brand-600 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
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
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[200px] max-w-md">
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* View Mode Toggle: Grid vs Kroki */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => { sound.beep(); setViewMode('grid'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Izgara Sıralama</span>
            </button>
            <button
              onClick={() => { sound.beep(); setViewMode('kroki'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'kroki'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
              <span>Kroki / Salon Düzeni</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {viewMode === 'kroki' && (
              <>
                <button
                  onClick={handleAutoAlignKroki}
                  className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
                  title="Masaları otomatik ızgaraya diz"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hizala</span>
                </button>

                <button
                  onClick={handleSaveKrokiPositions}
                  className={`px-3 sm:px-4 py-2 rounded-xl font-black text-xs shadow-md transition flex items-center gap-1.5 ${
                    hasUnsavedPositions
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                      : 'bg-slate-700 hover:bg-slate-800 text-white'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{hasUnsavedPositions ? 'Kaydet*' : 'Kaydedildi'}</span>
                </button>
              </>
            )}

            <button
              onClick={() => { sound.beep(); setIsBulkModalOpen(true); }}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap border border-slate-200 dark:border-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden xs:inline">Toplu Masa</span>
            </button>

            <button
              onClick={handleOpenAddTable}
              className="px-3 sm:px-4 py-2 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Masa</span>
            </button>
          </div>
        </div>

        {/* VIEW 1: GRID MODE WITH REORDERING & QUICK MOVE */}
        {viewMode === 'grid' && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 content-start">
            {displayedTables.map((t, idx) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => handleTableDragStart(e, t, idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleTableDrop(e, idx)}
                className="h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm hover:shadow-md transition relative group"
              >
                {/* Card Top: Drag Handle, Shape, and Table Shift Arrows */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 cursor-grab text-slate-300 dark:text-slate-600 hover:text-slate-500" title="Sürükleyip Sırala">
                    <GripVertical className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold text-slate-400 font-mono">#{idx + 1}</span>
                  </div>

                  {/* Left / Right Table Reorder Arrows */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleMoveTable(idx, 'prev')}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-20 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Sola / Öne Al"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveTable(idx, 'next')}
                      disabled={idx === (currentArea?.tables?.length || 0) - 1}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-20 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Sağa / Arkaya Al"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Center: Table Name and Area */}
                <div className="text-center my-auto">
                  <h4 className="font-black text-base text-slate-900 dark:text-white tracking-tight">
                    {t.name}
                  </h4>
                  <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                    {t.shape === 'round' ? <Circle className="w-2.5 h-2.5 text-blue-500" /> : <Square className="w-2.5 h-2.5 text-slate-400" />}
                    <span>{t.shape || 'Kare'}</span>
                  </div>
                </div>

                {/* Card Bottom: Quick Move Area, Edit, and Delete */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {/* Quick Move Table to Another Area Button */}
                  <button
                    onClick={() => {
                      setQuickMoveTable(t);
                      setQuickMoveTargetAreaId(t.area_id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition flex items-center gap-1"
                    title="Başka Bölgeye Taşı"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold hidden group-hover:inline">Taşı</span>
                  </button>

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
                      className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
        )}

        {/* VIEW 2: KROKI / VISUAL FLOOR PLAN EDITOR */}
        {viewMode === 'kroki' && (
          <div
            ref={canvasRef}
            onMouseMove={handleKrokiMouseMove}
            onMouseUp={handleKrokiMouseUp}
            className="flex-1 relative overflow-auto bg-slate-100/70 dark:bg-slate-950 p-4 select-none cursor-default min-h-[600px]"
            style={{
              backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          >
            {/* Floor Canvas Information Overlay */}
            <div className="absolute top-3 left-3 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs shadow-sm pointer-events-none">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {currentArea?.name} Kroki Düzeni
              </span>
              <p className="text-[11px] text-slate-400">
                Masaları istediğiniz konuma sürükleyip bırakabilirsiniz.
              </p>
            </div>

            {/* Draggable Tables on Canvas */}
            {canvasTables.map((t) => {
              const isSelected = activeDragKrokiId === t.id;
              const posX = t.x || 50;
              const posY = t.y || 50;
              const isRound = t.shape === 'round';

              return (
                <div
                  key={t.id}
                  onMouseDown={(e) => handleKrokiMouseDown(e, t)}
                  style={{
                    left: `${posX}px`,
                    top: `${posY}px`,
                    width: '120px',
                    height: '110px'
                  }}
                  className={`absolute flex flex-col justify-between p-2.5 transition-shadow cursor-move border select-none ${
                    isRound ? 'rounded-full text-center' : 'rounded-2xl'
                  } ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-2xl ring-4 ring-emerald-300 dark:ring-emerald-700 z-30 scale-105'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 shadow-md hover:border-emerald-500 hover:shadow-lg z-20'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold opacity-70">
                    <Move className="w-3 h-3" />
                    <span>{t.shape || 'Kare'}</span>
                  </div>

                  <div className="text-center my-auto">
                    <h5 className="font-black text-sm tracking-tight leading-tight">
                      {t.name}
                    </h5>
                    <span className="text-[9px] opacity-60 font-mono">
                      X:{Math.round(posX)} Y:{Math.round(posY)}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-1 pt-1 opacity-70 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold">{currentArea?.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                  className="flex-1 py-2.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black shadow"
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
                          ? 'bg-brand-600 text-white border-brand-500 shadow'
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
                  className="flex-1 py-2.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black shadow"
                >
                  {editingTable ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Hızlı Bölge Değiştir (Move Table to Another Area) */}
      {quickMoveTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-2 text-emerald-600">
              <ArrowRightLeft className="w-5 h-5" />
              <h3 className="text-base font-black">Masayı Başka Bölgeye Taşı</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white font-bold">{quickMoveTable.name}</strong> masasını taşımak istediğiniz hedef bölgeyi seçiniz:
            </p>

            <form onSubmit={handleExecuteQuickMove} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Hedef Bölge:</label>
                <select
                  value={quickMoveTargetAreaId}
                  onChange={(e) => setQuickMoveTargetAreaId(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white font-bold text-sm"
                >
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tables?.length || 0} Masa)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setQuickMoveTable(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black shadow"
                >
                  Bölgeye Taşı
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
                Oluşturulacak masalar: <span className="font-mono font-bold text-brand-600">{bulkPrefix}{bulkStartNum} ... {bulkPrefix}{Number(bulkStartNum) + Number(bulkCount) - 1}</span>
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
                  className="flex-1 py-2.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black shadow"
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
