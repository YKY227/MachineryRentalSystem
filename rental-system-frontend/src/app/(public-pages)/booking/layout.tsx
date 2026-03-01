"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BookingProvider } from "@/lib/booking-store";

export default function BookingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <BookingProvider>
      {/* AnimatePresence keeps old + new children around long enough to animate */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}

          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="min-h-screen"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </BookingProvider>
  );
}
