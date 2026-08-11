'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { PackagePlus, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPKR } from '@/lib/data';
import {
  entryUnitsForItem,
  formatQty,
  normalizeUnitLabel,
  resolveItemUnit,
  suggestCategoryFromName,
  suggestUnitFromName,
  toStoredQuantity,
  UNIT_OPTIONS,
  unitKind,
  unitKindLabel,
} from '@/lib/inventory-units';
import { catalogById, categoriesForCatalog, findStockByName, STOCK_CATALOGS, type StockCatalog, getCustomCatalogNames, addCustomCatalogName } from '@/lib/stock-catalog';

type StockItem = {
  id: string;
  sku: string;
  name: string;
  category?: string;
  unit: string;
  unit_kind?: string;
  opening_stock?: number;
  purchased?: number;
  issued?: number;
  returned?: number;
  damaged?: number;
  sold?: number;
  current_stock?: number;
  current_balance?: number;
  cost_price?: number;
  reorder_level?: number;
  supplier_name?: string;
  is_low_stock?: boolean;
};

type PurchaseRow = {
  id: string;
  sku?: string;
  name?: string;
  unit?: string;
  quantity: number;
  unit_cost?: number | null;
  notes?: string | null;
  created_at: string;
  tx_type: string;
  supplier_name?: string | null;
  activity_date?: string;
};

