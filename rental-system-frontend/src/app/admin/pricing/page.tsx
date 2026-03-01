// src/app/admin/pricing/page.tsx
"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

type VehicleKey = "motorcycle" | "car" | "van" | "lorry";

type VehicleMultiplierConfig = {
  multiplier: number; // e.g. 1.0, 1.2, 1.5, 2.0
  extraCents: number; // extra flat fee per job, in cents
};

type WeightBand = {
  minKg: number;
  maxKg: number | null; // null = open-ended (and above)
  priceCents: number;
};

type PeakHourWindow = {
  startHour: number; // 0–23
  endHour: number;   // 0–23, end > start
  surchargeCents: number;
};

type CategorySurchargeMap = Record<string, number>; // cents per category

type PricingConfig = {
  id: string;
  baseDistanceKm: number;
  baseFeeCents: number;
  perKmRateCents: number;
  longHaulThresholdKm: number;
  longHaulPerKmRateCents: number;
  additionalStopFeeCents: number;
  currency: string;
  vehicleMultipliers?: Record<VehicleKey, VehicleMultiplierConfig>;
  categorySurcharges?: CategorySurchargeMap;
  weightBands?: WeightBand[];
  peakHourWindows?: PeakHourWindow[];
  adHocServiceFeeCents?: number;       // “3-Hour Express” / ad hoc jobs
  specialHandlingFeeCents?: number;    // any job with special-handling items
};

type PreviewQuoteState = {
  vehicleType: VehicleKey;
  itemCategory: string;
  actualWeightKg: number;
  approximateDistanceKm: number;
  stopsCount: number;
};

type PreviewQuoteResult = {
  currency: string;
  totalPriceCents: number;
  totalDistanceKm: number;
  breakdown: {
    baseFeeCents: number;
    distanceKm: number;
    distanceChargeCents: number;
    weightChargeCents: number;
    categorySurchargeCents: number;
    vehicleSurchargeCents: number;
    peakHourSurchargeCents: number;
    multiStopChargeCents: number;
    manualAddOnCents: number;
  };
};

// sensible defaults if DB has null/undefined
const defaultVehicleMultipliers: Record<VehicleKey, VehicleMultiplierConfig> = {
  motorcycle: { multiplier: 1.0, extraCents: 0 },
  car: { multiplier: 1.2, extraCents: 300 },   // $3
  van: { multiplier: 1.5, extraCents: 800 },   // $8
  lorry: { multiplier: 2.0, extraCents: 1500 } // $15
};

const defaultCategorySurcharges: CategorySurchargeMap = {
  Document: 0,
  Parcel: 0,
  Fragile: 300,      // $3
  Oversized: 1000,   // $10
  Electronics: 200,  // $2
  "Food / Perishable": 0,
  Liquid: 0,
  Other: 0,
};

const defaultWeightBands: WeightBand[] = [
  { minKg: 0, maxKg: 1, priceCents: 500 },   // $5
  { minKg: 1, maxKg: 3, priceCents: 700 },   // $7
  { minKg: 3, maxKg: 5, priceCents: 1000 },  // $10
];

const defaultPeakHourWindows: PeakHourWindow[] = [
  { startHour: 8, endHour: 10, surchargeCents: 300 },  // $3 morning
  { startHour: 17, endHour: 20, surchargeCents: 300 }, // $3 evening
];



