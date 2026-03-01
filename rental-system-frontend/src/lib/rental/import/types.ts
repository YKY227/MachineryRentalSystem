//src/lib/rental/import/type.ts
export type ImportedImage = {
  id: string;
  url: string; // local object URL now, hosted URL later
  file?: File; // keep for future upload
};

export type ImportedEquipment = {
  localId: string; // stable UI identity for demo
  status: "draft" | "published";

  // Excel fields
  itemcode: string;
  itemName: string;
  uom?: string;
  rentalQty?: number;
  dayPrice?: number;
  weekPrice?: number;
  monthPrice?: number;
  sellingPrice?: number;

  // Enriched via modal
  category?: string;
  shortDesc?: string;
  specs?: string;
  keyFeatures?: string[];
  applications?: string[];

  images: ImportedImage[];
};

export interface EquipmentImportService {
  createDraft(input: ImportedEquipment): Promise<{ equipmentId: string }>;
  publish(equipmentId: string): Promise<void>;
  uploadImages(equipmentId: string, files: File[]): Promise<string[]>;
}

// Demo stub (no backend yet)
export const demoEquipmentImportService: EquipmentImportService = {
  async createDraft() {
    return { equipmentId: `demo-${Math.random().toString(16).slice(2)}` };
  },
  async publish() {},
  async uploadImages(_equipmentId, _files) {
    return [];
  },
};
