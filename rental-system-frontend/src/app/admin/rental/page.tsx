"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Equipment,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";
import {
  type EquipmentImageDraft,
  changeEquipmentImageDraftUrl,
  getEquipmentImageStoragePathFromPublicUrl,
  getEquipmentImageValidationError,
  getUnreferencedEquipmentImages,
  isCurrentEquipmentImageEditorSession,
  MAX_EQUIPMENT_IMAGES,
  shouldDiscardCompletedEquipmentUpload,
} from "@/lib/rental/equipment/equipment-images";
import { getHttpResourceUrlError } from "@/lib/rental/equipment/resource-urls";
import { getEquipmentCataloguePdfValidationError } from "@/lib/rental/equipment/catalogue-pdfs";

type TabKey = "inventory" | "orders" | "create";
type FulfillmentMode = "deliver" | "self_collect";
type CatalogueDraft = {
  storagePath?: string;
  fileName?: string;
  isNewUpload?: boolean;
  isPersisted?: boolean;
};
type ManagedCatalogueDraft = CatalogueDraft & { storagePath: string };

type LocalRentalOrder = {
  id: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  fulfillment: FulfillmentMode;
  pricingSnapshot: { total: number };
  createdAt: string;
};

type EquipmentInventoryProtection = {
  currentTotalUnits: number;
  protectedMinimum: number;
  currentCommittedQty: number;
  currentHeldQty: number;
  currentDowntimeQty: number;
  currentUnavailableQty: number;
  peakCommittedQty: number;
  peakHeldQty: number;
  peakDowntimeQty: number;
};

type TrackedEquipmentImage = {
  sessionId: number;
  image: EquipmentImageDraft;
};

type PendingEquipmentUpload = {
  sessionId: number;
  equipmentKey: string;
};

type TrackedCatalogueUpload = {
  sessionId: number;
  catalogue: ManagedCatalogueDraft;
};

type EditorState = {
  id: string | null;
  title: string;
  slug: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  totalUnits: number;
  maintenanceBufferDays: number;
  dayRate: number;
  weekRate: number | "";
  monthRate: number | "";
  minDays: number;
  depositAmount: number;
  images: EquipmentImageDraft[];
  catalogueUrl: string;
  catalogue: CatalogueDraft;
  trainingVideoUrl: string;
  keyFeaturesText: string;
  applicationsText: string;
  specsText: string;
  displayOrder: number;
  isPublished: boolean;
  saleEnabled: boolean;
  saleStatus: EquipmentSaleStatus;
  salePriceMode: EquipmentSalePriceMode;
  salePriceCents: number | "";
  saleCondition: string;
  saleWarranty: string;
  saleNotes: string;
  saleFulfillmentDeliver: boolean;
  saleFulfillmentSelfCollect: boolean;
};

const ORDERS_LS_KEY = "cms_rental_orders_v1";

function emptyEditor(defaultMaintenanceBufferDays = 7): EditorState {
  return {
    id: null,
    title: "",
    slug: "",
    category: "earthmoving",
    brand: "",
    model: "",
    description: "",
    totalUnits: 1,
    maintenanceBufferDays: defaultMaintenanceBufferDays,
    dayRate: 80,
    weekRate: "",
    monthRate: "",
    minDays: 1,
    depositAmount: 0,
    images: [{ url: "" }],
    catalogueUrl: "",
    catalogue: {},
    trainingVideoUrl: "",
    keyFeaturesText: "",
    applicationsText: "",
    specsText: "",
    displayOrder: 0,
    isPublished: false,
    saleEnabled: false,
    saleStatus: "not_available",
    salePriceMode: "request_quote",
    salePriceCents: "",
    saleCondition: "",
    saleWarranty: "",
    saleNotes: "",
    saleFulfillmentDeliver: false,
    saleFulfillmentSelfCollect: false,
  };
}

function readOrders(): LocalRentalOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalRentalOrder[]) : [];
  } catch {
    return [];
  }
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function listToText(items?: string[]) {
  return (items ?? []).join("\n");
}

function specsToText(specs?: Record<string, string>) {
  return Object.entries(specs ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function textToSpecs(value: string) {
  return value.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const index = line.indexOf(":");
    if (index <= 0) return acc;
    const key = line.slice(0, index).trim();
    const item = line.slice(index + 1).trim();
    if (!key || !item) return acc;
    acc[key] = item;
    return acc;
  }, {});
}

function toEditor(item?: Equipment | null, defaultMaintenanceBufferDays = 7): EditorState {
  if (!item) return emptyEditor(defaultMaintenanceBufferDays);
  return {
    id: item.id,
    title: item.title,
    slug: item.slug ?? "",
    category: item.category,
    brand: item.brand ?? "",
    model: item.model ?? "",
    description: item.description ?? item.shortDesc ?? "",
    totalUnits: item.totalUnits,
    maintenanceBufferDays: item.maintenanceBufferDays ?? defaultMaintenanceBufferDays,
    dayRate: item.pricing.dayRate ?? 0,
    weekRate: item.pricing.weekRate ?? "",
    monthRate: item.pricing.monthRate ?? "",
    minDays: item.pricing.minDays ?? 1,
    depositAmount: item.pricing.deposit ?? 0,
    images: item.images?.length
      ? item.images.map((url) => {
          const storagePath = getEquipmentImageStoragePathFromPublicUrl(url);
          return {
            url,
            publicUrl: storagePath ? url : undefined,
            storagePath,
            originalPublicUrl: storagePath ? url : undefined,
            originalStoragePath: storagePath,
            originalIsPersisted: Boolean(storagePath),
            isPersisted: Boolean(storagePath),
          };
        })
      : [{ url: "" }],
    catalogueUrl: item.catalogueUrl ?? "",
    catalogue: item.catalogueStoragePath
      ? {
          storagePath: item.catalogueStoragePath,
          fileName: item.catalogueFileName,
          isPersisted: true,
        }
      : {},
    trainingVideoUrl: item.trainingVideoUrl ?? "",
    keyFeaturesText: listToText(item.keyFeatures),
    applicationsText: listToText(item.applications),
    specsText: specsToText(item.specs),
    displayOrder: item.displayOrder ?? 0,
    isPublished: item.isPublished,
    saleEnabled: item.sale?.enabled ?? false,
    saleStatus: item.sale?.status ?? "not_available",
    salePriceMode: item.sale?.priceMode ?? "request_quote",
    salePriceCents: item.sale?.priceCents ?? "",
    saleCondition: item.sale?.condition ?? "",
    saleWarranty: item.sale?.warranty ?? "",
    saleNotes: item.sale?.notes ?? "",
    saleFulfillmentDeliver: item.sale?.fulfillmentModes?.includes("deliver") ?? false,
    saleFulfillmentSelfCollect: item.sale?.fulfillmentModes?.includes("self_collect") ?? false,
  };
}

