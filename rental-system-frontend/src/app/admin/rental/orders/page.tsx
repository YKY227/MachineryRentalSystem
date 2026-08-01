// src/app/admin/rental/orders/page.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Filter,
  HardHat,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";

import { OrderDamageAssessmentPanel } from "@/components/admin/rental/OrderDamageAssessmentPanel";
import type {
  RentalDamageAssessmentRecommendedDepositAction,
  RentalDamageAssessmentResult,
  RentalDamageAssessmentSummary,
} from "@/lib/rental/damage-assessments/types";
import type {
  RentalDepositTransaction,
  RentalOrderDepositSummary,
} from "@/lib/rental/deposits/types";
import type { RentalOrderExtension } from "@/lib/rental/extensions/types";
import type { Equipment } from "@/lib/rental/types";
import type { Invoice } from "@/lib/rental/invoices/types";
import type {
  CreateRentalOrderInput,
  RentalOrder,
  RentalOrderInspectionStatus,
  RentalOrderReturnStatus,
} from "@/lib/rental/orders/types";
import type { RentalEquipmentDowntime } from "@/lib/rental/downtime/types";

type DeleteDialogState =
  | {
      mode: "single";
      orderIds: string[];
    }
  | {
      mode: "bulk";
      orderIds: string[];
    };

type OrderDetailView = "operations" | "assessment" | "deposit" | "extensions";

const ORDERS_PER_PAGE = 20;

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = new Date(`${aStart}T12:00:00`).getTime();
  const ae = new Date(`${aEnd}T12:00:00`).getTime();
  const bs = new Date(`${bStart}T12:00:00`).getTime();
  const be = new Date(`${bEnd}T12:00:00`).getTime();
  if (!Number.isFinite(as) || !Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(be)) {
    return false;
  }
  return as <= be && bs <= ae;
}

function clampInt(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
}

function depositStatusLabel(status: RentalOrderDepositSummary["status"]) {
  switch (status) {
    case "held":
      return "Held";
    case "partially_held":
      return "Partially Held";
    case "pending":
      return "Pending";
    case "not_required":
      return "Not Required";
    case "released":
      return "Released";
    case "partially_released":
      return "Partially Released";
    case "retained":
      return "Retained";
    case "partially_retained":
      return "Partially Retained";
    default:
      return status;
  }
}

function depositTransactionLabel(type: RentalDepositTransaction["transactionType"]) {
  switch (type) {
    case "requirement_created":
      return "Requirement Created";
    case "payment_collected":
      return "Collected";
    case "released":
      return "Released";
    case "retained":
      return "Retained";
    case "adjustment":
    default:
      return type;
  }
}

function depositBadgeTone(status: RentalOrderDepositSummary["status"]) {
  switch (status) {
    case "held":
      return "bg-emerald-100 text-emerald-800";
    case "partially_held":
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "released":
      return "bg-slate-100 text-slate-700";
    case "retained":
    case "partially_retained":
      return "bg-rose-100 text-rose-800";
    case "not_required":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function returnStatusLabel(status: RentalOrderReturnStatus) {
  switch (status) {
    case "out":
      return "Active / Out";
    case "returned":
      return "Returned";
    case "completed":
      return "Operationally Closed";
    default:
      return status;
  }
}

function inspectionStatusLabel(status: RentalOrderInspectionStatus) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "pending":
      return "Inspection Pending";
    case "passed":
      return "Passed";
    case "issues_found":
      return "Issues Found";
    default:
      return status;
  }
}

function normalizeOperationalReturnStatus(status: RentalOrderReturnStatus) {
  return status === "completed" ? "returned" : status;
}

function isInspectionFinalStatus(status: RentalOrderInspectionStatus) {
  return status === "passed" || status === "issues_found";
}

function returnStatusHelp(status: RentalOrderReturnStatus) {
  switch (normalizeOperationalReturnStatus(status)) {
    case "out":
      return "Use this while the equipment is still with the customer and no return has been recorded.";
    case "returned":
      return "Use this once the equipment is physically back so inspection can begin or finish.";
    default:
      return "Use this once the equipment is physically back so inspection can begin or finish.";
  }
}

function inspectionStatusHelp(status: RentalOrderInspectionStatus) {
  switch (status) {
    case "not_started":
      return "No return inspection has started yet.";
    case "pending":
      return "The equipment is back and still being checked.";
    case "passed":
      return "Inspection finished with no operational issues recorded.";
    case "issues_found":
      return "Inspection finished and follow-up is still needed.";
    default:
      return "No return inspection has started yet.";
  }
}

function buildOperationalGuardrails(params: {
  returnStatus: RentalOrderReturnStatus;
  inspectionStatus: RentalOrderInspectionStatus;
  closeRequested: boolean;
  assessmentStatus?: RentalDamageAssessmentSummary["status"];
  assessmentExists: boolean;
  depositHeldAmountCents: number;
  depositUnresolvedAmountCents: number;
}) {
  const impossible: string[] = [];
  const warnings: string[] = [];
  const normalizedReturnStatus = normalizeOperationalReturnStatus(params.returnStatus);

  if (normalizedReturnStatus === "out" && params.inspectionStatus !== "not_started") {
    impossible.push("Inspection can only start after the equipment has been recorded as returned.");
  }

  if (params.closeRequested && normalizedReturnStatus === "out") {
    impossible.push("Record the equipment as returned before closing the order workflow.");
  }

  if (params.closeRequested && !isInspectionFinalStatus(params.inspectionStatus)) {
    impossible.push("Finish the inspection before closing the order workflow.");
  }

  if (
    params.inspectionStatus === "issues_found" &&
    params.depositHeldAmountCents > 0 &&
    params.depositUnresolvedAmountCents > 0
  ) {
    warnings.push("Inspection found issues and the deposit is still unresolved. Review the deposit decision separately.");
  }

  if (params.closeRequested && params.assessmentStatus === "draft") {
    warnings.push("Damage assessment is still draft. Finalize it first if staff need it as evidence.");
  }

  if (params.closeRequested && params.inspectionStatus === "issues_found" && !params.assessmentExists) {
    warnings.push("Inspection issues are recorded but no damage assessment exists yet.");
  }

  if (
    params.closeRequested &&
    params.depositHeldAmountCents > 0 &&
    params.depositUnresolvedAmountCents > 0
  ) {
    warnings.push("A held deposit is still unresolved. Closing the workflow will not release or retain it automatically.");
  }

  return { impossible, warnings };
}

function buildWorkflowSteps(
  returnStatus: RentalOrderReturnStatus,
  inspectionStatus: RentalOrderInspectionStatus,
  closeRequested: boolean
) {
  const normalizedReturnStatus = normalizeOperationalReturnStatus(returnStatus);
  const isReturned = normalizedReturnStatus !== "out";
  const inspectionFinal = isInspectionFinalStatus(inspectionStatus);
  const closed = closeRequested || returnStatus === "completed";

  return [
    {
      label: "Out on rent",
      description: "Equipment is still with the customer.",
      state: normalizedReturnStatus === "out" ? "current" : "done",
    },
    {
      label: "Returned",
      description: "Physical return has been recorded.",
      state: !isReturned ? "upcoming" : inspectionStatus === "not_started" ? "current" : "done",
    },
    {
      label: "Inspected",
      description: "Post-return check is complete.",
      state: !isReturned ? "upcoming" : inspectionFinal ? (closed ? "done" : "current") : "current",
    },
    {
      label: "Closed",
      description: "Operational follow-up is closed.",
      state: closed ? "current" : "upcoming",
    },
  ] as const;
}

function assessmentStatusLabel(status?: RentalDamageAssessmentSummary["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "finalized":
      return "Finalized";
    default:
      return "Not Started";
  }
}

function assessmentResultLabel(result?: RentalDamageAssessmentResult) {
  switch (result) {
    case "clear":
      return "Clear";
    case "wear_and_tear":
      return "Wear & Tear";
    case "issues_found":
      return "Issues Found";
    case "further_review":
      return "Further Review";
    default:
      return "-";
  }
}

function recommendedAssessmentActionLabel(
  action?: RentalDamageAssessmentRecommendedDepositAction
) {
  switch (action) {
    case "none":
      return "No follow-up recommended";
    case "release":
      return "Release deposit";
    case "partial_retain":
      return "Partial retain recommended";
    case "full_retain":
      return "Full retain recommended";
    case "manual_review":
      return "Manual financial review";
    default:
      return "-";
  }
}

function defaultAssessmentSummary(orderId: string): RentalDamageAssessmentSummary {
  return {
    orderId,
    exists: false,
    issueCategories: [],
    estimatedRetentionCents: 0,
  };
}

