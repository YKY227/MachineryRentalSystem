"use client";

import { useEffect, useMemo, useState } from "react";
import type { Equipment } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";

export function useAdminEquipments(opts?: {
  persistKey?: string;
}) {
  const persistKey = opts?.persistKey ?? "rental_selected_equipment_v1";

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      const list = await localEquipmentRepo.listAdmin();
      if (!mounted) return;

      setEquipments(list);

      const stored = typeof window !== "undefined"
        ? window.localStorage.getItem(persistKey)
        : null;

      const first =
        stored && list.some((e) => e.id === stored)
          ? stored
          : list[0]?.id ?? "";

      setSelectedEquipmentId(first);
    })();

    return () => {
      mounted = false;
    };
  }, [persistKey]);

  useEffect(() => {
    if (!selectedEquipmentId) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(persistKey, selectedEquipmentId);
  }, [persistKey, selectedEquipmentId]);

  const selectedEquipment = useMemo(
    () => equipments.find((e) => e.id === selectedEquipmentId) ?? null,
    [equipments, selectedEquipmentId]
  );

  return {
    equipments,
    selectedEquipmentId,
    setSelectedEquipmentId,
    selectedEquipment,
  };
}
