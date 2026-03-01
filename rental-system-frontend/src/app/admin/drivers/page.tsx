// src/app/admin/drivers/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Driver, RegionCode, VehicleType } from "@/lib/types";
import { mockDrivers, REGION_LABELS, VEHICLE_LABELS } from "@/lib/mock/drivers";
import { fetchAdminDrivers, updateDriverOnBackend } from "@/lib/api/drivers";
import {
  createAdminDriver,
  deleteAdminDriver,
  setAdminDriverPin,
  resetAdminDriverPin,
} from "@/lib/api/admin";
import { USE_BACKEND } from "@/lib/config";
import { useDemoData } from "@/lib/use-demo-data";

type FormMode = "create" | "edit";
type EditableDriver = Omit<Driver, "id"> & { id?: string };
type DriverRow = Driver & { __isMock?: boolean };

const REGION_OPTIONS: RegionCode[] = [
  "central",
  "east",
  "west",
  "north",
  "north-east",
  "island-wide",
];

const VEHICLE_OPTIONS: VehicleType[] = ["bike", "car", "van", "lorry"];


function emptyDriver(): EditableDriver {
  return {
    id: undefined,
    code: "",
    name: "",
    email: "",
    phone: "",
    primaryRegion: "central",
    secondaryRegions: [],
    vehicleType: "bike",
    isActive: true,
    maxJobsPerDay: 20,
    maxJobsPerSlot: 6,
    workDayStartHour: 8,
    workDayEndHour: 18,
    notes: "",
    authUserId: undefined,
  };
}

/**
 * IMPORTANT:
 * - Mock drivers must never share the same `id` with real drivers (React key collision).
 * - Prefix mock IDs so they're always unique.
 */
function makeMockRows(): DriverRow[] {
  return mockDrivers.map((d) => ({
    ...(d as DriverRow),
    id: `mock:${d.id}`,
    __isMock: true,
  }));
}

function isMockDriver(d: DriverRow | EditableDriver | Driver): boolean {
  return (
    Boolean((d as any).__isMock) ||
    String((d as any).id ?? "").startsWith("mock:")
  );
}

/**
 * Backend Prisma RegionCode enum uses:
 * - north_east
 * - island_wide
 * while frontend uses:
 * - north-east
 * - island-wide
 */