function buildPayload(editor: EditorState) {
  const saleFulfillmentModes = [
    editor.saleFulfillmentDeliver ? "deliver" : "",
    editor.saleFulfillmentSelfCollect ? "self_collect" : "",
  ].filter(Boolean);

  return {
    title: editor.title.trim(),
    slug: editor.slug.trim() || undefined,
    category: editor.category.trim(),
    brand: editor.brand,
    model: editor.model,
    description: editor.description,
    shortDesc: editor.description,
    totalUnits: editor.totalUnits,
    maintenanceBufferDays: editor.maintenanceBufferDays,
    dayRate: editor.dayRate,
    weekRate: editor.weekRate === "" ? null : editor.weekRate,
    monthRate: editor.monthRate === "" ? null : editor.monthRate,
    minDays: editor.minDays,
    depositAmount: editor.depositAmount,
    imageUrls: editor.images.map((item) => item.url.trim()).filter(Boolean),
    // An attached managed PDF is the authoritative catalogue source. Clearing any
    // legacy manual URL here prevents old external links surviving a PDF replacement.
    catalogueUrl: editor.catalogue.storagePath ? null : editor.catalogueUrl.trim() || null,
    catalogueStoragePath: editor.catalogue.storagePath ?? null,
    catalogueFileName: editor.catalogue.fileName ?? null,
    trainingVideoUrl: editor.trainingVideoUrl.trim() || null,
    keyFeatures: textToList(editor.keyFeaturesText),
    applications: textToList(editor.applicationsText),
    specs: textToSpecs(editor.specsText),
    displayOrder: editor.displayOrder,
    isPublished: editor.isPublished,
    saleEnabled: editor.saleEnabled,
    saleStatus: editor.saleEnabled ? editor.saleStatus : "not_available",
    salePriceMode: editor.salePriceMode,
    salePriceCents:
      editor.salePriceMode === "fixed" && editor.salePriceCents !== ""
        ? Math.max(0, Math.floor(Number(editor.salePriceCents)))
        : null,
    saleCondition: editor.saleCondition.trim() || null,
    saleWarranty: editor.saleWarranty.trim() || null,
    saleNotes: editor.saleNotes.trim() || null,
    saleFulfillmentModes,
  };
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <div className="mb-4 border-b border-slate-200 pb-3">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-1 text-xs text-slate-500">{props.description}</div>
    </div>
  );
}

function FieldBlock(props: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  let linkedControl = false;
  const linkedChildren = Children.map(props.children, (child) => {
    if (
      linkedControl ||
      !isValidElement(child) ||
      !["input", "select", "textarea"].includes(String(child.type))
    ) {
      return child;
    }

    linkedControl = true;
    const control = child as React.ReactElement<{
      id?: string;
      "aria-describedby"?: string;
    }>;
    return cloneElement(control, {
      id: props.id,
      ...(props.hint ? { "aria-describedby": `${props.id}-hint` } : {}),
    });
  });

  return (
    <div className={["grid gap-1.5", props.className ?? ""].join(" ").trim()}>
      <label htmlFor={props.id} className="text-sm font-medium text-slate-700">
        {props.label}
      </label>
      {props.hint ? (
        <span id={`${props.id}-hint`} className="text-xs text-slate-500">
          {props.hint}
        </span>
      ) : null}
      {linkedChildren}
    </div>
  );
}

