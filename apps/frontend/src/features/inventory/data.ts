export const inventoryStatuses = [
  "Available",
  "In use",
  "Maintenance",
  "Inactive",
  "Operational",
];
export interface InventoryAsset {
  id: string;
  name: string;
  location: string;
  status: string;
  version: number;
}
export function parseInventory(value: unknown): InventoryAsset[] {
  if (!Array.isArray(value))
    throw new Error("Inventory response is not a record list.");
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("Inventory contains an invalid record.");
    const record = item as Record<string, unknown>;
    if (
      !["id", "name", "location", "status"].every(
        (key) =>
          typeof record[key] === "string" && (record[key] as string).length > 0,
      ) ||
      !inventoryStatuses.includes(record.status as string) ||
      !Number.isSafeInteger(record.version) ||
      (record.version as number) < 1 ||
      seen.has(record.id as string)
    )
      throw new Error("Inventory contains an invalid or duplicate asset.");
    seen.add(record.id as string);
    return {
      id: record.id as string,
      name: record.name as string,
      location: record.location as string,
      status: record.status as string,
      version: record.version as number,
    };
  });
}
export function filterAssets(
  items: InventoryAsset[],
  text: string,
  location: string,
  status: string,
) {
  const search = text.trim().toLowerCase();
  return items.filter(
    (asset) =>
      (!location || asset.location === location) &&
      (!status || asset.status === status) &&
      `${asset.id} ${asset.name} ${asset.location} ${asset.status}`
        .toLowerCase()
        .includes(search),
  );
}
