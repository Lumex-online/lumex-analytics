import { create } from "zustand";

type DashboardFilterState = {
  selectedWarehouseKeys: number[];
  selectedBuyerKeys: number[];
  setWarehouseKeys: (keys: number[]) => void;
  setBuyerKeys: (keys: number[]) => void;
};

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  selectedWarehouseKeys: [],
  selectedBuyerKeys: [],
  setWarehouseKeys: (keys) => set({ selectedWarehouseKeys: keys }),
  setBuyerKeys: (keys) => set({ selectedBuyerKeys: keys })
}));
