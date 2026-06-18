import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Process } from '../../models/process.model';
import {
  FrameInfo,
  ProcessPageInfo,
  AddressTranslationStep,
  PagingConfig,
  ProcessSegmentInfo,
  SegmentEntry,
  MemoryBlock,
  SegmentAddressTranslationStep,
  PageReplacementResult,
  FragmentAnalysis,
  MemorySnapshot,
  SnapshotDiff,
} from '../../models/memory.model';
import { MemoryService } from '../../services/memory.service';

@Component({
  selector: 'app-memory-visualizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './memory-visualizer.component.html',
  styleUrls: ['./memory-visualizer.component.scss'],
})
export class MemoryVisualizerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() processes: Process[] = [];
  @Input() completedProcessIds: number[] = [];

  isExpanded = true;
  activeTab: 'paging' | 'segmentation' = 'paging';

  totalMemoryKB = 256;
  pageSizeKB = 4;

  frames: FrameInfo[] = [];
  processPages: ProcessPageInfo[] = [];
  selectedProcessId: number | null = null;

  pageModalVisible = false;
  pageModalProcessId: number | null = null;
  pageModalPageCount = 1;

  translationLogicalAddress: number | null = null;
  translationSteps: AddressTranslationStep[] = [];

  memoryBlocks: MemoryBlock[] = [];
  processSegments: ProcessSegmentInfo[] = [];

  segmentModalVisible = false;
  segmentModalProcessId: number | null = null;
  segmentModalSegments: { segmentName: string; segmentLength: number }[] = [];
  newSegmentName = '';
  newSegmentLength = 4;

  segTranslationSegmentNumber: number | null = null;
  segTranslationOffset: number | null = null;
  segTranslationSteps: SegmentAddressTranslationStep[] = [];

  readonly memoryOptions = [64, 128, 256, 512, 1024];
  readonly pageSizeOptions = [1, 2, 4, 8];

  replacementFrameLimit = 3;
  replacementAccessSequence = '0,1,2,3,0,1,4,0,1,2,3,4';
  replacementAlgorithm: 'FIFO' | 'LRU' | 'OPT' = 'FIFO';
  replacementResult: PageReplacementResult | null = null;

  fragmentAnalysis: FragmentAnalysis | null = null;

  snapshots: MemorySnapshot[] = [];
  snapshotNameCounter = 1;
  selectedSnapshotIndex1: number | null = null;
  selectedSnapshotIndex2: number | null = null;
  snapshotDiff: SnapshotDiff | null = null;

  pendingReclaimPids: Set<number> = new Set();

  constructor(private memoryService: MemoryService) {}

  ngOnInit(): void {
    this.initPagingIfNeeded();
    this.initSegmentationIfNeeded();
    if (this.selectedProcessId === null && this.processes.length > 0) {
      this.selectedProcessId = this.processes[0].id;
    }
  }

  ngOnDestroy(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['processes']) {
      this.syncProcesses();
    }
    if (changes['completedProcessIds']) {
      this.updatePendingReclaims();
    }
  }

  private updatePendingReclaims(): void {
    for (const pid of this.completedProcessIds) {
      if (!this.pendingReclaimPids.has(pid)) {
        const hasPages = this.processPages.some(p => p.processId === pid);
        const hasSegments = this.processSegments.some(p => p.processId === pid);
        if (hasPages || hasSegments) {
          this.pendingReclaimPids.add(pid);
        }
      }
    }
  }

  isProcessTerminated(processId: number): boolean {
    return this.completedProcessIds.includes(processId);
  }

  isProcessPendingReclaim(processId: number): boolean {
    return this.pendingReclaimPids.has(processId);
  }

  reclaimTerminatedProcesses(): void {
    for (const pid of this.pendingReclaimPids) {
      const pageResult = this.memoryService.releaseProcessPages(pid, this.frames, this.processPages);
      this.frames = pageResult.frames;
      this.processPages = pageResult.processPages;

      const segResult = this.memoryService.releaseProcessSegments(pid, this.memoryBlocks, this.processSegments);
      this.memoryBlocks = segResult.memoryBlocks;
      this.processSegments = segResult.processSegments;
    }
    this.pendingReclaimPids.clear();
  }

  get hasPendingReclaims(): boolean {
    return this.pendingReclaimPids.size > 0;
  }

  private syncProcesses(): void {
    const currentIds = this.processes.map((p) => p.id);

    const removedPagingIds = this.processPages
      .filter((pp) => !currentIds.includes(pp.processId))
      .map((pp) => pp.processId);
    for (const pid of removedPagingIds) {
      const result = this.memoryService.releaseProcessPages(pid, this.frames, this.processPages);
      this.frames = result.frames;
      this.processPages = result.processPages;
      this.pendingReclaimPids.delete(pid);
    }

    for (const pp of this.processPages) {
      const process = this.processes.find((p) => p.id === pp.processId);
      if (!process) {
        const result = this.memoryService.releaseProcessPages(pp.processId, this.frames, this.processPages);
        this.frames = result.frames;
        this.processPages = result.processPages;
      }
    }

    const removedSegIds = this.processSegments
      .filter((ps) => !currentIds.includes(ps.processId))
      .map((ps) => ps.processId);
    for (const pid of removedSegIds) {
      const result = this.memoryService.releaseProcessSegments(pid, this.memoryBlocks, this.processSegments);
      this.memoryBlocks = result.memoryBlocks;
      this.processSegments = result.processSegments;
      this.pendingReclaimPids.delete(pid);
    }

    if (this.selectedProcessId !== null && !currentIds.includes(this.selectedProcessId)) {
      this.selectedProcessId = this.processes.length > 0 ? this.processes[0].id : null;
    }

    if (this.selectedProcessId === null && this.processes.length > 0) {
      this.selectedProcessId = this.processes[0].id;
    }
  }

  get totalFrames(): number {
    return this.memoryService.getTotalFrames(this.pagingConfig);
  }

  get pagingConfig(): PagingConfig {
    return { totalMemoryKB: this.totalMemoryKB, pageSizeKB: this.pageSizeKB };
  }

  get freeFrameCount(): number {
    return this.frames.filter((f) => f.processId === null).length;
  }

  get selectedProcessPageInfo(): ProcessPageInfo | null {
    if (this.selectedProcessId === null) return null;
    return this.processPages.find((p) => p.processId === this.selectedProcessId) || null;
  }

  get selectedProcessSegmentInfo(): ProcessSegmentInfo | null {
    if (this.selectedProcessId === null) return null;
    return this.processSegments.find((p) => p.processId === this.selectedProcessId) || null;
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  onTotalMemoryChange(): void {
    this.resetPaging();
    this.resetSegmentation();
  }

  onPageSizeChange(): void {
    this.resetPaging();
  }

  resetPaging(): void {
    const total = this.totalFrames;
    this.frames = this.memoryService.initFrames(total);
    this.processPages = [];
    this.translationSteps = [];
    this.replacementResult = null;
  }

  resetSegmentation(): void {
    this.memoryBlocks = this.memoryService.initMemoryBlocks(this.totalMemoryKB);
    this.processSegments = [];
    this.segTranslationSteps = [];
    this.fragmentAnalysis = null;
  }

  getProcessById(id: number): Process | undefined {
    return this.processes.find((p) => p.id === id);
  }

  getProcessColor(id: number): string {
    return this.getProcessById(id)?.color || '#9ca3af';
  }

  openPageModal(processId: number): void {
    this.pageModalProcessId = processId;
    const existing = this.processPages.find((p) => p.processId === processId);
    this.pageModalPageCount = existing ? existing.logicalPageCount : 1;
    this.pageModalVisible = true;
  }

  closePageModal(): void {
    this.pageModalVisible = false;
    this.pageModalProcessId = null;
  }

  savePageModal(): void {
    if (this.pageModalProcessId === null) return;
    const pageCount = Math.max(1, Math.floor(this.pageModalPageCount));
    const maxPages = Math.floor(this.totalFrames / 2);
    if (pageCount > maxPages) {
      alert(`每个进程最多分配 ${maxPages} 页（总页框数的一半）`);
      return;
    }

    const existing = this.processPages.find((p) => p.processId === this.pageModalProcessId);
    if (existing) {
      const releaseResult = this.memoryService.releaseProcessPages(
        this.pageModalProcessId,
        this.frames,
        this.processPages
      );
      this.frames = releaseResult.frames;
      this.processPages = releaseResult.processPages;
    }

    const result = this.memoryService.allocatePages(
      this.pageModalProcessId,
      pageCount,
      this.frames,
      this.processPages,
      this.pagingConfig
    );

    if (!result) {
      alert('空闲页框不足，无法分配！');
      return;
    }

    this.frames = result.frames;
    this.processPages = result.processPages;
    this.closePageModal();
  }

  releaseProcessPages(processId: number): void {
    const result = this.memoryService.releaseProcessPages(processId, this.frames, this.processPages);
    this.frames = result.frames;
    this.processPages = result.processPages;
    this.pendingReclaimPids.delete(processId);
  }

  selectProcess(processId: number): void {
    this.selectedProcessId = processId;
  }

  translatePagingAddress(): void {
    if (this.translationLogicalAddress === null || this.selectedProcessId === null) return;
    const pInfo = this.processPages.find((p) => p.processId === this.selectedProcessId);
    if (!pInfo) {
      this.translationSteps = [{ label: '错误', value: '当前进程未分配页表', isError: true }];
      return;
    }
    this.translationSteps = this.memoryService.translatePagingAddress(
      this.translationLogicalAddress,
      pInfo,
      this.pageSizeKB
    );
  }

  openSegmentModal(processId: number): void {
    this.segmentModalProcessId = processId;
    const existing = this.processSegments.find((p) => p.processId === processId);
    if (existing) {
      this.segmentModalSegments = existing.segments.map((s) => ({
        segmentName: s.segmentName,
        segmentLength: s.segmentLength,
      }));
    } else {
      this.segmentModalSegments = [];
    }
    this.newSegmentName = '';
    this.newSegmentLength = 4;
    this.segmentModalVisible = true;
  }

  closeSegmentModal(): void {
    this.segmentModalVisible = false;
    this.segmentModalProcessId = null;
    this.segmentModalSegments = [];
  }

  addSegmentRow(): void {
    if (this.segmentModalSegments.length >= 8) return;
    this.segmentModalSegments.push({
      segmentName: this.newSegmentName.trim() || `段${this.segmentModalSegments.length}`,
      segmentLength: Math.max(1, Math.min(128, this.newSegmentLength)),
    });
    this.newSegmentName = '';
    this.newSegmentLength = 4;
  }

  removeSegmentRow(index: number): void {
    this.segmentModalSegments.splice(index, 1);
  }

  saveSegmentModal(): void {
    if (this.segmentModalProcessId === null) return;
    if (this.segmentModalSegments.length === 0) {
      alert('请至少添加一个段');
      return;
    }

    const existing = this.processSegments.find((p) => p.processId === this.segmentModalProcessId);
    if (existing) {
      const releaseResult = this.memoryService.releaseProcessSegments(
        this.segmentModalProcessId,
        this.memoryBlocks,
        this.processSegments
      );
      this.memoryBlocks = releaseResult.memoryBlocks;
      this.processSegments = releaseResult.processSegments;
    }

    const result = this.memoryService.allocateSegments(
      this.segmentModalProcessId,
      this.segmentModalSegments,
      this.memoryBlocks,
      this.processSegments,
      this.totalMemoryKB
    );

    if (!result) {
      alert('内存空间不足，无法为所有段分配空间！');
      return;
    }

    this.memoryBlocks = result.memoryBlocks;
    this.processSegments = result.processSegments;
    this.closeSegmentModal();
  }

  releaseProcessSegments(processId: number): void {
    const result = this.memoryService.releaseProcessSegments(processId, this.memoryBlocks, this.processSegments);
    this.memoryBlocks = result.memoryBlocks;
    this.processSegments = result.processSegments;
    this.pendingReclaimPids.delete(processId);
  }

  translateSegmentAddress(): void {
    if (this.segTranslationSegmentNumber === null || this.segTranslationOffset === null || this.selectedProcessId === null) return;
    const sInfo = this.processSegments.find((p) => p.processId === this.selectedProcessId);
    if (!sInfo) {
      this.segTranslationSteps = [{ label: '错误', value: '当前进程未配置段表', isError: true }];
      return;
    }
    this.segTranslationSteps = this.memoryService.translateSegmentAddress(
      Math.floor(this.segTranslationSegmentNumber),
      Math.floor(this.segTranslationOffset),
      sInfo
    );
  }

  getFrameTooltip(frame: FrameInfo): string {
    if (frame.processId === null) return `页框 ${frame.frameNumber}: 空闲`;
    const proc = this.getProcessById(frame.processId);
    return `页框 ${frame.frameNumber}: ${proc?.name || 'P' + frame.processId} 页${frame.logicalPage}`;
  }

  getFrameLabel(frame: FrameInfo): string {
    if (frame.processId === null) return '';
    const proc = this.getProcessById(frame.processId);
    return `${proc?.name || 'P' + frame.processId}:${frame.logicalPage}`;
  }

  getBlockTooltip(block: MemoryBlock): string {
    if (block.isFree) return `空闲区: ${block.startAddress}-${block.startAddress + block.size - 1} (${block.size}KB)`;
    const proc = this.getProcessById(block.processId!);
    return `${proc?.name || 'P' + block.processId} ${block.segmentName}: ${block.startAddress}-${block.startAddress + block.size - 1} (${block.size}KB)`;
  }

  getBlockWidthPercent(block: MemoryBlock): number {
    return (block.size / this.totalMemoryKB) * 100;
  }

  getProcessHasPages(processId: number): boolean {
    return this.processPages.some((p) => p.processId === processId);
  }

  getProcessHasSegments(processId: number): boolean {
    return this.processSegments.some((p) => p.processId === processId);
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  getMaxPageCount(): number {
    return Math.floor(this.totalFrames / 2);
  }

  getSegmentTableRows(): { segNumber: number; segName: string; base: number; length: number }[] {
    const info = this.selectedProcessSegmentInfo;
    if (!info) return [];
    return info.segments.map((s, i) => ({
      segNumber: i,
      segName: s.segmentName,
      base: s.baseAddress,
      length: s.segmentLength,
    }));
  }

  initPagingIfNeeded(): void {
    if (this.frames.length === 0 || this.frames.length !== this.totalFrames) {
      this.resetPaging();
    }
  }

  initSegmentationIfNeeded(): void {
    if (this.memoryBlocks.length === 0) {
      this.resetSegmentation();
    }
  }

  onTabChange(tab: 'paging' | 'segmentation'): void {
    this.activeTab = tab;
    if (tab === 'paging') {
      this.initPagingIfNeeded();
    } else {
      this.initSegmentationIfNeeded();
    }
  }

  getSelectedProcessName(): string {
    if (this.selectedProcessId === null) return '未选择';
    const proc = this.getProcessById(this.selectedProcessId);
    return proc ? proc.name : '未选择';
  }

  getBlockBgColor(block: MemoryBlock): string {
    if (block.isFree) return 'transparent';
    return this.getProcessColor(block.processId!) + 'cc';
  }

  getBlockLabel(block: MemoryBlock): string {
    if (block.isFree) return '';
    const proc = this.getProcessById(block.processId!);
    return (proc ? proc.name : 'P' + block.processId) + ':' + block.segmentName;
  }

  getProcessPageCount(processId: number): number {
    const info = this.processPages.find((p) => p.processId === processId);
    return info ? info.logicalPageCount : 0;
  }

  getProcessSegmentCount(processId: number): number {
    const info = this.processSegments.find((p) => p.processId === processId);
    return info ? info.segments.length : 0;
  }

  getReplacementMaxFrameLimit(): number {
    const pInfo = this.processPages.find(p => p.processId === this.selectedProcessId);
    if (!pInfo) return 2;
    return Math.max(2, pInfo.logicalPageCount);
  }

  getReplacementMinFrameLimit(): number {
    return 2;
  }

  startReplacementSimulation(): void {
    const sequence = this.replacementAccessSequence
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n));

    if (sequence.length === 0) {
      alert('请输入有效的页面访问序列');
      return;
    }

    const pInfo = this.processPages.find(p => p.processId === this.selectedProcessId);
    if (!pInfo) {
      alert('请先为当前进程分配页表');
      return;
    }

    const totalPages = pInfo.logicalPageCount;
    const frameLimit = Math.max(2, Math.min(this.replacementFrameLimit, totalPages));

    switch (this.replacementAlgorithm) {
      case 'FIFO':
        this.replacementResult = this.memoryService.simulateFIFO(sequence, frameLimit, totalPages);
        break;
      case 'LRU':
        this.replacementResult = this.memoryService.simulateLRU(sequence, frameLimit, totalPages);
        break;
      case 'OPT':
        this.replacementResult = this.memoryService.simulateOPT(sequence, frameLimit, totalPages);
        break;
    }
  }

  analyzeFragments(): void {
    this.fragmentAnalysis = this.memoryService.analyzeFragments(this.memoryBlocks);
  }

  canCompact(): boolean {
    if (!this.fragmentAnalysis) return false;
    return this.fragmentAnalysis.freeBlockCount > 1;
  }

  executeCompaction(): void {
    const result = this.memoryService.compactMemory(this.memoryBlocks, this.processSegments);
    this.memoryBlocks = result.memoryBlocks;
    this.processSegments = result.processSegments;
    this.fragmentAnalysis = this.memoryService.analyzeFragments(this.memoryBlocks);
  }

  saveSnapshot(): void {
    if (this.snapshots.length >= 5) {
      alert('快照已满（最多5个），请先删除旧快照');
      return;
    }

    const snapshot: MemorySnapshot = {
      name: `快照${this.snapshotNameCounter}`,
      timestamp: new Date(),
      frames: this.frames.map(f => ({ ...f })),
      processPages: this.processPages.map(pp => ({
        processId: pp.processId,
        logicalPageCount: pp.logicalPageCount,
        pageTable: pp.pageTable.map(e => ({ ...e })),
      })),
      memoryBlocks: this.memoryBlocks.map(b => ({ ...b })),
      processSegments: this.processSegments.map(ps => ({
        processId: ps.processId,
        segments: ps.segments.map(s => ({ ...s })),
      })),
      totalMemoryKB: this.totalMemoryKB,
      pageSizeKB: this.pageSizeKB,
    };

    this.snapshots.push(snapshot);
    this.snapshotNameCounter++;
  }

  restoreSnapshot(index: number): void {
    const snapshot = this.snapshots[index];
    if (!snapshot) return;

    this.totalMemoryKB = snapshot.totalMemoryKB;
    this.pageSizeKB = snapshot.pageSizeKB;
    this.frames = snapshot.frames.map(f => ({ ...f }));
    this.processPages = snapshot.processPages.map(pp => ({
      processId: pp.processId,
      logicalPageCount: pp.logicalPageCount,
      pageTable: pp.pageTable.map(e => ({ ...e })),
    }));
    this.memoryBlocks = snapshot.memoryBlocks.map(b => ({ ...b }));
    this.processSegments = snapshot.processSegments.map(ps => ({
      processId: ps.processId,
      segments: ps.segments.map(s => ({ ...s })),
    }));

    this.translationSteps = [];
    this.segTranslationSteps = [];
    this.replacementResult = null;
    this.fragmentAnalysis = null;
  }

  deleteSnapshot(index: number): void {
    this.snapshots.splice(index, 1);
    if (this.selectedSnapshotIndex1 !== null && this.selectedSnapshotIndex1 >= this.snapshots.length) {
      this.selectedSnapshotIndex1 = null;
    }
    if (this.selectedSnapshotIndex2 !== null && this.selectedSnapshotIndex2 >= this.snapshots.length) {
      this.selectedSnapshotIndex2 = null;
    }
    this.snapshotDiff = null;
  }

  toggleSnapshotSelection(index: number): void {
    if (this.selectedSnapshotIndex1 === index) {
      this.selectedSnapshotIndex1 = null;
      this.snapshotDiff = null;
      return;
    }
    if (this.selectedSnapshotIndex2 === index) {
      this.selectedSnapshotIndex2 = null;
      this.snapshotDiff = null;
      return;
    }
    if (this.selectedSnapshotIndex1 === null) {
      this.selectedSnapshotIndex1 = index;
    } else if (this.selectedSnapshotIndex2 === null) {
      this.selectedSnapshotIndex2 = index;
    } else {
      this.selectedSnapshotIndex1 = index;
      this.selectedSnapshotIndex2 = null;
      this.snapshotDiff = null;
    }
  }

  compareSelectedSnapshots(): void {
    if (this.selectedSnapshotIndex1 === null || this.selectedSnapshotIndex2 === null) return;
    const s1 = this.snapshots[this.selectedSnapshotIndex1];
    const s2 = this.snapshots[this.selectedSnapshotIndex2];
    if (!s1 || !s2) return;

    this.snapshotDiff = this.memoryService.compareSnapshots(
      s1.frames, s1.processPages, s1.memoryBlocks, s1.processSegments,
      s2.frames, s2.processPages, s2.memoryBlocks, s2.processSegments
    );
  }

  isSnapshotSelected(index: number): boolean {
    return this.selectedSnapshotIndex1 === index || this.selectedSnapshotIndex2 === index;
  }

  getProcessNameById(pid: number): string {
    const proc = this.getProcessById(pid);
    return proc ? proc.name : `P${pid}`;
  }

  isFramePendingReclaim(frame: FrameInfo): boolean {
    return frame.processId !== null && this.pendingReclaimPids.has(frame.processId);
  }

  isBlockPendingReclaim(block: MemoryBlock): boolean {
    return block.processId !== null && this.pendingReclaimPids.has(block.processId);
  }

  formatTimestamp(date: Date): string {
    const d = new Date(date);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}
