import {Alert, Platform} from 'react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function toSafeSheetName(name: string) {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, ' ').trim();
  const safe = cleaned.slice(0, 31);
  return safe || 'Sheet';
}

function normalizeRows<T extends Record<string, unknown>>(rows: T[], emptyLabel = 'No data') {
  if (rows.length) return rows;
  return [{Note: emptyLabel}];
}

export function buildWorkbook(sheets: Record<string, Record<string, unknown>[] | undefined>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(normalizeRows((rows ?? []) as Record<string, unknown>[]));
    XLSX.utils.book_append_sheet(wb, ws, toSafeSheetName(name));
  }
  return wb;
}

export async function exportWorkbook(wb: XLSX.WorkBook, filename: string) {
  const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  if (Platform.OS === 'web') {
    const data = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
    const blob = new Blob([data], {type: MIME_XLSX});
    const url = URL.createObjectURL(blob);
    const link = typeof document !== 'undefined' ? document.createElement('a') : null;
    if (!link) return;
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const data = XLSX.write(wb, {bookType: 'xlsx', type: 'base64'});
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) {
    Alert.alert('Export failed', 'No writable directory found for export.');
    return;
  }
  const fileUri = `${baseDir}${safeName}`;
  await FileSystem.writeAsStringAsync(fileUri, data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert('Export ready', `Saved to ${fileUri}`);
    return;
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: MIME_XLSX,
    dialogTitle: 'Share report',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}
