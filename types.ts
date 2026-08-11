
export interface FileProcessingState {
  name: string;
  status: 'waiting' | 'processing' | 'complete' | 'error';
  errorDetails?: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  READY = 'READY', // New status: Files selected, options adjustable, waiting for start
  UPLOADING = 'UPLOADING',
  CROP_SELECT = 'CROP_SELECT',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface ConversionResult {
  content: string;
  fileName: string;
}

export interface FileData {
  name: string;
  size: number;
  type: string;
  base64: string;
}

export interface CroppedImage {
  id: string;
  base64: string;
  page: number;
}

export type SimilarityLevel = 'numbers' | 'type';
export type MathFormat = 'latex' | 'equation';
export type DocumentType = 'academic' | 'administrative';
