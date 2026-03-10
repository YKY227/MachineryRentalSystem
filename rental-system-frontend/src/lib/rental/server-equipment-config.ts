import "server-only";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";

const DEFAULT_MAINTENANCE_BUFFER_DAYS = 7;

export type RentalEquipmentAvailabilityConfig = {
  equipmentId: string;
  title: string;
  totalUnits: number;
  maintenanceBufferDays: number;
};

export async function getRentalEquipmentAvailabilityConfig(
  equipmentId: string
): Promise<RentalEquipmentAvailabilityConfig> {
  const equipment = await dbRentalEquipmentRepo.getById(equipmentId);
  if (!equipment) {
    throw new Error("Equipment inventory configuration not found");
  }

  return {
    equipmentId: equipment.id,
    title: equipment.title,
    totalUnits: Math.max(0, Number(equipment.totalUnits ?? 0)),
    maintenanceBufferDays: Math.max(0, Number(equipment.maintenanceBufferDays ?? DEFAULT_MAINTENANCE_BUFFER_DAYS)),
  };
}
