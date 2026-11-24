import type { ReceiptLayout } from './receipt-print';

export type BarcodeSuffixMode = 'enter' | 'tab' | 'enter_or_tab';
export type CashDrawerMode = 'none' | 'manual_only' | 'escpos_pin2' | 'escpos_pin5';

export type WorkstationSettings = {
  receiptLayout: ReceiptLayout;
  receiptLanguage: 'en' | 'pa';
  printerName: string;
  barcodeSuffix: BarcodeSuffixMode;
  cashDrawerMode: CashDrawerMode;
  backupDestinationNote: string;
  revision: number;
  updatedAt: string | null;
};

export type SaveWorkstationSettings = {
  expectedRevision: number;
  receiptLayout: ReceiptLayout;
  receiptLanguage: 'en' | 'pa';
  printerName: string;
  barcodeSuffix: BarcodeSuffixMode;
  cashDrawerMode: CashDrawerMode;
  backupDestinationNote: string;
};

export type LocalPrinterInfo = {
  name: string;
  isDefault: boolean;
  workOffline: boolean;
  status: string;
};

export const defaultWorkstationSettings: WorkstationSettings = {
  receiptLayout: '80mm',
  receiptLanguage: 'en',
  printerName: '',
  barcodeSuffix: 'enter',
  cashDrawerMode: 'none',
  backupDestinationNote: '',
  revision: 1,
  updatedAt: null,
};