function opsBadgeTone(status: RentalOrderReturnStatus, inspectionStatus: RentalOrderInspectionStatus) {
  if (status === "completed") return "bg-slate-100 text-slate-700";
  if (inspectionStatus === "issues_found") return "bg-rose-100 text-rose-800";
  if (inspectionStatus === "passed") return "bg-emerald-100 text-emerald-800";
  if (status === "returned" || inspectionStatus === "pending") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

function extensionStatusLabel(status: RentalOrderExtension["status"]) {
  switch (status) {
    case "availability_blocked":
      return "Availability Blocked";
    case "awaiting_admin_review":
      return "Awaiting Review";
    case "approved_pending_payment":
      return "Approved - Payment Pending";
    case "approved_confirmed":
      return "Confirmed";
    case "rejected":
      return "Rejected";
    case "cancelled":
    default:
      return "Cancelled";
  }
}

function extensionBadgeTone(status: RentalOrderExtension["status"]) {
  switch (status) {
    case "approved_confirmed":
      return "bg-emerald-100 text-emerald-800";
    case "approved_pending_payment":
      return "bg-amber-100 text-amber-800";
    case "availability_blocked":
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "awaiting_admin_review":
      return "bg-sky-100 text-sky-800";
    case "cancelled":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function warningChipTone(kind: "critical" | "warning" | "info" | "ok") {
  switch (kind) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "info":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function orderChargeTotal(order: RentalOrder) {
  if (typeof order.pricingSnapshot?.payableTotal === "number") {
    return order.pricingSnapshot.payableTotal;
  }
  return Math.max(
    0,
    Number(order.pricingSnapshot?.total ?? 0) - Number(order.pricingSnapshot?.deposit ?? 0)
  );
}

function seedDemoOrders(items: Equipment[]): CreateRentalOrderInput[] {
  const pick = (id: string) => items.find((x) => x.id === id) ?? items[0];

  const a = pick("eq-scissor-lift-8m") ?? items[0];
  const b = pick("eq-forklift-3t") ?? items[Math.min(1, items.length - 1)];

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plusDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  const mk = (i: number, eq: Equipment, startOff: number, endOff: number): CreateRentalOrderInput => {
    const start = iso(plusDays(startOff));
    const end = iso(plusDays(endOff));
    const days = Math.max(1, endOff - startOff);
    const qty = 1;

    const dayRate = eq?.pricing?.dayRate ?? 80;
    const rentalSubtotal = dayRate * days * qty;
    const deliveryFee = 60;
    const collectionFee = 40;
    const deposit = eq?.pricing?.deposit ?? 0;
    const total = rentalSubtotal + deliveryFee + collectionFee + deposit;

    return {
      id: `ORD-DEMO-${String(i).padStart(4, "0")}`,
      equipmentId: eq.id,
      equipmentTitle: eq.title,
      qty,
      start,
      end,
      fulfillment: "deliver",
      pricingSnapshot: {
        days,
        rentalSubtotal,
        deliveryFee,
        collectionFee,
        deposit,
        total,
      },
      customerSnapshot: {
        companyName: `Demo Customer ${i}`,
        contactName: `Demo Contact ${i}`,
        email: `demo${i}@example.com`,
      },
    };
  };

  if (!items.length) return [];
  return [mk(1, a, 0, 3), mk(2, b ?? a, 5, 9)];
}

export default function AdminRentalOrdersPage() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";

  const [items, setItems] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<RentalOrder[]>([]);
  const [downtime, setDowntime] = useState<RentalEquipmentDowntime[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [depositSummariesByOrderId, setDepositSummariesByOrderId] = useState<
    Record<string, RentalOrderDepositSummary>
  >({});
  const [assessmentSummariesByOrderId, setAssessmentSummariesByOrderId] = useState<
    Record<string, RentalDamageAssessmentSummary>
  >({});
  const [activeDepositOrderId, setActiveDepositOrderId] = useState<string | null>(null);
  const [depositPanelLoading, setDepositPanelLoading] = useState(false);
  const [depositPanelError, setDepositPanelError] = useState<string | null>(null);
  const [depositPanelBanner, setDepositPanelBanner] = useState<string | null>(null);
  const [depositTransactions, setDepositTransactions] = useState<RentalDepositTransaction[]>([]);
  const [depositActionType, setDepositActionType] = useState<"release" | "retain" | "split">("release");
  const [releaseAmountInput, setReleaseAmountInput] = useState("");
  const [retainAmountInput, setRetainAmountInput] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionReference, setResolutionReference] = useState("");
  const [linkAssessmentToDeposit, setLinkAssessmentToDeposit] = useState(false);
  const [damageInvoiceDescription, setDamageInvoiceDescription] = useState("");
  const [damageInvoiceAmountInput, setDamageInvoiceAmountInput] = useState("");
  const [damageInvoiceNotes, setDamageInvoiceNotes] = useState("");
  const [linkAssessmentToDamageInvoice, setLinkAssessmentToDamageInvoice] = useState(false);
  const [linkedDamageInvoiceDepositTransactionId, setLinkedDamageInvoiceDepositTransactionId] = useState("");
  const [damageInvoiceSaving, setDamageInvoiceSaving] = useState(false);
  const [damageInvoiceError, setDamageInvoiceError] = useState<string | null>(null);
  const [damageInvoiceBanner, setDamageInvoiceBanner] = useState<string | null>(null);
  const [depositSaving, setDepositSaving] = useState(false);
  const [activeOpsOrderId, setActiveOpsOrderId] = useState<string | null>(null);
  const [opsBanner, setOpsBanner] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [opsSaving, setOpsSaving] = useState(false);
  const [opsReturnStatus, setOpsReturnStatus] = useState<RentalOrderReturnStatus>("out");
  const [opsReturnedAt, setOpsReturnedAt] = useState("");
  const [opsReturnNotes, setOpsReturnNotes] = useState("");
  const [opsInspectionStatus, setOpsInspectionStatus] = useState<RentalOrderInspectionStatus>("not_started");
  const [opsInspectionNotes, setOpsInspectionNotes] = useState("");
  const [opsMarkCompleted, setOpsMarkCompleted] = useState(false);
  const [activeExtensionOrderId, setActiveExtensionOrderId] = useState<string | null>(null);
  const [extensionPanelLoading, setExtensionPanelLoading] = useState(false);
  const [extensionPanelError, setExtensionPanelError] = useState<string | null>(null);
  const [extensionPanelBanner, setExtensionPanelBanner] = useState<string | null>(null);
  const [orderExtensions, setOrderExtensions] = useState<Record<string, RentalOrderExtension[]>>({});
  const [extensionReviewNote, setExtensionReviewNote] = useState("");
  const [extensionActingId, setExtensionActingId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingInv, setLoadingInv] = useState(true);
  const [working, setWorking] = useState(false);
  const [developerDeleteEnabled, setDeveloperDeleteEnabled] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBanner, setDeleteBanner] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [opsFilter, setOpsFilter] = useState<"all" | "active" | "returned" | "inspection" | "issues">("all");
  const [depositFilter, setDepositFilter] = useState<
    "all" | "unresolved" | "pending" | "held" | "released" | "retained"
  >("all");
  const [attentionFilter, setAttentionFilter] = useState<"all" | "attention" | "extensions" | "downtime">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailDrawer, setDetailDrawer] = useState<{ orderId: string; view: OrderDetailView } | null>(null);

  const equipmentById = useMemo(() => {
    const map = new Map<string, Equipment>();
    items.forEach((e) => map.set(e.id, e));
    return map;
  }, [items]);

  const ordersSummary = useMemo(() => {
    const totalOrders = orders.length;
    const totalRentalCharges = orders.reduce((sum, order) => sum + orderChargeTotal(order), 0);
    const totalDepositRequired = Object.values(depositSummariesByOrderId).reduce(
      (sum, deposit) => sum + deposit.requiredAmountCents / 100,
      0
    );
    const totalDepositHeld = Object.values(depositSummariesByOrderId).reduce(
      (sum, deposit) => sum + deposit.heldAmountCents / 100,
      0
    );
    return { totalOrders, totalRentalCharges, totalDepositRequired, totalDepositHeld };
  }, [depositSummariesByOrderId, orders]);

  const orderRows = useMemo(() => {
    return orders.map((order) => {
      const eq = equipmentById.get(order.equipmentId);
      const buffer = clampInt(order.maintenanceBufferDaysApplied, clampInt((eq as any)?.maintenanceBufferDays, 7));
      const reservedUntil = buffer > 0 ? addDaysISO(order.end, buffer) : order.end;
      const overlappingDowntime = downtime.filter(
        (entry) =>
          entry.equipmentId === order.equipmentId &&
          entry.status === "active" &&
          rangesOverlap(entry.startDate, entry.endDate, order.start, reservedUntil)
      );
      const downtimeQty = overlappingDowntime.reduce(
        (sum, entry) => sum + Math.max(0, Number(entry.quantityAffected ?? 0)),
        0
      );
      const invoice = findInvoiceForOrder(order.id);
      const deposit = depositSummariesByOrderId[order.id] ?? {
        orderId: order.id,
        requiredAmountCents: Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100),
        heldAmountCents: 0,
        releasedAmountCents: 0,
        retainedAmountCents: 0,
        unresolvedAmountCents: Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100),
        status: Number(order.pricingSnapshot?.deposit ?? 0) > 0 ? "pending" : "not_required",
      };
      const assessment =
        assessmentSummariesByOrderId[order.id] ?? defaultAssessmentSummary(order.id);
      const knownExtensions = orderExtensions[order.id] ?? [];
      const extensionNeedsAttention = knownExtensions.some(
        (extension) =>
          extension.status === "awaiting_admin_review" || extension.status === "availability_blocked"
      );
      const hasDepositAttention = deposit.heldAmountCents > 0 && deposit.unresolvedAmountCents > 0;
      const hasInspectionIssues = order.inspectionStatus === "issues_found";
      const hasAssessmentDraft = assessment.status === "draft";
      const needsInspection =
        order.returnStatus === "returned" ||
        order.inspectionStatus === "pending" ||
        order.inspectionStatus === "not_started";
      const hasDowntimeImpact = overlappingDowntime.length > 0;
      const needsAttention =
        hasInspectionIssues || hasDepositAttention || hasDowntimeImpact || extensionNeedsAttention || hasAssessmentDraft;
      const searchBlob = [
        order.id,
        order.equipmentTitle,
        order.equipmentId,
        order.customerSnapshot?.companyName,
        order.customerSnapshot?.contactName,
        order.customerSnapshot?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        order,
        eq,
        buffer,
        reservedUntil,
        overlappingDowntime,
        downtimeQty,
        invoice,
        deposit,
        assessment,
        knownExtensions,
        extensionNeedsAttention,
        hasDepositAttention,
        hasInspectionIssues,
        hasAssessmentDraft,
        needsInspection,
        hasDowntimeImpact,
        needsAttention,
        searchBlob,
      };
    });
  }, [assessmentSummariesByOrderId, depositSummariesByOrderId, downtime, equipmentById, orderExtensions, orders]);

  const filteredOrderRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return orderRows.filter((row) => {
      if (normalizedQuery && !row.searchBlob.includes(normalizedQuery)) return false;

      if (opsFilter === "active" && row.order.returnStatus !== "out") return false;
      if (opsFilter === "returned" && row.order.returnStatus !== "returned") return false;
      if (
        opsFilter === "inspection" &&
        !(
          row.order.returnStatus === "returned" ||
          row.order.inspectionStatus === "pending" ||
          row.order.inspectionStatus === "not_started"
        )
      ) {
        return false;
      }
      if (opsFilter === "issues" && row.order.inspectionStatus !== "issues_found") return false;

      if (depositFilter === "unresolved" && !(row.deposit.unresolvedAmountCents > 0)) return false;
      if (depositFilter !== "all" && depositFilter !== "unresolved" && row.deposit.status !== depositFilter) {
        return false;
      }

      if (attentionFilter === "attention" && !row.needsAttention) return false;
      if (attentionFilter === "extensions" && !row.extensionNeedsAttention) return false;
      if (attentionFilter === "downtime" && !row.hasDowntimeImpact) return false;

      return true;
    });
  }, [attentionFilter, depositFilter, opsFilter, orderRows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredOrderRows.length / ORDERS_PER_PAGE));
  const paginatedOrderRows = useMemo(() => {
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    return filteredOrderRows.slice(startIndex, startIndex + ORDERS_PER_PAGE);
  }, [currentPage, filteredOrderRows]);
  const paginatedStart = filteredOrderRows.length === 0 ? 0 : (currentPage - 1) * ORDERS_PER_PAGE + 1;
  const paginatedEnd = filteredOrderRows.length === 0 ? 0 : Math.min(currentPage * ORDERS_PER_PAGE, filteredOrderRows.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, opsFilter, depositFilter, attentionFilter]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const operationsSummary = useMemo(() => {
    const activeRentals = orderRows.filter((row) => row.order.returnStatus === "out").length;
    const pendingReturnInspection = orderRows.filter((row) => row.needsInspection).length;
    const inspectionIssues = orderRows.filter((row) => row.hasInspectionIssues).length;
    const unresolvedDepositCases = orderRows.filter((row) => row.hasDepositAttention).length;
    const downtimeAffected = orderRows.filter((row) => row.hasDowntimeImpact).length;
    const extensionAttention = orderRows.filter((row) => row.extensionNeedsAttention).length;
    return {
      activeRentals,
      pendingReturnInspection,
      inspectionIssues,
      unresolvedDepositCases,
      downtimeAffected,
      extensionAttention,
    };
  }, [orderRows]);

  const activeDetailOrderId =
    detailDrawer?.orderId ?? activeOpsOrderId ?? activeDepositOrderId ?? activeExtensionOrderId ?? null;
  const activeDetailOrder = useMemo(
    () => orderRows.find((row) => row.order.id === activeDetailOrderId) ?? null,
    [activeDetailOrderId, orderRows]
  );
  const detailOrder = activeDetailOrder?.order ?? null;
  const opsGuardrails = activeDetailOrder
    ? buildOperationalGuardrails({
        returnStatus: opsReturnStatus,
        inspectionStatus: opsInspectionStatus,
        closeRequested: opsMarkCompleted,
        assessmentStatus: activeDetailOrder.assessment.status,
        assessmentExists: activeDetailOrder.assessment.exists,
        depositHeldAmountCents: activeDetailOrder.deposit.heldAmountCents,
        depositUnresolvedAmountCents: activeDetailOrder.deposit.unresolvedAmountCents,
      })
    : { impossible: [], warnings: [] };
  const drawerWorkflowReturnStatus: RentalOrderReturnStatus =
  detailDrawer?.view === "operations"
    ? opsReturnStatus
    : (detailOrder?.returnStatus ?? "out");

