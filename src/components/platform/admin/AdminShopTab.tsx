import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiShopItemAsset } from '../../../api/client';
import { Banner, Section } from './AdminDashboardPrimitives';
import type { ItemCategory, OwnershipType, ShopItem } from '../shop/shop.types';
import { X } from 'lucide-react';

export function ShopTab() {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [initialPriceDzp, setInitialPriceDzp] = useState('0');
  const [currentPriceDzp, setCurrentPriceDzp] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCategory, setDraftCategory] = useState<ItemCategory>('title');
  const [draftOwnershipType, setDraftOwnershipType] = useState<OwnershipType>('normal');
  const [draftDisplayOrder, setDraftDisplayOrder] = useState('0');
  const [draftInitialPriceDzp, setDraftInitialPriceDzp] = useState('1');
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [changingLifecycle, setChangingLifecycle] = useState(false);
  const [assets, setAssets] = useState<ApiShopItemAsset[] | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetType, setAssetType] = useState<'png' | 'webp' | 'gif' | 'apng' | 'svg'>('svg');
  const [assetUrl, setAssetUrl] = useState('');
  const [assetAltText, setAssetAltText] = useState('');
  const [assetFrameInnerDiameterRatio, setAssetFrameInnerDiameterRatio] = useState('');
  const [assetIsAnimated, setAssetIsAnimated] = useState(false);
  const [makeAssetActive, setMakeAssetActive] = useState(true);
  const [savingAsset, setSavingAsset] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);

    const result = await api.admin.shopItems();

    if (!result.ok) {
      setError(result.error);
      setItems(null);
      setBusy(false);
      return;
    }

    setItems(result.data);
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAssets = async (itemId: string) => {
    setLoadingAssets(true);
    const result = await api.admin.shopItemAssets(itemId);
    setLoadingAssets(false);

    if (!result.ok) {
      setAssets(null);
      setError(result.error);
      return;
    }

    setAssets(result.data);
  };

  const beginEdit = (item: ShopItem) => {
    setEditing(item);
    setName(item.name);
    setDescription(item.description);
    setDisplayOrder(String(item.displayOrder));
    setInitialPriceDzp(String(item.initialPriceDzp));
    setCurrentPriceDzp(item.currentPriceDzp === null ? '' : String(item.currentPriceDzp));
    setAssets(null);
    setAssetType('svg');
    setAssetUrl('');
    setAssetAltText('');
    setAssetFrameInnerDiameterRatio('');
    setAssetIsAnimated(item.artwork?.isAnimated ?? false);
    setMakeAssetActive(true);
    setSaved(false);
    setError(null);
    void loadAssets(item.id);
  };

  const closeEditor = () => {
    if (!saving && !changingLifecycle && !savingAsset) setEditing(null);
  };

  const beginDraft = () => {
    setDraftName('');
    setDraftDescription('');
    setDraftCategory('title');
    setDraftOwnershipType('normal');
    setDraftDisplayOrder(String(items?.length ?? 0));
    setDraftInitialPriceDzp('1');
    setCreating(true);
    setSaved(false);
    setError(null);
  };

  const closeDraft = () => {
    if (!creatingDraft) setCreating(false);
  };

  const createDraft = async () => {
    const displayOrder = Number(draftDisplayOrder);
    const initialPriceDzp = Number(draftInitialPriceDzp);

    if (
      !draftName.trim() ||
      !draftDescription.trim() ||
      !Number.isInteger(displayOrder) || displayOrder < 0 ||
      !Number.isInteger(initialPriceDzp) || initialPriceDzp <= 0
    ) {
      setError('Enter a name and description, plus a positive whole-number price and display order of zero or more.');
      return;
    }

    setCreatingDraft(true);
    setError(null);
    const result = await api.admin.createShopItemDraft({
      name: draftName.trim(),
      description: draftDescription.trim(),
      category: draftCategory,
      ownershipType: draftOwnershipType,
      displayOrder,
      initialPriceDzp,
    });
    setCreatingDraft(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCreating(false);
    setSaved(true);
    await load();
  };

  const save = async () => {
    if (!editing) return;

    const parsedDisplayOrder = Number(displayOrder);
    const parsedInitialPrice = Number(initialPriceDzp);
    const parsedCurrentPrice = editing.ownershipType === 'stealable'
      ? Number(currentPriceDzp)
      : null;

    if (
      !name.trim() ||
      !description.trim() ||
      !Number.isInteger(parsedDisplayOrder) || parsedDisplayOrder < 0 ||
      !Number.isInteger(parsedInitialPrice) || parsedInitialPrice < 0 ||
      (editing.ownershipType === 'stealable' &&
        (parsedCurrentPrice === null || !Number.isInteger(parsedCurrentPrice) || parsedCurrentPrice < 0))
    ) {
      setError('Enter a name and description, plus whole-number prices and display order of zero or more.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await api.admin.updateShopItem(editing.id, {
      name: name.trim(),
      description: description.trim(),
      displayOrder: parsedDisplayOrder,
      initialPriceDzp: parsedInitialPrice,
      currentPriceDzp: parsedCurrentPrice,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaved(true);
    setEditing(null);
    await load();
  };

  const changeLifecycle = async (lifecycle: 'ready' | 'active' | 'retired') => {
    if (!editing) return;

    setChangingLifecycle(true);
    setError(null);
    const result = await api.admin.updateShopItemLifecycle(editing.id, lifecycle);
    setChangingLifecycle(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing(null);
    setSaved(true);
    await load();
  };

  const addAsset = async () => {
    if (!editing) return;
    if (!assetUrl.trim() || !assetAltText.trim()) {
  setError('Artwork URL and alt text are required.');
  return;
}

const frameInnerDiameterRatio =
  assetFrameInnerDiameterRatio.trim() === ''
    ? null
    : Number(assetFrameInnerDiameterRatio);

if (
  frameInnerDiameterRatio !== null &&
  (!Number.isFinite(frameInnerDiameterRatio) ||
    frameInnerDiameterRatio <= 0 ||
    frameInnerDiameterRatio > 1)
) {
  setError('Frame inner diameter ratio must be greater than 0 and at most 1.');
  return;
}

    setSavingAsset(true);
    setError(null);
    const result = await api.admin.createShopItemAsset(editing.id, {
      assetType,
      url: assetUrl.trim(),
      altText: assetAltText.trim(),
      frameInnerDiameterRatio,
      isAnimated: assetIsAnimated,
      makeActive: makeAssetActive,
    });
    setSavingAsset(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (makeAssetActive) {
      setEditing({
  ...editing,
  artwork: {
    assetId: '',
    url: assetUrl.trim(),
    assetType,
    altText: assetAltText.trim(),
    isAnimated: assetIsAnimated,
    frameInnerDiameterRatio: frameInnerDiameterRatio ?? undefined,
  },
});
    }
    setAssetUrl('');
    setAssetAltText('');
    setAssetFrameInnerDiameterRatio('');
    setAssetIsAnimated(false);
    setSaved(true);
    await Promise.all([loadAssets(editing.id), load()]);
  };

  const activateAsset = async (asset: ApiShopItemAsset) => {
    if (!editing || asset.isActive) return;

    setSavingAsset(true);
    setError(null);
    const result = await api.admin.setShopItemAssetActive(editing.id, asset.id);
    setSavingAsset(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing({
  ...editing,
  artwork: {
    assetId: asset.id,
    url: asset.url,
    assetType: asset.assetType,
    altText: asset.altText,
    isAnimated: asset.isAnimated,
    frameInnerDiameterRatio: asset.frameInnerDiameterRatio ?? undefined,
  },
});
    setSaved(true);
    await Promise.all([loadAssets(editing.id), load()]);
  };

  return (
    <div className="space-y-5">
      {error && (
        <Banner
          tone="error"
          text={`Could not load Shop items: ${error}`}
          onDismiss={() => setError(null)}
        />
      )}

      <Section
        title="Shop Catalog"
        description="All Shop items, including staged and retired items. Ownership and pricing shown here come from the database."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {items === null
              ? 'Loading catalog…'
              : `${items.length} item${items.length === 1 ? '' : 's'}`}
          </p>

          <button
            type="button"
            onClick={beginDraft}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-xs font-black text-slate-950 transition-colors"
          >
            Create draft
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => { void load(); }}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-300 transition-colors"
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {items === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No Shop items exist yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-4 p-4 bg-slate-900/40 border border-slate-800/70 rounded-xl"
              >
                {item.artwork ? (
                  <img
                    src={item.artwork.url}
                    alt=""
                    className="w-24 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-900"
                  />
                ) : (
                  <div className="w-24 h-14 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-900 border border-slate-800 text-[10px] text-slate-600">
                    NO ART
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-white truncate">
                      {item.name}
                    </p>

                    <span className="text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">
                      {item.lifecycle}
                    </span>

                    <span className="text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border border-slate-700 text-slate-500">
                      {item.ownershipType}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {item.category}
                    {item.profileSlot ? ` · slot: ${item.profileSlot}` : ''}
                    {` · #${item.displayOrder}`}
                  </p>

                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Initial {item.initialPriceDzp.toLocaleString()} DZP
                    {item.currentPriceDzp !== null
                      ? ` · Current ${item.currentPriceDzp.toLocaleString()} DZP`
                      : ''}
                  </p>

                  <p className="text-[11px] text-slate-600 mt-1">
                    {item.currentOwner
                      ? `Held by ${item.currentOwner.username} · acquired for ${item.currentOwner.acquisitionPriceDzp.toLocaleString()} DZP`
                      : 'No current owner'}
                    {` · ${item.transferCount} transfer${item.transferCount === 1 ? '' : 's'}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => beginEdit(item)}
                  className="flex-shrink-0 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="presentation" onMouseDown={closeDraft}>
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="shop-draft-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">New Shop item</p>
                <h3 id="shop-draft-title" className="mt-1 text-lg font-black text-white">Create draft</h3>
                <p className="mt-1 text-xs text-slate-500">Drafts are not visible to players. Artwork and activation are separate steps.</p>
              </div>
              <button type="button" onClick={closeDraft} disabled={creatingDraft} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Close draft creator">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">Name</span>
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} disabled={creatingDraft} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">Description</span>
                <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} disabled={creatingDraft} rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Category</span>
                <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as ItemCategory)} disabled={creatingDraft} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50">
                  <option value="title">Title</option>
                  <option value="badge">Badge</option>
                  <option value="frame">Frame</option>
                  <option value="username_decoration">Username decoration</option>
                  <option value="profile_decoration">Profile decoration</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Ownership</span>
                <select value={draftOwnershipType} onChange={(event) => setDraftOwnershipType(event.target.value as OwnershipType)} disabled={creatingDraft} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50">
                  <option value="normal">Normal</option>
                  <option value="stealable">Stealable</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Display order</span>
                <input type="number" min="0" step="1" value={draftDisplayOrder} onChange={(event) => setDraftDisplayOrder(event.target.value)} disabled={creatingDraft} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Initial price (DZP)</span>
                <input type="number" min="1" step="1" value={draftInitialPriceDzp} onChange={(event) => setDraftInitialPriceDzp(event.target.value)} disabled={creatingDraft} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeDraft} disabled={creatingDraft} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => { void createDraft(); }} disabled={creatingDraft} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-40">
                {creatingDraft ? 'Creating…' : 'Create draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          role="presentation"
          onMouseDown={closeEditor}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Shop item editor</p>
                <h3 id="shop-editor-title" className="mt-1 text-lg font-black text-white">{editing.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {editing.ownershipType === 'stealable'
                    ? 'Stealable item — the server enforces price history and increase rules.'
                    : 'Normal item — its current price is not applicable.'}
                </p>
              </div>
              <button type="button" onClick={closeEditor} disabled={saving || changingLifecycle || savingAsset} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Close editor">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={saving} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Display order</span>
                <input type="number" min="0" step="1" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} disabled={saving} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-300">Initial price (DZP)</span>
                <input type="number" min="0" step="1" value={initialPriceDzp} onChange={(event) => setInitialPriceDzp(event.target.value)} disabled={saving} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
              </label>
              {editing.ownershipType === 'stealable' && (
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-300">Current steal price (DZP)</span>
                  <input type="number" min="0" step="1" value={currentPriceDzp} onChange={(event) => setCurrentPriceDzp(event.target.value)} disabled={saving} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
                </label>
              )}
            </div>

            <div className="mt-6 border-t border-slate-800 pt-5">
              <p className="text-xs font-bold text-slate-300">Artwork assets</p>
              <p className="mt-1 text-xs text-slate-500">Add a URL-backed asset, then select one as the player-facing artwork.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-300">Asset type</span>
                  <select value={assetType} onChange={(event) => setAssetType(event.target.value as 'png' | 'webp' | 'gif' | 'apng' | 'svg')} disabled={savingAsset} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50">
                    <option value="svg">SVG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                    <option value="gif">GIF</option>
                    <option value="apng">APNG</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-xs font-bold text-slate-300">
                  <input type="checkbox" checked={makeAssetActive} onChange={(event) => setMakeAssetActive(event.target.checked)} disabled={savingAsset} className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-400" />
                  Make this the active artwork
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-300">Artwork URL</span>
                  <input value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} disabled={savingAsset} placeholder="/assets/shop/item.svg" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-300">Alt text</span>
                  <input value={assetAltText} onChange={(event) => setAssetAltText(event.target.value)} disabled={savingAsset} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50" />
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={assetIsAnimated}
                    onChange={(event) => setAssetIsAnimated(event.target.checked)}
                    disabled={savingAsset}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-400"
                  />
                  <span className="text-xs font-bold text-slate-300">Animated asset</span>
                  <span className="text-[10px] text-slate-600">GIF, APNG, or animated WebP can be used for titles.</span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-300">Frame inner diameter ratio</span>
                  <input
                    type="number"
                    min="0.01"
                    max="1"
                    step="0.000001"
                    value={assetFrameInnerDiameterRatio}
                    onChange={(event) => setAssetFrameInnerDiameterRatio(event.target.value)}
                    disabled={savingAsset}
                    placeholder="0.679426"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Inner opening diameter ÷ source artwork width. Leave empty for non-frame artwork.
                  </p>
                </label>
              </div>
              <button type="button" onClick={() => { void addAsset(); }} disabled={savingAsset} className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                {savingAsset ? 'Adding…' : 'Add artwork asset'}
              </button>

              <div className="mt-4 space-y-2">
                {loadingAssets ? (
                  <p className="text-xs text-slate-500">Loading artwork…</p>
                ) : assets === null ? (
                  <p className="text-xs text-slate-500">Artwork history could not be loaded.</p>
                ) : assets.length === 0 ? (
                  <p className="text-xs text-slate-500">No artwork assets yet.</p>
                ) : assets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                    <img src={asset.url} alt="" className="h-10 w-16 rounded object-cover bg-slate-900" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-200">{asset.altText}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        {asset.assetType.toUpperCase()} · {asset.isAnimated ? 'Animated · ' : ''}{asset.url}
                        {asset.frameInnerDiameterRatio !== null
                          ? ` · ratio ${asset.frameInnerDiameterRatio}`
                          : ''}
                      </p>
                    </div>
                    {asset.isActive ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-300">Active</span>
                    ) : (
                      <button type="button" onClick={() => { void activateAsset(asset); }} disabled={savingAsset} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-300 hover:bg-slate-700 disabled:opacity-40">Set active</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {editing.lifecycle !== 'retired' && (
              <div className="mt-6 border-t border-slate-800 pt-5">
                <p className="text-xs font-bold text-slate-300">Lifecycle</p>
                <p className="mt-1 text-xs text-slate-500">
                  Current state: <span className="font-bold text-slate-300">{editing.lifecycle}</span>.
                  {' '}Lifecycle transitions cannot be reversed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {editing.lifecycle === 'draft' && (
                    <button type="button" onClick={() => { void changeLifecycle('ready'); }} disabled={saving || changingLifecycle} className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-black text-sky-300 hover:bg-sky-500/25 disabled:opacity-40">
                      {changingLifecycle ? 'Updating…' : 'Mark ready'}
                    </button>
                  )}
                  {editing.lifecycle === 'ready' && (
                    <button type="button" onClick={() => { void changeLifecycle('active'); }} disabled={saving || changingLifecycle || !editing.artwork} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40" title={editing.artwork ? undefined : 'Add and activate artwork before publishing this item'}>
                      {changingLifecycle ? 'Updating…' : editing.artwork ? 'Activate' : 'Active artwork required'}
                    </button>
                  )}
                  <button type="button" onClick={() => { void changeLifecycle('retired'); }} disabled={saving || changingLifecycle} className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-black text-rose-300 hover:bg-rose-500/25 disabled:opacity-40">
                    Retire item
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeEditor} disabled={saving || changingLifecycle || savingAsset} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => { void save(); }} disabled={saving || changingLifecycle || savingAsset} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saved && <p className="text-xs font-bold text-emerald-400">Shop item saved and catalog reloaded.</p>}
    </div>
  );
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────