export default function AdminRentalInventoryPage() {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [items, setItems] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<LocalRentalOrder[]>([]);
  const [defaultMaintenanceBufferDays, setDefaultMaintenanceBufferDays] = useState(7);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingCatalogue, setUploadingCatalogue] = useState(false);
  const [draftUploadKey, setDraftUploadKey] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventoryProtection, setInventoryProtection] = useState<EquipmentInventoryProtection | null>(null);
  const [inventoryProtectionLoading, setInventoryProtectionLoading] = useState(false);
  const editorSessionRef = useRef(0);
  const pendingUploadsRef = useRef(new Map<string, PendingEquipmentUpload>());
  const unsavedUploadsRef = useRef(new Map<string, TrackedEquipmentImage>());
  const removedPersistedImagesRef = useRef(new Map<string, TrackedEquipmentImage>());
  const unsavedCatalogueRef = useRef<TrackedCatalogueUpload | null>(null);
  const removedPersistedCatalogueRef = useRef<TrackedCatalogueUpload | null>(null);

  const orderRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + (order.pricingSnapshot?.total ?? 0), 0),
    [orders]
  );
  const totalUnitsBelowFloor = Boolean(
    editor.id && inventoryProtection && editor.totalUnits < inventoryProtection.protectedMinimum
  );
  const availableUnits = inventoryProtection
    ? Math.max(0, inventoryProtection.currentTotalUnits - inventoryProtection.currentUnavailableQty)
    : null;

  async function refreshInventory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rental/equipment", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment");
      setItems(Array.isArray(data?.equipment) ? (data.equipment as Equipment[]) : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load equipment");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSettings() {
    const res = await fetch("/api/admin/settings", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load settings");
    const nextDefault = Math.max(0, Number(data?.operationsPolicy?.defaultMaintenanceBufferDays ?? 7));
    setDefaultMaintenanceBufferDays(nextDefault);
    setEditor((current) =>
      current.id ? current : { ...current, maintenanceBufferDays: nextDefault }
    );
  }

  async function loadInventoryProtection(equipmentId: string) {
    setInventoryProtectionLoading(true);
    try {
      const res = await fetch(`/api/admin/rental/equipment/${encodeURIComponent(equipmentId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment inventory context");
      setInventoryProtection((data?.inventoryProtection ?? null) as EquipmentInventoryProtection | null);
    } catch (nextError) {
      console.error("loadInventoryProtection failed", nextError);
      setInventoryProtection(null);
    } finally {
      setInventoryProtectionLoading(false);
    }
  }

  useEffect(() => {
    refreshSettings().catch((nextError) => {
      console.error("refreshSettings failed", nextError);
    });
    refreshInventory();
    setOrders(readOrders());
  }, []);

  useEffect(() => {
    if (!editor.id) {
      setInventoryProtection(null);
      setInventoryProtectionLoading(false);
      return;
    }

    loadInventoryProtection(editor.id).catch((nextError) => {
      console.error("loadInventoryProtection effect failed", nextError);
    });
  }, [editor.id]);

  function setImageUrl(index: number, value: string) {
    const currentImage = editor.images[index];
    if (!currentImage) return;
    const change = changeEquipmentImageDraftUrl(currentImage, value);

    if (change.replacedPersistedImage) {
      trackImage(
        removedPersistedImagesRef,
        editorSessionRef.current,
        change.replacedPersistedImage
      );
    }
    if (change.restoredPersistedImage) {
      removeTrackedImage(removedPersistedImagesRef, change.restoredPersistedImage);
    }
    if (change.replacedNewUpload) {
      removeTrackedImage(unsavedUploadsRef, change.replacedNewUpload);
      void cleanupEquipmentImages(
        [change.replacedNewUpload],
        "replacing an unsaved uploaded image"
      );
    }

    setEditor((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) =>
        imageIndex === index ? change.draft : image
      ),
    }));
  }

  function addImageUrl() {
    setEditor((current) => {
      if (current.images.length >= MAX_EQUIPMENT_IMAGES) return current;
      return { ...current, images: [...current.images, { url: "" }] };
    });
  }

  function imageTrackingKey(image: EquipmentImageDraft) {
    return image.storagePath ?? image.publicUrl ?? image.url;
  }

  function trackImage(
    target: React.MutableRefObject<Map<string, TrackedEquipmentImage>>,
    sessionId: number,
    image: EquipmentImageDraft
  ) {
    if (!image.storagePath) return;
    target.current.set(imageTrackingKey(image), { sessionId, image });
  }

  function removeTrackedImage(
    target: React.MutableRefObject<Map<string, TrackedEquipmentImage>>,
    image: EquipmentImageDraft
  ) {
    target.current.delete(imageTrackingKey(image));
  }

  function setUploadPending(uploadId: string, pendingUpload: PendingEquipmentUpload) {
    pendingUploadsRef.current.set(uploadId, pendingUpload);
    setUploadingImages(true);
  }

  function clearUploadPending(uploadId: string) {
    pendingUploadsRef.current.delete(uploadId);
    setUploadingImages(pendingUploadsRef.current.size > 0);
  }

  async function deleteEquipmentImage(image: EquipmentImageDraft, context: string) {
    if (!image.storagePath) return null;

    try {
      const response = await fetch("/api/admin/rental/equipment/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path: image.storagePath,
          publicUrl: image.publicUrl ?? image.url,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error ?? "Storage deletion failed");
      }
      return null;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Storage deletion failed";
      console.warn(`Equipment image cleanup failed during ${context}`, {
        path: image.storagePath,
        message,
      });
      return message;
    }
  }

  async function cleanupEquipmentImages(images: EquipmentImageDraft[], context: string) {
    const cleanupCandidates = Array.from(
      new Map(
        images
          .filter((image) => image.storagePath)
          .map((image) => [image.storagePath as string, image])
      ).values()
    );
    if (!cleanupCandidates.length) return;

    const failures = (await Promise.all(
      cleanupCandidates.map((image) => deleteEquipmentImage(image, context))
    )).filter((message): message is string => Boolean(message));

    if (failures.length) {
      setWarning(
        `${failures.length} image cleanup ${failures.length === 1 ? "request" : "requests"} failed after ${context}. The editor change was kept, but the uploaded object may need manual cleanup.`
      );
    }
  }

  async function discardNewUploadsForSession(sessionId: number, context: string) {
    const trackedUploads = Array.from(unsavedUploadsRef.current.values())
      .filter((tracked) => tracked.sessionId === sessionId)
      .map((tracked) => tracked.image);
    await cleanupEquipmentImages(trackedUploads, context);
    for (const [key, tracked] of unsavedUploadsRef.current) {
      if (tracked.sessionId === sessionId) unsavedUploadsRef.current.delete(key);
    }
  }

  async function deleteEquipmentCatalogue(catalogue: CatalogueDraft, context: string) {
    if (!catalogue.storagePath) return;
    try {
      const response = await fetch("/api/admin/rental/equipment/catalogue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: catalogue.storagePath }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Catalogue deletion failed");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Catalogue deletion failed";
      console.warn(`Catalogue cleanup failed during ${context}`, { path: catalogue.storagePath, message });
      setWarning(`Catalogue cleanup failed after ${context}. The editor change was kept, but the PDF may need manual cleanup.`);
    }
  }

  async function discardNewCatalogueForSession(sessionId: number, context: string) {
    const tracked = unsavedCatalogueRef.current;
    if (!tracked || tracked.sessionId !== sessionId) return;
    await deleteEquipmentCatalogue(tracked.catalogue, context);
    if (unsavedCatalogueRef.current?.sessionId === sessionId) {
      unsavedCatalogueRef.current = null;
    }
  }

  function queueRemovedPersistedCatalogue(catalogue: CatalogueDraft) {
    if (!catalogue.isPersisted || !catalogue.storagePath) return;
    removedPersistedCatalogueRef.current = {
      sessionId: editorSessionRef.current,
      catalogue: { ...catalogue, storagePath: catalogue.storagePath },
    };
  }

  async function clearCatalogueUpload() {
    const catalogue = editor.catalogue;
    setWarning(null);
    if (catalogue.isNewUpload) {
      unsavedCatalogueRef.current = null;
      await deleteEquipmentCatalogue(catalogue, "removing an unsaved catalogue PDF");
    } else {
      queueRemovedPersistedCatalogue(catalogue);
    }
    setEditor((current) => ({ ...current, catalogue: {} }));
  }

  async function changeCatalogueUrl(value: string) {
    const catalogue = editor.catalogue;
    if (catalogue.isNewUpload) {
      unsavedCatalogueRef.current = null;
      await deleteEquipmentCatalogue(catalogue, "replacing an unsaved catalogue PDF");
    } else {
      queueRemovedPersistedCatalogue(catalogue);
    }
    setEditor((current) => ({ ...current, catalogueUrl: value, catalogue: {} }));
  }

  async function uploadCataloguePdf(file: File | null) {
    if (!file) return;
    const validationError = getEquipmentCataloguePdfValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const sessionId = editorSessionRef.current;
    const existingCatalogue = editor.catalogue;
    const equipmentKey = editor.id ?? (draftUploadKey || crypto.randomUUID());
    if (!editor.id && !draftUploadKey) setDraftUploadKey(equipmentKey);
    setError(null);
    setWarning(null);
    setUploadingCatalogue(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("equipmentKey", equipmentKey);
      const response = await fetch("/api/admin/rental/equipment/catalogue", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        path?: unknown;
        fileName?: unknown;
        error?: unknown;
      };
      if (!response.ok || typeof data.path !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Catalogue upload failed");
      }

      const uploadedCatalogue: ManagedCatalogueDraft = {
        storagePath: data.path,
        fileName: typeof data.fileName === "string" ? data.fileName : file.name,
        isNewUpload: true,
      };
      if (editorSessionRef.current !== sessionId) {
        await deleteEquipmentCatalogue(uploadedCatalogue, "discarding a catalogue upload from a previous editor");
        return;
      }

      if (existingCatalogue.isNewUpload) {
        await deleteEquipmentCatalogue(existingCatalogue, "replacing an unsaved catalogue PDF");
      } else {
        queueRemovedPersistedCatalogue(existingCatalogue);
      }
      unsavedCatalogueRef.current = { sessionId, catalogue: uploadedCatalogue };
      setEditor((current) =>
        editorSessionRef.current === sessionId
          ? { ...current, catalogueUrl: "", catalogue: uploadedCatalogue }
          : current
      );
      setNotice("Catalogue PDF uploaded. Save equipment to publish it.");
    } catch (nextError) {
      if (editorSessionRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : "Catalogue upload failed");
      } else {
        console.warn("Catalogue upload failed after its editor session changed", nextError);
      }
    } finally {
      if (editorSessionRef.current === sessionId) setUploadingCatalogue(false);
    }
  }

  function startNewEditorSession() {
    const previousSessionId = editorSessionRef.current;
    editorSessionRef.current += 1;
    setUploadingCatalogue(false);

    // Persisted removals are intentionally abandoned with their old editor session:
    // the DB may still reference them when no successful save occurred.
    for (const [key, tracked] of removedPersistedImagesRef.current) {
      if (tracked.sessionId === previousSessionId) {
        removedPersistedImagesRef.current.delete(key);
      }
    }
    if (removedPersistedCatalogueRef.current?.sessionId === previousSessionId) {
      removedPersistedCatalogueRef.current = null;
    }

    return previousSessionId;
  }

  async function resetEquipmentEditor() {
    setWarning(null);
    const previousSessionId = startNewEditorSession();
    setEditor(emptyEditor(defaultMaintenanceBufferDays));
    setDraftUploadKey("");
    setInventoryProtection(null);
    setTab("create");
    await discardNewUploadsForSession(previousSessionId, "resetting the editor");
    await discardNewCatalogueForSession(previousSessionId, "resetting the editor");
  }

  async function openEquipmentForEdit(item: Equipment) {
    setWarning(null);
    const previousSessionId = startNewEditorSession();
    setEditor(toEditor(item, defaultMaintenanceBufferDays));
    setDraftUploadKey("");
    setInventoryProtection(null);
    setTab("create");
    await discardNewUploadsForSession(previousSessionId, "opening another equipment record");
    await discardNewCatalogueForSession(previousSessionId, "opening another equipment record");
  }

  async function removeImage(index: number) {
    const removedImage = editor.images[index];
    if (!removedImage) return;

    setWarning(null);
    setEditor((current) => {
      const next = current.images.filter((_, imageIndex) => imageIndex !== index);
      return { ...current, images: next.length ? next : [{ url: "" }] };
    });

    if (removedImage.isNewUpload) {
      removeTrackedImage(unsavedUploadsRef, removedImage);
      await cleanupEquipmentImages([removedImage], "removing an unsaved uploaded image");
    } else if (removedImage.isPersisted && removedImage.storagePath) {
      trackImage(removedPersistedImagesRef, editorSessionRef.current, removedImage);
    }
  }

  function moveImageUrl(index: number, direction: -1 | 1) {
    setEditor((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.images.length) return current;
      const next = [...current.images];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...current, images: next };
    });
  }

  async function uploadEquipmentImages(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    const sessionId = editorSessionRef.current;

    const currentCount = editor.images.filter((image) => image.url.trim()).length;
    if (currentCount + selectedFiles.length > MAX_EQUIPMENT_IMAGES) {
      setError(`Equipment can have up to ${MAX_EQUIPMENT_IMAGES} images.`);
      return;
    }

    for (const file of selectedFiles) {
      const validationError = getEquipmentImageValidationError(file);
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        return;
      }
    }

    let equipmentKey = editor.id ?? draftUploadKey;
    if (!equipmentKey) {
      equipmentKey = `draft-${crypto.randomUUID()}`;
      setDraftUploadKey(equipmentKey);
    }

    setError(null);
    let uploadedCount = 0;
    try {
      for (const file of selectedFiles) {
        if (editorSessionRef.current !== sessionId) break;

        const uploadId = crypto.randomUUID();
        setUploadPending(uploadId, { sessionId, equipmentKey });
        // Do not abort a request that may already have reached Storage: waiting for its
        // response gives us the returned path needed to delete a stale upload safely.
        const formData = new FormData();
        formData.set("file", file);
        formData.set("equipmentKey", equipmentKey);
        let data: { publicUrl?: unknown; path?: unknown; error?: unknown } = {};
        let response: Response;
        try {
          response = await fetch("/api/admin/rental/equipment/images", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          data = await response.json().catch(() => ({}));
        } finally {
          clearUploadPending(uploadId);
        }

        if (!response!.ok) {
          const message =
            typeof data.error === "string" ? data.error : `Failed to upload ${file.name}`;
          throw new Error(message);
        }
        const publicUrl = typeof data.publicUrl === "string" ? data.publicUrl.trim() : "";
        const storagePath = typeof data.path === "string" ? data.path.trim() : "";
        if (!publicUrl) throw new Error(`Upload for ${file.name} did not return a public URL`);
        if (!storagePath) throw new Error(`Upload for ${file.name} did not return a storage path`);

        const uploadedImage: EquipmentImageDraft = {
              url: publicUrl,
              publicUrl,
              storagePath,
              originalPublicUrl: publicUrl,
              originalStoragePath: storagePath,
              originalIsPersisted: false,
              isNewUpload: true,
        };

        if (shouldDiscardCompletedEquipmentUpload(editorSessionRef.current, sessionId)) {
          await cleanupEquipmentImages([uploadedImage], "discarding an upload from a previous editor");
          continue;
        }

        trackImage(unsavedUploadsRef, sessionId, uploadedImage);
        setEditor((current) => {
          if (!isCurrentEquipmentImageEditorSession(editorSessionRef.current, sessionId)) {
            return current;
          }
          return {
            ...current,
            images: [
              ...current.images.filter((image) => image.url.trim()),
              uploadedImage,
            ],
          };
        });
        uploadedCount += 1;
      }
      if (editorSessionRef.current === sessionId && uploadedCount) {
        setNotice(`${uploadedCount} image${uploadedCount === 1 ? "" : "s"} uploaded.`);
      }
    } catch (nextError) {
      if (editorSessionRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : "Equipment image upload failed");
      } else {
        console.warn("Equipment image upload failed after its editor session changed", nextError);
      }
    }
  }

  async function saveEquipment() {
    if (uploadingImages || uploadingCatalogue) {
      setError("Wait for equipment uploads to finish before saving.");
      return;
    }

    const sessionId = editorSessionRef.current;

    const resourceError =
      getHttpResourceUrlError(editor.catalogueUrl, "Catalogue URL") ??
      getHttpResourceUrlError(editor.trainingVideoUrl, "Training video URL");
    if (resourceError) {
      setError(resourceError);
      return;
    }
    if (
      editor.saleEnabled &&
      editor.salePriceMode === "fixed" &&
      (editor.salePriceCents === "" || Number(editor.salePriceCents) <= 0)
    ) {
      setError("Sale price is required when fixed price is selected.");
      return;
    }

    setSaving(true);
    setNotice(null);
    setError(null);
    setWarning(null);
    try {
      const method = editor.id ? "PATCH" : "POST";
      const url = editor.id
        ? `/api/admin/rental/equipment/${encodeURIComponent(editor.id)}`
        : "/api/admin/rental/equipment";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload(editor)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.details) {
          setInventoryProtection(data.details as EquipmentInventoryProtection);
        }
        throw new Error(data?.error ?? "Failed to save equipment");
      }
      const saved = (data?.equipment ?? null) as Equipment | null;
      const savedImageUrls = saved?.images ?? [];
      const removedPersistedImages = saved
        ? getUnreferencedEquipmentImages(
            Array.from(removedPersistedImagesRef.current.values())
              .filter((tracked) => tracked.sessionId === sessionId)
              .map((tracked) => tracked.image),
            savedImageUrls
          )
        : [];
      const unreferencedNewUploads = saved
        ? getUnreferencedEquipmentImages(
            Array.from(unsavedUploadsRef.current.values())
              .filter((tracked) => tracked.sessionId === sessionId)
              .map((tracked) => tracked.image),
            savedImageUrls
          )
        : [];
      const catalogueCleanupCandidates = saved
        ? [removedPersistedCatalogueRef.current, unsavedCatalogueRef.current]
            .filter((tracked): tracked is TrackedCatalogueUpload => Boolean(tracked))
            .filter((tracked) => tracked.sessionId === sessionId)
            .map((tracked) => tracked.catalogue)
            .filter((catalogue) => catalogue.storagePath !== saved.catalogueStoragePath)
        : [];
      setInventoryProtection((data?.inventoryProtection ?? null) as EquipmentInventoryProtection | null);
      await refreshInventory();
      await cleanupEquipmentImages(
        [...removedPersistedImages, ...unreferencedNewUploads],
        "saving equipment changes"
      );
      for (const catalogue of catalogueCleanupCandidates) {
        await deleteEquipmentCatalogue(catalogue, "saving equipment changes");
      }
      if (saved) {
        for (const [key, tracked] of removedPersistedImagesRef.current) {
          if (tracked.sessionId === sessionId) {
            removedPersistedImagesRef.current.delete(key);
          }
        }
        for (const [key, tracked] of unsavedUploadsRef.current) {
          if (tracked.sessionId === sessionId) {
            unsavedUploadsRef.current.delete(key);
          }
        }
        if (removedPersistedCatalogueRef.current?.sessionId === sessionId) {
          removedPersistedCatalogueRef.current = null;
        }
        if (unsavedCatalogueRef.current?.sessionId === sessionId) {
          unsavedCatalogueRef.current = null;
        }
        startNewEditorSession();
      }
      setEditor(toEditor(saved, defaultMaintenanceBufferDays));
      setDraftUploadKey("");
      setNotice(editor.id ? "Equipment updated." : "Equipment created.");
      setTab("inventory");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save equipment");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(item: Equipment, isPublished: boolean) {
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rental/equipment/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update publish state");
      await refreshInventory();
      setNotice(isPublished ? "Equipment published." : "Equipment unpublished.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to update publish state");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rental Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage DB-backed rental equipment and publish customer-facing catalog items.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshInventory} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
          <button
            type="button"
            onClick={() => { void resetEquipmentEditor(); }}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Add equipment
          </button>
        </div>
      </div>

      {(notice || warning || error) && (
        <div className={["mt-4 rounded-xl border px-4 py-3 text-sm", error ? "border-rose-200 bg-rose-50 text-rose-700" : warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"].join(" ")}>
          {error ?? warning ?? notice}
        </div>
      )}

      <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["inventory", "orders", "create"] as TabKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={["rounded-lg px-3 py-2 text-sm font-semibold", tab === key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"].join(" ")}>
            {key === "create" ? (editor.id ? "Edit equipment" : "Add equipment") : key === "orders" ? `Orders (${orders.length})` : "Inventory"}
          </button>
        ))}
      </div>

      {tab === "inventory" && (
        loading ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading inventory...</div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Pricing</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{item.title}</div><div className="text-xs text-slate-500">{item.brand ?? "-"} {item.model ? `• ${item.model}` : ""}</div></td>
                    <td className="px-4 py-3 capitalize text-slate-700">{item.category}</td>
                    <td className="px-4 py-3 text-slate-700">{item.totalUnits}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMoney(item.pricing.dayRate)} / {item.pricing.weekRate ? formatMoney(item.pricing.weekRate) : "-"} / {item.pricing.monthRate ? formatMoney(item.pricing.monthRate) : "-"}</td>
                    <td className="px-4 py-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={item.isPublished} onChange={(event) => togglePublish(item, event.target.checked)} /><span className="text-slate-700">{item.isPublished ? "Yes" : "No"}</span></label></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => { void openEquipmentForEdit(item); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-sm text-slate-500">No equipment records found.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "orders" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">Orders captured locally</div><div className="mt-2 text-2xl font-semibold text-slate-900">{orders.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">Recorded total</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(orderRevenue)}</div></div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">This tab is left unchanged for now. Production equipment truth has moved to the database.</div>
          {orders.length > 0 && <div className="mt-4 text-xs text-slate-500">Latest order captured: {orders[0]?.equipmentTitle} ({orders[0]?.start} to {orders[0]?.end})</div>}
        </div>
      )}

      {tab === "create" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{editor.id ? "Edit equipment" : "Add equipment"}</h2>
                <p className="mt-1 text-sm text-slate-600">This form writes directly to the DB-backed rental catalog.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="inline-flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={editor.isPublished} onChange={(e) => setEditor((prev) => ({ ...prev, isPublished: e.target.checked }))} />
                  <span>
                    <span className="block font-medium text-slate-700">Published</span>
                    <span className="block text-xs text-slate-500">
                      Published items appear in the customer-facing catalog. Leave unchecked to keep this equipment in draft.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              <section>
                <SectionHeader
                  title="Basic details"
                  description="Core identifying details used across admin, customer browsing, and links."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock id="equipment-title" label="Title" hint="Customer-facing equipment title used in listings and orders.">
                    <input value={editor.title} onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))} placeholder="e.g. 19ft Electric Scissor Lift" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-slug" label="Slug" hint="Optional URL slug. Leave blank to derive it from the title.">
                    <input value={editor.slug} onChange={(e) => setEditor((prev) => ({ ...prev, slug: e.target.value }))} placeholder="e.g. 19ft-electric-scissor-lift" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-category" label="Category" hint="Used for grouping and filtering in the rental catalog.">
                    <select value={editor.category} onChange={(e) => setEditor((prev) => ({ ...prev, category: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="earthmoving">Earthmoving</option><option value="lifting">Lifting</option><option value="power">Power</option><option value="concreting">Concreting</option><option value="compaction">Compaction</option><option value="cleaning">Cleaning</option></select>
                  </FieldBlock>
                  <FieldBlock id="equipment-display-order" label="Display order" hint="Lower numbers appear earlier in admin and public equipment lists.">
                    <input type="number" min={0} value={editor.displayOrder} onChange={(e) => setEditor((prev) => ({ ...prev, displayOrder: Math.max(0, Number(e.target.value || 0)) }))} placeholder="0" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-brand" label="Brand">
                    <input value={editor.brand} onChange={(e) => setEditor((prev) => ({ ...prev, brand: e.target.value }))} placeholder="e.g. Genie" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-model" label="Model">
                    <input value={editor.model} onChange={(e) => setEditor((prev) => ({ ...prev, model: e.target.value }))} placeholder="e.g. GS-1930" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-description" label="Description" hint="Short, readable description shown with the equipment record." className="sm:col-span-2">
                    <textarea value={editor.description} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Brief overview, typical use cases, and any customer-facing notes." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Rental settings"
                  description="Inventory, availability protection, rental pricing, and deposit settings."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                      <FieldBlock id="equipment-total-units" label="Total units" hint="Total rentable units. Reductions below the operational floor are blocked server-side.">
                        <input
                          type="number"
                          min={0}
                          value={editor.totalUnits}
                          onChange={(e) => setEditor((prev) => ({ ...prev, totalUnits: Math.max(0, Number(e.target.value || 0)) }))}
                          placeholder="e.g. 4"
                          className={["rounded-xl border px-3 py-2 text-sm", totalUnitsBelowFloor ? "border-rose-300 bg-rose-50" : "border-slate-200"].join(" ")}
                        />
                        {totalUnitsBelowFloor && (
                          <div className="text-xs text-rose-700">
                            This value is below the current protected minimum of {inventoryProtection?.protectedMinimum ?? 0} unit(s). The backend will reject this reduction.
                          </div>
                        )}
                      </FieldBlock>
                      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="font-semibold text-slate-900">Operational floor</div>
                        <div className="mt-1 text-slate-500">Based on current operational commitments</div>
                        {editor.id ? (
                          inventoryProtectionLoading ? (
                            <div className="mt-2">Loading current allocation summary...</div>
                          ) : inventoryProtection ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="text-2xl font-semibold text-slate-900">
                                    {inventoryProtection.currentTotalUnits}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Total Units
                                  </div>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                  <div className="text-2xl font-semibold text-emerald-900">
                                    {availableUnits ?? 0}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                                    Available Units
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="text-2xl font-semibold text-slate-900">
                                    {inventoryProtection.currentUnavailableQty}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Unavailable Units
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                                  Protected Minimum
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-amber-900">
                                  {inventoryProtection.protectedMinimum}
                                </div>
                                <div className="mt-1 text-xs text-amber-800">
                                  Total units cannot be reduced below this value.
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentHeldQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Holds
                                  </div>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentDowntimeQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Downtime
                                  </div>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentCommittedQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Committed
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2">Inventory protection details are unavailable right now.</div>
                          )
                        ) : (
                          <div className="mt-2">New equipment starts with no operational floor until it has committed allocations.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <FieldBlock id="equipment-maintenance-buffer" label="Maintenance buffer days" hint="Days kept unavailable after rental return before units are reusable.">
                    <input type="number" min={0} value={editor.maintenanceBufferDays} onChange={(e) => setEditor((prev) => ({ ...prev, maintenanceBufferDays: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 7" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Rental pricing</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Commercial values used for rental pricing, minimum terms, and deposit guidance.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock id="equipment-day-rate" label="Day rate">
                    <input type="number" min={0} value={editor.dayRate} onChange={(e) => setEditor((prev) => ({ ...prev, dayRate: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 80" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-deposit" label="Deposit amount" hint="Operational deposit amount shown in pricing and checkout flows.">
                    <input type="number" min={0} value={editor.depositAmount} onChange={(e) => setEditor((prev) => ({ ...prev, depositAmount: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 500" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-week-rate" label="Week rate">
                    <input type="number" min={0} value={editor.weekRate} onChange={(e) => setEditor((prev) => ({ ...prev, weekRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Optional" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-month-rate" label="Month rate">
                    <input type="number" min={0} value={editor.monthRate} onChange={(e) => setEditor((prev) => ({ ...prev, monthRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Optional" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-min-days" label="Minimum rental days">
                    <input type="number" min={1} value={editor.minDays} onChange={(e) => setEditor((prev) => ({ ...prev, minDays: Math.max(1, Number(e.target.value || 1)) }))} placeholder="e.g. 1" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Sales settings"
                  description="Configure whether this equipment can be bought. Sale availability remains separate from rental inventory."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <input
                      id="equipment-sale-enabled"
                      type="checkbox"
                      checked={editor.saleEnabled}
                      onChange={(event) =>
                        setEditor((previous) => ({
                          ...previous,
                          saleEnabled: event.target.checked,
                          saleStatus:
                            event.target.checked && previous.saleStatus === "not_available"
                              ? "available_for_sale"
                              : previous.saleStatus,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">Available for sale</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Enable the Buy option on the public equipment detail page.
                      </span>
                    </span>
                  </label>

                  <FieldBlock id="equipment-sale-status" label="Sale status">
                    <select
                      value={editor.saleStatus}
                      onChange={(event) =>
                        setEditor((previous) => ({
                          ...previous,
                          saleStatus: event.target.value as EquipmentSaleStatus,
                        }))
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="available_for_sale">Available for sale</option>
                      <option value="on_request">On request</option>
                      <option value="sold">Sold</option>
                      <option value="not_available">Not available</option>
                    </select>
                  </FieldBlock>

                  <FieldBlock id="equipment-sale-price-mode" label="Sale price mode">
                    <select
                      value={editor.salePriceMode}
                      onChange={(event) =>
                        setEditor((previous) => ({
                          ...previous,
                          salePriceMode: event.target.value as EquipmentSalePriceMode,
                        }))
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="fixed">Fixed price</option>
                      <option value="request_quote">Request a quote</option>
                    </select>
                  </FieldBlock>

                  {editor.salePriceMode === "fixed" ? (
                    <FieldBlock
                      id="equipment-sale-price"
                      label="Sale price (SGD)"
                      hint="Required when sales are enabled with a fixed price."
                    >
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editor.salePriceCents === "" ? "" : editor.salePriceCents / 100}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEditor((previous) => ({
                            ...previous,
                            salePriceCents:
                              value === "" ? "" : Math.max(0, Math.round(Number(value) * 100)),
                          }));
                        }}
                        placeholder="e.g. 25000.00"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </FieldBlock>
                  ) : null}

                  <FieldBlock id="equipment-sale-condition" label="Sale condition">
                    <input
                      value={editor.saleCondition}
                      onChange={(event) =>
                        setEditor((previous) => ({ ...previous, saleCondition: event.target.value }))
                      }
                      placeholder="e.g. Used - excellent condition"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </FieldBlock>

                  <FieldBlock id="equipment-sale-warranty" label="Sale warranty">
                    <input
                      value={editor.saleWarranty}
                      onChange={(event) =>
                        setEditor((previous) => ({ ...previous, saleWarranty: event.target.value }))
                      }
                      placeholder="e.g. 3-month dealer warranty"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </FieldBlock>

                  <FieldBlock
                    id="equipment-sale-notes"
                    label="Sales notes"
                    hint="Optional details shown with the Buy option."
                    className="sm:col-span-2"
                  >
                    <textarea
                      value={editor.saleNotes}
                      onChange={(event) =>
                        setEditor((previous) => ({ ...previous, saleNotes: event.target.value }))
                      }
                      rows={3}
                      placeholder="e.g. Inspection available by appointment."
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </FieldBlock>

                  <fieldset className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                    <legend className="px-1 text-sm font-medium text-slate-700">Sale fulfilment modes</legend>
                    <p className="mt-1 text-xs text-slate-500">Choose how a buyer can receive this equipment.</p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          id="equipment-sale-fulfillment-deliver"
                          type="checkbox"
                          checked={editor.saleFulfillmentDeliver}
                          onChange={(event) =>
                            setEditor((previous) => ({
                              ...previous,
                              saleFulfillmentDeliver: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Delivery
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          id="equipment-sale-fulfillment-self-collect"
                          type="checkbox"
                          checked={editor.saleFulfillmentSelfCollect}
                          onChange={(event) =>
                            setEditor((previous) => ({
                              ...previous,
                              saleFulfillmentSelfCollect: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Self-collect
                      </label>
                    </div>
                  </fieldset>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Images"
                  description={`Add up to ${MAX_EQUIPMENT_IMAGES} ordered image URLs or upload JPEG, PNG, and WebP files up to 8 MB each.`}
                />
                <div className="space-y-3">
                  {editor.images.map((image, index) => (
                    <div key={index} className="rounded-xl border border-slate-200 p-3">
                      <div className="grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
                        <div className="h-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {image.url.trim() ? (
                            <img
                              src={image.url.trim()}
                              alt={`${editor.title || "Equipment"} image ${index + 1} preview`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-400">
                              No preview
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <label
                            htmlFor={`equipment-image-url-${index}`}
                            className="text-sm font-medium text-slate-700"
                          >
                            Image URL {index + 1}
                          </label>
                          <input
                            id={`equipment-image-url-${index}`}
                            value={image.url}
                            onChange={(event) => setImageUrl(index, event.target.value)}
                            placeholder={index === 0 ? "/rental/example.jpg or https://..." : "https://..."}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => moveImageUrl(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move image ${index + 1} left`}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              Move left
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImageUrl(index, 1)}
                              disabled={index === editor.images.length - 1}
                              aria-label={`Move image ${index + 1} right`}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              Move right
                            </button>
                            <button
                              type="button"
                              onClick={() => { void removeImage(index); }}
                              aria-label={`Remove image ${index + 1}`}
                              className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={addImageUrl}
                    disabled={editor.images.length >= MAX_EQUIPMENT_IMAGES}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Add image URL
                  </button>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    {uploadingImages ? "Uploading..." : "Upload images"}
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingImages || saving}
                      className="sr-only"
                      onChange={(event) => {
                        const input = event.currentTarget;
                        uploadEquipmentImages(input.files).finally(() => {
                          input.value = "";
                        });
                      }}
                    />
                  </label>
                  <span className="text-xs text-slate-500">
                    {editor.images.filter((image) => image.url.trim()).length}/{MAX_EQUIPMENT_IMAGES} images
                  </span>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Resources"
                  description="Optional HTTP(S) catalogue and training links shown on the public equipment page."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock id="equipment-catalogue-url" label="Catalogue URL" hint="Use an HTTPS link, or upload a private PDF below.">
                    <input value={editor.catalogueUrl} onChange={(e) => { void changeCatalogueUrl(e.target.value); }} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock id="equipment-training-video-url" label="Training video URL">
                    <input value={editor.trainingVideoUrl} onChange={(e) => setEditor((prev) => ({ ...prev, trainingVideoUrl: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">Upload catalogue PDF</div>
                        <p className="mt-1 text-xs text-slate-500">PDF only, up to 20 MB. Uploaded catalogues stay private and are previewed with a temporary link.</p>
                        {editor.catalogue.storagePath ? (
                          <p className="mt-1 text-xs font-medium text-slate-700">Attached: {editor.catalogue.fileName || "catalogue.pdf"}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                          {uploadingCatalogue ? "Uploading..." : "Upload catalogue PDF"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            disabled={uploadingCatalogue || saving}
                            className="sr-only"
                            onChange={(event) => {
                              const input = event.currentTarget;
                              void uploadCataloguePdf(input.files?.[0] ?? null).finally(() => {
                                input.value = "";
                              });
                            }}
                          />
                        </label>
                        {editor.catalogue.storagePath ? (
                          <button type="button" onClick={() => { void clearCatalogueUpload(); }} disabled={uploadingCatalogue || saving} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
                            Remove uploaded PDF
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Key features"
                  description="Customer-facing equipment highlights."
                />
                <div>
                  <FieldBlock id="equipment-key-features" label="Key features" hint="One feature per line.">
                    <textarea value={editor.keyFeaturesText} onChange={(e) => setEditor((prev) => ({ ...prev, keyFeaturesText: e.target.value }))} rows={5} placeholder="Low-emission electric drive" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Applications"
                  description="Customer-facing use cases for this equipment."
                />
                <div>
                  <FieldBlock id="equipment-applications" label="Applications" hint="One application or use case per line.">
                    <textarea value={editor.applicationsText} onChange={(e) => setEditor((prev) => ({ ...prev, applicationsText: e.target.value }))} rows={5} placeholder="Indoor maintenance" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Specifications"
                  description="Structured technical details shown on the public equipment page."
                />
                <div>
                  <FieldBlock id="equipment-specifications" label="Specifications" hint="Use one line per value in the format Key: Value." className="sm:col-span-2">
                    <textarea value={editor.specsText} onChange={(e) => setEditor((prev) => ({ ...prev, specsText: e.target.value }))} rows={6} placeholder={"Working height: 7.8m\nPlatform capacity: 227kg"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={saveEquipment} disabled={saving || uploadingImages || uploadingCatalogue} className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving..." : uploadingImages || uploadingCatalogue ? "Waiting for uploads..." : editor.id ? "Save changes" : "Create equipment"}</button>
              <button type="button" onClick={() => { void resetEquipmentEditor(); }} disabled={saving} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">New entry</button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Live preview</h3>
                <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", editor.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"].join(" ")}>{editor.isPublished ? "Published" : "Draft"}</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="aspect-[4/3] bg-slate-100">{editor.images.find((image) => image.url.trim()) ? <img src={editor.images.find((image) => image.url.trim())?.url} alt={editor.title || "Preview"} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">No image</div>}</div>
                <div className="p-4">
                  <div className="text-lg font-semibold text-slate-900">{editor.title || "Equipment title"}</div>
                  <div className="mt-1 text-sm text-slate-600">{(editor.brand || "Brand") + (editor.model ? ` • ${editor.model}` : "")}</div>
                  <div className="mt-3 text-sm text-slate-600">Units: {editor.totalUnits} • Day rate: {formatMoney(editor.dayRate)}</div>
                  {editor.description.trim() && <div className="mt-3 text-xs text-slate-500">{editor.description.trim()}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



