import * as XLSX from 'xlsx';

// Shared "Export to Excel" helper for the super-admin-only export buttons
// across the list pages (Leads, Bookings, Payments, Inventory, Channel
// Partners, etc.) -- takes rows that are already shaped into readable
// column names (not raw DB rows with foreign-key UUIDs), so every export
// looks the same regardless of which page it came from.
export function exportRowsToExcel(baseFilename: string, sheetName: string, rows: Record<string, any>[]) {
  const safeRows = rows.length > 0 ? rows : [{ 'No data': 'No records matched the current view.' }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const dateStamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${baseFilename}_${dateStamp}.xlsx`);
}