export function InventoryPanel() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [showBuy, setShowBuy] = useState(false);
  const [showCatalogBuy, setShowCatalogBuy] = useState<StockCatalog | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAmend, setShowAmend] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyItemId, setBuyItemId] = useState('');
  const [amendItemId, setAmendItemId] = useState('');
  const [catalogItemName, setCatalogItemName] = useState('');
  const [catalogMode, setCatalogMode] = useState<'add' | 'amend' | 'delete' | 'rename'>('add');
  const [catalogQty, setCatalogQty] = useState('');
  const [catalogDeleteId, setCatalogDeleteId] = useState('');
  const [catalogRenameName, setCatalogRenameName] = useState('');
  const [catalogExtraNames, setCatalogExtraNames] = useState<string[]>([]);
  const [useNewCatalogItem, setUseNewCatalogItem] = useState(false);
  const [newCatalogItemName, setNewCatalogItemName] = useState('');
  const [amendKind, setAmendKind] = useState<'qty' | 'spelling'>('qty');
  const [amendNewName, setAmendNewName] = useState('');
  const [entryUnit, setEntryUnit] = useState('kg');
  const [storeUnit, setStoreUnit] = useState('kg');
  const [addName, setAddName] = useState('');
  const [addUnit, setAddUnit] = useState('pcs');
  const [addOpening, setAddOpening] = useState('');
  const [addCategory, setAddCategory] = useState('General');
  const [activityDate, setActivityDate] = useState('');
  const [activitySupplier, setActivitySupplier] = useState('');
  const [activityItem, setActivityItem] = useState('');
  const [viewDayDate, setViewDayDate] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [issueItemId, setIssueItemId] = useState('');
  const [issueQty, setIssueQty] = useState('');
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const [stock, recent] = await Promise.all([
        api<StockItem[]>('/inventory/report'),
        api<PurchaseRow[]>('/inventory/purchases'),
      ]);
      setItems(
        stock.map((i) => ({
          ...i,
          unit: resolveItemUnit(i.unit, i.name),
        }))
      );
      setPurchases(recent);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load inventory');
      setItems([]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedBuyItem = useMemo(
    () => items.find((i) => i.id === buyItemId) || null,
    [items, buyItemId]
  );

  const selectedAmendItem = useMemo(
    () => items.find((i) => i.id === amendItemId) || null,
    [items, amendItemId]
  );

  function activityDay(p: PurchaseRow): string {
    if (p.activity_date) return p.activity_date;
    try {
      return new Date(p.created_at).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  function activityTypeLabel(tx: string) {
    switch (tx) {
      case 'adjustment':
        return 'Amend';
      case 'opening':
        return 'Opening';
      case 'issue':
        return 'Kitchen issue';
      case 'return':
        return 'Return';
      case 'damage':
        return 'Damage';
      case 'sale_deduction':
        return 'Sale';
      case 'purchase':
        return 'Buy';
      default:
        return tx || 'Move';
    }
  }

  function activityTypeClass(tx: string) {
    if (tx === 'adjustment') return 'bg-amber-500/20 text-amber-800 dark:text-amber-300';
    if (tx === 'issue') return 'bg-sky-500/15 text-sky-900 dark:text-sky-300';
    if (tx === 'purchase' || tx === 'opening') return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
    if (tx === 'damage' || tx === 'sale_deduction') return 'bg-crimson/15 text-crimson';
    return 'bg-muted/30 text-ink';
  }

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) {
      const s = (p.supplier_name || '').trim();
      if (s) set.add(s);
    }
    for (const i of items) {
      const s = (i.supplier_name || '').trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchases, items]);

  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) {
      if (p.name?.trim()) set.add(p.name.trim());
    }
    for (const i of items) {
      if (i.name?.trim()) set.add(i.name.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchases, items]);

  const filteredActivity = useMemo(() => {
    return purchases.filter((p) => {
      if (activityDate) {
        if (activityDay(p) !== activityDate) return false;
      }
      if (activitySupplier) {
        const s = (p.supplier_name || '').trim().toLowerCase();
        if (s !== activitySupplier.trim().toLowerCase()) return false;
      }
      if (activityItem) {
        if ((p.name || '').trim().toLowerCase() !== activityItem.trim().toLowerCase()) return false;
      }
      return true;
    });
  }, [purchases, activityDate, activitySupplier, activityItem]);

  const dayViewRows = useMemo(() => {
    if (!viewDayDate) return [];
    return purchases
      .filter((p) => activityDay(p) === viewDayDate)
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [purchases, viewDayDate]);

  async function issueToKitchen(e: FormEvent) {
    e.preventDefault();
    if (!issueItemId) return;
    const qty = Number(issueQty);
    if (!(qty > 0)) {
      setStatus('Enter a valid quantity to issue.');
      return;
    }
    setIssuing(true);
    setStatus('');
    try {
      await api('/inventory/transactions', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: issueItemId,
          txType: 'issue',
          quantity: qty,
          notes: 'Issued to kitchen',
        }),
      });
      setShowIssue(false);
      setIssueQty('');
      setStatus('Stock issued to kitchen and logged in activity.');
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not issue stock');
    } finally {
      setIssuing(false);
    }
  }

  function renderActivityQty(p: PurchaseRow) {
    if (p.tx_type === 'adjustment') {
      const m = String(p.notes || '').match(
        /Correct balance(?: set to)?:\s*([\d.]+)\s*([a-zA-Z]+)?/i
      );
      const u = resolveItemUnit(m?.[2] || p.unit, p.name);
      return m
        ? formatQty(Number(m[1]), u)
        : formatQty(Number(p.quantity), resolveItemUnit(p.unit, p.name));
    }
    return formatQty(Number(p.quantity), resolveItemUnit(p.unit, p.name));
  }

  const buyEntryOptions = useMemo(() => entryUnitsForItem(storeUnit), [storeUnit]);

  useEffect(() => {
    if (selectedBuyItem) {
      setStoreUnit(normalizeUnitLabel(selectedBuyItem.unit || suggestUnitFromName(selectedBuyItem.name)));
    }
  }, [selectedBuyItem]);

  useEffect(() => {
    if (buyEntryOptions.length) setEntryUnit(buyEntryOptions[0].value);
  }, [buyEntryOptions]);

  useEffect(() => {
    if (!showCatalogBuy) return;
    const custom = getCustomCatalogNames(showCatalogBuy.id);
    setCatalogExtraNames(custom);
    const allowed = categoriesForCatalog(showCatalogBuy.id).map((c) => c.toLowerCase());
    const fromStock = items
      .filter((i) => allowed.includes(String(i.category || '').toLowerCase()))
      .map((i) => i.name);
    const names = Array.from(
      new Set([...showCatalogBuy.names, ...custom, ...fromStock])
    ).sort((a, b) => a.localeCompare(b));
    setCatalogItemName((prev) => (prev && names.includes(prev) ? prev : names[0] || ''));
    setStoreUnit(showCatalogBuy.unit);
    setEntryUnit(showCatalogBuy.unit);
    setUseNewCatalogItem(false);
    setNewCatalogItemName('');
  }, [showCatalogBuy, items]);

  function catalogSelectNames(cat: StockCatalog) {
    const allowed = categoriesForCatalog(cat.id).map((c) => c.toLowerCase());
    const fromStock = items
      .filter((i) => allowed.includes(String(i.category || '').toLowerCase()))
      .map((i) => i.name);
    const custom = catalogExtraNames.length
      ? catalogExtraNames
      : getCustomCatalogNames(cat.id);
    return Array.from(new Set([...cat.names, ...custom, ...fromStock])).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function resolveCatalogAddName(): string {
    if (useNewCatalogItem) return newCatalogItemName.trim();
    return catalogItemName.trim();
  }

  const selectedCatalogStock = useMemo(() => {
    if ((catalogMode === 'delete' || catalogMode === 'rename') && catalogDeleteId) {
      return items.find((i) => i.id === catalogDeleteId) || null;
    }
    if (!catalogItemName) return null;
    return findStockByName(items, catalogItemName) || null;
  }, [items, catalogItemName, catalogMode, catalogDeleteId]);

  const catalogItemsInStock = useMemo(() => {
    if (!showCatalogBuy) return [];
    const allowed = categoriesForCatalog(showCatalogBuy.id).map((c) => c.toLowerCase());
    return items
      .filter((i) => allowed.includes(String(i.category || '').toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, showCatalogBuy]);

  function resolveDeleteTargetId(form?: HTMLFormElement | null) {
    if (form) {
      const fd = new FormData(form);
      const fromForm = String(fd.get('deleteItemId') || '').trim();
      if (fromForm && items.some((i) => i.id === fromForm)) return fromForm;
    }
    if (catalogDeleteId && items.some((i) => i.id === catalogDeleteId)) return catalogDeleteId;
    return '';
  }

  const summary = useMemo(() => {
    const low = items.filter(
      (i) =>
        i.is_low_stock ||
        Number(i.current_stock ?? i.current_balance ?? 0) <= Number(i.reorder_level ?? 0)
    ).length;
    const value = items.reduce(
      (s, i) => s + Number(i.current_stock ?? i.current_balance ?? 0) * Number(i.cost_price ?? 0),
      0
    );
    return { skus: items.length, low, value };
  }, [items]);

  function openBuy() {
    setBuyItemId(items[0]?.id || '');
    setShowBuy(true);
  }

  function openCatalog(id: string) {
    const cat = catalogById(id);
    if (cat) {
      setCatalogMode('add');
      setCatalogQty('');
      setCatalogDeleteId('');
      setShowCatalogBuy(cat);
    }
  }

  function openAmend() {
    setAmendItemId('');
    setAmendKind('qty');
    setAmendNewName('');
    setShowAmend(true);
  }

  async function buyStock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedBuyItem) return;
    setBuying(true);
    setStatus('');
    const fd = new FormData(e.currentTarget);
    const rawQty = Number(fd.get('quantity'));
    const storedQty = toStoredQuantity(rawQty, storeUnit, entryUnit);
    try {
      await api('/inventory/buy', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selectedBuyItem.id,
          quantity: rawQty,
          entryUnit,
          storeUnit,
          unitCost: fd.get('unitCost') ? Number(fd.get('unitCost')) : undefined,
          supplierName: String(fd.get('supplierName') || '').trim() || undefined,
          notes: String(fd.get('notes') || '').trim() || undefined,
        }),
      });
      setShowBuy(false);
      setStatus(
        `Purchased ${formatQty(storedQty, storeUnit)} — balance updated in ${storeUnit}.`
      );
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Buy stock failed');
    } finally {
      setBuying(false);
    }
  }

  async function buyCatalogStock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!showCatalogBuy) return;

    const addName = resolveCatalogAddName();
    if (catalogMode !== 'delete' && catalogMode !== 'rename' && !addName) {
      setStatus(
        catalogMode === 'add' && useNewCatalogItem
          ? 'Enter a name for the new stock item.'
          : 'Select a stock item from the list.'
      );
      return;
    }

    if (catalogMode === 'delete') {
      const deleteId = resolveDeleteTargetId(e.currentTarget);
      const target = items.find((i) => i.id === deleteId) || null;
      if (!target?.id) {
        setStatus('Select an item from the stock list to delete.');
        return;
      }
      const unit = resolveItemUnit(target.unit, target.name);
      const currentBal = Number(target.current_stock ?? target.current_balance ?? 0);
      const confirmMsg = `Delete "${target.name}" from inventory?\n\nCurrent stock: ${formatQty(currentBal, unit)}\n\nThis removes only this item (${target.sku || target.id.slice(0, 8)}).`;
      if (!window.confirm(confirmMsg)) return;

      setBuying(true);
      setStatus('');
      try {
        await api(`/inventory/items/${target.id}`, { method: 'DELETE' });
        setStatus(`Deleted ${target.name} from inventory.`);
        setShowCatalogBuy(null);
        setCatalogQty('');
        setCatalogDeleteId('');
        await load();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setBuying(false);
      }
      return;
    }

    if (catalogMode === 'rename') {
      const renameId = resolveDeleteTargetId(e.currentTarget) || catalogDeleteId;
      const target = items.find((i) => i.id === renameId) || null;
      const newName = catalogRenameName.trim();
      if (!target?.id) {
        setStatus('Select an item to fix spelling.');
        return;
      }
      if (!newName) {
        setStatus('Enter the correct spelling.');
        return;
      }
      if (newName === target.name) {
        setStatus('Correct spelling is the same as the current name.');
        return;
      }
      const confirmMsg = `Fix spelling?\n\n"${target.name}" → "${newName}"`;
      if (!window.confirm(confirmMsg)) return;

      setBuying(true);
      setStatus('');
      try {
        await api(`/inventory/items/${target.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newName, notes: 'Spelling correction' }),
        });
        setStatus(`Renamed "${target.name}" to "${newName}".`);
        setShowCatalogBuy(null);
        setCatalogRenameName('');
        setCatalogDeleteId('');
        await load();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Rename failed');
      } finally {
        setBuying(false);
      }
      return;
    }

    const targetName = addName;
    const matched = findStockByName(items, targetName) || null;
    const unit = showCatalogBuy.unit;
    const currentBal = matched
      ? Number(matched.current_stock ?? matched.current_balance ?? 0)
      : 0;
    const rawQty = Number(catalogQty);
    if (!Number.isFinite(rawQty) || rawQty < 0) {
      setStatus('Enter a valid quantity.');
      return;
    }
    if (catalogMode === 'add' && rawQty <= 0) {
      setStatus('Quantity to add must be greater than 0.');
      return;
    }

    const storedAdd = toStoredQuantity(rawQty, unit, entryUnit);
    const confirmMsg =
      catalogMode === 'add'
        ? `Add ${formatQty(storedAdd, unit)} to "${targetName}"?\n\nCurrent stock: ${formatQty(currentBal, unit)}\nNew balance will be about: ${formatQty(currentBal + storedAdd, unit)}`
        : `Set correct balance of "${targetName}" to ${formatQty(rawQty, unit)}?\n\nCurrent stock: ${formatQty(currentBal, unit)}`;

    if (!window.confirm(confirmMsg)) return;

    setBuying(true);
    setStatus('');
    try {
      if (catalogMode === 'add') {
        const buyName = matched?.name || targetName;
        await api('/inventory/buy-named', {
          method: 'POST',
          body: JSON.stringify({
            name: buyName,
            category: showCatalogBuy.category,
            unit,
            quantity: rawQty,
            entryUnit,
            unitCost: showCatalogBuy.defaultCost,
          }),
        });
        const updated = addCustomCatalogName(showCatalogBuy.id, buyName);
        setCatalogExtraNames(updated);
        setCatalogItemName(buyName);
        setUseNewCatalogItem(false);
        setNewCatalogItemName('');
        setStatus(
          `Added ${formatQty(storedAdd, unit)} of ${buyName}. It is now in the ${showCatalogBuy.label} dropdown.`
        );
      } else {
        let itemId = matched?.id;
        if (!itemId) {
          const created = await api<StockItem>('/inventory/items', {
            method: 'POST',
            body: JSON.stringify({
              name: targetName,
              category: showCatalogBuy.category,
              unit,
              openingStock: 0,
              costPrice: showCatalogBuy.defaultCost,
            }),
          });
          itemId = created.id;
        }
        await api('/inventory/amend', {
          method: 'POST',
          body: JSON.stringify({
            inventoryItemId: itemId,
            newBalance: rawQty,
            notes: `Amend via ${showCatalogBuy.label} menu`,
          }),
        });
        setStatus(`Amended ${targetName} balance to ${formatQty(rawQty, unit)}.`);
      }
      setShowCatalogBuy(null);
      setCatalogQty('');
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBuying(false);
    }
  }

  async function amendStock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedAmendItem) return;
    setBuying(true);
    setStatus('');
    const fd = new FormData(e.currentTarget);

    try {
      if (amendKind === 'spelling') {
        const newName = amendNewName.trim() || String(fd.get('newName') || '').trim();
        if (!newName) {
          setStatus('Enter the correct spelling.');
          setBuying(false);
          return;
        }
        if (newName === selectedAmendItem.name) {
          setStatus('Correct spelling is the same as the current name.');
          setBuying(false);
          return;
        }
        if (
          !window.confirm(
            `Fix spelling?\n\n"${selectedAmendItem.name}" → "${newName}"`
          )
        ) {
          setBuying(false);
          return;
        }
        await api(`/inventory/items/${selectedAmendItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: newName,
            notes: String(fd.get('notes') || '').trim() || 'Spelling correction',
          }),
        });
        setShowAmend(false);
        setStatus(`Renamed "${selectedAmendItem.name}" to "${newName}".`);
        await load();
        return;
      }

      const newBalance = Number(fd.get('newBalance'));
      if (
        !window.confirm(
          `Set correct balance of "${selectedAmendItem.name}" to ${newBalance}?`
        )
      ) {
        setBuying(false);
        return;
      }
      const result = await api<{
        previousBalance: number;
        newBalance: number;
        delta: number;
      }>('/inventory/amend', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selectedAmendItem.id,
          newBalance,
          notes: String(fd.get('notes') || '').trim() || undefined,
        }),
      });
      setShowAmend(false);
      setStatus(
        `Amended ${selectedAmendItem.name}: correct balance set to ${formatQty(result.newBalance, resolveItemUnit(selectedAmendItem.unit, selectedAmendItem.name))}.`
      );
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Amend stock failed');
    } finally {
      setBuying(false);
    }
  }

  async function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBuying(true);
    setStatus('');
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || addName || '').trim();
    const unit = normalizeUnitLabel(String(fd.get('unit') || addUnit || suggestUnitFromName(name)));
    const openingStock = Number(addOpening);
    try {
      const created = await api<StockItem>('/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: String(fd.get('sku') || '').trim() || undefined,
          name,
          category: addCategory.trim() || suggestCategoryFromName(name),
          unit,
          openingStock: Number.isFinite(openingStock) && openingStock > 0 ? openingStock : 0,
          costPrice: Number(fd.get('costPrice') || 0),
          reorderLevel: Number(fd.get('reorderLevel') || (unitKind(unit) === 'count' ? 24 : 10)),
          supplierName: String(fd.get('supplierName') || '').trim() || undefined,
        }),
      });
      setShowAddItem(false);
      setAddName('');
      setAddOpening('');
      const bal = Number(created.current_stock ?? created.opening_stock ?? openingStock) || 0;
      setStatus(
        bal > 0
          ? `Added ${name} with opening ${formatQty(bal, unit)}.`
          : `Stock item added · tracked in ${unit}.`
      );
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Add item failed');
    } finally {
      setBuying(false);
    }
  }

  function balance(i: StockItem) {
    return Number(i.current_stock ?? i.current_balance ?? 0);
  }

  const catalogEntryOptions = useMemo(
    () => (showCatalogBuy ? entryUnitsForItem(showCatalogBuy.unit) : []),
    [showCatalogBuy]
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Stock control</h1>
          <p className="mt-1 text-sm text-muted">
            Buy Lentils, Spices, or Drinks from their menus. Use Amend to correct a balance by item
            name only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setAddName('');
              setAddUnit('pcs');
              setAddOpening('');
              setAddCategory('General');
              setShowAddItem(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <Plus size={14} /> Add New Stock Item
          </button>
          <button
            type="button"
            onClick={openAmend}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <Pencil size={14} /> Amend stock
          </button>
          <button
            type="button"
            onClick={() => {
              setIssueItemId(items[0]?.id || '');
              setIssueQty('');
              setShowIssue(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <PackagePlus size={14} /> Issue to kitchen
          </button>
          <button
            type="button"
            onClick={openBuy}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <PackagePlus size={14} /> Buy other
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STOCK_CATALOGS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openCatalog(c.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] bg-white px-4 py-2 text-sm font-bold text-black shadow-sm"
          >
            <PackagePlus size={14} /> {c.label} menu
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Items</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{summary.skus}</p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Low stock alerts</p>
          <p className="mt-1 text-2xl font-semibold text-crimson">{summary.low}</p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Inventory value</p>
          <p className="mt-1 text-2xl font-semibold text-crimson">{formatPKR(summary.value)}</p>
        </div>
      </div>

      {status && <p className="mt-3 text-sm text-muted">{status}</p>}

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading stock…</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--kdc-border)]">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead className="bg-crimson-deep text-white">
                <tr>
                  <th className="px-3 py-3 font-medium">Item</th>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Opening</th>
                  <th className="px-3 py-3 font-medium">Total purchased</th>
                  <th className="px-3 py-3 font-medium">Issued</th>
                  <th className="px-3 py-3 font-medium">Returned</th>
                  <th className="px-3 py-3 font-medium">Available stock</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const bal = balance(i);
                  const u = normalizeUnitLabel(i.unit);
                  const purchasedOnly = Number(i.purchased ?? 0);
                  const low = Boolean(i.is_low_stock) || bal <= Number(i.reorder_level ?? 0);
                  return (
                    <tr key={i.id || i.sku} className="border-t border-[var(--kdc-border)] bg-surface">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-ink">{i.name}</p>
                        <p className="text-xs text-muted">
                          {i.category || 'General'}
                          {low && (
                            <span className="ml-2 rounded bg-crimson/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-crimson">
                              Low
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-ink">{u}</span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
                          {unitKindLabel(u)}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatQty(Number(i.opening_stock ?? 0), u)}</td>
                      <td className="px-3 py-3 font-medium text-ink">
                        {formatQty(purchasedOnly, u)}
                      </td>
                      <td className="px-3 py-3">{formatQty(Number(i.issued ?? i.sold ?? 0), u)}</td>
                      <td className="px-3 py-3">{formatQty(Number(i.returned ?? 0), u)}</td>
                      <td className="px-3 py-3 font-semibold text-crimson">{formatQty(bal, u)}</td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      No stock items yet. Use a category menu or Add New Stock Item.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Per item: <strong className="text-ink">Total purchased</strong> is buys only;{' '}
            <strong className="text-ink">Available stock</strong> is what remains on hand (not a
            combined total).
          </p>
        </>
      )}

      <div className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Recent stock activity</h2>
        <p className="mt-1 text-sm text-muted">
          Filter by date, supplier, or item. Buys, amendments, and kitchen issues are all listed —
          view only (no edits from this log).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-muted">
            Activity date
            <input
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              className="kdc-stock-input mt-1"
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Supplier
            <select
              value={activitySupplier}
              onChange={(e) => setActivitySupplier(e.target.value)}
              className="kdc-stock-select mt-1"
            >
              <option value="">All suppliers</option>
              {supplierOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Item
            <select
              value={activityItem}
              onChange={(e) => setActivityItem(e.target.value)}
              className="kdc-stock-select mt-1"
            >
              <option value="">All items</option>
              {itemOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setActivityDate('');
                setActivitySupplier('');
                setActivityItem('');
              }}
              className="w-full rounded-xl border border-[var(--kdc-border)] px-3 py-2 text-sm text-muted hover:text-ink"
            >
              Clear filters
            </button>
          </div>
        </div>

        {activityDate && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
            <p className="text-ink">
              Date filter: <strong>{activityDate}</strong> ·{' '}
              {
                purchases.filter((p) => activityDay(p) === activityDate).length
              }{' '}
              activit
              {purchases.filter((p) => activityDay(p) === activityDate).length === 1 ? 'y' : 'ies'}{' '}
              that day (all types, including kitchen issue).
            </p>
            <button
              type="button"
              onClick={() => setViewDayDate(activityDate)}
              className="text-sm font-semibold text-crimson underline"
            >
              View only — all activity on this date
            </button>
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--kdc-border)]">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-crimson-deep text-white">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">View</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivity.map((p) => {
                const day = activityDay(p);
                return (
                  <tr key={p.id} className="border-t border-[var(--kdc-border)] bg-surface">
                    <td className="px-3 py-2 text-xs text-muted">
                      {new Date(p.created_at).toLocaleString('en-PK')}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${activityTypeClass(
                          p.tx_type
                        )}`}
                      >
                        {activityTypeLabel(p.tx_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{p.name || '—'}</td>
                    <td className="px-3 py-2 text-muted">{p.supplier_name || '—'}</td>
                    <td className="px-3 py-2 font-medium">{renderActivityQty(p)}</td>
                    <td className="px-3 py-2">
                      {p.unit_cost != null ? formatPKR(Number(p.unit_cost)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted">{p.notes || '—'}</td>
                    <td className="px-3 py-2">
                      {day ? (
                        <button
                          type="button"
                          onClick={() => setViewDayDate(day)}
                          className="text-xs font-semibold text-crimson underline"
                        >
                          View day
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filteredActivity.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted">
                    {purchases.length
                      ? 'No activity matches these filters.'
                      : 'No stock activity yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewDayDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="kdc-panel-3d max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--kdc-border)] bg-surface shadow-xl"
            role="dialog"
            aria-labelledby="activity-day-title"
          >
            <div className="border-b border-[var(--kdc-border)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                View only
              </p>
              <h3 id="activity-day-title" className="font-[family-name:var(--font-display)] text-2xl text-ink">
                Stock activity · {viewDayDate}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {dayViewRows.length} entr{dayViewRows.length === 1 ? 'y' : 'ies'} · includes buys,
                amends, and kitchen issues (read only).
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-3">
              <ul className="space-y-3 text-sm">
                {dayViewRows.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-[var(--kdc-border)] bg-white/50 px-3 py-2 dark:bg-black/10"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${activityTypeClass(
                          p.tx_type
                        )}`}
                      >
                        {activityTypeLabel(p.tx_type)}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(p.created_at).toLocaleTimeString('en-PK')}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-ink">{p.name || '—'}</p>
                    <p className="text-muted">
                      Qty {renderActivityQty(p)}
                      {p.supplier_name ? ` · Supplier: ${p.supplier_name}` : ''}
                      {p.unit_cost != null ? ` · ${formatPKR(Number(p.unit_cost))}` : ''}
                    </p>
                    {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
                  </li>
                ))}
                {!dayViewRows.length && (
                  <li className="py-6 text-center text-muted">No activity on this date.</li>
                )}
              </ul>
            </div>
            <div className="border-t border-[var(--kdc-border)] px-5 py-3 text-right">
              <button
                type="button"
                onClick={() => setViewDayDate(null)}
                className="kdc-button kdc-button-primary !px-5 !py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 [perspective:1400px]">
          <form
            onSubmit={(e) => void issueToKitchen(e)}
            className="kdc-panel-3d w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-ink">
              Issue stock to kitchen
            </h3>
            <p className="text-sm text-muted">
              Issues are logged in Recent stock activity and can be filtered by date and item like
              any other movement.
            </p>
            <label className="block text-xs font-bold text-ink">
              Item
              <select
                required
                value={issueItemId}
                onChange={(e) => setIssueItemId(e.target.value)}
                className="kdc-stock-select mt-1"
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatQty(balance(i), resolveItemUnit(i.unit, i.name))} avail.)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-ink">
              Quantity to issue
              <input
                type="number"
                min={0.001}
                step="any"
                required
                value={issueQty}
                onChange={(e) => setIssueQty(e.target.value)}
                className="kdc-stock-input mt-1"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowIssue(false)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={issuing || !items.length}
                className="kdc-button kdc-button-primary disabled:opacity-60"
              >
                {issuing ? 'Issuing…' : 'Issue to kitchen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCatalogBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 [perspective:1400px]">
          <form
            onSubmit={(e) => void buyCatalogStock(e)}
            className="kdc-panel-3d w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-ink">
              {showCatalogBuy.label} menu
            </h3>
            <p className="text-sm font-semibold text-ink/80">
              Select an item, then Add, Amend quantity, Fix spelling, or Delete. Use “New item name”
              when adding a product that is not in the list yet.
            </p>
            <label className="block text-xs font-bold text-ink">
              {catalogMode === 'delete' || catalogMode === 'rename'
                ? `Stock item (${showCatalogBuy.label})`
                : showCatalogBuy.label === 'Lentils'
                  ? 'Which daal'
                  : showCatalogBuy.label === 'Spices'
                    ? 'Which spice'
                    : 'Which soft drink'}
              {catalogMode === 'delete' || catalogMode === 'rename' ? (
                <select
                  key="stock-item-select"
                  name="deleteItemId"
                  required
                  value={catalogDeleteId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCatalogDeleteId(id);
                    const row = items.find((i) => i.id === id);
                    setCatalogRenameName(row?.name || '');
                  }}
                  className="kdc-stock-select mt-1"
                >
                  <option value="">Select item…</option>
                  {catalogItemsInStock.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} —{' '}
                      {formatQty(
                        Number(i.current_stock ?? i.current_balance ?? 0),
                        resolveItemUnit(i.unit, i.name)
                      )}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  {!useNewCatalogItem && (
                    <select
                      key="catalog-item-select"
                      required={!useNewCatalogItem}
                      value={catalogItemName}
                      onChange={(e) => {
                        setCatalogItemName(e.target.value);
                        setCatalogQty('');
                      }}
                      className="kdc-stock-select mt-1"
                    >
                      {catalogSelectNames(showCatalogBuy).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                  {catalogMode === 'add' && (
                    <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-ink">
                        <input
                          type="checkbox"
                          checked={useNewCatalogItem}
                          onChange={(e) => {
                            setUseNewCatalogItem(e.target.checked);
                            if (!e.target.checked) setNewCatalogItemName('');
                          }}
                        />
                        Add a new item name (not in list)
                      </label>
                      {useNewCatalogItem && (
                        <input
                          type="text"
                          required
                          value={newCatalogItemName}
                          onChange={(e) => setNewCatalogItemName(e.target.value)}
                          placeholder={
                            showCatalogBuy.label === 'Drinks'
                              ? 'e.g. Nestle Juice'
                              : showCatalogBuy.label === 'Spices'
                                ? 'e.g. Black cardamom'
                                : 'e.g. Kabuli Chana'
                          }
                          className="kdc-stock-input"
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </label>

            <p className="rounded-lg border border-[var(--kdc-border)] bg-white px-3 py-2 text-sm font-semibold text-ink">
              {(catalogMode === 'delete' || catalogMode === 'rename') && selectedCatalogStock ? (
                <>
                  Selected: <strong>{selectedCatalogStock.name}</strong>
                  <span className="mt-1 block">
                    Current stock:{' '}
                    <strong>
                      {formatQty(
                        Number(
                          selectedCatalogStock.current_stock ??
                            selectedCatalogStock.current_balance ??
                            0
                        ),
                        resolveItemUnit(selectedCatalogStock.unit, selectedCatalogStock.name)
                      )}
                    </strong>
                  </span>
                </>
              ) : (
                <>
                  Current stock:{' '}
                  <strong>
                    {formatQty(
                      (() => {
                        const n = resolveCatalogAddName();
                        const match = n ? findStockByName(items, n) : null;
                        return match
                          ? Number(match.current_stock ?? match.current_balance ?? 0)
                          : 0;
                      })(),
                      showCatalogBuy.unit
                    )}
                  </strong>
                  {!findStockByName(items, resolveCatalogAddName() || '') && (
                    <span className="mt-1 block text-xs font-bold text-ink/70">
                      Not in stock list yet (balance 0) — saving will create it and add it to the
                      dropdown.
                    </span>
                  )}
                </>
              )}
            </p>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-ink">Action</legend>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input
                  type="radio"
                  name="catalogMode"
                  checked={catalogMode === 'add'}
                  onChange={() => {
                    setCatalogMode('add');
                    setCatalogQty('');
                    setCatalogDeleteId('');
                  }}
                />
                Add new stock
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input
                  type="radio"
                  name="catalogMode"
                  checked={catalogMode === 'amend'}
                  onChange={() => {
                    setCatalogMode('amend');
                    setUseNewCatalogItem(false);
                    setCatalogDeleteId('');
                    const match = findStockByName(items, catalogItemName);
                    setCatalogQty(
                      match
                        ? String(Number(match.current_stock ?? match.current_balance ?? 0))
                        : ''
                    );
                  }}
                />
                Amend quantity
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input
                  type="radio"
                  name="catalogMode"
                  checked={catalogMode === 'rename'}
                  onChange={() => {
                    setCatalogMode('rename');
                    setUseNewCatalogItem(false);
                    setCatalogQty('');
                    const match =
                      findStockByName(catalogItemsInStock, catalogItemName) ||
                      catalogItemsInStock[0];
                    setCatalogDeleteId(match?.id || '');
                    setCatalogRenameName(match?.name || '');
                  }}
                />
                Fix spelling
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input
                  type="radio"
                  name="catalogMode"
                  checked={catalogMode === 'delete'}
                  onChange={() => {
                    setCatalogMode('delete');
                    setUseNewCatalogItem(false);
                    setCatalogQty('');
                    const match =
                      findStockByName(catalogItemsInStock, catalogItemName) ||
                      catalogItemsInStock[0];
                    setCatalogDeleteId(match?.id || '');
                  }}
                />
                Delete item
              </label>
            </fieldset>

            {(catalogMode === 'add' || catalogMode === 'amend') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-ink">
                  {catalogMode === 'add' ? 'Quantity to add' : 'Correct balance'}
                  <input
                    type="number"
                    min={0}
                    step={unitKind(showCatalogBuy.unit) === 'count' ? 1 : 'any'}
                    required
                    value={catalogQty}
                    onChange={(e) => setCatalogQty(e.target.value)}
                    className="kdc-stock-input mt-1"
                  />
                </label>
                {catalogMode === 'add' && (
                  <label className="text-xs font-bold text-ink">
                    Enter as
                    <select
                      value={entryUnit}
                      onChange={(e) => setEntryUnit(e.target.value)}
                      className="kdc-stock-select mt-1"
                    >
                      {catalogEntryOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {catalogMode === 'rename' && (
              <label className="block text-xs font-bold text-ink">
                Correct spelling
                <input
                  type="text"
                  required
                  value={catalogRenameName}
                  onChange={(e) => setCatalogRenameName(e.target.value)}
                  placeholder="e.g. Mirinda"
                  className="kdc-stock-input mt-1"
                />
              </label>
            )}

            {catalogMode === 'delete' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-ink">
                Delete removes the selected stock row (including duplicates). Confirm before
                deletion.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCatalogBuy(null)}
                className="rounded-full px-4 py-2 text-sm font-bold text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  buying ||
                  (catalogMode === 'delete' || catalogMode === 'rename'
                    ? !catalogDeleteId
                    : !resolveCatalogAddName() || catalogQty === '') ||
                  (catalogMode === 'rename' && !catalogRenameName.trim())
                }
                className="rounded-full bg-crimson px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {buying
                  ? 'Saving…'
                  : catalogMode === 'delete'
                    ? 'Delete'
                    : catalogMode === 'rename'
                      ? 'Save spelling'
                      : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={(e) => void buyStock(e)}
            className="w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl">Buy other stock</h3>
            <p className="text-sm text-muted">
              For items outside Lentils, Spices, and Drinks menus.
            </p>
            <label className="block text-xs text-muted">
              Stock item
              <select
                name="inventoryItemId"
                required
                value={buyItemId}
                onChange={(e) => setBuyItemId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              >
                <option value="" disabled>
                  Select item…
                </option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedBuyItem && (
              <p className="rounded-lg bg-crimson/5 px-3 py-2 text-xs text-muted">
                Current balance:{' '}
                <strong className="text-ink">
                  {formatQty(balance(selectedBuyItem), selectedBuyItem.unit)}
                </strong>
              </p>
            )}
            <label className="block text-xs text-muted">
              Record unit
              <select
                value={storeUnit}
                onChange={(e) => setStoreUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min={unitKind(storeUnit) === 'count' ? 1 : 0.001}
                  step={unitKind(storeUnit) === 'count' ? 1 : 'any'}
                  required
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-muted">
                Enter as
                <select
                  value={entryUnit}
                  onChange={(e) => setEntryUnit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                >
                  {buyEntryOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted">
              Unit cost (PKR, optional)
              <input
                name="unitCost"
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Supplier (optional)
              <input
                name="supplierName"
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Notes (optional)
              <input
                name="notes"
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowBuy(false)} className="rounded-full px-4 py-2 text-sm text-muted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={buying || !selectedBuyItem}
                className="rounded-full bg-crimson px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {buying ? 'Saving…' : 'Buy & update balance'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAmend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 [perspective:1400px]">
          <form
            onSubmit={(e) => void amendStock(e)}
            className="kdc-panel-3d w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl">Amend stock</h3>
            <p className="text-sm text-muted">
              Fix a wrong quantity or correct a spelling mistake on the item name.
            </p>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Amend type</legend>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="amendKind"
                  checked={amendKind === 'qty'}
                  onChange={() => setAmendKind('qty')}
                />
                Amend quantity
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="amendKind"
                  checked={amendKind === 'spelling'}
                  onChange={() => {
                    setAmendKind('spelling');
                    setAmendNewName(selectedAmendItem?.name || '');
                  }}
                />
                Fix spelling
              </label>
            </fieldset>
            <label className="block text-xs text-muted">
              Stock item
              <select
                required
                value={amendItemId}
                onChange={(e) => {
                  setAmendItemId(e.target.value);
                  const row = items.find((i) => i.id === e.target.value);
                  setAmendNewName(row?.name || '');
                }}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              >
                <option value="" disabled>
                  Select item…
                </option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedAmendItem && amendKind === 'qty' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-muted">
                Current balance:{' '}
                <strong className="text-ink">
                  {formatQty(balance(selectedAmendItem), selectedAmendItem.unit)}
                </strong>
              </p>
            )}
            {amendKind === 'qty' ? (
              <label className="block text-xs text-muted">
                Correct balance (
                {selectedAmendItem
                  ? resolveItemUnit(selectedAmendItem.unit, selectedAmendItem.name)
                  : 'unit'}
                )
                <input
                  name="newBalance"
                  type="number"
                  min={0}
                  step={
                    selectedAmendItem && unitKind(selectedAmendItem.unit) === 'count' ? 1 : 'any'
                  }
                  required
                  placeholder="Enter correct stock quantity"
                  key={`bal-${amendItemId}`}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
            ) : (
              <label className="block text-xs text-muted">
                Correct spelling
                <input
                  name="newName"
                  type="text"
                  required
                  value={amendNewName}
                  onChange={(e) => setAmendNewName(e.target.value)}
                  placeholder="e.g. Mirinda"
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
            )}
            <label className="block text-xs text-muted">
              Reason (optional)
              <input
                name="notes"
                placeholder={
                  amendKind === 'spelling'
                    ? 'e.g. Typo — Marinda → Mirinda'
                    : 'e.g. Typo — entered 50 instead of 5'
                }
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAmend(false)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  buying ||
                  !selectedAmendItem ||
                  (amendKind === 'spelling' && !amendNewName.trim())
                }
                className="rounded-full bg-crimson px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {buying
                  ? 'Saving…'
                  : amendKind === 'spelling'
                    ? 'Save spelling'
                    : 'Save amendment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={(e) => void addItem(e)}
            className="w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl">Add New Stock Item</h3>
            <label className="block text-xs text-muted">
              Name
              <input
                name="name"
                required
                value={addName}
                onChange={(e) => {
                  const v = e.target.value;
                  setAddName(v);
                  setAddUnit(suggestUnitFromName(v));
                  setAddCategory(suggestCategoryFromName(v));
                }}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                SKU (optional)
                <input
                  name="sku"
                  placeholder="INV-TEA"
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-muted">
                Unit
                <select
                  name="unit"
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                >
                  {UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted">
              First quantity — Opening stock ({addUnit})
              <input
                name="openingStock"
                type="number"
                min={0}
                step={unitKind(addUnit) === 'count' ? 1 : 'any'}
                required
                value={addOpening}
                onChange={(e) => setAddOpening(e.target.value)}
                placeholder="e.g. 40"
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <p className="text-xs text-muted">
              This quantity appears in Opening and Balance as soon as the item is saved.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                Category
                <input
                  name="category"
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-muted">
                Cost / {addUnit} (PKR)
                <input
                  name="costPrice"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={0}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <label className="text-xs text-muted">
              Reorder level ({addUnit})
              <input
                name="reorderLevel"
                type="number"
                min={0}
                step={unitKind(addUnit) === 'count' ? 1 : 'any'}
                defaultValue={unitKind(addUnit) === 'count' ? 24 : 10}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Supplier (optional)
              <input
                name="supplierName"
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddItem(false)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={buying}
                className="rounded-full bg-crimson px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {buying ? 'Saving…' : 'Add to inventory'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
