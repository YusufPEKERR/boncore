import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Copy, Trash2, Edit3, CheckCircle2, 
  AlertTriangle, Layers, ArrowLeft, Save, Scale, 
  DollarSign, Utensils, X, ChefHat, Sparkles 
} from 'lucide-react';
import { Category, Product, Ingredient, RecipeItem, ProductRecipe } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface ProductDefinitionsProps {
  categories: Category[];
  onRefreshData?: () => void;
}

export const ProductDefinitions: React.FC<ProductDefinitionsProps> = ({
  categories,
  onRefreshData
}) => {
  const [activeCatId, setActiveCatId] = useState<number>(categories[0]?.id || 1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Available raw materials / ingredients for recipes
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);

  // Selection / Direct Site Page View state (NO MODAL!)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Product Form Fields
  const [prodName, setProdName] = useState<string>('');
  const [prodCategoryId, setProdCategoryId] = useState<number>(1);
  const [prodPrice, setProdPrice] = useState<number>(150);
  const [prodStock, setProdStock] = useState<number>(0);
  const [prodUnit, setProdUnit] = useState<string>('Adet');
  const [prodStation, setProdStation] = useState<'kitchen' | 'bar' | 'pastry' | 'grill'>('kitchen');
  const [prodPlu, setProdPlu] = useState<string>('');
  const [prodBarcode, setProdBarcode] = useState<string>('');
  const [prodVatRate, setProdVatRate] = useState<number>(10);
  const [prodIsAvailable, setProdIsAvailable] = useState<boolean>(true);
  const [prodDescription, setProdDescription] = useState<string>('');

  // Recipe (BOM) Editor Fields
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Add Ingredient to Recipe Row state
  const [selectedIngId, setSelectedIngId] = useState<number | ''>('');
  const [newIngAmount, setNewIngAmount] = useState<number | ''>('');
  const [newIngWaste, setNewIngWaste] = useState<number>(0);

  // Category Add Modal (lightweight)
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');

  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.id === activeCatId)) {
      setActiveCatId(categories[0].id);
    }
  }, [categories, activeCatId]);

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    try {
      const ings = await api.getIngredients();
      setAllIngredients(ings);
    } catch (e) {
      console.warn('Failed to load ingredients for recipes', e);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Open direct site view for a product
  const handleSelectProduct = async (p: Product) => {
    sound.beep();
    setSelectedProduct(p);
    setIsCreatingNew(false);

    // Populate Product Fields
    setProdName(p.name);
    setProdCategoryId(p.category_id);
    setProdPrice(p.base_price);
    setProdStock(p.stock_quantity ?? 0);
    setProdUnit(p.unit || 'Adet');
    setProdStation(p.station || 'kitchen');
    setProdPlu(p.plu_code || '');
    setProdBarcode(p.barcode || '');
    setProdVatRate(p.vat_rate ?? 10);
    setProdIsAvailable(p.is_available ?? true);
    setProdDescription(p.description || '');

    // Reset Add Ingredient Form
    setSelectedIngId('');
    setNewIngAmount('');
    setNewIngWaste(0);

    // Load Recipe for this product
    setLoadingRecipe(true);
    try {
      const recData = await api.getProductRecipe(p.id);
      if (recData && Array.isArray(recData.recipes)) {
        setRecipeItems(recData.recipes);
      } else {
        setRecipeItems([]);
      }
    } catch (err) {
      setRecipeItems([]);
    } finally {
      setLoadingRecipe(false);
    }
  };

  // Open direct site view for creating a brand new product
  const handleStartCreateNew = () => {
    sound.beep();
    setSelectedProduct(null);
    setIsCreatingNew(true);

    const defaultCat = currentCategory?.id || categories[0]?.id || 1;
    setProdName('');
    setProdCategoryId(defaultCat);
    setProdPrice(100);
    setProdStock(0);
    setProdUnit('Adet');
    setProdStation('kitchen');
    setProdPlu('');
    setProdBarcode('');
    setProdVatRate(10);
    setProdIsAvailable(true);
    setProdDescription('');
    setRecipeItems([]);
    setSelectedIngId('');
    setNewIngAmount('');
    setNewIngWaste(0);
  };

  // Close direct site view and return to product list
  const handleBackToList = () => {
    sound.beep();
    setSelectedProduct(null);
    setIsCreatingNew(false);
  };

  // Add an ingredient item to the local recipe state
  const handleAddIngredientToRecipe = () => {
    if (!selectedIngId || !newIngAmount || Number(newIngAmount) <= 0) {
      sound.warning();
      showToast('Lütfen hammadde ve geçerli bir miktar giriniz.', 'error');
      return;
    }
    sound.beep();
    const ingObj = allIngredients.find(i => i.id === Number(selectedIngId));
    if (!ingObj) return;

    const amt = Number(newIngAmount);
    const waste = Number(newIngWaste) || 0;
    const fireMultiplier = 1.0 + (waste / 100.0);
    const lineCost = Number((amt * fireMultiplier * (ingObj.cost_per_unit || 0)).toFixed(2));

    // Check if ingredient already in list
    const existingIdx = recipeItems.findIndex(r => r.ingredient_id === ingObj.id);
    if (existingIdx > -1) {
      setRecipeItems(prev => prev.map((item, idx) => {
        if (idx === existingIdx) {
          const updatedAmt = Number((item.amount + amt).toFixed(3));
          const updatedCost = Number((updatedAmt * (1 + (item.waste_percentage / 100)) * (ingObj.cost_per_unit || 0)).toFixed(2));
          return { ...item, amount: updatedAmt, cost: updatedCost };
        }
        return item;
      }));
    } else {
      const newItem: RecipeItem = {
        id: Date.now(),
        ingredient_id: ingObj.id,
        ingredient_name: ingObj.name,
        amount: amt,
        unit: ingObj.unit || 'gr',
        waste_percentage: waste,
        cost: lineCost
      };
      setRecipeItems(prev => [...prev, newItem]);
    }

    setSelectedIngId('');
    setNewIngAmount('');
    setNewIngWaste(0);
    showToast(`"${ingObj.name}" reçeteye eklendi.`, 'success');
  };

  // Remove ingredient row from recipe
  const handleRemoveRecipeItem = (index: number) => {
    sound.beep();
    setRecipeItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Update ingredient amount or waste in existing recipe row
  const handleUpdateRecipeRow = (index: number, field: 'amount' | 'waste_percentage', value: number) => {
    setRecipeItems(prev => prev.map((item, idx) => {
      if (idx === index) {
        const amt = field === 'amount' ? Math.max(0, value) : item.amount;
        const waste = field === 'waste_percentage' ? Math.max(0, value) : item.waste_percentage;
        const ingObj = allIngredients.find(i => i.id === item.ingredient_id);
        const costPerUnit = ingObj?.cost_per_unit || 0;
        const lineCost = Number((amt * (1 + (waste / 100)) * costPerUnit).toFixed(2));
        return {
          ...item,
          amount: amt,
          waste_percentage: waste,
          cost: lineCost
        };
      }
      return item;
    }));
  };

  // Total recipe cost calculation
  const totalRecipeCost = useMemo(() => {
    return recipeItems.reduce((sum, item) => sum + (item.cost || 0), 0);
  }, [recipeItems]);

  const profitMargin = useMemo(() => {
    if (!prodPrice || prodPrice <= 0) return 0;
    return Math.max(0, ((prodPrice - totalRecipeCost) / prodPrice) * 100);
  }, [prodPrice, totalRecipeCost]);

  // Save Product Details & Recipe to Backend
  const handleSaveProductAndRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'error');
      return;
    }
    sound.beep();
    setSaving(true);
    try {
      let targetProductId = selectedProduct?.id;

      if (isCreatingNew || !targetProductId) {
        // Create Product
        const createRes = await api.createProduct({
          category_id: Number(prodCategoryId),
          name: prodName.trim(),
          base_price: Number(prodPrice),
          stock_quantity: Number(prodStock),
          unit: prodUnit,
          station: prodStation,
          plu_code: prodPlu.trim() || undefined,
          barcode: prodBarcode.trim() || undefined,
          is_available: prodIsAvailable,
          description: prodDescription.trim() || undefined
        });
        targetProductId = createRes.product_id;
      } else {
        // Update Product
        await api.updateProduct(targetProductId, {
          name: prodName.trim(),
          category_id: Number(prodCategoryId),
          base_price: Number(prodPrice),
          stock_quantity: Number(prodStock),
          unit: prodUnit,
          station: prodStation,
          plu_code: prodPlu.trim() || undefined,
          barcode: prodBarcode.trim() || undefined,
          is_available: prodIsAvailable,
          description: prodDescription.trim() || undefined
        });
      }

      // Save Recipe Items for this product
      if (targetProductId) {
        const itemsToSave = recipeItems.map(r => ({
          ingredient_id: r.ingredient_id,
          amount: Number(r.amount),
          waste_percentage: Number(r.waste_percentage || 0)
        }));
        await api.updateProductRecipe(targetProductId, itemsToSave);
      }

      showToast(`"${prodName}" ürün bilgileri ve reçetesi başarıyla kaydedildi.`, 'success');
      if (onRefreshData) onRefreshData();
      handleBackToList();
    } catch (err: any) {
      showToast(err.message || 'Kaydetme işlemi başarısız oldu.', 'error');
      sound.warning();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (prodId: number) => {
    if (confirm('Bu ürünü ve bağlı reçetesini silmek istediğinize emin misiniz?')) {
      sound.beep();
      try {
        await api.deleteProduct(prodId);
        showToast('Ürün ve reçete başarıyla silindi.', 'success');
        if (onRefreshData) onRefreshData();
        handleBackToList();
      } catch (err: any) {
        showToast(err.message || 'Ürün silinemedi.', 'error');
        sound.warning();
      }
    }
  };

  const handleDuplicateProduct = async (p: Product) => {
    sound.beep();
    try {
      await api.createProduct({
        category_id: p.category_id,
        name: `${p.name} (Kopya)`,
        base_price: p.base_price,
        stock_quantity: p.stock_quantity ?? 0,
        unit: p.unit || 'Adet',
        station: p.station || 'kitchen',
        is_available: true
      });
      showToast(`"${p.name}" kopyalandı.`, 'success');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Ürün kopyalanamadı.', 'error');
      sound.warning();
    }
  };

  const handleToggleAvailability = async (p: Product) => {
    sound.beep();
    try {
      const newStatus = !(p.is_available ?? true);
      await api.updateProduct(p.id, { is_available: newStatus });
      showToast('Ürün durumu güncellendi.', 'success');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Ürün durumu güncellenemedi.', 'error');
      sound.warning();
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    sound.beep();
    try {
      await api.createCategory({ name: newCatName.trim().toUpperCase() });
      if (onRefreshData) onRefreshData();
      showToast('Kategori başarıyla eklendi.', 'success');
      setNewCatName('');
      setIsAddCategoryModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Kategori eklenemedi.', 'error');
      sound.warning();
    }
  };

  const handleDeleteCategory = async (catId: number, catName: string) => {
    if (confirm(`"${catName}" kategorisini ve bağlı tüm ürünleri silmek istediğinize emin misiniz?`)) {
      sound.beep();
      try {
        await api.deleteCategory(catId);
        showToast(`"${catName}" kategorisi silindi.`, 'success');
        if (onRefreshData) onRefreshData();
      } catch (err: any) {
        showToast(err.message || 'Kategori silinemedi.', 'error');
        sound.warning();
      }
    }
  };

  const currentCategory = categories.find(c => c.id === activeCatId) || categories[0];
  const displayedProducts = searchQuery.trim()
    ? categories
        .flatMap(c => c.products || [])
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : (currentCategory?.products || []);

  const isEditingOrCreating = selectedProduct !== null || isCreatingNew;

  return (
    <div className="relative flex-1 flex flex-col h-full min-h-0 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
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

      {/* ========================================================================= */}
      {/* 1. DIRECT INLINE SITE VIEW: PRODUCT & RECIPE DETAIL & EDIT (NO MODAL WINDOW) */}
      {/* ========================================================================= */}
      {isEditingOrCreating ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0 animate-fadeIn">
          {/* Top Sticky Header with Back Button & Actions */}
          <div className="min-h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-sm shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleBackToList}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Ürün Listesine Dön</span>
              </button>

              <div className="truncate">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-red-600 shrink-0" />
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                    {isCreatingNew ? 'Yeni Ürün & Reçete Oluştur' : prodName || 'Ürün & Reçete Düzenle'}
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400 font-semibold truncate block">
                  Tanımlamalar • Ürün Kartı ve Otomatik Gramaj Düşümlü Reçete (BOM)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedProduct && (
                <button
                  type="button"
                  onClick={() => handleDeleteProduct(selectedProduct.id)}
                  className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 font-bold text-xs transition cursor-pointer"
                  title="Ürünü Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleBackToList}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={handleSaveProductAndRecipe}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
              </button>
            </div>
          </div>

          {/* Main Scrollable Body: 2 Balanced Sections */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              
              {/* ================= SECTION 1: ÜRÜN BİLGİLERİ (5 cols) ================= */}
              <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-amber-500" />
                    <span>1. Ürün & Satış Bilgileri</span>
                  </h3>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodIsAvailable}
                      onChange={(e) => setProdIsAvailable(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 accent-red-600 cursor-pointer"
                    />
                    <span className={`text-xs font-bold ${prodIsAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {prodIsAvailable ? 'Satışa Açık' : 'Pasif'}
                    </span>
                  </label>
                </div>

                <div className="space-y-3.5 text-xs font-semibold">
                  <div>
                    <label className="text-slate-500 block mb-1">Ürün Adı:</label>
                    <input
                      type="text"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="Örn: ADANA KEBAP, AYRAN, KUZU PİRZOLA"
                      required
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1">Kategori:</label>
                      <select
                        value={prodCategoryId}
                        onChange={(e) => setProdCategoryId(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-500 block mb-1">Satış Fiyatı (₺):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(Number(e.target.value))}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1">Stok Birimi:</label>
                      <select
                        value={prodUnit}
                        onChange={(e) => setProdUnit(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                      >
                        <option value="Adet">Adet</option>
                        <option value="Kg">Kg</option>
                        <option value="LİTRE">LİTRE</option>
                        <option value="GR">GR</option>
                        <option value="PORSİYON">PORSİYON</option>
                        <option value="Paket">Paket</option>
                        <option value="Tam">Tam</option>
                        <option value="Yarım">Yarım</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-500 block mb-1">Hazırlama İstasyonu (KDS):</label>
                      <select
                        value={prodStation}
                        onChange={(e) => setProdStation(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                      >
                        <option value="kitchen">Mutfak</option>
                        <option value="grill">Izgara / Kebap</option>
                        <option value="bar">Bar / İçecek</option>
                        <option value="pastry">Tatlı / Fırın</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-slate-500 block mb-1">Mevcut Stok:</label>
                      <input
                        type="number"
                        step="0.001"
                        value={prodStock}
                        onChange={(e) => setProdStock(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">PLU Kodu:</label>
                      <input
                        type="text"
                        value={prodPlu}
                        onChange={(e) => setProdPlu(e.target.value)}
                        placeholder="Örn: 101"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">KDV Oranı (%):</label>
                      <select
                        value={prodVatRate}
                        onChange={(e) => setProdVatRate(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold"
                      >
                        <option value={10}>%10</option>
                        <option value={1}>%1</option>
                        <option value={20}>%20</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Barkod Numarası:</label>
                    <input
                      type="text"
                      value={prodBarcode}
                      onChange={(e) => setProdBarcode(e.target.value)}
                      placeholder="Örn: 8690123456789"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Açıklama / Menü Notu:</label>
                    <textarea
                      rows={2}
                      value={prodDescription}
                      onChange={(e) => setProdDescription(e.target.value)}
                      placeholder="Müşteriye veya garsona gösterilecek açıklama..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* ================= SECTION 2: ÜRÜN REÇETESİ (BOM) (7 cols) ================= */}
              <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                      <Scale className="w-4 h-4 text-blue-500" />
                      <span>2. Ürün Reçetesi & Fire Oranı (BOM)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                      Bu ürün satıldığında depodan otomatik düşülecek hammadde ve gramajlar
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                    {recipeItems.length} Kalem
                  </span>
                </div>

                {/* KPI Metrics: Maliyet, Satış Fiyatı, Kar Marjı */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Maliyet</span>
                    <span className="text-sm sm:text-base font-black font-mono text-blue-600 dark:text-blue-400">
                      ₺{totalRecipeCost.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Satış Fiyatı</span>
                    <span className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white">
                      ₺{Number(prodPrice || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Tahmini Brüt Kar</span>
                    <span className={`text-sm sm:text-base font-black font-mono ${
                      profitMargin > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                    }`}>
                      %{profitMargin.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Recipe Items Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Hammadde Adı</th>
                        <th className="py-2.5 px-2 text-center">Birim Tüketim</th>
                        <th className="py-2.5 px-2 text-center">Fire (%)</th>
                        <th className="py-2.5 px-2 text-right">Birim Fiyat</th>
                        <th className="py-2.5 px-2 text-right">Tutar</th>
                        <th className="py-2.5 px-2 text-center">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {recipeItems.map((item, idx) => {
                        const ingObj = allIngredients.find(i => i.id === item.ingredient_id);
                        const unitCost = ingObj?.cost_per_unit || 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {item.ingredient_name}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.amount}
                                  onChange={(e) => handleUpdateRecipeRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-center font-mono font-bold text-xs"
                                />
                                <span className="text-[10px] text-slate-400 font-mono">{item.unit}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="inline-flex items-center gap-0.5">
                                <span className="text-slate-400 text-[10px]">%</span>
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max="100"
                                  value={item.waste_percentage}
                                  onChange={(e) => handleUpdateRecipeRow(idx, 'waste_percentage', parseFloat(e.target.value) || 0)}
                                  className="w-12 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-center font-mono font-bold text-xs"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                              ₺{unitCost.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                              ₺{item.cost.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipeItem(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                title="Hammaddeyi Reçeteden Çıkar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {recipeItems.length === 0 && !loadingRecipe && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-semibold">
                            Bu ürün için henüz reçete kalemi eklenmedi. Aşağıdaki formdan hammadde seçip ekleyebilirsiniz.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Form to Add New Ingredient to this Recipe */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    + Reçeteye Yeni Hammadde Ekle
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    <div className="sm:col-span-5">
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Hammadde Seçin:</label>
                      <select
                        value={selectedIngId}
                        onChange={(e) => setSelectedIngId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-bold"
                      >
                        <option value="">Hammadde seçiniz...</option>
                        {allIngredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit}) - ₺{(ing.cost_per_unit || 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Miktar:</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={newIngAmount}
                        onChange={(e) => setNewIngAmount(e.target.value ? parseFloat(e.target.value) : '')}
                        placeholder="Örn: 180"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Fire %:</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={newIngWaste}
                        onChange={(e) => setNewIngWaste(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddIngredientToRecipe}
                        className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ekle</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Save Bar */}
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProductAndRecipe}
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Kaydediliyor...' : 'Tüm Değişiklikleri Kaydet'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. DEFAULT VIEW: CATEGORY SIDEBAR + PRODUCT CARDS GRID                    */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 overflow-hidden">
          {/* Left Sidebar: Categories List */}
          <div className="w-full md:w-72 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10 shrink-0">
            <div className="p-2.5 sm:p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={() => { sound.beep(); setIsAddCategoryModalOpen(true); }}
                className="w-full py-2 sm:py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-extrabold text-xs border border-red-200 dark:border-red-900/60 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Kategori Ekle ({categories.length})</span>
              </button>
            </div>

            <div className="flex md:flex-col md:flex-1 overflow-x-auto md:overflow-y-auto p-2 gap-1.5 md:gap-0 md:space-y-1 no-scrollbar">
              {categories.map((cat) => {
                const isActive = cat.id === activeCatId;
                return (
                  <div
                    key={cat.id}
                    onClick={() => { sound.beep(); setActiveCatId(cat.id); }}
                    className={`p-2 sm:p-2.5 rounded-xl cursor-pointer transition flex items-center justify-between gap-2 text-xs font-bold shrink-0 ${
                      isActive
                        ? 'bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-white border-b-2 md:border-b-0 md:border-l-4 border-red-600 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="uppercase truncate">{cat.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">({cat.products?.length || 0})</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(cat.id, cat.name);
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 rounded transition shrink-0 cursor-pointer"
                      title="Kategoriyi Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Content: Products Grid & Search Toolbar */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0">
            <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-4 shadow-sm shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-lg">
                <span className="hidden sm:inline text-xs font-black uppercase text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {searchQuery.trim() ? 'Arama Sonuçları' : currentCategory?.name}
                </span>
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tüm ürünlerde ara..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <button
                onClick={handleStartCreateNew}
                className="px-3 sm:px-4 py-2 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Ürün & Reçete Ekle</span>
              </button>
            </div>

            {/* Products Cards Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 content-start">
              {displayedProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectProduct(p)}
                  className="h-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-red-400 dark:hover:border-red-600 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition relative group cursor-pointer"
                >
                  {/* Card Top: Availability Status & Action Icons */}
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAvailability(p);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black transition cursor-pointer flex items-center gap-1 ${
                        (p.is_available ?? true)
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                      title="Satışa Aç / Kapat"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${(p.is_available ?? true) ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span>{(p.is_available ?? true) ? 'Satışta' : 'Pasif'}</span>
                    </button>

                    <div className="flex items-center gap-1.5 text-slate-400">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectProduct(p);
                        }}
                        className="p-1 hover:text-blue-500 transition cursor-pointer" 
                        title="Reçete & Ürün Bilgilerini Düzenle"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateProduct(p);
                        }}
                        className="p-1 hover:text-emerald-500 transition cursor-pointer" 
                        title="Kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProduct(p.id);
                        }}
                        className="p-1 hover:text-red-600 transition cursor-pointer" 
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Center: Product Name & Station */}
                  <div className="text-center my-auto">
                    <h4 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight line-clamp-1 group-hover:text-red-600 transition">
                      {p.name}
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {p.station === 'bar' ? 'Bar / İçecek' : p.station === 'grill' ? 'Izgara / Kebap' : 'Mutfak'} • {p.unit || 'Adet'}
                    </span>
                  </div>

                  {/* Card Bottom: Price (Left) + Real Stock (Right) */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="font-mono font-black text-slate-900 dark:text-white">
                      ₺{p.base_price.toFixed(2)}
                    </span>
                    <span
                      className={`text-[11px] font-bold font-mono ${
                        (p.stock_quantity ?? 0) <= 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {p.stock_quantity !== null && p.stock_quantity !== undefined
                        ? `Stok: ${Number(Number(p.stock_quantity).toFixed(2))} ${p.unit || 'Adet'}`
                        : 'Stok: 0'}
                    </span>
                  </div>
                </div>
              ))}

              {displayedProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-slate-400 text-xs font-semibold">
                  Bu kategoride ürün bulunamadı veya arama kriterine uygun sonuç yok.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightweight Category Add Modal */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Yeni Kategori Ekle</h3>
            <form onSubmit={handleAddCategory} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Kategori Adı:</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Örn: FIRIN ÜRÜNLERİ"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white uppercase font-bold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black shadow cursor-pointer"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
