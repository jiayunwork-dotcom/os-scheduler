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
  }

  resetSegmentation(): void {
    this.memoryBlocks = this.memoryService.initMemoryBlocks(this.totalMemoryKB);
    this.processSegments = [];
    this.segTranslationSteps = [];
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
}
