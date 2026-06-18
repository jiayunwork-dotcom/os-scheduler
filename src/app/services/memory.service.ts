import { Injectable } from '@angular/core';
import {
  FrameInfo,
  ProcessPageInfo,
  AddressTranslationStep,
  PagingConfig,
  ProcessSegmentInfo,
  SegmentEntry,
  MemoryBlock,
  SegmentAddressTranslationStep,
} from '../models/memory.model';

@Injectable({ providedIn: 'root' })
export class MemoryService {
  getTotalFrames(config: PagingConfig): number {
    return Math.floor(config.totalMemoryKB / config.pageSizeKB);
  }

  allocatePages(
    processId: number,
    pageCount: number,
    frames: FrameInfo[],
    processPages: ProcessPageInfo[],
    config: PagingConfig
  ): { frames: FrameInfo[]; processPages: ProcessPageInfo[] } | null {
    const totalFrames = this.getTotalFrames(config);
    const freeFrames = frames.filter((f) => f.processId === null);
    if (freeFrames.length < pageCount) {
      return null;
    }

    const newFrames = frames.map((f) => ({ ...f }));
    const pageTable: { logicalPage: number; physicalFrame: number }[] = [];

    for (let i = 0; i < pageCount; i++) {
      const freeFrame = newFrames.find((f) => f.processId === null);
      if (!freeFrame) return null;
      freeFrame.processId = processId;
      freeFrame.logicalPage = i;
      pageTable.push({ logicalPage: i, physicalFrame: freeFrame.frameNumber });
    }

    const newProcessPages = processPages.filter((p) => p.processId !== processId);
    newProcessPages.push({ processId, logicalPageCount: pageCount, pageTable });

    return { frames: newFrames, processPages: newProcessPages };
  }

  releaseProcessPages(
    processId: number,
    frames: FrameInfo[],
    processPages: ProcessPageInfo[]
  ): { frames: FrameInfo[]; processPages: ProcessPageInfo[] } {
    const newFrames = frames.map((f) => {
      if (f.processId === processId) {
        return { ...f, processId: null, logicalPage: null };
      }
      return { ...f };
    });
    const newProcessPages = processPages.filter((p) => p.processId !== processId);
    return { frames: newFrames, processPages: newProcessPages };
  }

  translatePagingAddress(
    logicalAddress: number,
    processPageInfo: ProcessPageInfo,
    pageSizeKB: number
  ): AddressTranslationStep[] {
    const pageSize = pageSizeKB * 1024;
    const steps: AddressTranslationStep[] = [];

    steps.push({
      label: '输入逻辑地址',
      value: `${logicalAddress}`,
    });

    const pageNumber = Math.floor(logicalAddress / pageSize);
    const offset = logicalAddress % pageSize;

    steps.push({
      label: '计算页号',
      value: `⌊${logicalAddress} / ${pageSize}⌋ = ${pageNumber}`,
    });

    steps.push({
      label: '计算页内偏移',
      value: `${logicalAddress} mod ${pageSize} = ${offset}`,
    });

    const entry = processPageInfo.pageTable.find((e) => e.logicalPage === pageNumber);
    if (!entry) {
      steps.push({
        label: '查页表',
        value: `页号 ${pageNumber} 不在页表范围内（页表共 ${processPageInfo.logicalPageCount} 页）`,
        isError: true,
      });
      steps.push({
        label: '结果',
        value: '⚠️ 页错误 (Page Fault)',
        isError: true,
      });
      return steps;
    }

    steps.push({
      label: '查页表',
      value: `逻辑页 ${pageNumber} → 物理页框 ${entry.physicalFrame}`,
    });

    const physicalAddress = entry.physicalFrame * pageSize + offset;
    steps.push({
      label: '计算物理地址',
      value: `${entry.physicalFrame} × ${pageSize} + ${offset} = ${physicalAddress}`,
    });

    steps.push({
      label: '结果',
      value: `物理地址 = ${physicalAddress}`,
    });

    return steps;
  }

  allocateSegments(
    processId: number,
    segments: { segmentName: string; segmentLength: number }[],
    memoryBlocks: MemoryBlock[],
    processSegments: ProcessSegmentInfo[],
    totalMemoryKB: number
  ): { memoryBlocks: MemoryBlock[]; processSegments: ProcessSegmentInfo[] } | null {
    let blocks = memoryBlocks.map((b) => ({ ...b }));
    const allocatedSegments: SegmentEntry[] = [];

    for (const seg of segments) {
      const freeBlock = this.findFirstFit(blocks, seg.segmentLength);
      if (!freeBlock) {
        return null;
      }

      const baseAddress = freeBlock.startAddress;
      allocatedSegments.push({
        segmentName: seg.segmentName,
        segmentLength: seg.segmentLength,
        baseAddress,
      });

      blocks = this.splitBlock(blocks, freeBlock, seg.segmentLength, processId, seg.segmentName);
    }

    const newProcessSegments = processSegments.filter((p) => p.processId !== processId);
    newProcessSegments.push({ processId, segments: allocatedSegments });

    return { memoryBlocks: blocks, processSegments: newProcessSegments };
  }