const drawerWorkflowInspectionStatus: RentalOrderInspectionStatus =
  detailDrawer?.view === "operations"
    ? opsInspectionStatus
    : (detailOrder?.inspectionStatus ?? "not_started");

const drawerWorkflowClosed =
  detailDrawer?.view === "operations"
    ? opsMarkCompleted
    : detailOrder?.returnStatus === "completed";

const drawerWorkflowSteps = buildWorkflowSteps(
  drawerWorkflowReturnStatus,
  drawerWorkflowInspectionStatus,
  drawerWorkflowClosed
);
  const depositResolutionTransactions = useMemo(
    () =>
      depositTransactions.filter(
        (transaction) => transaction.transactionType === "released" || transaction.transactionType === "retained"
      ),
    [depositTransactions]
  );

  async function refreshInventory() {
    const res = await fetch("/api/admin/rental/equipment", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment");
    setItems(Array.isArray(data?.equipment) ? (data.equipment as Equipment[]) : []);
  }

  async function refreshOrders() {
    try {
      setLoadingOrders(true);
      const res = await fetch("/api/admin/rental/orders", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load orders");
      const nextOrders = (data?.orders ?? []) as RentalOrder[];
      setDepositSummariesByOrderId(
        (data?.depositSummariesByOrderId ?? {}) as Record<string, RentalOrderDepositSummary>
      );
      setAssessmentSummariesByOrderId(
        (data?.assessmentSummariesByOrderId ?? {}) as Record<string, RentalDamageAssessmentSummary>
      );
      setDeveloperDeleteEnabled(Boolean(data?.developerDeleteEnabled));
      setOrders(nextOrders);
      setSelectedOrderIds((current) => current.filter((orderId) => nextOrders.some((order) => order.id === orderId)));
      return nextOrders;
    } catch (e) {
      console.error("refreshOrders failed", e);
      setDeveloperDeleteEnabled(false);
      setDepositSummariesByOrderId({});
      setOrders([]);
      setSelectedOrderIds([]);
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }

  async function refreshDowntime() {
    const res = await fetch("/api/admin/rental/downtime", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load downtime");
    setDowntime((data?.downtime ?? []) as RentalEquipmentDowntime[]);
  }

  async function refreshInvoices(orderItems: RentalOrder[]) {
    try {
      setLoadingInv(true);
      const orderIds = orderItems.map((o) => o.id).filter(Boolean);

      if (!orderIds.length) {
        setInvoices([]);
        return;
      }

      const res = await fetch(
        `/api/admin/rental/invoices?orderIds=${encodeURIComponent(orderIds.join(","))}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load invoice statuses");

      setInvoices(((data?.invoices ?? []) as Invoice[]).filter((x) => x.status !== "void"));
    } catch (e) {
      console.error("refreshInvoices failed", e);
      setInvoices([]);
    } finally {
      setLoadingInv(false);
    }
  }

  useEffect(() => {
    refreshInventory().then(async () => {
      const nextOrders = await refreshOrders();
      await refreshInvoices(nextOrders);
    });
    refreshDowntime().catch((error) => {
      console.error("refreshDowntime failed", error);
      setDowntime([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!developerDeleteEnabled) {
      setSelectedOrderIds([]);
      setDeleteDialog(null);
    }
  }, [developerDeleteEnabled]);

  function findInvoiceForOrder(orderId: string) {
    return invoices.find((x) => x.orderId === orderId && x.status !== "void");
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    );
  }

  function toggleSelectAllCurrentOrders() {
    const visibleOrderIds = paginatedOrderRows.map((row) => row.order.id);
    setSelectedOrderIds((current) =>
      visibleOrderIds.every((orderId) => current.includes(orderId))
        ? current.filter((orderId) => !visibleOrderIds.includes(orderId))
        : [...new Set([...current, ...visibleOrderIds])]
    );
  }

  async function submitDeleteOrders(orderIds: string[]) {
    const normalizedOrderIds = [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))];
    if (!normalizedOrderIds.length) return;

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      setDeleteBanner(null);

      const single = normalizedOrderIds.length === 1;
      const endpoint = single
        ? `/api/admin/rental/orders/${encodeURIComponent(normalizedOrderIds[0])}`
        : "/api/admin/rental/orders/bulk-delete";
      const res = await fetch(endpoint, {
        method: single ? "DELETE" : "POST",
        credentials: "include",
        headers: single ? undefined : { "Content-Type": "application/json" },
        body: single ? undefined : JSON.stringify({ orderIds: normalizedOrderIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete rental order");

      const deletedCount = single
        ? data?.status === "deleted"
          ? 1
          : 0
        : Number(data?.deletedCount ?? 0);
      const skippedCount = single
        ? data?.status === "not_found"
          ? 1
          : 0
        : Number(data?.skippedCount ?? 0);
      const failedCount = single ? 0 : Array.isArray(data?.failedIds) ? data.failedIds.length : 0;

      setDeleteBanner(
        single
          ? deletedCount > 0
            ? "Rental order permanently deleted."
            : "Rental order was already missing."
          : `Deleted ${deletedCount} order(s).${skippedCount > 0 ? ` Skipped ${skippedCount}.` : ""}${
              failedCount > 0 ? ` Failed ${failedCount}.` : ""
            }`
      );
      setDeleteDialog(null);
      setSelectedOrderIds((current) => current.filter((orderId) => !normalizedOrderIds.includes(orderId)));
      const nextOrders = await refreshOrders();
      await refreshInvoices(nextOrders);
      await refreshDowntime();
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete rental order");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function openDepositPanel(orderId: string) {
    setActiveDepositOrderId(orderId);
    setDepositPanelLoading(true);
    setDepositPanelError(null);
    setDepositPanelBanner(null);
    setDepositTransactions([]);
    setDepositActionType("release");
    setReleaseAmountInput("");
    setRetainAmountInput("");
    setResolutionNote("");
    setResolutionReference("");
    setLinkAssessmentToDeposit(false);
    setDamageInvoiceDescription("");
    setDamageInvoiceAmountInput("");
    setDamageInvoiceNotes("");
    setLinkAssessmentToDamageInvoice(false);
    setLinkedDamageInvoiceDepositTransactionId("");
    setDamageInvoiceError(null);
    setDamageInvoiceBanner(null);

    try {
      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/deposit`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load deposit detail");
      setDepositTransactions((data?.transactions ?? []) as RentalDepositTransaction[]);
      const summary = (data?.summary ?? null) as RentalOrderDepositSummary | null;
      if (summary) {
        setDepositSummariesByOrderId((prev) => ({
          ...prev,
          [orderId]: summary,
        }));
      }
    } catch (error) {
      setDepositPanelError(error instanceof Error ? error.message : "Failed to load deposit detail");
    } finally {
      setDepositPanelLoading(false);
    }
  }

  async function submitDepositResolution(orderId: string) {
    try {
      setDepositSaving(true);
      setDepositPanelError(null);
      setDepositPanelBanner(null);

      const linkedAssessmentId =
        linkAssessmentToDeposit &&
        activeDetailOrder?.assessment.status === "finalized" &&
        activeDetailOrder.assessment.assessmentId
          ? activeDetailOrder.assessment.assessmentId
          : undefined;

      const payload = {
        actionType: depositActionType,
        releaseAmountCents: Math.round(Number(releaseAmountInput || 0) * 100),
        retainAmountCents: Math.round(Number(retainAmountInput || 0) * 100),
        note: resolutionNote,
        externalReference: resolutionReference,
        damageAssessmentId: linkedAssessmentId,
      };

      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/deposit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to resolve deposit");

      const summary = (data?.summary ?? null) as RentalOrderDepositSummary | null;
      if (summary) {
        setDepositSummariesByOrderId((prev) => ({
          ...prev,
          [orderId]: summary,
        }));
      }
      const newTransactions = (data?.transactions ?? []) as RentalDepositTransaction[];
      setDepositTransactions((prev) => [...newTransactions, ...prev]);
      setDepositPanelBanner(String(data?.message ?? "Deposit resolution recorded."));
      setReleaseAmountInput("");
      setRetainAmountInput("");
      setResolutionNote("");
      setResolutionReference("");
      setLinkAssessmentToDeposit(false);
    } catch (error) {
      setDepositPanelError(error instanceof Error ? error.message : "Failed to resolve deposit");
    } finally {
      setDepositSaving(false);
    }
  }

  async function submitDamageInvoice(orderId: string) {
    try {
      setDamageInvoiceSaving(true);
      setDamageInvoiceError(null);
      setDamageInvoiceBanner(null);

      const linkedAssessmentId =
        linkAssessmentToDamageInvoice &&
        activeDetailOrder?.assessment.status === "finalized" &&
        activeDetailOrder.assessment.assessmentId
          ? activeDetailOrder.assessment.assessmentId
          : undefined;

      const payload = {
        description: damageInvoiceDescription,
        amountExclGstCents: Math.round(Number(damageInvoiceAmountInput || 0) * 100),
        notes: damageInvoiceNotes,
        damageAssessmentId: linkedAssessmentId,
        depositTransactionId: linkedDamageInvoiceDepositTransactionId || undefined,
      };

      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/damage-invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create damage charge invoice");

      const invoice = data?.invoice as Invoice | undefined;
      if (!invoice?.id) throw new Error("Damage invoice response missing id");

      setDamageInvoiceBanner(String(data?.message ?? "Damage charge invoice draft created."));
      setDamageInvoiceDescription("");
      setDamageInvoiceAmountInput("");
      setDamageInvoiceNotes("");
      setLinkAssessmentToDamageInvoice(false);
      setLinkedDamageInvoiceDepositTransactionId("");
      await refreshInvoices(orders);
      router.push(`/admin/rental/invoices/${encodeURIComponent(invoice.id)}`);
    } catch (error) {
      setDamageInvoiceError(error instanceof Error ? error.message : "Failed to create damage charge invoice");
    } finally {
      setDamageInvoiceSaving(false);
    }
  }

  async function acknowledgeOrder(orderId: string) {
    const current = orders.find((order) => order.id === orderId);
    if (!current || current.newOrderAcknowledgedAt) return;

    try {
      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to acknowledge order");
      const updated = data?.order as RentalOrder | undefined;
      if (updated?.id) {
        setOrders((existing) => existing.map((order) => (order.id === updated.id ? updated : order)));
      }
    } catch (error) {
      console.error("acknowledgeOrder failed", error);
    }
  }

  function openOperationsPanel(order: RentalOrder) {
    setActiveOpsOrderId(order.id);
    setOpsBanner(null);
    setOpsError(null);
    setOpsReturnStatus(normalizeOperationalReturnStatus(order.returnStatus));
    setOpsReturnedAt(order.returnedAt ? order.returnedAt.slice(0, 10) : "");
    setOpsReturnNotes(order.returnNotes ?? "");
    setOpsInspectionStatus(order.inspectionStatus);
    setOpsInspectionNotes(order.inspectionNotes ?? "");
    setOpsMarkCompleted(order.returnStatus === "completed");
  }

  async function submitOperationsUpdate(orderId: string) {
    try {
      if (opsGuardrails.impossible.length > 0) {
        setOpsError(opsGuardrails.impossible[0]);
        return;
      }

      setOpsSaving(true);
      setOpsBanner(null);
      setOpsError(null);

      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/operations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnStatus: opsReturnStatus,
          returnedAt: opsReturnedAt ? `${opsReturnedAt}T12:00:00.000+08:00` : null,
          returnNotes: opsReturnNotes,
          inspectionStatus: opsInspectionStatus,
          inspectionNotes: opsInspectionNotes,
          markCompleted: opsMarkCompleted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update return and inspection state");

      const updated = data?.order as RentalOrder;
      setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
      setOpsBanner("Return and inspection workflow updated.");
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to update return and inspection state");
    } finally {
      setOpsSaving(false);
    }
  }

  async function openExtensionPanel(orderId: string) {
    setActiveExtensionOrderId(orderId);
    setExtensionPanelLoading(true);
    setExtensionPanelError(null);
    setExtensionPanelBanner(null);
    setExtensionReviewNote("");

    try {
      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/extensions`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load extensions");
      setOrderExtensions((current) => ({
        ...current,
        [orderId]: (data?.extensions ?? []) as RentalOrderExtension[],
      }));
    } catch (error) {
      setExtensionPanelError(error instanceof Error ? error.message : "Failed to load extensions");
    } finally {
      setExtensionPanelLoading(false);
    }
  }

  async function reviewExtension(orderId: string, extensionId: string, action: "approve" | "reject") {
    try {
      setExtensionActingId(extensionId);
      setExtensionPanelError(null);
      setExtensionPanelBanner(null);
      const res = await fetch(
        `/api/admin/rental/orders/${encodeURIComponent(orderId)}/extensions/${encodeURIComponent(extensionId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reviewNote: extensionReviewNote,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to review extension");

      await openExtensionPanel(orderId);
      await refreshOrders();
      setExtensionPanelBanner(
        action === "approve" ? "Extension request reviewed and updated." : "Extension request rejected."
      );
      setExtensionReviewNote("");
    } catch (error) {
      setExtensionPanelError(error instanceof Error ? error.message : "Failed to review extension");
    } finally {
      setExtensionActingId(null);
    }
  }

  function closeDetailDrawer() {
    setDetailDrawer(null);
    setActiveOpsOrderId(null);
    setActiveDepositOrderId(null);
    setActiveExtensionOrderId(null);
  }

  function handleAssessmentSummaryChange(orderId: string, summary: RentalDamageAssessmentSummary) {
    setAssessmentSummariesByOrderId((current) => ({
      ...current,
      [orderId]: summary,
    }));
  }

  function openOrderWorkspace(order: RentalOrder, view: OrderDetailView = "operations") {
    setDetailDrawer({ orderId: order.id, view });
    void acknowledgeOrder(order.id);
    if (view === "operations") {
      setActiveDepositOrderId(null);
      setActiveExtensionOrderId(null);
      openOperationsPanel(order);
      return;
    }
    if (view === "assessment") {
      setActiveOpsOrderId(null);
      setActiveDepositOrderId(null);
      setActiveExtensionOrderId(null);
      return;
    }
    if (view === "deposit") {
      setActiveOpsOrderId(null);
      setActiveExtensionOrderId(null);
      void openDepositPanel(order.id);
      return;
    }
    setActiveOpsOrderId(null);
    setActiveDepositOrderId(null);
    void openExtensionPanel(order.id);
  }

  async function onCreateOrViewInvoice(o: RentalOrder) {
    try {
      const res = await fetch("/api/admin/rental/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create or load invoice");

      const inv = data?.invoice as Invoice | undefined;
      if (!inv?.id) throw new Error("Invoice create response missing id");

      await refreshInvoices(orders);
      router.push(`/admin/rental/invoices/${encodeURIComponent(inv.id)}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create invoice";
      alert(message);
    }
  }

  async function onRefreshAll() {
    const nextOrders = await refreshOrders();
    await refreshInvoices(nextOrders);
  }

  async function onSeedOrders() {
    if (!isDev) return;
    const seed = seedDemoOrders(items);
    if (!seed.length) return;

    try {
      setWorking(true);
      const res = await fetch("/api/admin/rental/orders/import-local", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: seed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to import demo orders");

      await onRefreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to seed demo orders";
      alert(message);
    } finally {
      setWorking(false);
    }
  }

  async function onDevReset() {
    if (!isDev) return;
    const ok = window.confirm("Delete all DB rental orders in development mode?");
    if (!ok) return;

    try {
      setWorking(true);
      const res = await fetch("/api/admin/rental/orders", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to reset orders");

      await onRefreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reset orders";
      alert(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 bg-slate-50 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B9382E]">
            <ClipboardList className="h-4 w-4" />
            Rental operations workspace
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[#2A2A2A]">Rental Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            Triage active rentals, return and inspection flow, deposit follow-up, and extension review from one DB-backed workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push("/admin/rental")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Rental
            </span>
          </button>

          <button
            onClick={onRefreshAll}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={working}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </span>
          </button>

          {isDev && (
            <>
              <button
                onClick={onSeedOrders}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                disabled={!items.length || working}
                title={!items.length ? "Load inventory first" : "Create demo DB orders"}
              >
                Seed demo orders
              </button>

              <button
                onClick={onDevReset}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={working}
                title="Development only"
              >
                Dev reset
              </button>
            </>
          )}
        </div>
      </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active rentals</div>
            <HardHat className="h-4 w-4 text-[#D24338]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{operationsSummary.activeRentals}</div>
          <div className="mt-1 text-xs text-slate-500">Orders currently out on rent.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Return / inspection queue</div>
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{operationsSummary.pendingReturnInspection}</div>
          <div className="mt-1 text-xs text-slate-500">Returned or pending inspection workflow.</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-rose-700">Inspection issues</div>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-rose-900">{operationsSummary.inspectionIssues}</div>
          <div className="mt-1 text-xs text-rose-700">Orders with recorded issues found.</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-amber-700">Unresolved deposit cases</div>
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{operationsSummary.unresolvedDepositCases}</div>
          <div className="mt-1 text-xs text-amber-700">Held deposits still needing action.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Downtime overlaps</div>
            <Wrench className="h-4 w-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{operationsSummary.downtimeAffected}</div>
          <div className="mt-1 text-xs text-slate-500">Orders intersecting active downtime blocks.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Charge snapshot</div>
            <BadgeDollarSign className="h-4 w-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(ordersSummary.totalRentalCharges)}</div>
          <div className="mt-1 text-xs text-slate-500">Charge totals exclude refundable deposits.</div>
        </div>
      </div>

      {deleteBanner && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {deleteBanner}
        </div>
      )}

      {deleteError && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {deleteError}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="h-4 w-4 text-[#D24338]" />
              Triage and filters
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Focus the list on orders that need operational attention.
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-700">{paginatedStart}</span>-<span className="font-semibold text-slate-700">{paginatedEnd}</span> of{" "}
            <span className="font-semibold text-slate-700">{filteredOrderRows.length}</span> filtered orders
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(180px,1fr))]">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Search</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Order ID, customer, equipment..."
              />
            </div>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Operational status</span>
            <select
              value={opsFilter}
              onChange={(e) => setOpsFilter(e.target.value as typeof opsFilter)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All operations</option>
              <option value="active">Active / out</option>
              <option value="returned">Returned</option>
              <option value="inspection">Needs inspection</option>
              <option value="issues">Issues found</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Deposit status</span>
            <select
              value={depositFilter}
              onChange={(e) => setDepositFilter(e.target.value as typeof depositFilter)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All deposits</option>
              <option value="unresolved">Needs resolution</option>
              <option value="pending">Pending</option>
              <option value="held">Held</option>
              <option value="released">Released</option>
              <option value="retained">Retained</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Attention</span>
            <select
              value={attentionFilter}
              onChange={(e) => setAttentionFilter(e.target.value as typeof attentionFilter)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All orders</option>
              <option value="attention">Any attention needed</option>
              <option value="extensions">Extension attention</option>
              <option value="downtime">Downtime overlap</option>
            </select>
          </label>
        </div>
      </div>

      {/* Orders table */}
      {loadingOrders ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading DB orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No rental orders found in DB.
          <div className="mt-2 text-xs text-slate-500">
            Public checkout now writes to DB via <span className="font-mono">/api/public/rental/orders</span>.
          </div>
        </div>
      ) : filteredOrderRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No orders match the current filters.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {developerDeleteEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-rose-900">Developer delete tools enabled</div>
                <div className="text-xs text-rose-700">
                  Permanent test-data cleanup only. Related invoices and operational records will also be deleted.
                </div>
              </div>
              <button
                type="button"
                disabled={selectedOrderIds.length === 0}
                onClick={() => setDeleteDialog({ mode: "bulk", orderIds: selectedOrderIds })}
                className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete Selected ({selectedOrderIds.length})
              </button>
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {developerDeleteEnabled && (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        paginatedOrderRows.length > 0 &&
                        paginatedOrderRows.every((row) => selectedOrderIds.includes(row.order.id))
                      }
                      onChange={toggleSelectAllCurrentOrders}
                      aria-label="Select all orders"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Rental</th>
                <th className="px-4 py-3">Operations</th>
                <th className="px-4 py-3">Deposit</th>
                <th className="px-4 py-3">Attention</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedOrderRows.map((row) => {
                const {
                  order: o,
                  buffer,
                  reservedUntil,
                  overlappingDowntime,
                  downtimeQty,
                  invoice: inv,
                  deposit,
                  assessment,
                  extensionNeedsAttention,
                  hasDepositAttention,
                  hasInspectionIssues,
                  hasAssessmentDraft,
                  needsAttention,
                } = row;
                const isNewOrder = !o.newOrderAcknowledgedAt;

                return (
                  <Fragment key={o.id}>
                  <tr className={`border-t ${isNewOrder ? "border-emerald-100 bg-emerald-50/40" : "border-slate-100"} ${!isNewOrder && needsAttention ? "bg-rose-50/20" : !isNewOrder ? "bg-white" : ""}`}>
                    {developerDeleteEnabled && (
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(o.id)}
                          onChange={() => toggleOrderSelection(o.id)}
                          aria-label={`Select order ${o.id}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{o.id}</div>
                        {isNewOrder && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        {o.customerSnapshot?.companyName ?? "Walk-in / direct customer"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {o.customerSnapshot?.contactName ?? "No contact"} Â· {formatDateTime(o.createdAt)}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-slate-900">{o.equipmentTitle}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {o.equipmentId} Â· Qty {o.qty} Â· {o.fulfillment === "deliver" ? "Deliver & collect" : "Self-collect"}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                        <CalendarClock className="h-3.5 w-3.5 text-[#D24338]" />
                        {o.start} â†’ {o.end}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Reserved until <span className="font-medium text-slate-700">{reservedUntil}</span>
                        {buffer > 0 ? ` Â· buffer ${buffer}d` : ""}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
                            opsBadgeTone(o.returnStatus, o.inspectionStatus),
                          ].join(" ")}
                        >
                          {returnStatusLabel(o.returnStatus)}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
                            opsBadgeTone(o.returnStatus, o.inspectionStatus),
                          ].join(" ")}
                        >
                          {inspectionStatusLabel(o.inspectionStatus)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Charge snapshot <span className="font-medium text-slate-700">{formatMoney(orderChargeTotal(o))}</span>
                      </div>
                      {inv && (
                        <div className="mt-1 text-xs text-slate-500">
                          Invoice {loadingInv ? "..." : inv.status.toUpperCase()}
                        </div>
                      )}
                      {assessment.exists && (
                        <div className="mt-1 text-xs text-slate-500">
                          Assessment {assessmentStatusLabel(assessment.status).toUpperCase()}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-slate-900">
                        {formatMoney(deposit.requiredAmountCents / 100)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Held {formatMoney(deposit.heldAmountCents / 100)} Â· Unresolved {formatMoney(deposit.unresolvedAmountCents / 100)}
                      </div>
                      <div className="mt-2">
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                            depositBadgeTone(deposit.status),
                          ].join(" ")}
                        >
                          {depositStatusLabel(deposit.status)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {hasInspectionIssues && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("critical")}`}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Inspection issues
                          </span>
                        )}
                        {hasDepositAttention && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("warning")}`}>
                            <Wallet className="h-3.5 w-3.5" />
                            Deposit unresolved
                          </span>
                        )}
                        {assessment.status === "draft" && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("info")}`}>
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Assessment draft
                          </span>
                        )}
                        {assessment.status === "finalized" && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("ok")}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Assessment finalized
                          </span>
                        )}
                        {overlappingDowntime.length > 0 && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("warning")}`}>
                            <Wrench className="h-3.5 w-3.5" />
                            Downtime {overlappingDowntime.length} / {downtimeQty}u
                          </span>
                        )}
                        {extensionNeedsAttention && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("info")}`}>
                            <ChevronRight className="h-3.5 w-3.5" />
                            Extension review
                          </span>
                        )}
                        {!needsAttention && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("ok")}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            No immediate blockers
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => openOrderWorkspace(o, "operations")}
                          className="rounded-lg border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-2 text-xs font-semibold text-[#B9382E] hover:bg-[#F2C7C2]"
                        >
                          Open workspace
                        </button>
                        <button
                          type="button"
                          onClick={() => onCreateOrViewInvoice(o)}
                          className={[
                            "rounded-lg px-3 py-2 text-xs font-semibold",
                            inv ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-sky-600 text-white hover:bg-sky-700",
                          ].join(" ")}
                        >
                          {inv ? "View Invoice" : "Create Invoice"}
                        </button>
                        <details className="relative">
                          <summary className="list-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600 hover:bg-slate-50">
                            <MoreHorizontal className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-10 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                            <button
                              type="button"
                              onClick={() => openOrderWorkspace(o, "operations")}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <ClipboardCheck className="h-4 w-4 text-slate-500" />
                              Return / inspection
                            </button>
                            <button
                              type="button"
                              onClick={() => openOrderWorkspace(o, "assessment")}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <ShieldAlert className="h-4 w-4 text-slate-500" />
                              Damage assessment
                            </button>
                            <button
                              type="button"
                              onClick={() => openOrderWorkspace(o, "extensions")}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                              Review extensions
                            </button>
                            {deposit.heldAmountCents > 0 && deposit.unresolvedAmountCents > 0 && (
                              <button
                                type="button"
                                onClick={() => openOrderWorkspace(o, "deposit")}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Wallet className="h-4 w-4 text-slate-500" />
                                Resolve deposit
                              </button>
                            )}
                            <button
                              type="button"
                              disabled
                              title="Coming soon: release buffer early by marking maintenance completed"
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-400"
                            >
                              <Wrench className="h-4 w-4" />
                              Release early
                            </button>
                            {developerDeleteEnabled && (
                              <button
                                type="button"
                                onClick={() => setDeleteDialog({ mode: "single", orderIds: [o.id] })}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete permanently
                              </button>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                  {false && activeOpsOrderId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={developerDeleteEnabled ? 11 : 10} className="px-4 py-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Return & Inspection</div>
                              <div className="text-xs text-slate-500">
                                Record return, inspection outcome, and notes before using the separate deposit
                                resolution workflow.
                              </div>
                            </div>
                            <span
                              className={[
                                "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                                opsBadgeTone(o.returnStatus, o.inspectionStatus),
                              ].join(" ")}
                            >
                              {returnStatusLabel(o.returnStatus)} / {inspectionStatusLabel(o.inspectionStatus)}
                            </span>
                          </div>

                          {opsBanner && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                              {opsBanner}
                            </div>
                          )}

                          {opsError && (
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                              {opsError}
                            </div>
                          )}

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="space-y-5">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-sm">
                                  <span className="text-slate-700">Return Status</span>
                                  <select
                                    value={opsReturnStatus}
                                    onChange={(e) => setOpsReturnStatus(e.target.value as RentalOrderReturnStatus)}
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  >
                                    <option value="out">Active / Out</option>
                                    <option value="returned">Returned</option>
                                    <option value="completed">Completed</option>
                                  </select>
                                </label>

                                <label className="grid gap-1 text-sm">
                                  <span className="text-slate-700">Inspection Status</span>
                                  <select
                                    value={opsInspectionStatus}
                                    onChange={(e) =>
                                      setOpsInspectionStatus(e.target.value as RentalOrderInspectionStatus)
                                    }
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  >
                                    <option value="not_started">Not Started</option>
                                    <option value="pending">Pending</option>
                                    <option value="passed">Passed</option>
                                    <option value="issues_found">Issues Found</option>
                                  </select>
                                </label>
                              </div>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Returned On</span>
                                <input
                                  type="date"
                                  value={opsReturnedAt}
                                  onChange={(e) => setOpsReturnedAt(e.target.value)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Return Notes</span>
                                <textarea
                                  value={opsReturnNotes}
                                  onChange={(e) => setOpsReturnNotes(e.target.value)}
                                  className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Returned by site contact, missing accessories, pickup observations..."
                                />
                              </label>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Inspection Notes</span>
                                <textarea
                                  value={opsInspectionNotes}
                                  onChange={(e) => setOpsInspectionNotes(e.target.value)}
                                  className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Inspection outcome, damage notes, follow-up needed..."
                                />
                              </label>

                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={opsMarkCompleted}
                                  onChange={(e) => setOpsMarkCompleted(e.target.checked)}
                                />
                                Mark workflow completed
                              </label>

                              <button
                                type="button"
                                onClick={() => submitOperationsUpdate(o.id)}
                                disabled={opsSaving}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                              >
                                {opsSaving ? "Saving..." : "Save Return & Inspection"}
                              </button>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                              <div className="text-sm font-semibold text-slate-900">Operational Summary</div>
                              <div className="mt-3">Return Status: {returnStatusLabel(o.returnStatus)}</div>
                              <div className="mt-1">Returned On: {o.returnedAt ? formatDateTime(String(o.returnedAt)) : "-"}</div>
                              <div className="mt-1">Inspection: {inspectionStatusLabel(o.inspectionStatus)}</div>
                              <div className="mt-1">Completed: {o.completedAt ? formatDateTime(String(o.completedAt)) : "-"}</div>
                              <div className="mt-3">
                                Deposit Status: {depositStatusLabel(deposit.status)} | Held{" "}
                                {formatMoney(deposit.heldAmountCents / 100)} | Unresolved{" "}
                                {formatMoney(deposit.unresolvedAmountCents / 100)}
                              </div>
                              <div className="mt-3 text-slate-500">
                                Deposit release or retention remains a separate admin action after return and inspection
                                are recorded.
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {false && activeDepositOrderId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={developerDeleteEnabled ? 11 : 10} className="px-4 py-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Deposit Resolution</div>
                              <div className="text-xs text-slate-500">
                                Held: {formatMoney(deposit.heldAmountCents / 100)} Â· Released:{" "}
                                {formatMoney(deposit.releasedAmountCents / 100)} Â· Retained:{" "}
                                {formatMoney(deposit.retainedAmountCents / 100)} Â· Unresolved:{" "}
                                {formatMoney(deposit.unresolvedAmountCents / 100)}
                              </div>
                            </div>
                            <span
                              className={[
                                "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                                depositBadgeTone(deposit.status),
                              ].join(" ")}
                            >
                              {depositStatusLabel(deposit.status)}
                            </span>
                          </div>

                          {deposit.lastResolutionNote && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                              Latest resolution: {deposit.lastResolutionType ?? "-"} Â· {deposit.lastResolutionNote}
                              {deposit.resolvedAt ? ` Â· ${formatDateTime(deposit.resolvedAt)}` : ""}
                            </div>
                          )}

                          {depositPanelBanner && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                              {depositPanelBanner}
                            </div>
                          )}

                          {depositPanelError && (
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                              {depositPanelError}
                            </div>
                          )}

                          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_320px]">
                            <div className="space-y-5">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <label className="grid gap-1 text-sm">
                                  <span className="text-slate-700">Action</span>
                                  <select
                                    value={depositActionType}
                                    onChange={(e) =>
                                      setDepositActionType(
                                        e.target.value as "release" | "retain" | "split"
                                      )
                                    }
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  >
                                    <option value="release">Release / refund record</option>
                                    <option value="retain">Retain</option>
                                    <option value="split">Split release + retain</option>
                                  </select>
                                </label>

                                {(depositActionType === "release" || depositActionType === "split") && (
                                  <label className="grid gap-1 text-sm">
                                    <span className="text-slate-700">Release Amount (SGD)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={releaseAmountInput}
                                      onChange={(e) => setReleaseAmountInput(e.target.value)}
                                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                  </label>
                                )}

                                {(depositActionType === "retain" || depositActionType === "split") && (
                                  <label className="grid gap-1 text-sm">
                                    <span className="text-slate-700">Retain Amount (SGD)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={retainAmountInput}
                                      onChange={(e) => setRetainAmountInput(e.target.value)}
                                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                  </label>
                                )}
                              </div>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Reason / Note</span>
                                <textarea
                                  value={resolutionNote}
                                  onChange={(e) => setResolutionNote(e.target.value)}
                                  className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Inspection outcome, refund note, damage retention reason..."
                                />
                              </label>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Refund / Reference (optional)</span>
                                <input
                                  type="text"
                                  value={resolutionReference}
                                  onChange={(e) => setResolutionReference(e.target.value)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Manual refund ref, bank transfer ref, internal note..."
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => submitDepositResolution(o.id)}
                                disabled={depositSaving || depositPanelLoading}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                              >
                                {depositSaving ? "Recording..." : "Record Deposit Resolution"}
                              </button>
                            </div>

                            <div>
                              <div className="text-sm font-semibold text-slate-900">Recent Deposit Activity</div>
                              {depositPanelLoading ? (
                                <div className="mt-3 text-sm text-slate-500">Loading deposit history...</div>
                              ) : depositTransactions.length === 0 ? (
                                <div className="mt-3 text-sm text-slate-500">No deposit transactions recorded.</div>
                              ) : (
                                <div className="mt-3 space-y-2">
                                  {depositTransactions.slice(0, 6).map((transaction) => (
                                    <div
                                      key={transaction.id}
                                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-slate-900">
                                          {depositTransactionLabel(transaction.transactionType)}
                                        </span>
                                        <span>{formatMoney(transaction.amountCents / 100)}</span>
                                      </div>
                                      <div className="mt-1">{formatDateTime(transaction.createdAt)}</div>
                                      {transaction.notes && <div className="mt-1">{transaction.notes}</div>}
                                      {transaction.externalReference && (
                                        <div className="mt-1">Ref: {transaction.externalReference}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {false && activeExtensionOrderId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={developerDeleteEnabled ? 11 : 10} className="px-4 py-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Extension Review</div>
                              <div className="text-xs text-slate-500">
                                Review customer extension requests without changing the original order dates until the
                                extension is confirmed.
                              </div>
                            </div>
                            <div className="text-xs text-slate-500">
                              Payment terms: {o.customerSnapshot?.paymentTerms ?? "upfront"}
                            </div>
                          </div>

                          {extensionPanelBanner && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                              {extensionPanelBanner}
                            </div>
                          )}

                          {extensionPanelError && (
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                              {extensionPanelError}
                            </div>
                          )}

                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <label className="grid gap-1 text-sm">
                              <span className="text-slate-700">Review note</span>
                              <textarea
                                value={extensionReviewNote}
                                onChange={(e) => setExtensionReviewNote(e.target.value)}
                                className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="Approval note, payment instruction, or rejection context..."
                              />
                            </label>
                          </div>

                          {extensionPanelLoading ? (
                            <div className="mt-4 text-sm text-slate-500">Loading extension requests...</div>
                          ) : (orderExtensions[o.id] ?? []).length === 0 ? (
                            <div className="mt-4 text-sm text-slate-500">No extension requests recorded for this order.</div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {(orderExtensions[o.id] ?? []).map((extension) => (
                                <div key={extension.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-slate-900">
                                        Through {extension.requestedRentalEnd}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        Current end {extension.currentRentalEnd} | Requested {formatDateTime(extension.createdAt)}
                                      </div>
                                    </div>
                                    <span
                                      className={[
                                        "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                                        extensionBadgeTone(extension.status),
                                      ].join(" ")}
                                    >
                                      {extensionStatusLabel(extension.status)}
                                    </span>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                      Estimated: {formatMoney(extension.extensionChargeEstimateCents / 100)}
                                    </div>
                                    <div>
                                      Final: {formatMoney((extension.finalExtensionChargeCents ?? 0) / 100)}
                                    </div>
                                    <div>Payment terms: {extension.paymentTermsSnapshot}</div>
                                    <div>Availability: {extension.availabilityStatus}</div>
                                  </div>

                                  {(extension.availabilityMessage || extension.customerMessage || extension.reviewNote) && (
                                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                                      {extension.availabilityMessage && <div>Availability: {extension.availabilityMessage}</div>}
                                      {extension.customerMessage && <div>Customer note: {extension.customerMessage}</div>}
                                      {extension.reviewNote && <div>Review note: {extension.reviewNote}</div>}
                                    </div>
                                  )}

                                  {(extension.status === "awaiting_admin_review" ||
                                    extension.status === "availability_blocked") && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => reviewExtension(o.id, extension.id, "approve")}
                                        disabled={extensionActingId === extension.id}
                                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                                      >
                                        {extensionActingId === extension.id ? "Saving..." : "Approve"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => reviewExtension(o.id, extension.id, "reject")}
                                        disabled={extensionActingId === extension.id}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="text-xs text-slate-500">
    Showing <span className="font-semibold text-slate-700">{paginatedStart}</span>-
    <span className="font-semibold text-slate-700">{paginatedEnd}</span> of{" "}
    <span className="font-semibold text-slate-700">{filteredOrderRows.length}</span> filtered orders
  </div>

  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
      disabled={currentPage === 1}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Previous
    </button>

    <div className="text-sm text-slate-600">
      Page <span className="font-semibold text-slate-900">{currentPage}</span> of{" "}
      <span className="font-semibold text-slate-900">{totalPages}</span>
    </div>

    <button
      type="button"
      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
      disabled={currentPage === totalPages}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Next
    </button>
  </div>
</div>

          <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
            Orders source: <span className="font-mono">Supabase Postgres</span> â€¢ Invoices source:{" "}
            <span className="font-mono">Supabase Postgres</span>.
          </div>
        </div>
      )}

      {detailDrawer && detailOrder && activeDetailOrder && (
  <div className="fixed inset-y-0 right-0 z-40 flex w-full justify-end bg-slate-900/20">
    <div className="h-full w-full md:max-w-[min(62vw,1040px)] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
  <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B9382E]">
              <ClipboardList className="h-4 w-4" />
              Order workspace
            </div>
            <div className="mt-3 text-lg font-semibold text-[#2A2A2A]">{detailOrder.id}</div>
            <div className="mt-1 text-sm text-slate-600">
              {detailOrder.customerSnapshot?.companyName ?? "Direct customer"} · {detailOrder.equipmentTitle}
            </div>
          </div>

          <button
            type="button"
            onClick={closeDetailDrawer}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Workflow guide
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {drawerWorkflowSteps.map((step, index) => {
              const tone =
                step.state === "done"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : step.state === "current"
                    ? "border-[#F2C7C2] bg-[#FFF6F4] text-[#8A453F]"
                    : "border-slate-200 bg-white text-slate-500";

              return (
                <div
                  key={step.label}
                  className={[
                    "min-w-[180px] flex-1 rounded-2xl border px-4 py-3",
                    tone,
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-[10px]">
                      {index + 1}
                    </span>
                    {step.label}
                  </div>
                  <div className="mt-2 text-xs leading-5">{step.description}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Use this as a quick reference for what should happen next.
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openOrderWorkspace(detailOrder, "operations")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              detailDrawer.view === "operations"
                ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Return / inspection
          </button>
          <button
            type="button"
            onClick={() => openOrderWorkspace(detailOrder, "assessment")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              detailDrawer.view === "assessment"
                ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Assessment
          </button>
          <button
            type="button"
            onClick={() => openOrderWorkspace(detailOrder, "deposit")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              detailDrawer.view === "deposit"
                ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => openOrderWorkspace(detailOrder, "extensions")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              detailDrawer.view === "extensions"
                ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Extensions
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-5">
            {detailDrawer.view === "operations" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ClipboardCheck className="h-4 w-4 text-[#D24338]" />
                  Return & inspection workflow
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Record the physical return first, then finish inspection, then close the operational workflow when follow-up is done.
                </div>

                {opsBanner && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {opsBanner}
                  </div>
                )}

                {opsError && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {opsError}
                  </div>
                )}

                {opsGuardrails.impossible.length > 0 && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <div className="font-semibold">This combination cannot be saved yet.</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {opsGuardrails.impossible.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {opsGuardrails.warnings.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <div className="font-semibold">Before you close this workflow</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {opsGuardrails.warnings.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Physical return status</span>
                    <select
                      value={normalizeOperationalReturnStatus(opsReturnStatus)}
                      onChange={(e) => setOpsReturnStatus(e.target.value as RentalOrderReturnStatus)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="out">Active / out on rent</option>
                      <option value="returned">Returned to yard / site</option>
                    </select>
                    <span className="text-xs text-slate-500">{returnStatusHelp(opsReturnStatus)}</span>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Inspection status</span>
                    <select
                      value={opsInspectionStatus}
                      onChange={(e) => setOpsInspectionStatus(e.target.value as RentalOrderInspectionStatus)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="not_started">Not started</option>
                      <option
                        value="pending"
                        disabled={normalizeOperationalReturnStatus(opsReturnStatus) === "out"}
                      >
                        Pending inspection
                      </option>
                      <option
                        value="passed"
                        disabled={normalizeOperationalReturnStatus(opsReturnStatus) === "out"}
                      >
                        Passed - no issues
                      </option>
                      <option
                        value="issues_found"
                        disabled={normalizeOperationalReturnStatus(opsReturnStatus) === "out"}
                      >
                        Issues found - follow-up needed
                      </option>
                    </select>
                    <span className="text-xs text-slate-500">{inspectionStatusHelp(opsInspectionStatus)}</span>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Returned on</span>
                    <input
                      type="date"
                      value={opsReturnedAt}
                      onChange={(e) => setOpsReturnedAt(e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <span className="text-xs text-slate-500">
                      Add the date the equipment physically came back.
                    </span>
                  </label>

                  <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={opsMarkCompleted}
                      onChange={(e) => setOpsMarkCompleted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-slate-900">Close order workflow</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Use this only after the equipment is returned and inspection is finished. This does not resolve deposit, invoicing, or credit automatically.
                      </span>
                    </span>
                  </label>
                </div>

                <label className="mt-4 grid gap-1 text-sm">
                  <span className="text-slate-700">Return notes</span>
                  <textarea
                    value={opsReturnNotes}
                    onChange={(e) => setOpsReturnNotes(e.target.value)}
                    className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label className="mt-4 grid gap-1 text-sm">
                  <span className="text-slate-700">Inspection notes</span>
                  <textarea
                    value={opsInspectionNotes}
                    onChange={(e) => setOpsInspectionNotes(e.target.value)}
                    className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-5 flex justify-start">
                  <button
                    type="button"
                    onClick={() => submitOperationsUpdate(detailOrder.id)}
                    disabled={opsSaving || opsGuardrails.impossible.length > 0}
                    className="rounded-lg bg-[#D24338] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                  >
                    {opsSaving ? "Saving..." : "Save operational workflow"}
                  </button>
                </div>
              </div>
            )}

            {detailDrawer.view === "assessment" && (
              <OrderDamageAssessmentPanel
                order={detailOrder}
                summary={activeDetailOrder.assessment}
                onSummaryChange={(summary) => handleAssessmentSummaryChange(detailOrder.id, summary)}
              />
            )}

            {detailDrawer.view === "deposit" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Wallet className="h-4 w-4 text-[#D24338]" />
                  Deposit resolution
                </div>

                {depositPanelBanner && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {depositPanelBanner}
                  </div>
                )}

                {depositPanelError && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {depositPanelError}
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Damage assessment context</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Advisory evidence only. Deposit release or retention still requires an explicit manual action below.
                  </div>

                  {!activeDetailOrder.assessment.exists && (
                    <div className="mt-3 text-sm text-slate-600">
                      No damage assessment recorded for this order.
                    </div>
                  )}

                  {activeDetailOrder.assessment.exists && (
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      <div>Status: {assessmentStatusLabel(activeDetailOrder.assessment.status)}</div>
                      <div>Result: {assessmentResultLabel(activeDetailOrder.assessment.assessmentResult)}</div>
                      <div>
                        Issue categories:{" "}
                        {activeDetailOrder.assessment.issueCategories.length > 0
                          ? activeDetailOrder.assessment.issueCategories.join(", ")
                          : "None recorded"}
                      </div>
                      <div>
                        Estimated retention:{" "}
                        {formatMoney(activeDetailOrder.assessment.estimatedRetentionCents / 100)}
                      </div>
                      <div>
                        Recommended action:{" "}
                        {recommendedAssessmentActionLabel(
                          activeDetailOrder.assessment.recommendedDepositAction
                        )}
                      </div>
                    </div>
                  )}

                  {activeDetailOrder.assessment.status === "finalized" &&
                    activeDetailOrder.assessment.assessmentId && (
                      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={linkAssessmentToDeposit}
                          onChange={(e) => setLinkAssessmentToDeposit(e.target.checked)}
                        />
                        <span>
                          Link finalized assessment{" "}
                          <span className="font-mono text-xs">
                            {activeDetailOrder.assessment.assessmentId}
                          </span>{" "}
                          to this deposit resolution.
                        </span>
                      </label>
                    )}

                  {activeDetailOrder.assessment.exists &&
                    activeDetailOrder.assessment.status !== "finalized" && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Draft assessments can be reviewed here but cannot be linked as finalized deposit evidence yet.
                      </div>
                    )}
                </div>

                <div className="mt-4 rounded-xl border border-[#F2C7C2] bg-[#FFF6F4] p-4">
                  <div className="text-sm font-semibold text-slate-900">Deposit resolution action</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Record the manual release or retain decision here. This is the primary action in this tab.
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-sm">
                      <span className="text-slate-700">Action</span>
                      <select
                        value={depositActionType}
                        onChange={(e) =>
                          setDepositActionType(e.target.value as "release" | "retain" | "split")
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="release">Release / refund record</option>
                        <option value="retain">Retain</option>
                        <option value="split">Split release + retain</option>
                      </select>
                    </label>

                    {(depositActionType === "release" || depositActionType === "split") && (
                      <label className="grid gap-1 text-sm">
                        <span className="text-slate-700">Release amount (SGD)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={releaseAmountInput}
                          onChange={(e) => setReleaseAmountInput(e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    )}

                    {(depositActionType === "retain" || depositActionType === "split") && (
                      <label className="grid gap-1 text-sm">
                        <span className="text-slate-700">Retain amount (SGD)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={retainAmountInput}
                          onChange={(e) => setRetainAmountInput(e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    )}
                  </div>

                  <label className="mt-3 grid gap-1 text-sm">
                    <span className="text-slate-700">Reason / note</span>
                    <textarea
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="mt-3 grid gap-1 text-sm">
                    <span className="text-slate-700">Refund / reference</span>
                    <input
                      type="text"
                      value={resolutionReference}
                      onChange={(e) => setResolutionReference(e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => submitDepositResolution(detailOrder.id)}
                    disabled={depositSaving || depositPanelLoading}
                    className="mt-4 rounded-lg bg-[#D24338] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                  >
                    {depositSaving ? "Recording..." : "Record deposit resolution"}
                  </button>
                </div>

                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <BadgeDollarSign className="h-4 w-4 text-[#D24338]" />
                    Manual damage charge invoice
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Separate finance action only. This creates a normal draft invoice and does not automate deposit, invoicing, or credit decisions.
                  </div>

                  {damageInvoiceBanner && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      {damageInvoiceBanner}
                    </div>
                  )}

                  {damageInvoiceError && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {damageInvoiceError}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm sm:col-span-2">
                      <span className="text-slate-700">Description</span>
                      <input
                        type="text"
                        value={damageInvoiceDescription}
                        onChange={(e) => setDamageInvoiceDescription(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder={`Damage charge for ${detailOrder.equipmentTitle}`}
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-slate-700">Amount (Excl GST, SGD)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={damageInvoiceAmountInput}
                        onChange={(e) => setDamageInvoiceAmountInput(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-slate-700">Linked deposit decision</span>
                      <select
                        value={linkedDamageInvoiceDepositTransactionId}
                        onChange={(e) => setLinkedDamageInvoiceDepositTransactionId(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {depositResolutionTransactions.map((transaction) => (
                          <option key={transaction.id} value={transaction.id}>
                            {depositTransactionLabel(transaction.transactionType)} ·{" "}
                            {formatMoney(transaction.amountCents / 100)} · {transaction.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 grid gap-1 text-sm">
                    <span className="text-slate-700">Internal finance note</span>
                    <textarea
                      value={damageInvoiceNotes}
                      onChange={(e) => setDamageInvoiceNotes(e.target.value)}
                      className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>

                  {activeDetailOrder.assessment.status === "finalized" &&
                    activeDetailOrder.assessment.assessmentId && (
                      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={linkAssessmentToDamageInvoice}
                          onChange={(e) => setLinkAssessmentToDamageInvoice(e.target.checked)}
                        />
                        <span>
                          Link finalized assessment{" "}
                          <span className="font-mono text-xs">
                            {activeDetailOrder.assessment.assessmentId}
                          </span>{" "}
                          as evidence for this invoice draft.
                        </span>
                      </label>
                    )}

                  {activeDetailOrder.assessment.exists &&
                    activeDetailOrder.assessment.status !== "finalized" && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Draft assessments are visible for context but cannot be linked as finalized invoice evidence yet.
                      </div>
                    )}

                  <button
                    type="button"
                    onClick={() => submitDamageInvoice(detailOrder.id)}
                    disabled={damageInvoiceSaving || depositPanelLoading}
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                  >
                    {damageInvoiceSaving ? "Creating..." : "Create damage invoice draft"}
                  </button>
                </div>
              </div>
            )}

            {detailDrawer.view === "extensions" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ChevronRight className="h-4 w-4 text-[#D24338]" />
                  Extension review
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Review the note once, then work through each request card below.
                </div>

                {extensionPanelBanner && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {extensionPanelBanner}
                  </div>
                )}

                {extensionPanelError && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {extensionPanelError}
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Review note</span>
                    <textarea
                      value={extensionReviewNote}
                      onChange={(e) => setExtensionReviewNote(e.target.value)}
                      className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                {extensionPanelLoading ? (
                  <div className="mt-4 text-sm text-slate-500">Loading extension requests...</div>
                ) : activeDetailOrder.knownExtensions.length === 0 ? (
                  <div className="mt-4 text-sm text-slate-500">
                    No extension requests recorded for this order.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {activeDetailOrder.knownExtensions.map((extension) => (
                      <div
                        key={extension.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              Through {extension.requestedRentalEnd}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Current end {extension.currentRentalEnd} · Requested{" "}
                              {formatDateTime(extension.createdAt)}
                            </div>
                          </div>
                          <span
                            className={[
                              "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                              extensionBadgeTone(extension.status),
                            ].join(" ")}
                          >
                            {extensionStatusLabel(extension.status)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            Estimated: {formatMoney(extension.extensionChargeEstimateCents / 100)}
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            Final: {formatMoney((extension.finalExtensionChargeCents ?? 0) / 100)}
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            Payment terms: {extension.paymentTermsSnapshot}
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            Availability: {extension.availabilityStatus}
                          </div>
                        </div>

                        {(extension.availabilityMessage ||
                          extension.customerMessage ||
                          extension.reviewNote) && (
                          <div className="mt-3 space-y-1 text-xs text-slate-600">
                            {extension.availabilityMessage && (
                              <div>Availability: {extension.availabilityMessage}</div>
                            )}
                            {extension.customerMessage && (
                              <div>Customer note: {extension.customerMessage}</div>
                            )}
                            {extension.reviewNote && <div>Review note: {extension.reviewNote}</div>}
                          </div>
                        )}

                        {(extension.status === "awaiting_admin_review" ||
                          extension.status === "availability_blocked") && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => reviewExtension(detailOrder.id, extension.id, "approve")}
                              disabled={extensionActingId === extension.id}
                              className="rounded-lg bg-[#D24338] px-3 py-2 text-xs font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                            >
                              {extensionActingId === extension.id ? "Saving..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewExtension(detailOrder.id, extension.id, "reject")}
                              disabled={extensionActingId === extension.id}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Operational summary</div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Lifecycle
                  </div>
                  <dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm text-slate-600">
                    <dt className="text-slate-500">Return</dt>
                    <dd className="text-slate-900">{returnStatusLabel(detailOrder.returnStatus)}</dd>

                    <dt className="text-slate-500">Inspection</dt>
                    <dd className="text-slate-900">
                      {inspectionStatusLabel(detailOrder.inspectionStatus)}
                    </dd>

                    <dt className="text-slate-500">Closed</dt>
                    <dd className="text-slate-900">
                      {detailOrder.completedAt ? formatDateTime(String(detailOrder.completedAt)) : "-"}
                    </dd>

                    <dt className="text-slate-500">Reserved</dt>
                    <dd className="text-slate-900">{activeDetailOrder.reservedUntil}</dd>
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Assessment
                  </div>
                  <dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm text-slate-600">
                    <dt className="text-slate-500">Status</dt>
                    <dd className="text-slate-900">
                      {assessmentStatusLabel(activeDetailOrder.assessment.status)}
                    </dd>

                    <dt className="text-slate-500">Result</dt>
                    <dd className="text-slate-900">
                      {assessmentResultLabel(activeDetailOrder.assessment.assessmentResult)}
                    </dd>

                    <dt className="text-slate-500">Action</dt>
                    <dd className="text-slate-900">
                      {recommendedAssessmentActionLabel(
                        activeDetailOrder.assessment.recommendedDepositAction
                      )}
                    </dd>

                    <dt className="text-slate-500">Estimate</dt>
                    <dd className="text-slate-900">
                      {formatMoney(activeDetailOrder.assessment.estimatedRetentionCents / 100)}
                    </dd>
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Deposit
                  </div>
                  <dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm text-slate-600">
                    <dt className="text-slate-500">Status</dt>
                    <dd className="text-slate-900">
                      {depositStatusLabel(activeDetailOrder.deposit.status)}
                    </dd>

                    <dt className="text-slate-500">Held</dt>
                    <dd className="text-slate-900">
                      {formatMoney(activeDetailOrder.deposit.heldAmountCents / 100)}
                    </dd>

                    <dt className="text-slate-500">Unresolved</dt>
                    <dd className="text-slate-900">
                      {formatMoney(activeDetailOrder.deposit.unresolvedAmountCents / 100)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Attention</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeDetailOrder.hasInspectionIssues && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("critical")}`}
                  >
                    Inspection issues
                  </span>
                )}
                {activeDetailOrder.hasAssessmentDraft && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("info")}`}
                  >
                    Assessment draft
                  </span>
                )}
                {activeDetailOrder.hasDepositAttention && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("warning")}`}
                  >
                    Deposit unresolved
                  </span>
                )}
                {activeDetailOrder.hasDowntimeImpact && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("warning")}`}
                  >
                    Downtime overlap
                  </span>
                )}
                {activeDetailOrder.extensionNeedsAttention && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("info")}`}
                  >
                    Extension review
                  </span>
                )}
                {!activeDetailOrder.needsAttention && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warningChipTone("ok")}`}
                  >
                    No immediate blockers
                  </span>
                )}
              </div>
            </div>

            {detailDrawer.view === "deposit" && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Recent deposit activity</div>

                {depositPanelLoading ? (
                  <div className="mt-3 text-sm text-slate-500">Loading deposit history...</div>
                ) : depositTransactions.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-500">No deposit transactions recorded.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {depositTransactions.slice(0, 6).map((transaction) => (
                      <div
                        key={transaction.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-slate-900">
                            {depositTransactionLabel(transaction.transactionType)}
                          </span>
                          <span>{formatMoney(transaction.amountCents / 100)}</span>
                        </div>
                        <div className="mt-1">{formatDateTime(transaction.createdAt)}</div>
                        {transaction.notes && <div className="mt-1">{transaction.notes}</div>}
                        {transaction.externalReference && (
                          <div className="mt-1">Ref: {transaction.externalReference}</div>
                        )}
                        {transaction.damageAssessmentId && (
                          <div className="mt-1">Assessment: {transaction.damageAssessmentId}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
)}

      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="text-lg font-semibold text-slate-900">Permanently delete rental order data?</div>
            <div className="mt-2 text-sm text-slate-600">
              This developer-only action permanently deletes the selected rental order
              {deleteDialog.orderIds.length === 1 ? "" : "s"} and linked records such as invoices, payment
              allocations, extensions, and operational holds.
            </div>
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              This cannot be undone. Use it for test data cleanup only.
            </div>
            <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {deleteDialog.orderIds.map((orderId) => (
                <div key={orderId} className="font-mono">
                  {orderId}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteDialog(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitDeleteOrders(deleteDialog.orderIds)}
                disabled={deleteSubmitting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:bg-rose-300"
              >
                {deleteSubmitting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

