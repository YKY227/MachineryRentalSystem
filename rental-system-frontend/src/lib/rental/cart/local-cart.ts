import {
  RENTAL_CART_STORAGE_KEY,
  RENTAL_CART_VERSION,
  type NewRentalCartLine,
  type NewRentalCartSaleLine,
  type RentalCart,
  type RentalCartLine,
  type RentalCartRentalLine,
  type RentalCartSaleLine,
} from "@/lib/rental/cart/types";

const CART_EVENT = "rental-cart-updated";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function emptyCart(): RentalCart {
  return {
    version: RENTAL_CART_VERSION,
    lines: [],
    updatedAt: nowIso(),
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeCart(value: unknown): RentalCart {
  if (!value || typeof value !== "object") return emptyCart();
  const candidate = value as Partial<RentalCart>;
  if (candidate.version !== RENTAL_CART_VERSION || !Array.isArray(candidate.lines)) {
    return emptyCart();
  }
  return {
    version: RENTAL_CART_VERSION,
    lines: candidate.lines.filter((line): line is RentalCartLine => {
      return Boolean(
        line &&
          typeof line === "object" &&
          typeof (line as RentalCartLine).id === "string" &&
          ((line as RentalCartLine).type === "rental" || (line as RentalCartLine).type === "sale")
      );
    }),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
  };
}

function notifyCartUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function readRentalCart(): RentalCart {
  if (!isBrowser()) return emptyCart();
  try {
    const raw = window.localStorage.getItem(RENTAL_CART_STORAGE_KEY);
    if (!raw) return emptyCart();
    return normalizeCart(JSON.parse(raw));
  } catch {
    return emptyCart();
  }
}

export function writeRentalCart(cart: RentalCart) {
  if (!isBrowser()) return cart;
  const next = normalizeCart({ ...cart, updatedAt: nowIso() });
  window.localStorage.setItem(RENTAL_CART_STORAGE_KEY, JSON.stringify(next));
  notifyCartUpdated();
  return next;
}

export function addRentalCartLine(line: NewRentalCartLine) {
  const cart = readRentalCart();
  const timestamp = nowIso();
  const nextLine = {
    ...line,
    id: createId(),
    addedAt: timestamp,
    updatedAt: timestamp,
  } as RentalCartLine;
  const nextCart = writeRentalCart({
    ...cart,
    lines: [...cart.lines, nextLine],
  });
  return {
    cart: nextCart,
    line: nextLine,
  };
}

export function upsertSaleCartLine(line: NewRentalCartSaleLine) {
  const cart = readRentalCart();
  const submittedLine = cart.lines.find(
    (cartLine): cartLine is RentalCartSaleLine =>
      cartLine.type === "sale" &&
      cartLine.equipmentId === line.equipmentId &&
      Boolean(cartLine.enquiryId || cartLine.enquirySubmittedAt)
  );
  if (submittedLine) {
    return {
      cart,
      line: submittedLine,
      status: "submitted_exists" as const,
    };
  }

  const timestamp = nowIso();
  const existingLine = cart.lines.find(
    (cartLine): cartLine is RentalCartSaleLine =>
      cartLine.type === "sale" && cartLine.equipmentId === line.equipmentId
  );
  if (existingLine) {
    const nextLine: RentalCartSaleLine = {
      ...existingLine,
      ...line,
      id: existingLine.id,
      addedAt: existingLine.addedAt,
      updatedAt: timestamp,
    };
    const nextCart = writeRentalCart({
      ...cart,
      lines: cart.lines.map((cartLine) => (cartLine.id === existingLine.id ? nextLine : cartLine)),
    });
    return {
      cart: nextCart,
      line: nextLine,
      status: "updated" as const,
    };
  }

  const nextLine: RentalCartSaleLine = {
    ...line,
    id: createId(),
    addedAt: timestamp,
    updatedAt: timestamp,
  };
  const nextCart = writeRentalCart({
    ...cart,
    lines: [...cart.lines, nextLine],
  });
  return {
    cart: nextCart,
    line: nextLine,
    status: "added" as const,
  };
}

export function markSaleCartLinesSubmittedForEquipment(input: {
  equipmentId: string;
  enquiryId?: string;
  enquirySubmittedAt?: string;
}) {
  const cart = readRentalCart();
  const timestamp = input.enquirySubmittedAt ?? nowIso();
  let updatedCount = 0;
  const nextLines = cart.lines.map((line) => {
    if (line.type !== "sale" || line.equipmentId !== input.equipmentId) return line;
    updatedCount += 1;
    return {
      ...line,
      enquiryId: input.enquiryId,
      enquirySubmittedAt: timestamp,
      updatedAt: timestamp,
    } satisfies RentalCartSaleLine;
  });

  if (updatedCount === 0) {
    return {
      cart,
      updatedCount,
    };
  }

  return {
    cart: writeRentalCart({ ...cart, lines: nextLines }),
    updatedCount,
  };
}

export function updateRentalCartLine(
  lineId: string,
  patch:
    | Partial<Omit<RentalCartRentalLine, "id" | "type" | "addedAt">>
    | Partial<Omit<RentalCartSaleLine, "id" | "type" | "addedAt">>
) {
  const cart = readRentalCart();
  let updatedLine: RentalCartLine | null = null;
  const nextLines = cart.lines.map((line) => {
    if (line.id !== lineId) return line;
    updatedLine = { ...line, ...patch, updatedAt: nowIso() } as RentalCartLine;
    return updatedLine;
  });
  const nextCart = writeRentalCart({ ...cart, lines: nextLines });
  return {
    cart: nextCart,
    line: updatedLine,
  };
}

export function removeRentalCartLine(lineId: string) {
  const cart = readRentalCart();
  return writeRentalCart({
    ...cart,
    lines: cart.lines.filter((line) => line.id !== lineId),
  });
}

export function clearRentalCart() {
  const next = emptyCart();
  if (!isBrowser()) return next;
  window.localStorage.setItem(RENTAL_CART_STORAGE_KEY, JSON.stringify(next));
  notifyCartUpdated();
  return next;
}

export function subscribeToRentalCart(listener: () => void) {
  if (!isBrowser()) return () => {};
  window.addEventListener(CART_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CART_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
