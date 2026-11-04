import axios from "axios";
import { parseInventory } from "../features/inventory/data";
export const inventoryApi = {
  list: async () =>
    parseInventory(
      (await axios.get<unknown>("/inventory-data", { timeout: 15000 })).data,
    ),
};
