import { createClient } from "@supabase/supabase-js";
import { EQUIPMENT_IMAGES_BUCKET_DEFAULT } from "@/lib/rental/equipment/equipment-images";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function supabaseAdmin() {
  return createClient(mustEnv("SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export function supabaseBucket() {
  return mustEnv("SUPABASE_STORAGE_BUCKET");
}

export function supabaseEquipmentImagesBucket() {
  return process.env.SUPABASE_EQUIPMENT_IMAGES_BUCKET?.trim() || EQUIPMENT_IMAGES_BUCKET_DEFAULT;
}