  private findFirstFit(blocks: MemoryBlock[], size: number): MemoryBlock | null {
    for (const block of blocks) {
      if (block.isFree && block.size >= size) {
        return block;
      }
    }
    return null;
  }

  private splitBlock(
    blocks: MemoryBlock[],
    freeBlock: MemoryBlock,
    size: number,
    processId: number,
    segmentName: string
  ): MemoryBlock[] {
    const result: MemoryBlock[] = [];
    for (const block of blocks) {
      if (block === freeBlock) {
        result.push({
          startAddress: block.startAddress,
          size,
          processId,
          segmentName,
          isFree: false,
        });
        if (block.size > size) {
          result.push({
            startAddress: block.startAddress + size,
            size: block.size - size,
            processId: null,
            segmentName: null,
            isFree: true,
          });
        }
      } else {
        result.push({ ...block });
      }
    }
    return result;
  }

  releaseProcessSegments(
    processId: number,
    memoryBlocks: MemoryBlock[],
    processSegments: ProcessSegmentInfo[]
  ): { memoryBlocks: MemoryBlock[]; processSegments: ProcessSegmentInfo[] } {
    let blocks = memoryBlocks.map((b) => {
      if (b.processId === processId) {
        return { ...b, processId: null, segmentName: null, isFree: true };
      }
      return { ...b };
    });

    blocks = this.mergeAdjacentFreeBlocks(blocks);

    const newProcessSegments = processSegments.filter((p) => p.processId !== processId);
    return { memoryBlocks: blocks, processSegments: newProcessSegments };
  }

  private mergeAdjacentFreeBlocks(blocks: MemoryBlock[]): MemoryBlock[] {
    if (blocks.length <= 1) return blocks;
    const sorted = [...blocks].sort((a, b) => a.startAddress - b.startAddress);
    const merged: MemoryBlock[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const current = sorted[i];
      if (last.isFree && current.isFree && last.startAddress + last.size === current.startAddress) {
        last.size += current.size;
      } else {
        merged.push({ ...current });
      }
    }

    return merged;
  }

  translateSegmentAddress(
    segmentNumber: number,
    offset: number,
    processSegmentInfo: ProcessSegmentInfo
  ): SegmentAddressTranslationStep[] {
    const steps: SegmentAddressTranslationStep[] = [];

    steps.push({
      label: '输入段号',
      value: `${segmentNumber}`,
    });

    steps.push({
      label: '输入段内偏移',
      value: `${offset}`,
    });

    if (segmentNumber < 0 || segmentNumber >= processSegmentInfo.segments.length) {
      steps.push({
        label: '查段表',
        value: `段号 ${segmentNumber} 超出段表范围（共 ${processSegmentInfo.segments.length} 段）`,
        isError: true,
      });
      steps.push({
        label: '结果',
        value: '⚠️ 段错误 (Segmentation Fault)',
        isError: true,
      });
      return steps;
    }

    const seg = processSegmentInfo.segments[segmentNumber];
    steps.push({
      label: '查段表',
      value: `段 ${segmentNumber}(${seg.segmentName}): 基址=${seg.baseAddress}, 段长=${seg.segmentLength}`,
    });

    if (offset >= seg.segmentLength) {
      steps.push({
        label: '越界检查',
        value: `偏移 ${offset} ≥ 段长 ${seg.segmentLength}，越界！`,
        isError: true,
      });
      steps.push({
        label: '结果',
        value: '⚠️ 段错误 (Segmentation Fault): 偏移越界',
        isError: true,
      });
      return steps;
    }

    steps.push({
      label: '越界检查',
      value: `偏移 ${offset} < 段长 ${seg.segmentLength}，通过`,
    });

    const physicalAddress = seg.baseAddress + offset;
    steps.push({
      label: '计算物理地址',
      value: `基址 + 偏移 = ${seg.baseAddress} + ${offset} = ${physicalAddress}`,
    });

    steps.push({
      label: '结果',
      value: `物理地址 = ${physicalAddress}`,
    });

    return steps;
  }

  initFrames(totalFrames: number): FrameInfo[] {
    const frames: FrameInfo[] = [];
    for (let i = 0; i < totalFrames; i++) {
      frames.push({ frameNumber: i, processId: null, logicalPage: null });
    }
    return frames;
  }

  initMemoryBlocks(totalMemoryKB: number): MemoryBlock[] {
    return [{ startAddress: 0, size: totalMemoryKB, processId: null, segmentName: null, isFree: true }];
  }
}
