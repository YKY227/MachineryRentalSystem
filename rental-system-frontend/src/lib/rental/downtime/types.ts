export type RentalEquipmentDowntimeType =
  | "maintenance"
  | "repair"
  | "inspection"
  | "admin_hold"
  | "internal_use";

export type RentalEquipmentDowntimeStatus = "active" | "cancelled";
export type RentalEquipmentDowntimeUnitAssignment = string;

export type RentalEquipmentDowntime = {
  id: string;
  equipmentId: string;
  downtimeType: RentalEquipmentDowntimeType;
  startDate: string;
  endDate: string;
  quantityAffected: number;
  unitAssignments: RentalEquipmentDowntimeUnitAssignment[];
  status: RentalEquipmentDowntimeStatus;
  reason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalEquipmentDowntimeInput = {
  equipmentId: string;
  downtimeType: RentalEquipmentDowntimeType;
  startDate: string;
  endDate: string;
  quantityAffected: number;
  unitAssignments?: RentalEquipmentDowntimeUnitAssignment[];
  reason?: string;
  notes?: string;
  status?: RentalEquipmentDowntimeStatus;
};

export type UpdateRentalEquipmentDowntimeInput = {
  downtimeType?: RentalEquipmentDowntimeType;
  startDate?: string;
  endDate?: string;
  quantityAffected?: number;
  unitAssignments?: RentalEquipmentDowntimeUnitAssignment[];
  reason?: string | null;
  notes?: string | null;
  status?: RentalEquipmentDowntimeStatus;
};
