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
  PageReplacementStep,
  PageReplacementResult,
  FragmentAnalysis,
  SnapshotDiff,
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

  simulateFIFO(accessSequence: number[], frameCount: number, totalPages: number): PageReplacementResult {
    const steps: PageReplacementStep[] = [];
    const frames: number[] = [];
    let faultCount = 0;
    const queue: number[] = [];

    for (const page of accessSequence) {
      if (page < 0 || page >= totalPages) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage: null });
        faultCount++;
        continue;
      }

      if (frames.includes(page)) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: true, evictedPage: null });
        continue;
      }

      faultCount++;
      let evictedPage: number | null = null;

      if (frames.length < frameCount) {
        frames.push(page);
        queue.push(page);
      } else {
        evictedPage = queue.shift()!;
        const idx = frames.indexOf(evictedPage);
        frames[idx] = page;
        queue.push(page);
      }

      steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage });
    }

    return { steps, faultCount, faultRate: accessSequence.length > 0 ? faultCount / accessSequence.length : 0, algorithm: 'FIFO' };
  }

  simulateLRU(accessSequence: number[], frameCount: number, totalPages: number): PageReplacementResult {
    const steps: PageReplacementStep[] = [];
    const frames: number[] = [];
    let faultCount = 0;
    const useOrder: number[] = [];

    for (const page of accessSequence) {
      if (page < 0 || page >= totalPages) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage: null });
        faultCount++;
        continue;
      }

      const useIdx = useOrder.indexOf(page);
      if (useIdx !== -1) {
        useOrder.splice(useIdx, 1);
      }
      useOrder.push(page);

      if (frames.includes(page)) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: true, evictedPage: null });
        continue;
      }

      faultCount++;
      let evictedPage: number | null = null;

      if (frames.length < frameCount) {
        frames.push(page);
      } else {
        let lruPage = useOrder[0];
        for (const u of useOrder) {
          if (frames.includes(u)) {
            lruPage = u;
            break;
          }
        }
        evictedPage = lruPage;
        const idx = frames.indexOf(lruPage);
        frames[idx] = page;
      }

      steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage });
    }

    return { steps, faultCount, faultRate: accessSequence.length > 0 ? faultCount / accessSequence.length : 0, algorithm: 'LRU' };
  }

  simulateOPT(accessSequence: number[], frameCount: number, totalPages: number): PageReplacementResult {
    const steps: PageReplacementStep[] = [];
    const frames: number[] = [];
    let faultCount = 0;

    for (let i = 0; i < accessSequence.length; i++) {
      const page = accessSequence[i];

      if (page < 0 || page >= totalPages) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage: null });
        faultCount++;
        continue;
      }

      if (frames.includes(page)) {
        steps.push({ accessPage: page, framesContent: [...frames], hit: true, evictedPage: null });
        continue;
      }

      faultCount++;
      let evictedPage: number | null = null;

      if (frames.length < frameCount) {
        frames.push(page);
      } else {
        let farthestUse = -1;
        let victimPage = frames[0];

        for (const f of frames) {
          let nextUse = -1;
          for (let j = i + 1; j < accessSequence.length; j++) {
            if (accessSequence[j] === f) {
              nextUse = j;
              break;
            }
          }

          if (nextUse === -1) {
            victimPage = f;
            break;
          }

          if (nextUse > farthestUse) {
            farthestUse = nextUse;
            victimPage = f;
          }
        }

        evictedPage = victimPage;
        const idx = frames.indexOf(victimPage);
        frames[idx] = page;
      }

      steps.push({ accessPage: page, framesContent: [...frames], hit: false, evictedPage });
    }

    return { steps, faultCount, faultRate: accessSequence.length > 0 ? faultCount / accessSequence.length : 0, algorithm: 'OPT' };
  }

  analyzeFragments(memoryBlocks: MemoryBlock[]): FragmentAnalysis {
    const freeBlocks = memoryBlocks.filter(b => b.isFree);
    const totalFragmentSize = freeBlocks.reduce((sum, b) => sum + b.size, 0);
    const freeBlockCount = freeBlocks.length;
    const maxFreeBlockSize = freeBlocks.length > 0 ? Math.max(...freeBlocks.map(b => b.size)) : 0;
    const nonMaxFragmentSize = totalFragmentSize - maxFreeBlockSize;
    const fragmentationRate = totalFragmentSize > 0 ? nonMaxFragmentSize / totalFragmentSize : 0;

    return { totalFragmentSize, freeBlockCount, maxFreeBlockSize, fragmentationRate };
  }

  compactMemory(memoryBlocks: MemoryBlock[], processSegments: ProcessSegmentInfo[]): { memoryBlocks: MemoryBlock[]; processSegments: ProcessSegmentInfo[] } {
    const allocatedBlocks = memoryBlocks.filter(b => !b.isFree);
    const totalFree = memoryBlocks.filter(b => b.isFree).reduce((sum, b) => sum + b.size, 0);

    const newBlocks: MemoryBlock[] = [];
    let currentAddress = 0;

    for (const block of allocatedBlocks) {
      newBlocks.push({
        startAddress: currentAddress,
        size: block.size,
        processId: block.processId,
        segmentName: block.segmentName,
        isFree: false,
      });
      currentAddress += block.size;
    }

    if (totalFree > 0) {
      newBlocks.push({
        startAddress: currentAddress,
        size: totalFree,
        processId: null,
        segmentName: null,
        isFree: true,
      });
    }

    const newProcessSegments = processSegments.map(ps => {
      const newSegments: SegmentEntry[] = ps.segments.map(seg => {
        const block = newBlocks.find(b => b.processId === ps.processId && b.segmentName === seg.segmentName);
        return {
          segmentName: seg.segmentName,
          segmentLength: seg.segmentLength,
          baseAddress: block ? block.startAddress : seg.baseAddress,
        };
      });
      return { processId: ps.processId, segments: newSegments };
    });

    return { memoryBlocks: newBlocks, processSegments: newProcessSegments };
  }

  compareSnapshots(s1: FrameInfo[], pp1: ProcessPageInfo[], mb1: MemoryBlock[], ps1: ProcessSegmentInfo[],
                   s2: FrameInfo[], pp2: ProcessPageInfo[], mb2: MemoryBlock[], ps2: ProcessSegmentInfo[]): SnapshotDiff {
    const pids1 = new Set(pp1.map(p => p.processId));
    const pids2 = new Set(pp2.map(p => p.processId));
    const allPagingPids = new Set([...pids1, ...pids2]);

    const pagingChangedProcessIds: number[] = [];
    for (const pid of allPagingPids) {
      const pp1Entry = pp1.find(p => p.processId === pid);
      const pp2Entry = pp2.find(p => p.processId === pid);
      if (!pp1Entry || !pp2Entry) {
        pagingChangedProcessIds.push(pid);
        continue;
      }
      if (pp1Entry.logicalPageCount !== pp2Entry.logicalPageCount ||
          JSON.stringify(pp1Entry.pageTable) !== JSON.stringify(pp2Entry.pageTable)) {
        pagingChangedProcessIds.push(pid);
      }
    }

    const segPids1 = new Set(ps1.map(p => p.processId));
    const segPids2 = new Set(ps2.map(p => p.processId));
    const allSegPids = new Set([...segPids1, ...segPids2]);

    const segmentationChangedProcessIds: number[] = [];
    for (const pid of allSegPids) {
      const ps1Entry = ps1.find(p => p.processId === pid);
      const ps2Entry = ps2.find(p => p.processId === pid);
      if (!ps1Entry || !ps2Entry) {
        segmentationChangedProcessIds.push(pid);
        continue;
      }
      if (JSON.stringify(ps1Entry.segments) !== JSON.stringify(ps2Entry.segments)) {
        segmentationChangedProcessIds.push(pid);
      }
    }

    const occupied1 = s1.filter(f => f.processId !== null).length;
    const occupied2 = s2.filter(f => f.processId !== null).length;

    const free1 = mb1.filter(b => b.isFree).reduce((sum, b) => sum + b.size, 0);
    const free2 = mb2.filter(b => b.isFree).reduce((sum, b) => sum + b.size, 0);

    return {
      pagingChangedProcessIds,
      segmentationChangedProcessIds,
      frameOccupancyDiff: occupied2 - occupied1,
      freeMemoryDiff: free2 - free1,
    };
  }
}
