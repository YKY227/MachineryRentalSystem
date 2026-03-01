// src/lib/booking-store.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

export type ServiceType = "same-day" | "next-day" | "express-3h" | null;
export type RouteType =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "round-trip"
  | null;

export interface PickupLocation {
  id: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  remarks: string;
  saveAsFavorite: boolean;
}

export interface DeliveryPoint {
  id: string; // simple string ID for UI use
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  remarks: string;
  saveAsFavorite?: boolean;
}

export type ItemCategory =
  | "document"
  | "parcel"
  | "fragile"
  | "electronics"
  | "food"
  | "liquid"
  | "oversized"
  | "other";

export interface DeliveryItem {
  id: string;
  deliveryId: string; // which delivery point this item belongs to
  description: string;
  category: ItemCategory;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumetricWeightKg: number;
  remarks: string;
  specialHandling?: boolean;
}

export interface ScheduleInfo {
  pickupDate: string;   // ISO date string e.g. "2025-03-10"
  pickupSlot: string;   // e.g. "09:00 – 12:00"
}

interface BookingState {
  serviceType: ServiceType;
  routeType: RouteType;
  pickups: PickupLocation[];  
  deliveries: DeliveryPoint[];
  items: DeliveryItem[];
  schedule: ScheduleInfo | null;
  setServiceType: (type: ServiceType) => void;
  setRouteType: (type: RouteType) => void;
    setPickups: (pickups: PickupLocation[]) => void;
  setDeliveries: (deliveries: DeliveryPoint[]) => void;
  setItems: (items: DeliveryItem[]) => void;
  setSchedule: (schedule: ScheduleInfo) => void;
  resetBooking: () => void;
}

const BookingContext = createContext<BookingState | undefined>(undefined);

// helper
const emptyPickup = (): PickupLocation => ({
  id: `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  companyName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  remarks: "",
  saveAsFavorite: true,
});

export function BookingProvider({ children }: { children: ReactNode }) {
  const [serviceType, setServiceType] = useState<ServiceType>(null);
  const [routeType, setRouteType] = useState<RouteType>(null);
  const [pickups, setPickupsState] = useState<PickupLocation[]>([]);
  const [deliveries, setDeliveriesState] = useState<DeliveryPoint[]>([]);
  const [items, setItemsState] = useState<DeliveryItem[]>([]);
  const [schedule, setScheduleState] = useState<ScheduleInfo | null>(null);

  const setPickups = (list: PickupLocation[]) => {
    setPickupsState(list.map((p) => ({ ...p })));
  };

  const setDeliveries = (list: DeliveryPoint[]) => {
    setDeliveriesState(list.map((d) => ({ ...d })));
  };

  const setItems = (list: DeliveryItem[]) => {
    setItemsState(list.map((i) => ({ ...i })));
  };

  const setSchedule = (s: ScheduleInfo) => {
    setScheduleState({ ...s });
  };

  const resetBooking = () => {
    setServiceType(null);
    setRouteType(null);
    setPickupsState([]); 
    setDeliveriesState([]);
    setItemsState([]);
    setScheduleState(null);
  };

  return (
    <BookingContext.Provider
      value={{
        serviceType,
        routeType,
        pickups,
        deliveries,
        items,
        schedule,
        setServiceType,
        setRouteType,
        setPickups,
        setDeliveries,
        setItems,
        setSchedule,
        resetBooking,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error("useBooking must be used within a BookingProvider");
  }
  return ctx;
}

// Helpers to create blank structs
export function createEmptyPickup(): PickupLocation {
  return emptyPickup();
}

export function createEmptyDelivery(id: string): DeliveryPoint {
  return {
    id,
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    remarks: "",
    saveAsFavorite: true,
  };
}

export function createEmptyItem(id: string, deliveryId: string): DeliveryItem {
  return {
    id,
    deliveryId,
    description: "",
    category: "parcel",
    quantity: 1,
    weightKg: 0,
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    volumetricWeightKg: 0,
    remarks: "",
  };
}
