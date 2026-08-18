import * as XLSX from "xlsx";

export function generateOrdersExcel(data: Record<string, unknown>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Commandes");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(output as Uint8Array);
}

export function exportToExcel(data: Record<string, unknown>[], filename: string): void {
  // For server-side: returns buffer. Client download is handled via API route.
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