export default function AdminPricingPage() {
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Preview quote state
  const [preview, setPreview] = useState<PreviewQuoteState>({
    vehicleType: "motorcycle",
    itemCategory: "Parcel",
    actualWeightKg: 2,
    approximateDistanceKm: 10,
    stopsCount: 2,
  });
  const [previewResult, setPreviewResult] =
    useState<PreviewQuoteResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ─────────────────────────────────────────────
  // Helpers: cents ↔ dollars
  // ─────────────────────────────────────────────
  const centsToDollars = (cents: number | null | undefined) =>
    ((cents ?? 0) / 100).toString();

  const dollarsToCents = (value: string) =>
    Math.round((Number(value) || 0) * 100);

  // ─────────────────────────────────────────────
  // Load config
  // ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/admin/pricing`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch pricing config: ${res.status}`);
        }
        const data = await res.json();
        setConfig(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load pricing config");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // change for baseDistanceKm, longHaulThresholdKm, currency
  const handleBasicChange = (field: keyof PricingConfig, value: string) => {
    if (!config) return;
    if (field === "currency") {
      setConfig({ ...config, currency: value });
      return;
    }

    const kmFields: (keyof PricingConfig)[] = [
      "baseDistanceKm",
      "longHaulThresholdKm",
    ];

    if (kmFields.includes(field)) {
      setConfig({
        ...config,
        [field]: Number(value),
      } as PricingConfig);
    }
  };

  

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseDistanceKm: config.baseDistanceKm,
          baseFeeCents: config.baseFeeCents,
          perKmRateCents: config.perKmRateCents,
          longHaulThresholdKm: config.longHaulThresholdKm,
          longHaulPerKmRateCents: config.longHaulPerKmRateCents,
          additionalStopFeeCents: config.additionalStopFeeCents,
          currency: config.currency,
          vehicleMultipliers: config.vehicleMultipliers,
          categorySurcharges: config.categorySurcharges,
          weightBands: config.weightBands,
          peakHourWindows: config.peakHourWindows,

          adHocServiceFeeCents: config.adHocServiceFeeCents ?? 0,
          specialHandlingFeeCents: config.specialHandlingFeeCents ?? 0,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to save: ${res.status} ${text}`);
      }
      const data = await res.json();
      setConfig(data);
      setMessage("Pricing configuration saved.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save pricing configuration");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // Preview helpers
  // ─────────────────────────────────────────────
  const handlePreviewChange = <K extends keyof PreviewQuoteState>(
    field: K,
    value: string,
  ) => {
    setPreview((prev) => {
      if (
        field === "actualWeightKg" ||
        field === "approximateDistanceKm" ||
        field === "stopsCount"
      ) {
        return { ...prev, [field]: Number(value) } as PreviewQuoteState;
      }
      return { ...prev, [field]: value } as PreviewQuoteState;
    });
  };

  const runPreviewQuote = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);

    try {
      // Build synthetic stops from approximate distance & stopsCount
      const baseLat = 1.3521;
      const baseLng = 103.8198;
      const { approximateDistanceKm, stopsCount } = preview;

      const safeStopsCount = Math.max(2, Math.floor(stopsCount) || 2);
      const distancePerLeg = approximateDistanceKm / (safeStopsCount - 1 || 1);
      const degreesPerKm = 1 / 111; // approx near equator

      const stops = Array.from({ length: safeStopsCount }).map((_, index) => {
        const offsetKm = distancePerLeg * index;
        const deltaLat = offsetKm * degreesPerKm;
        return {
          latitude: baseLat + deltaLat,
          longitude: baseLng,
          type: index === 0 ? "pickup" : "delivery",
        };
      });

      const body = {
        vehicleType: preview.vehicleType,
        itemCategory: preview.itemCategory || "Parcel",
        actualWeightKg: preview.actualWeightKg || 1,
        pickupDateTime: new Date().toISOString(),
        stops,
      };

      const res = await fetch(`${API_BASE_URL}/pricing/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Preview quote failed: ${res.status} ${res.statusText} ${text}`,
        );
      }

      const data = (await res.json()) as PreviewQuoteResult;
      setPreviewResult(data);
    } catch (err: any) {
      console.error("[AdminPricing] preview quote error", err);
      setPreviewError(err?.message ?? "Failed to calculate preview quote");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  if (loading) {
    return <div className="p-6">Loading pricing configuration...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Error loading pricing configuration: {error}
      </div>
    );
  }

  if (!config) {
    return <div className="p-6">No pricing configuration found.</div>;
  }

  const formatCurrency = (cents: number) =>
    `${config.currency} ${(cents / 100).toFixed(2)}`;

  // Normalised nested configs
  const vehicleMultipliers: Record<VehicleKey, VehicleMultiplierConfig> = {
    ...defaultVehicleMultipliers,
    ...(config.vehicleMultipliers ?? {}),
  };

  const categorySurcharges: CategorySurchargeMap = {
    ...defaultCategorySurcharges,
    ...(config.categorySurcharges ?? {}),
  };

  const weightBands: WeightBand[] =
    config.weightBands && config.weightBands.length > 0
      ? config.weightBands
      : defaultWeightBands;

  const peakHourWindows: PeakHourWindow[] =
    config.peakHourWindows && config.peakHourWindows.length > 0
      ? config.peakHourWindows
      : defaultPeakHourWindows;

  // convenience updaters for nested structures
  const updateVehicle = (key: VehicleKey, patch: Partial<VehicleMultiplierConfig>) => {
    const updated = {
      ...vehicleMultipliers,
      [key]: {
        ...vehicleMultipliers[key],
        ...patch,
      },
    };
    setConfig({ ...config, vehicleMultipliers: updated });
  };

  const updateCategory = (category: string, cents: number) => {
    const updated: CategorySurchargeMap = {
      ...categorySurcharges,
      [category]: cents,
    };
    setConfig({ ...config, categorySurcharges: updated });
  };

  const removeCategory = (category: string) => {
    const clone: CategorySurchargeMap = { ...categorySurcharges };
    delete clone[category];
    setConfig({ ...config, categorySurcharges: clone });
  };

  const updateWeightBand = (index: number, patch: Partial<WeightBand>) => {
    const copy = [...weightBands];
    copy[index] = { ...copy[index], ...patch };
    setConfig({ ...config, weightBands: copy });
  };

  const addWeightBand = () => {
    const last = weightBands[weightBands.length - 1];
    const newBand: WeightBand = {
      minKg: last ? (last.maxKg ?? last.minKg + 1) : 0,
      maxKg: null,
      priceCents: 0,
    };
    const copy = [...weightBands];

    // ensure previous last has a maxKg if it was null
    if (last && last.maxKg == null) {
      copy[copy.length - 1] = { ...last, maxKg: newBand.minKg };
    }

    copy.push(newBand);
    setConfig({ ...config, weightBands: copy });
  };

  const removeWeightBand = (index: number) => {
    const copy = [...weightBands];
    copy.splice(index, 1);
    setConfig({ ...config, weightBands: copy });
  };

  const updatePeakWindow = (index: number, patch: Partial<PeakHourWindow>) => {
    const copy = [...peakHourWindows];
    copy[index] = { ...copy[index], ...patch };
    setConfig({ ...config, peakHourWindows: copy });
  };

  const addPeakWindow = () => {
    const newWindow: PeakHourWindow = {
      startHour: 12,
      endHour: 14,
      surchargeCents: 0,
    };
    setConfig({ ...config, peakHourWindows: [...peakHourWindows, newWindow] });
  };

  const removePeakWindow = (index: number) => {
    const copy = [...peakHourWindows];
    copy.splice(index, 1);
    setConfig({ ...config, peakHourWindows: copy });
  };

  const handleAddCategoryRow = () => {
    const name = prompt("New category name (e.g. 'Bulky Furniture'):");
    if (!name) return;
    if (categorySurcharges[name]) return;
    updateCategory(name, 0);
  };

  const adHocFeeCents = config.adHocServiceFeeCents ?? 0;
  const specialHandlingFeeCents = config.specialHandlingFeeCents ?? 0;


  // ─────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Pricing Configuration</h1>

      {message && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Distance pricing */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="text-lg font-medium">1. Distance Pricing</h2>
        <p className="text-xs text-slate-500">
          Base fee covers the first X km, then per-km charges apply. Long-haul
          rate can be cheaper for very long distances.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span>Base distance (km)</span>
            <input
              type="number"
              step={0.1}
              value={config.baseDistanceKm}
              onChange={(e) =>
                handleBasicChange("baseDistanceKm", e.target.value)
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Base fee ({config.currency})</span>
            <input
              type="number"
              step={0.1}
              value={centsToDollars(config.baseFeeCents)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  baseFeeCents: dollarsToCents(e.target.value),
                })
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Per km rate after base ({config.currency})</span>
            <input
              type="number"
              step={0.1}
              value={centsToDollars(config.perKmRateCents)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  perKmRateCents: dollarsToCents(e.target.value),
                })
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Long-haul threshold (km)</span>
            <input
              type="number"
              step={0.1}
              value={config.longHaulThresholdKm}
              onChange={(e) =>
                handleBasicChange("longHaulThresholdKm", e.target.value)
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Long-haul per km ({config.currency})</span>
            <input
              type="number"
              step={0.1}
              value={centsToDollars(config.longHaulPerKmRateCents)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  longHaulPerKmRateCents: dollarsToCents(e.target.value),
                })
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Additional stop fee ({config.currency})</span>
            <input
              type="number"
              step={0.1}
              value={centsToDollars(config.additionalStopFeeCents)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  additionalStopFeeCents: dollarsToCents(e.target.value),
                })
              }
              className="border rounded px-2 py-1"
            />
            <span className="text-[11px] text-slate-500">
              Charged for each stop beyond pickup + first delivery.
            </span>
          </label>
        </div>
      </section>

      {/* Vehicle pricing */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="text-lg font-medium">2. Vehicle Pricing</h2>
        <p className="text-xs text-slate-500 mb-2">
          Multipliers scale the distance component; extra fee is a flat add-on
          per job for that vehicle.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border border-slate-200 rounded-md">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Vehicle
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Base multiplier
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Extra per job ({config.currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(vehicleMultipliers) as VehicleKey[]).map(
                (key) => (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="px-3 py-2 capitalize">
                      {key === "motorcycle" ? "Motorcycle" : key}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step={0.1}
                        value={vehicleMultipliers[key].multiplier}
                        onChange={(e) =>
                          updateVehicle(key, {
                            multiplier: Number(e.target.value),
                          })
                        }
                        className="border rounded px-2 py-1 w-24"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step={0.1}
                        value={centsToDollars(
                          vehicleMultipliers[key].extraCents,
                        )}
                        onChange={(e) =>
                          updateVehicle(key, {
                            extraCents: dollarsToCents(e.target.value),
                          })
                        }
                        className="border rounded px-2 py-1 w-24"
                      />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Category surcharges */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">3. Category Surcharges</h2>
          <button
            type="button"
            onClick={handleAddCategoryRow}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            + Add category
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Extra fee per booking based on item category (fragile, oversized,
          etc).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border border-slate-200 rounded-md">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Category
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Surcharge ({config.currency})
                </th>
                <th className="px-3 py-2 text-right font-semibold border-b">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categorySurcharges).map(
                ([category, cents]) => (
                  <tr key={category} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <span className="text-[11px]">{category}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step={0.1}
                        value={centsToDollars(cents)}
                        onChange={(e) =>
                          updateCategory(category, dollarsToCents(e.target.value))
                        }
                        className="border rounded px-2 py-1 w-24"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!(category in defaultCategorySurcharges) && (
                        <button
                          type="button"
                          onClick={() => removeCategory(category)}
                          className="text-[11px] text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weight bands */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">4. Weight Bands</h2>
          <button
            type="button"
            onClick={addWeightBand}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            + Add band
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Flat fee per booking based on chargeable weight. The engine picks the
          first band where weight falls between min &amp; max.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border border-slate-200 rounded-md">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Min (kg)
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Max (kg)
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Price ({config.currency})
                </th>
                <th className="px-3 py-2 text-right font-semibold border-b">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {weightBands.map((band, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step={0.1}
                      value={band.minKg}
                      onChange={(e) =>
                        updateWeightBand(idx, {
                          minKg: Number(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step={0.1}
                      value={band.maxKg ?? ""}
                      placeholder="∞"
                      onChange={(e) =>
                        updateWeightBand(idx, {
                          maxKg:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step={0.1}
                      value={centsToDollars(band.priceCents)}
                      onChange={(e) =>
                        updateWeightBand(idx, {
                          priceCents: dollarsToCents(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {weightBands.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWeightBand(idx)}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Peak hour windows */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">5. Peak Hour Windows</h2>
          <button
            type="button"
            onClick={addPeakWindow}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            + Add window
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Surcharge applied if pickup time falls inside any window. Use 24-hour
          format (e.g. 8–10, 17–20).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border border-slate-200 rounded-md">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Start hour
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  End hour
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b">
                  Surcharge ({config.currency})
                </th>
                <th className="px-3 py-2 text-right font-semibold border-b">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {peakHourWindows.map((win, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={win.startHour}
                      onChange={(e) =>
                        updatePeakWindow(idx, {
                          startHour: Number(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={win.endHour}
                      onChange={(e) =>
                        updatePeakWindow(idx, {
                          endHour: Number(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step={0.1}
                      value={centsToDollars(win.surchargeCents)}
                      onChange={(e) =>
                        updatePeakWindow(idx, {
                          surchargeCents: dollarsToCents(e.target.value),
                        })
                      }
                      className="border rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removePeakWindow(idx)}
                      className="text-[11px] text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Misc Add-ons */}
        <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="text-lg font-medium">6. Misc Add-ons</h2>
        <p className="text-xs text-slate-500 mb-2">
            Flat fees added on top of the calculated price when certain conditions are met.
        </p>

        <div className="grid gap-4 md:grid-cols-2 text-sm">
            {/* Ad Hoc / 3-Hour Express */}
            <label className="flex flex-col gap-1">
            <span>Ad hoc / 3-Hour Express fee ({config.currency})</span>
            <input
                type="number"
                step={0.1}
                value={centsToDollars(config.adHocServiceFeeCents ?? 0)}
                onChange={(e) =>
                setConfig({
                    ...config,
                    adHocServiceFeeCents: dollarsToCents(e.target.value),
                })
                }
                className="border rounded px-2 py-1"
            />
            <span className="text-[11px] text-slate-500">
                Applied when customer chooses “3-Hour Express” / ad hoc service.
            </span>
            </label>

            {/* Special Handling */}
            <label className="flex flex-col gap-1">
            <span>Special handling fee ({config.currency})</span>
            <input
                type="number"
                step={0.1}
                value={centsToDollars(config.specialHandlingFeeCents ?? 0)}
                onChange={(e) =>
                setConfig({
                    ...config,
                    specialHandlingFeeCents: dollarsToCents(e.target.value),
                })
                }
                className="border rounded px-2 py-1"
            />
            <span className="text-[11px] text-slate-500">
                Applied once per booking if any item is flagged as “Special handling”.
            </span>
            </label>
        </div>
        </section>


      {/* Currency + save */}
      <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="text-lg font-medium">7. Currency</h2>
        <div className="flex items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <span>Currency code</span>
            <input
              type="text"
              value={config.currency}
              onChange={(e) => handleBasicChange("currency", e.target.value)}
              className="border rounded px-2 py-1 text-sm w-24"
            />
            <p className="text-xs text-slate-500">
              Use ISO code, e.g. <strong>SGD</strong>, <strong>USD</strong>.
            </p>
          </div>
          <div className="flex-1 text-right">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save configuration"}
            </button>
          </div>
        </div>
      </section>

      {/* Preview quote panel */}
      <section className="space-y-4 border rounded-xl p-4 bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Preview Quote (sandbox)</h2>
          <span className="text-xs text-slate-500">
            Test the current pricing engine with a sample route.
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>Vehicle type</span>
            <select
              value={preview.vehicleType}
              onChange={(e) =>
                handlePreviewChange(
                  "vehicleType",
                  e.target.value as VehicleKey,
                )
              }
              className="border rounded px-2 py-1"
            >
              <option value="motorcycle">Motorcycle</option>
              <option value="car">Car</option>
              <option value="van">Van</option>
              <option value="lorry">Lorry</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span>Item category</span>
            <select
              value={preview.itemCategory}
              onChange={(e) =>
                handlePreviewChange("itemCategory", e.target.value)
              }
              className="border rounded px-2 py-1"
            >
              {Object.keys(categorySurcharges).map((cat) => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span>Chargeable weight (kg)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={preview.actualWeightKg}
              onChange={(e) =>
                handlePreviewChange("actualWeightKg", e.target.value)
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Approx. route distance (km)</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={preview.approximateDistanceKm}
              onChange={(e) =>
                handlePreviewChange("approximateDistanceKm", e.target.value)
              }
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Total stops (incl. pickup)</span>
            <input
              type="number"
              min={2}
              step={1}
              value={preview.stopsCount}
              onChange={(e) =>
                handlePreviewChange("stopsCount", e.target.value)
              }
              className="border rounded px-2 py-1"
            />
            <span className="text-[11px] text-slate-500">
              2 stops = 1 pickup + 1 delivery; 3+ adds multi-stop fees.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4">
          <button
            onClick={runPreviewQuote}
            disabled={previewLoading}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {previewLoading ? "Calculating…" : "Calculate preview quote"}
          </button>

          {previewError && (
            <span className="text-xs text-red-600">{previewError}</span>
          )}
        </div>

        {previewResult && (
          <div className="mt-3 grid gap-4 md:grid-cols-[1.4fr_1.6fr] text-sm">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Preview Total
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatCurrency(previewResult.totalPriceCents)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Estimated distance:{" "}
                {previewResult.totalDistanceKm.toFixed(1)} km
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Breakdown (in cents)
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                <div>
                  <dt>Base fee</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.baseFeeCents}
                  </dd>
                </div>
                <div>
                  <dt>Distance charge</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.distanceChargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Weight charge</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.weightChargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Category surcharge</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.categorySurchargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Vehicle surcharge</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.vehicleSurchargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Peak hour</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.peakHourSurchargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Multi-stop</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.multiStopChargeCents}
                  </dd>
                </div>
                <div>
                  <dt>Manual add-ons</dt>
                  <dd className="font-medium">
                    {previewResult.breakdown.manualAddOnCents}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