function toBackendRegionCode(r: RegionCode): string {
  if (r === "north-east") return "north_east";
  if (r === "island-wide") return "island_wide";
  return r;
}
function toBackendVehicleType(v: VehicleType): string {
  // If your Prisma enum uses lowercase (bike/car/van/lorry/other), keep as-is.
  // If your Prisma enum uses uppercase, return v.toUpperCase().
  return v;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function isSixDigitPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

function generateSixDigitPin() {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

function suggestCodeFromId(id?: string) {
  // deterministic, good enough for legacy “code empty” drivers
  if (!id) return "DRV-001";
  const clean = String(id)
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const tail = clean.slice(-3).padStart(3, "0"); // keep human-friendly (3 digits)
  return `DRV-${tail}`;
}

export default function AdminDriversPage() {
  const { showDemoData } = useDemoData();

  const [realDrivers, setRealDrivers] = useState<Driver[]>([]);
  const [mode, setMode] = useState<FormMode | null>(null);
  const [formState, setFormState] = useState<
    (EditableDriver & { __isMock?: boolean }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  // Code edit UX (edit mode: not editable until admin clicks "Edit")
  const [codeEditEnabled, setCodeEditEnabled] = useState(false);

  // PIN UI state (NOT stored in Driver type, NOT sent in create/update payload)
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);

  // Code lock + UX:
  // - Backend rule: if code exists, it's permanently locked after creation.
  // - UX rule: even if code is empty (legacy), in EDIT mode it's read-only until admin clicks "Edit".
  const existingCode = mode === "edit" ? formState?.code ?? "" : "";
  const isEditing = mode === "edit" && Boolean(formState?.id);
  const hasCodeAlready = isEditing && Boolean(existingCode.trim());

  const isCodeLocked = hasCodeAlready;

  const codeInputDisabled =
    mode === "create" ? false : isCodeLocked ? true : !codeEditEnabled;

  const handleGenerateCode = () => {
    const suggested = suggestCodeFromId(formState?.id);
    setFormState((s) => (s ? { ...s, code: suggested } : s));
  };

  const resetPinUI = () => {
    setPin("");
    setPinConfirm("");
    setShowPin(false);
  };

  // Load real drivers from backend
  useEffect(() => {
    if (!USE_BACKEND) {
      setRealDrivers([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchAdminDrivers();
        if (!cancelled) setRealDrivers(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("[AdminDriversPage] fetchAdminDrivers failed", e);
        if (!cancelled) setRealDrivers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const uniqueRealDrivers = useMemo(
    () => dedupeById(realDrivers),
    [realDrivers]
  );

  const visibleDrivers: DriverRow[] = useMemo(() => {
    const mock = showDemoData ? makeMockRows() : [];
    if (!USE_BACKEND) return mock;
    return [...uniqueRealDrivers, ...mock];
  }, [uniqueRealDrivers, showDemoData]);

  const reloadDrivers = async () => {
    if (!USE_BACKEND) return;
    const data = await fetchAdminDrivers();
    setRealDrivers(Array.isArray(data) ? data : []);
  };

  const openCreate = () => {
    if (!USE_BACKEND) {
      alert(
        "Backend is disabled (USE_BACKEND=false). Turn on backend to create real drivers."
      );
      return;
    }
    setMode("create");
    setFormState(emptyDriver());
    setCodeEditEnabled(true); // ✅ allow typing on create
    resetPinUI();
  };

  const openEdit = (driver: DriverRow) => {
    if (isMockDriver(driver)) return;
     console.log("[AdminDrivers] openEdit driver.code =", driver.code); // ✅ debug
    setMode("edit");
    setFormState({
      ...(driver as Driver),
      code: driver.code ?? "", // ✅ keep controlled input
    });
    setCodeEditEnabled(false); // ✅ default read-only until admin clicks "Edit"
    resetPinUI(); // PIN is set/reset explicitly; never show existing PIN
  };

  const closeForm = () => {
    setMode(null);
    setFormState(null);
    setCodeEditEnabled(false);
    resetPinUI();
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    if (!formState) return;

    const target = e.target;
    const { name, value } = target;

    setFormState((prev) => {
      if (!prev) return prev;

      // checkbox
      if (
        name === "isActive" &&
        target instanceof HTMLInputElement &&
        target.type === "checkbox"
      ) {
        return { ...prev, isActive: target.checked };
      }

      // number fields
      if (
        name === "maxJobsPerDay" ||
        name === "maxJobsPerSlot" ||
        name === "workDayStartHour" ||
        name === "workDayEndHour"
      ) {
        return { ...prev, [name]: Number(value) || 0 };
      }

      return { ...prev, [name]: value };
    });
  };

  const toggleSecondaryRegion = (region: RegionCode) => {
    if (!formState) return;
    setFormState((prev) => {
      if (!prev) return prev;
      const current = prev.secondaryRegions ?? [];
      const exists = current.includes(region);
      return {
        ...prev,
        secondaryRegions: exists
          ? current.filter((r) => r !== region)
          : [...current, region],
      };
    });
  };

  const handleResetPinRow = async (driver: DriverRow) => {
    if (!USE_BACKEND) return;
    if (isMockDriver(driver)) return;

    if (!driver.code?.trim()) {
      alert(
        "This driver has no Driver Code. Set a code first (e.g. DRV-001) before resetting PIN."
      );
      return;
    }

    const newPin = generateSixDigitPin();

    const ok = confirm(
      `Reset PIN for ${driver.name} (${driver.code})?\n\nNew PIN will be: ${newPin}\n\n(You should share it securely. PIN won’t be shown again.)`
    );
    if (!ok) return;

    try {
      await resetAdminDriverPin(driver.id, newPin);
      await reloadDrivers();

      alert(
        `✅ PIN reset successful.\n\nDriver: ${driver.name}\nCode: ${driver.code}\nNEW PIN: ${newPin}\n\n(Please share securely. PIN will not be shown again.)`
      );
    } catch (e) {
      console.error("Reset PIN failed", e);
      alert("Failed to reset PIN. Check backend logs.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState) return;

    if (isMockDriver(formState)) {
      alert("Mock drivers are read-only. (Demo data is predefined)");
      return;
    }

    if (!formState.name || !formState.email || !formState.phone) {
      alert("Name, email, and phone are required.");
      return;
    }

    if (!formState.primaryRegion) {
      alert("Please select a primary region.");
      return;
    }

    if (!USE_BACKEND) {
      alert("Backend is disabled (USE_BACKEND=false).");
      return;
    }

    const wantsToSetPin = pin.trim().length > 0 || pinConfirm.trim().length > 0;

    // Create: require code + PIN
    if (mode === "create") {
      if (!formState.code?.trim()) {
        alert(
          "Driver code is required for Driver Code + PIN login (e.g. DRV-001)."
        );
        return;
      }
      if (!wantsToSetPin) {
        alert("PIN is required for new drivers. Please set a 6-digit PIN.");
        return;
      }
    }

    // If admin typed PIN fields (create or edit): validate
    if (wantsToSetPin) {
      if (!formState.code?.trim()) {
        alert("Driver code is required if you want to set a login PIN.");
        return;
      }
      if (!isSixDigitPin(pin.trim())) {
        alert("PIN must be exactly 6 digits.");
        return;
      }
      if (pin.trim() !== pinConfirm.trim()) {
        alert("PIN and Confirm PIN do not match.");
        return;
      }
    }

        const normalizedCode = formState.code?.trim().toUpperCase() || undefined;

    const primaryRegionBackend = toBackendRegionCode(formState.primaryRegion);
    const secondaryRegionsBackend = (formState.secondaryRegions ?? []).map(toBackendRegionCode);
    const vehicleBackend = toBackendVehicleType(formState.vehicleType);


    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createAdminDriver({
          name: formState.name,
          email: formState.email,
          phone: formState.phone,
          code: normalizedCode,
          primaryRegion: primaryRegionBackend as any,
          secondaryRegions: secondaryRegionsBackend as any,
          vehicleType: vehicleBackend as any,
          isActive: formState.isActive,
          maxJobsPerDay: formState.maxJobsPerDay,
          maxJobsPerSlot: formState.maxJobsPerSlot,
          workDayStartHour: formState.workDayStartHour,
          workDayEndHour: formState.workDayEndHour,
          notes: formState.notes?.trim() || undefined,
        });

        if (wantsToSetPin && created.id) {
          await setAdminDriverPin(created.id, pin.trim());
        }

        await reloadDrivers();
      } else if (mode === "edit" && formState.id) {
        // Code-lock enforced: only send code if it was empty (legacy drivers)
        const updatePayload: any = {
          name: formState.name,
          email: formState.email,
          phone: formState.phone,
          ...(isCodeLocked
            ? {}
            : { code: formState.code?.trim() || undefined }),
          primaryRegion: primaryRegionBackend as any,
          secondaryRegions: secondaryRegionsBackend as any,
          vehicleType: vehicleBackend as any,
          isActive: formState.isActive,
          maxJobsPerDay: formState.maxJobsPerDay,
          maxJobsPerSlot: formState.maxJobsPerSlot,
          workDayStartHour: formState.workDayStartHour,
          workDayEndHour: formState.workDayEndHour,
          notes: formState.notes?.trim() || undefined,
        };

        await updateDriverOnBackend(formState.id, updatePayload);

        if (wantsToSetPin) {
          await setAdminDriverPin(formState.id, pin.trim());
        }

        await reloadDrivers();
      }

      closeForm();
    } catch (err) {
      console.error("Driver save failed", err);
      alert("Failed to save driver / PIN. Check console + backend logs.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (driver: DriverRow) => {
    if (isMockDriver(driver)) return;
    if (!USE_BACKEND) return;

    try {
      await updateDriverOnBackend(driver.id, {
        isActive: !driver.isActive,
      } as Partial<Driver>);
      await reloadDrivers();
    } catch (e) {
      console.error("Toggle active failed", e);
      alert("Failed to update driver status.");
    }
  };

  const handleDeleteDriver = async () => {
    if (!formState?.id) return;
    if (isMockDriver(formState)) return;
    if (!USE_BACKEND) return;

    const ok = confirm("Delete this driver? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    try {
      await deleteAdminDriver(formState.id);
      await reloadDrivers();
      closeForm();
    } catch (e) {
      console.error("Delete driver failed", e);
      alert(
        "Failed to delete driver. If driver has active jobs, unassign first."
      );
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(
    () => visibleDrivers.filter((d) => d.isActive && !isMockDriver(d)).length,
    [visibleDrivers]
  );

  const mainRegionsCovered = useMemo(() => {
    const regions = visibleDrivers
      .filter((d) => !isMockDriver(d))
      .map((d) => d.primaryRegion);
    return Array.from(new Set(regions))
      .map((r) => REGION_LABELS[r])
      .join(", ");
  }, [visibleDrivers]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Drivers</h1>
            <p className="text-sm text-slate-600">
              Manage driver profiles, service regions, and capacity. These
              records will be used by the assignment engine and Driver PWA.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
          >
            + Add driver
          </button>
        </header>

        {/* Summary cards */}
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total drivers
            </h2>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {visibleDrivers.length}
            </p>
            {showDemoData && (
              <p className="mt-1 text-[11px] text-slate-500">
                Includes demo data (mock rows) in addition to real drivers.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active & assignable
            </h2>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {activeCount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Mock drivers are excluded.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Main regions covered
            </h2>
            <p className="mt-1 text-sm text-slate-800">
              {mainRegionsCovered || "—"}
            </p>
          </div>
        </section>

        {/* Driver table */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Driver
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Regions
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Vehicle
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Capacity
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {visibleDrivers.map((d) => {
                const mock = isMockDriver(d);

                return (
                  <tr key={d.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <div className="font-medium text-slate-900">
                          {d.name}
                        </div>
                        {mock && (
                          <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                            MOCK
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">{d.email}</div>
                      <div className="text-xs text-slate-500">{d.phone}</div>
                      {d.code && (
                        <div className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {d.code}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-slate-700">
                      <div className="font-medium">
                        {REGION_LABELS[d.primaryRegion]}
                      </div>
                      {d.secondaryRegions?.length ? (
                        <div className="mt-0.5 text-slate-500">
                          Also:{" "}
                          {d.secondaryRegions
                            .map((r) => REGION_LABELS[r])
                            .join(", ")}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-slate-700">
                      {VEHICLE_LABELS[d.vehicleType]}
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-slate-700">
                      <div>
                        Max/day:{" "}
                        <span className="font-medium">{d.maxJobsPerDay}</span>
                      </div>
                      <div>
                        Max/slot:{" "}
                        <span className="font-medium">{d.maxJobsPerSlot}</span>
                      </div>
                      <div className="text-slate-500">
                        Hours: {d.workDayStartHour}:00 – {d.workDayEndHour}:00
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border",
                          d.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-500 border-slate-200",
                        ].join(" ")}
                      >
                        {d.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-4 py-3 align-top text-right text-xs">
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className={[
                          "mr-2",
                          mock
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-sky-600 hover:text-sky-700",
                        ].join(" ")}
                        disabled={mock}
                      >
                        Edit
                      </button>

                      {!mock && (
                        <button
                          type="button"
                          onClick={() => handleResetPinRow(d)}
                          className="mr-2 text-amber-700 hover:text-amber-800"
                        >
                          Reset PIN
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleActive(d)}
                        className={[
                          mock
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-500 hover:text-slate-700",
                        ].join(" ")}
                        disabled={mock}
                      >
                        {d.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {visibleDrivers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    No drivers to show. Turn on backend to load real drivers,
                    and optionally enable Demo Mode to append mock drivers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* Sliding panel form */}
      {mode && formState && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {mode === "create" ? "Add driver" : "Edit driver"}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Driver settings here will directly affect auto-assignment and
                  capacity calculation.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm"
            >
              {/* Identity */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={formState.name}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Alex Tan"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formState.email}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="name@example.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="phone"
                    value={formState.phone}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="+65 ..."
                  />
                </div>
              </div>

              {/* Code locked after creation */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Driver code <span className="text-red-500">*</span>
                </label>

                <div className="flex gap-2">
                  <input
                    name="code"
                    value={formState.code ?? ""}
                    onChange={handleChange}
                    disabled={codeInputDisabled}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      codeInputDisabled
                        ? "bg-slate-50 text-slate-500"
                        : "border-slate-200",
                    ].join(" ")}
                    placeholder="e.g. DRV-001"
                  />

                  {isCodeLocked ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(formState.code ?? "")
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      title="Copy code"
                    >
                      Copy
                    </button>
                  ) : codeEditEnabled ? (
                    <>
                      <button
                        type="button"
                        onClick={handleGenerateCode}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        title="Suggest code from Driver ID"
                      >
                        Suggest
                      </button>

                      {mode === "edit" && (
                        <button
                          type="button"
                          onClick={() => setCodeEditEnabled(false)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                          title="Stop editing code"
                        >
                          Done
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCodeEditEnabled(true)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      title="Enable editing for legacy empty code"
                    >
                      Edit
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-slate-500">
                  Used for Driver login (Code + PIN).
                  {isCodeLocked ? (
                    <span className="ml-1 text-slate-600">
                      Code is locked after creation.
                    </span>
                  ) : (
                    <span className="ml-1 text-slate-600">
                      If empty (legacy driver), set it once.
                    </span>
                  )}
                </p>
              </div>

              {/* ✅ PIN (Option B) */}
              {!isMockDriver(formState) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        Login PIN (6 digits){" "}
                        {mode === "create" ? (
                          <span className="text-rose-700">*</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {mode === "create"
                          ? "Required for new drivers. PIN is set after driver is created."
                          : "Optional. Leave blank to keep current PIN. To change, enter a new PIN + confirm."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const p = generateSixDigitPin();
                        setPin(p);
                        setPinConfirm(p);
                      }}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Generate
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">
                        New PIN
                      </label>
                      <input
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={6}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        type={showPin ? "text" : "password"}
                        placeholder="6 digits"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">
                        Confirm
                      </label>
                      <input
                        value={pinConfirm}
                        onChange={(e) => setPinConfirm(e.target.value)}
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={6}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        type={showPin ? "text" : "password"}
                        placeholder="repeat"
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      className="text-[11px] text-slate-600 hover:text-slate-800"
                    >
                      {showPin ? "Hide" : "Show"}
                    </button>

                    <div className="text-[11px] text-slate-500">
                      {pin || pinConfirm ? (
                        !isSixDigitPin(pin.trim()) ? (
                          <span className="text-rose-700">
                            PIN must be 6 digits
                          </span>
                        ) : pin.trim() !== pinConfirm.trim() ? (
                          <span className="text-rose-700">PIN mismatch</span>
                        ) : (
                          <span className="text-emerald-700">
                            PIN looks good
                          </span>
                        )
                      ) : mode === "create" ? (
                        <span className="text-rose-700">PIN required</span>
                      ) : (
                        "Leave blank to keep unchanged"
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Regions & vehicle */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Primary region <span className="text-red-500">*</span>
                </label>
                <select
                  name="primaryRegion"
                  value={formState.primaryRegion}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {REGION_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Secondary regions
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {REGION_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleSecondaryRegion(r)}
                      className={[
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        formState.secondaryRegions?.includes(r)
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-slate-50 text-slate-600",
                      ].join(" ")}
                    >
                      {REGION_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Vehicle type
                </label>
                <select
                  name="vehicleType"
                  value={formState.vehicleType}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {VEHICLE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {VEHICLE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Capacity */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Max jobs per day
                  </label>
                  <input
                    name="maxJobsPerDay"
                    type="number"
                    min={1}
                    value={formState.maxJobsPerDay}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Max jobs per time slot
                  </label>
                  <input
                    name="maxJobsPerSlot"
                    type="number"
                    min={1}
                    value={formState.maxJobsPerSlot}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Workday start (hour)
                  </label>
                  <input
                    name="workDayStartHour"
                    type="number"
                    min={0}
                    max={23}
                    value={formState.workDayStartHour}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Workday end (hour)
                  </label>
                  <input
                    name="workDayEndHour"
                    type="number"
                    min={0}
                    max={23}
                    value={formState.workDayEndHour}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Status & notes */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="isActive"
                  name="isActive"
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                <label htmlFor="isActive" className="text-xs text-slate-700">
                  Active & eligible for auto-assignment
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Notes (internal)
                </label>
                <textarea
                  name="notes"
                  value={formState.notes ?? ""}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Special instructions, skills, or limitations..."
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <div>
                  {mode === "edit" && (
                    <button
                      type="button"
                      onClick={handleDeleteDriver}
                      disabled={saving}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      Delete driver
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="text-xs text-slate-600 hover:text-slate-800"
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {saving
                      ? "Saving..."
                      : mode === "create"
                      ? "Create driver"
                      : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
