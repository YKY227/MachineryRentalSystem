import "server-only";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { dbAdminSettingsRepo, DEFAULT_OPERATIONS_POLICY_SETTINGS } from "@/lib/settings/db-admin-settings-repo";

export type RentalEquipmentAvailabilityConfig = {
  equipmentId: string;
  title: string;
  totalUnits: number;
  maintenanceBufferDays: number;
};

export async function getRentalEquipmentAvailabilityConfig(
  equipmentId: string
): Promise<RentalEquipmentAvailabilityConfig> {
  const [equipment, operationsPolicy] = await Promise.all([
    dbRentalEquipmentRepo.getById(equipmentId),
    dbAdminSettingsRepo.getOperationsPolicy().catch(() => DEFAULT_OPERATIONS_POLICY_SETTINGS),
  ]);
  if (!equipment) {
    throw new Error("Equipment inventory configuration not found");
  }

  return {
    equipmentId: equipment.id,
    title: equipment.title,
    totalUnits: Math.max(0, Number(equipment.totalUnits ?? 0)),
    maintenanceBufferDays: Math.max(
      0,
      Number(
        equipment.maintenanceBufferDays ?? operationsPolicy.defaultMaintenanceBufferDays
      )
    ),
  };
}
