export interface PageTableEntry {
  logicalPage: number;
  physicalFrame: number;
}

export interface ProcessPageInfo {
  processId: number;
  logicalPageCount: number;
  pageTable: PageTableEntry[];
}

export interface FrameInfo {
  frameNumber: number;
  processId: number | null;
  logicalPage: number | null;
}

export interface AddressTranslationStep {
  label: string;
  value: string;
  isError?: boolean;
}

export interface PagingConfig {
  totalMemoryKB: number;
  pageSizeKB: number;
}

export interface SegmentEntry {
  segmentName: string;
  segmentLength: number;
  baseAddress: number;
}

export interface ProcessSegmentInfo {
  processId: number;
  segments: SegmentEntry[];
}

export interface MemoryBlock {
  startAddress: number;
  size: number;
  processId: number | null;
  segmentName: string | null;
  isFree: boolean;
}

export interface SegmentAddressTranslationStep {
  label: string;
  value: string;
  isError?: boolean;
}
