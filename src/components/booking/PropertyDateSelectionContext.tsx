"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { findFirstAvailableWindow } from "@/lib/calendar/availability";
import type { OccupiedDateRange } from "@/modules/properties/queries";

interface PropertyDateSelectionContextValue {
  checkIn: string;
  checkOut: string;
  setCheckIn: (ymd: string) => void;
  setCheckOut: (ymd: string) => void;
  setDateRange: (nextIn: string, nextOut: string) => void;
  occupiedRanges: OccupiedDateRange[];
  addOccupiedRange: (range: OccupiedDateRange) => void;
  todayYmd: string;
  initialWindow: { checkIn: string; checkOut: string };
}

const PropertyDateSelectionContext =
  createContext<PropertyDateSelectionContextValue | null>(null);

interface PropertyDateSelectionProviderProps {
  occupiedRanges: OccupiedDateRange[];
  todayYmd: string;
  children: ReactNode;
}

/**
 * Sincroniza en tiempo real las fechas seleccionadas y reservas parciales
 * entre el calendario visual de disponibilidad y el widget lateral (`StickyBookingWidget`).
 */
export function PropertyDateSelectionProvider({
  occupiedRanges,
  todayYmd,
  children,
}: PropertyDateSelectionProviderProps) {
  const [liveOccupiedRanges, setLiveOccupiedRanges] =
    useState<OccupiedDateRange[]>(occupiedRanges);

  useEffect(() => {
    setLiveOccupiedRanges(occupiedRanges);
  }, [occupiedRanges]);

  const initialWindow = useMemo(
    () => findFirstAvailableWindow(liveOccupiedRanges, todayYmd, 5),
    [liveOccupiedRanges, todayYmd]
  );

  const [checkIn, setCheckIn] = useState<string>(initialWindow.checkIn);
  const [checkOut, setCheckOut] = useState<string>(initialWindow.checkOut);

  const setDateRange = useCallback((nextIn: string, nextOut: string) => {
    setCheckIn(nextIn);
    setCheckOut(nextOut);
  }, []);

  const addOccupiedRange = useCallback((range: OccupiedDateRange) => {
    setLiveOccupiedRanges((prev) =>
      prev.some((r) => r.id === range.id) ? prev : [...prev, range]
    );
  }, []);

  const value = useMemo<PropertyDateSelectionContextValue>(
    () => ({
      checkIn,
      checkOut,
      setCheckIn,
      setCheckOut,
      setDateRange,
      occupiedRanges: liveOccupiedRanges,
      addOccupiedRange,
      todayYmd,
      initialWindow,
    }),
    [
      checkIn,
      checkOut,
      setDateRange,
      liveOccupiedRanges,
      addOccupiedRange,
      todayYmd,
      initialWindow,
    ]
  );

  return (
    <PropertyDateSelectionContext.Provider value={value}>
      {children}
    </PropertyDateSelectionContext.Provider>
  );
}

export function usePropertyDateSelection():
  | PropertyDateSelectionContextValue
  | null {
  return useContext(PropertyDateSelectionContext);
}
