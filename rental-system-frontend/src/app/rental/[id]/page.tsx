"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Package,
  Shield,
  Truck,
  Sparkles,
  Factory,
  MapPin,
  ShoppingCart,
  Download,
  ExternalLink,
  X,
} from "lucide-react";

import type { Equipment, EquipmentSaleSettings, EquipmentSaleStatus } from "@/lib/rental/types";
import { toSafeHttpResourceUrl } from "@/lib/rental/equipment/resource-urls";
import {
  calculateAuthoritativeRentalPricing,
  calculateRentalDaysInclusive,
} from "@/lib/rental/orders/pricing";
import {
  markSaleCartLinesSubmittedForEquipment,
  upsertSaleCartLine,
} from "@/lib/rental/cart/local-cart";
import type { RentalCustomer } from "@/lib/rental/orders/types";

type FulfillmentMode = "deliver" | "self_collect";
type DetailTab = "rent" | "buy";
type AvailabilitySnapshot = {
  totalUnits: number;
  committedQty: number;
  heldQty: number;
  downtimeQty: number;
  availableQty: number;
};
type AuthStatusResponse = {
  adminAuthenticated?: boolean;
  customer?: RentalCustomer | null;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCents(cents?: number) {
  return formatMoney(Math.max(0, Number(cents ?? 0)) / 100);
}

const defaultSaleSettings: EquipmentSaleSettings = {
  enabled: false,
  status: "not_available",
  priceMode: "request_quote",
};

function saleStatusLabel(status?: EquipmentSaleStatus) {
  switch (status) {
    case "available_for_sale":
      return "Available for sale";
    case "sold":
      return "Sold";
    case "on_request":
      return "On request";
    default:
      return "Not available";
  }
}

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toYouTubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (host === "youtube.com") {
      videoId = url.pathname.startsWith("/embed/")
        ? url.pathname.split("/")[2] ?? ""
        : url.searchParams.get("v") ?? "";
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(videoId)
      ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
      : "";
  } catch {
    return "";
  }
}

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();

  const equipmentId = (params?.id as string) ?? "";
  const todayIso = useMemo(() => todayLocalIso(), []);

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selectedImg, setSelectedImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("deliver");
  const [activeTab, setActiveTab] = useState<DetailTab>("rent");
  const [purchaseFulfillment, setPurchaseFulfillment] = useState<FulfillmentMode>("deliver");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<AvailabilitySnapshot | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [saleCustomerName, setSaleCustomerName] = useState("");
  const [saleCustomerEmail, setSaleCustomerEmail] = useState("");
  const [saleCustomerPhone, setSaleCustomerPhone] = useState("");
  const [saleCompanyName, setSaleCompanyName] = useState("");
  const [saleMessage, setSaleMessage] = useState("");
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleSubmitted, setSaleSubmitted] = useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [catalogueModalOpen, setCatalogueModalOpen] = useState(false);
  const [cataloguePreviewUrl, setCataloguePreviewUrl] = useState("");
  const [catalogueDownloadUrl, setCatalogueDownloadUrl] = useState("");
  const [cataloguePreviewLoading, setCataloguePreviewLoading] = useState(false);
  const [cataloguePreviewError, setCataloguePreviewError] = useState<string | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const deliveryFee = fulfillment === "deliver" ? 60 : 0;
  const collectionFee = fulfillment === "deliver" ? 60 : 0;

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/rental/equipment/${encodeURIComponent(equipmentId)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        setEquipment(res.ok ? ((data?.equipment ?? null) as Equipment | null) : null);
        setSelectedImg(0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    let active = true;

    fetch("/api/public/rental/auth/me", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as AuthStatusResponse;
        if (!active || !res.ok) return;
        setAdminAuthenticated(Boolean(data.adminAuthenticated));
      })
      .catch(() => {
        if (active) setAdminAuthenticated(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fulfillment === "self_collect" && deliveryAddress) {
      setDeliveryAddress("");
    }
  }, [deliveryAddress, fulfillment]);

  useEffect(() => {
    const modes = equipment?.sale?.fulfillmentModes ?? [];
    if (modes.length > 0 && !modes.includes(purchaseFulfillment)) {
      setPurchaseFulfillment(modes[0]);
    }
  }, [equipment, purchaseFulfillment]);

  useEffect(() => {
    setSaleError(null);
    setSaleSubmitted(false);
    setCartNotice(null);
    setCartError(null);
  }, [equipmentId]);

  useEffect(() => {
    if (startDate < todayIso) {
      setStartDate(todayIso);
    }
  }, [startDate, todayIso]);

  useEffect(() => {
    if (endDate < startDate) {
      setEndDate(startDate);
    }
  }, [endDate, startDate]);

  const days = useMemo(() => calculateRentalDaysInclusive(startDate, endDate), [startDate, endDate]);
  const minDays = equipment?.pricing?.minDays ?? 1;
  const dateValid = days > 0 && days >= minDays;
  const availableUnitsForRange =
    dateValid && availabilitySnapshot ? availabilitySnapshot.availableQty : equipment?.totalUnits ?? 0;

  useEffect(() => {
    setQty((prev) => Math.max(1, Math.min(prev, Math.max(1, availableUnitsForRange))));
  }, [availableUnitsForRange]);

  useEffect(() => {
    if (!equipment?.id || !dateValid) {
      setAvailabilitySnapshot(null);
      return;
    }

    let active = true;
    setAvailabilityLoading(true);
    fetch(
      `/api/public/rental/equipment/${encodeURIComponent(equipment.id)}/availability?start=${encodeURIComponent(
        startDate
      )}&end=${encodeURIComponent(endDate)}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load availability");
        setAvailabilitySnapshot((data?.snapshot ?? null) as AvailabilitySnapshot | null);
      })
      .catch(() => {
        if (active) setAvailabilitySnapshot(null);
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dateValid, endDate, equipment?.id, startDate]);

  const repricedPreview = useMemo(() => {
    if (!equipment) return null;
    try {
      return calculateAuthoritativeRentalPricing({
        equipment,
        qty,
        start: startDate,
        end: endDate,
        fulfillment,
      });
    } catch {
      return null;
    }
  }, [endDate, equipment, fulfillment, qty, startDate]);
  const deposit = repricedPreview?.pricingSnapshot.deposit ?? equipment?.pricing?.deposit ?? 0;
  const rentalSubtotal = repricedPreview?.pricingSnapshot.rentalSubtotal ?? 0;

  const total = useMemo(() => {
    return rentalSubtotal + deliveryFee + collectionFee + deposit;
  }, [collectionFee, deliveryFee, deposit, rentalSubtotal]);

  const inStock = availableUnitsForRange > 0;
  const qtyValid = qty >= 1 && qty <= availableUnitsForRange;
  const addressRequired = fulfillment === "deliver";
  const addressValid = !addressRequired || deliveryAddress.trim().length >= 8;

  const canProceed = !!equipment && !adminAuthenticated && inStock && dateValid && qtyValid && addressValid;

  function handleProceed() {
    if (!equipment || !canProceed) return;

    const qp = new URLSearchParams();
    qp.set("equipmentId", equipment.id);
    qp.set("qty", String(qty));
    qp.set("start", startDate);
    qp.set("end", endDate);
    qp.set("fulfillment", fulfillment);
    if (fulfillment === "deliver") qp.set("address", deliveryAddress.trim());
    router.push(`/rental/checkout?${qp.toString()}`);
  }

  function selectPreviousImage() {
    const imageCount = equipment?.images?.length ?? 0;
    if (!imageCount) return;
    setSelectedImg((current) => (current - 1 + imageCount) % imageCount);
  }

  async function openCatalogueModal() {
    if (!equipment) return;
    setCatalogueModalOpen(true);
    setCataloguePreviewError(null);
    setCataloguePreviewUrl("");
    setCatalogueDownloadUrl("");
    if (!equipment.catalogueStoragePath) return;

    setCataloguePreviewLoading(true);
    try {
      const response = await fetch(
        `/api/public/rental/equipment/${encodeURIComponent(equipment.id)}/catalogue`,
        { credentials: "include" }
      );
      const data = (await response.json().catch(() => ({}))) as { signedUrl?: unknown; downloadUrl?: unknown; error?: unknown };
      if (!response.ok || typeof data.signedUrl !== "string" || typeof data.downloadUrl !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Catalogue preview is unavailable.");
      }
      setCataloguePreviewUrl(data.signedUrl);
      setCatalogueDownloadUrl(data.downloadUrl);
    } catch (error) {
      setCataloguePreviewError(
        error instanceof Error ? error.message : "Catalogue preview is unavailable."
      );
    } finally {
      setCataloguePreviewLoading(false);
    }
  }

  function closeCatalogueModal() {
    setCatalogueModalOpen(false);
    setCataloguePreviewUrl("");
    setCatalogueDownloadUrl("");
    setCataloguePreviewError(null);
  }

  function closeVideoModal() {
    setVideoModalOpen(false);
  }

  useEffect(() => {
    if (!catalogueModalOpen && !videoModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeCatalogueModal();
      closeVideoModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [catalogueModalOpen, videoModalOpen]);

  function selectNextImage() {
    const imageCount = equipment?.images?.length ?? 0;
    if (!imageCount) return;
    setSelectedImg((current) => (current + 1) % imageCount);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading equipment...
        </div>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Not found</h1>
            <p className="mt-1 text-sm text-slate-600">
              This equipment does not exist or is no longer published.
            </p>
          </div>
          <Link
            href="/rental"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  const heroImg = equipment.images?.[selectedImg] ?? equipment.images?.[0] ?? "";
  const safeCatalogueUrl = toSafeHttpResourceUrl(equipment.catalogueUrl);
  const hasCatalogue = Boolean(safeCatalogueUrl || equipment.catalogueStoragePath);
  const catalogueModalUrl = cataloguePreviewUrl || safeCatalogueUrl;
  const safeTrainingUrl = toSafeHttpResourceUrl(equipment.trainingVideoUrl);
  const youTubeEmbedUrl = safeTrainingUrl ? toYouTubeEmbedUrl(safeTrainingUrl) : "";
  const showGalleryControls = equipment.images.length >= 5;
  const sale = equipment.sale ?? defaultSaleSettings;
  const saleFulfillmentModes = sale.fulfillmentModes ?? [];
  const saleStatus = sale.enabled ? sale.status : "not_available";
  const saleAvailable = saleStatus === "available_for_sale";
  const saleOnRequest = saleStatus === "on_request";
  const saleSold = saleStatus === "sold";
  const saleEnquiryAllowed = saleAvailable || saleOnRequest;
  const salePriceLabel =
    saleSold
      ? "Sold"
      : sale.priceMode === "fixed" && sale.priceCents !== undefined
        ? formatCents(sale.priceCents)
        : "Request quote";
  const salePriceDisplay = saleEnquiryAllowed || saleSold ? salePriceLabel : "Not available";
  const saleCtaLabel = saleAvailable
    ? "Request purchase confirmation"
    : saleOnRequest
      ? "Submit purchase enquiry"
      : saleSold
        ? "Sold"
        : "Purchase unavailable";
  const saleAccentClass = saleAvailable
    ? "text-amber-700"
    : saleOnRequest
      ? "text-orange-700"
      : saleSold
        ? "text-rose-700"
        : "text-slate-500";
  const salePanelClass = saleAvailable
    ? "border-amber-200 bg-amber-50"
    : saleOnRequest
      ? "border-orange-200 bg-orange-50"
      : saleSold
        ? "border-rose-200 bg-rose-50"
        : "border-slate-200 bg-slate-50";

  function handleAddSaleToCart() {
    if (!equipment || !saleEnquiryAllowed) return;

    try {
      const result = upsertSaleCartLine({
        type: "sale",
        equipmentId: equipment.id,
        equipmentSlug: equipment.slug,
        titleSnapshot: equipment.title,
        imageUrlSnapshot: heroImg || equipment.imageUrl,
        saleStatusSnapshot: saleStatus,
        salePriceModeSnapshot: sale.priceMode,
        salePriceCentsSnapshot: sale.priceCents,
        saleConditionSnapshot: sale.condition,
        saleWarrantySnapshot: sale.warranty,
        fulfillmentPreference: saleFulfillmentModes.length > 0 ? purchaseFulfillment : undefined,
        message: saleMessage.trim() || undefined,
      });
      setCartError(null);
      setCartNotice(
        result.status === "submitted_exists"
          ? "A sale enquiry for this equipment was already submitted from your cart."
          : result.status === "updated"
            ? "Existing sale enquiry cart item updated."
            : "Sale enquiry item added to cart."
      );
    } catch {
      setCartNotice(null);
      setCartError("Unable to add sale enquiry item to cart on this device.");
    }
  }

  async function handleSaleEnquirySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!equipment || saleSubmitting || !saleEnquiryAllowed) return;

    const customerName = saleCustomerName.trim();
    const customerEmail = saleCustomerEmail.trim();
    if (!customerName || !customerEmail) {
      setSaleError("Name and email are required.");
      return;
    }

    try {
      setSaleSubmitting(true);
      setSaleError(null);
      const res = await fetch(
        `/api/public/rental/equipment/${encodeURIComponent(equipment.id)}/sale-enquiry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName,
            customerEmail,
            customerPhone: saleCustomerPhone.trim() || null,
            companyName: saleCompanyName.trim() || null,
            fulfillmentPreference:
              saleFulfillmentModes.length > 0 ? purchaseFulfillment : null,
            message: saleMessage.trim() || null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Unable to submit purchase enquiry");
      const enquiryId = typeof data?.enquiry?.id === "string" ? data.enquiry.id : undefined;
      markSaleCartLinesSubmittedForEquipment({
        equipmentId: equipment.id,
        enquiryId,
        enquirySubmittedAt: new Date().toISOString(),
      });
      setSaleSubmitted(true);
      setSaleMessage("");
    } catch (error) {
      setSaleError(error instanceof Error ? error.message : "Unable to submit purchase enquiry");
    } finally {
      setSaleSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Equipment Rental
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {equipment.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {equipment.brand ?? "-"}
            {equipment.model ? ` | ${equipment.model}` : ""}
          </p>
        </div>

        <Link
          href="/rental"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-[16/10] w-full bg-slate-100">
              {heroImg ? (
                <img
                  src={heroImg}
                  alt={equipment.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <Package className="h-10 w-10" />
                </div>
              )}

              {showGalleryControls && (
                <>
                  <button
                    type="button"
                    onClick={selectPreviousImage}
                    aria-label="Show previous equipment image"
                    className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={selectNextImage}
                    aria-label="Show next equipment image"
                    className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            {equipment.images?.length > 1 && (
              <div
                className="flex gap-2 overflow-x-auto border-t border-slate-200 p-3"
                role="group"
                aria-label="Equipment image thumbnails"
              >
                {equipment.images.map((url, idx) => {
                  const active = idx === selectedImg;
                  return (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => setSelectedImg(idx)}
                      aria-pressed={active}
                      className={[
                        "h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2",
                        active
                          ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                          : "border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                      aria-label={`Select image ${idx + 1}`}
                    >
                      <img
                        src={url}
                        alt={`${equipment.title} ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
              <p className="mt-2 text-sm text-slate-600">
                {equipment.description || equipment.shortDesc}
              </p>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#D24338]" />
                  {inStock
                    ? dateValid
                      ? `${availableUnitsForRange} unit(s) available for ${startDate} to ${endDate}`
                      : `${availableUnitsForRange} unit(s) in catalog inventory`
                    : "Out of stock"}
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  Min rental: {minDays} day(s)
                </div>
                {deposit > 0 && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-slate-500" />
                    Deposit: {formatMoney(deposit)} (refundable)
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#2A2A2A]">Specifications</h2>
              <div className="mt-3 space-y-2">
                {Object.entries(equipment.specs ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[#F2C7C2] bg-[#FFF6F4] px-3 py-2"
                  >
                    <div className="text-xs font-medium text-[#8A453F]">{k}</div>
                    <div className="text-xs text-slate-900">{v}</div>
                  </div>
                ))}
                {Object.keys(equipment.specs ?? {}).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No specs provided yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Resources</h2>
              <p className="mt-1 text-xs text-slate-500">
                Optional supporting references for operators and planners.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {hasCatalogue ? (
                <button
                  type="button"
                  onClick={() => { void openCatalogueModal(); }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <Package className="h-4 w-4 text-slate-700" />
                  Open catalogue
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                >
                  <Package className="h-4 w-4 text-slate-300" />
                  Catalogue unavailable
                </button>
              )}

              {safeTrainingUrl ? (
                <button
                  type="button"
                  onClick={() => setVideoModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <Sparkles className="h-4 w-4 text-slate-700" />
                  Watch training video
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                >
                  <Sparkles className="h-4 w-4 text-slate-300" />
                  Training video unavailable
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-[#D24338]" />
                  Key features
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.keyFeatures?.length
                    ? equipment.keyFeatures
                    : [
                        "Transparent tiered pricing (day / week / month)",
                        "Delivery and collection or self-collect",
                        "Refundable deposit where applicable",
                      ]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#D24338]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:border-l md:border-slate-200 md:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Factory className="h-4 w-4 text-[#D24338]" />
                  Applications
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.applications?.length
                    ? equipment.applications
                    : [
                        "Construction and renovation works",
                        "Events and temporary site setup",
                        "Maintenance and facility operations",
                      ]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#D24338]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(["rent", "buy"] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  aria-pressed={activeTab === tab}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200",
                    activeTab === tab
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  {tab === "rent" ? "Rent" : "Buy"}
                </button>
              ))}
            </div>

            <div className={activeTab === "rent" ? "mt-4" : "mt-4 hidden"}>
            <h2 className="text-sm font-semibold text-[#2A2A2A]">
              Create rental booking
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Final availability is checked and locked server-side when checkout begins.
            </p>

            <div className="mt-4 rounded-xl border border-[#F2C7C2] bg-[#FFF6F4] p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-slate-500">From</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatMoney(equipment.pricing.dayRate)}
                  <span className="text-xs font-medium text-slate-500">/day</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Day</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatMoney(equipment.pricing.dayRate)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Week</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.weekRate ? formatMoney(equipment.pricing.weekRate) : "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Month</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.monthRate ? formatMoney(equipment.pricing.monthRate) : "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-700">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={todayIso}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || todayIso}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                  />
                </div>
              </div>

              {!dateValid && (
                <p className="text-xs text-rose-600">
                  Please select a valid date range (min {minDays} day(s)).
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, availableUnitsForRange)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                />
                <div className="mt-1 text-xs text-slate-500">
                  {dateValid ? "Available for selected dates:" : "Current catalog units:"}{" "}
                  <span className="font-semibold text-slate-700">{availableUnitsForRange}</span>
                </div>
                {availabilityLoading && (
                  <div className="mt-1 inline-flex items-center gap-2 text-xs text-slate-500">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#D24338]" />
                    Checking server availability...
                  </div>
                )}
                {!qtyValid && (
                  <p className="mt-1 text-xs text-rose-600">
                    Quantity exceeds available inventory.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Fulfillment</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillment("deliver")}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                      fulfillment === "deliver"
                        ? "border-[#D24338] bg-[#D24338] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#F2C7C2] hover:bg-[#FFF6F4]",
                    ].join(" ")}
                  >
                    <Truck className="h-4 w-4" />
                    Deliver
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillment("self_collect")}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                      fulfillment === "self_collect"
                        ? "border-[#D24338] bg-[#D24338] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#F2C7C2] hover:bg-[#FFF6F4]",
                    ].join(" ")}
                  >
                    <Package className="h-4 w-4" />
                    Self-collect
                  </button>
                </div>

                {fulfillment === "deliver" ? (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-slate-700">
                      Delivery address <span className="text-rose-600">*</span>
                    </label>
                    <div className="mt-1 relative">
                      <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="e.g. 10 Ubi Crescent, #05-12, Singapore 408564"
                        className={[
                          "w-full rounded-xl border bg-white py-2 pl-9 pr-3 text-sm outline-none",
                          addressValid
                            ? "border-slate-200 focus:border-[#D24338]"
                            : "border-rose-300 focus:border-rose-400",
                        ].join(" ")}
                      />
                    </div>
                    {!addressValid && (
                      <p className="mt-1 text-xs text-rose-600">
                        Please enter a delivery address to proceed.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Warehouse pickup details will be confirmed at checkout.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Price estimate
                </div>
                <div className="text-xs text-slate-500">
                  {days > 0 ? `${days} day(s)` : "-"}
                </div>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Rental subtotal</span>
                  <span className="font-semibold text-slate-900">{formatMoney(rentalSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Delivery fee</span>
                  <span className="text-slate-900">{formatMoney(deliveryFee)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Collection fee</span>
                  <span className="text-slate-900">{formatMoney(collectionFee)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Deposit (refundable)</span>
                  <span className="text-slate-900">{formatMoney(deposit)}</span>
                </div>

                <div className="mt-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Total</span>
                    <span className="font-semibold text-slate-900">{formatMoney(total)}</span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Final inventory and temporary checkout hold are enforced on the server.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleProceed}
              disabled={!canProceed}
              className={[
                "mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                canProceed
                  ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              ].join(" ")}
            >
              {adminAuthenticated ? "Customer checkout only" : "Proceed to checkout"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>

            {adminAuthenticated && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Checkout is only available for customer accounts. Admin sessions may browse public equipment but cannot continue through customer checkout.
              </div>
            )}

            {!inStock && (
              <p className="mt-2 text-xs text-rose-600">
                This equipment is currently out of stock.
              </p>
            )}
            </div>

            <div className={activeTab === "buy" ? "mt-4" : "mt-4 hidden"}>
              <h2 className="text-sm font-semibold text-[#2A2A2A]">Purchase enquiry</h2>
              <p className="mt-1 text-xs text-slate-500">
                Sale stock is manually confirmed by our team before any purchase can proceed.
              </p>

              <div className={["mt-4 rounded-xl border p-4", salePanelClass].join(" ")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={["text-xs font-semibold uppercase tracking-wide", saleAccentClass].join(" ")}>Sale status</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{saleStatusLabel(saleStatus)}</div>
                  </div>
                  <div className="text-right">
                    <div className={["text-xs", saleAccentClass].join(" ")}>Price</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{salePriceDisplay}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</div>
                  <div className="mt-1 text-slate-800">{sale.condition ?? "To be confirmed"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty</div>
                  <div className="mt-1 text-slate-800">{sale.warranty ?? "To be confirmed"}</div>
                </div>
                {sale.notes && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales notes</div>
                    <div className="mt-1 text-slate-700">{sale.notes}</div>
                  </div>
                )}
                {saleEnquiryAllowed && saleFulfillmentModes.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-700">Fulfillment</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {saleFulfillmentModes.includes("deliver") && (
                        <button type="button" onClick={() => setPurchaseFulfillment("deliver")} className={["inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold", purchaseFulfillment === "deliver" ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50"].join(" ")}>
                          <Truck className="h-4 w-4" />Delivery
                        </button>
                      )}
                      {saleFulfillmentModes.includes("self_collect") && (
                        <button type="button" onClick={() => setPurchaseFulfillment("self_collect")} className={["inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold", purchaseFulfillment === "self_collect" ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50"].join(" ")}>
                          <Package className="h-4 w-4" />Self-collect
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {saleEnquiryAllowed ? (
                saleSubmitted ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <div className="font-semibold">Purchase enquiry submitted.</div>
                    <p className="mt-1">Our team will confirm sale availability and final pricing before any payment can proceed.</p>
                  </div>
                ) : (
                  <form className="mt-4 space-y-3" onSubmit={handleSaleEnquirySubmit}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-700">Name <span className="sr-only">required</span><input type="text" value={saleCustomerName} onChange={(event) => setSaleCustomerName(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400" required /></label>
                      <label className="grid gap-1 text-xs font-medium text-slate-700">Email <span className="sr-only">required</span><input type="email" value={saleCustomerEmail} onChange={(event) => setSaleCustomerEmail(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400" required /></label>
                      <label className="grid gap-1 text-xs font-medium text-slate-700">Phone<input type="tel" value={saleCustomerPhone} onChange={(event) => setSaleCustomerPhone(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400" /></label>
                      <label className="grid gap-1 text-xs font-medium text-slate-700">Company<input type="text" value={saleCompanyName} onChange={(event) => setSaleCompanyName(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400" /></label>
                    </div>
                    <label className="grid gap-1 text-xs font-medium text-slate-700">Message<textarea value={saleMessage} onChange={(event) => setSaleMessage(event.target.value)} rows={3} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400" placeholder="Tell us your preferred timing, usage context, or inspection questions." /></label>
                    {saleError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{saleError}</div>}
                    <button type="button" onClick={handleAddSaleToCart} className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"><ShoppingCart className="mr-2 h-4 w-4" />Add sale enquiry to cart</button>
                    {cartNotice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{cartNotice} <Link href="/rental/cart" className="font-semibold underline">View cart</Link></div>}
                    {cartError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{cartError}</div>}
                    <button type="submit" disabled={saleSubmitting} className="inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300">{saleSubmitting ? "Submitting..." : saleCtaLabel}</button>
                    <p className="text-xs text-slate-500">This sends an enquiry only. Sale payment is unavailable until admin confirms stock and final price.</p>
                  </form>
                )
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  {saleSold ? "This equipment is sold and cannot accept purchase enquiries." : "This equipment is not available for purchase enquiries."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {catalogueModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCatalogueModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalogue-modal-title"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="catalogue-modal-title" className="text-base font-semibold text-slate-900">Equipment catalogue</h2>
                <p className="mt-1 text-xs text-slate-500">Preview the catalogue, or open it in a new tab if your browser blocks embedding.</p>
              </div>
              <button type="button" onClick={closeCatalogueModal} aria-label="Close catalogue preview" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-[22rem] flex-1 bg-slate-100 p-4">
              {cataloguePreviewLoading ? (
                <div className="flex h-full min-h-[22rem] items-center justify-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" />Loading catalogue preview…</div>
              ) : cataloguePreviewError ? (
                <div className="flex h-full min-h-[22rem] items-center justify-center text-center text-sm text-slate-600">{cataloguePreviewError}</div>
              ) : catalogueModalUrl ? (
                <div className="space-y-2">
                  <iframe src={catalogueModalUrl} title="Equipment catalogue PDF preview" className="h-[65vh] min-h-[22rem] w-full rounded-lg border border-slate-200 bg-white" />
                  <p className="text-xs text-slate-500">If this external catalogue does not display in the preview, use Open in new tab below.</p>
                </div>
              ) : (
                <div className="flex h-full min-h-[22rem] items-center justify-center text-center text-sm text-slate-600">This external catalogue cannot be previewed here. Open it in a new tab instead.</div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              {catalogueModalUrl ? (
                <>
                  <a href={catalogueDownloadUrl || catalogueModalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Download PDF</a>
                  <a href={catalogueModalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Open in new tab</a>
                </>
              ) : null}
              <button type="button" onClick={closeCatalogueModal} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {videoModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeVideoModal();
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="training-video-modal-title" className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="training-video-modal-title" className="text-base font-semibold text-slate-900">Training video</h2>
                <p className="mt-1 text-xs text-slate-500">Close this window to stop playback.</p>
              </div>
              <button type="button" onClick={closeVideoModal} aria-label="Close training video" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="bg-slate-950 p-4">
              {youTubeEmbedUrl ? (
                <iframe src={youTubeEmbedUrl} title="Equipment training video" className="aspect-video w-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ) : (
                <div className="flex aspect-video items-center justify-center p-8 text-center text-sm text-slate-200">This training video is not hosted on YouTube, so it cannot be embedded here.</div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              {safeTrainingUrl ? <a href={safeTrainingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Open in new tab</a> : null}
              <button type="button" onClick={closeVideoModal} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
