import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray, FormControl } from '@angular/forms';
import { Process } from '../../models/process.model';
import {
  ResourceType,
  ProcessResourceInfo,
  BankerResult,
  BankerStep,
  ResourceRequestResult,
  DeadlockDetectionResult,
} from '../../models/deadlock.model';
import { DeadlockService } from '../../services/deadlock.service';

const RESOURCE_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
];

const DEFAULT_RESOURCES = [
  { name: '打印机', totalCount: 2 },
  { name: '磁盘', totalCount: 3 },
  { name: '内存块', totalCount: 4 },
];

@Component({
  selector: 'app-deadlock-detector',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './deadlock-detector.component.html',
  styleUrls: ['./deadlock-detector.component.scss'],
})
export class DeadlockDetectorComponent implements OnInit, OnChanges {
  @Input() processes: Process[] = [];
  @Input() completedProcessIds: number[] = [];
  @Output() resourceInfoChange = new EventEmitter<ProcessResourceInfo[]>();

  isExpanded = true;

  resources: ResourceType[] = [];
  processResourceInfo: ProcessResourceInfo[] = [];

  resourceForm!: FormGroup;
  newResourceName = '';
  newResourceCount = 1;

  selectedProcessId: number | null = null;
  resourceModalVisible = false;
  resourceModalForm!: FormGroup;

  bankerResult: BankerResult | null = null;
  currentBankerStep = 0;
  bankerPlayMode: 'step' | 'instant' = 'instant';
  bankerIsPlaying = false;
  private bankerTimer: ReturnType<typeof setInterval> | null = null;

  requestProcessId: number | null = null;
  requestModalVisible = false;
  requestForm!: FormGroup;
  requestResult: ResourceRequestResult | null = null;

  deadlockResult: DeadlockDetectionResult | null = null;

  tempAllocation: number[] = [];
  tempMax: number[] = [];
  tempRequest: number[] = [];

  constructor(
    private fb: FormBuilder,
    private deadlockService: DeadlockService
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.loadDefaultResources();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['processes']) {
      this.syncProcessResources();
    }
    if (changes['completedProcessIds']) {
      this.releaseCompletedProcessResources();
    }
  }

  private initForms(): void {
    this.resourceForm = this.fb.group({
      resources: this.fb.array([]),
    });
  }

  private loadDefaultResources(): void {
    this.resources = DEFAULT_RESOURCES.map((r, i) => ({
      id: this.deadlockService.generateResourceId(),
      name: r.name,
      totalCount: r.totalCount,
      color: RESOURCE_COLORS[i % RESOURCE_COLORS.length],
    }));
    this.syncProcessResources();
  }

  private syncProcessResources(): void {
    const updatedInfo: ProcessResourceInfo[] = [];
    for (const p of this.processes) {
      const existing = this.processResourceInfo.find(
        (info) => info.processId === p.id
      );
      if (existing) {
        const paddedAllocation = this.padArray(existing.allocation, this.resources.length);
        const paddedMax = this.padArray(existing.max, this.resources.length);
        updatedInfo.push({
          ...existing,
          allocation: paddedAllocation,
          max: paddedMax,
        });
      } else {
        updatedInfo.push({
          processId: p.id,
          allocation: new Array(this.resources.length).fill(0),
          max: new Array(this.resources.length).fill(0),
        });
      }
    }
    this.processResourceInfo = updatedInfo;
    this.emitResourceInfo();
    this.clearResults();
  }

  private padArray(arr: number[], length: number): number[] {
    const result = [...arr];
    while (result.length < length) {
      result.push(0);
    }
    return result.slice(0, length);
  }

  private releaseCompletedProcessResources(): void {
    let changed = false;
    for (const pid of this.completedProcessIds) {
      const info = this.processResourceInfo.find(
        (p) => p.processId === pid
      );
      if (info) {
        const hasAllocation = info.allocation.some((a) => a > 0);
        if (hasAllocation) {
          info.allocation = new Array(this.resources.length).fill(0);
          changed = true;
        }
      }
    }
    if (changed) {
      this.emitResourceInfo();
      this.clearResults();
    }
  }

  private clearResults(): void {
    this.bankerResult = null;
    this.currentBankerStep = 0;
    this.stopBankerAnimation();
    this.deadlockResult = null;
  }

  private emitResourceInfo(): void {
    this.resourceInfoChange.emit([...this.processResourceInfo]);
  }

  get resourceFormArray(): FormArray {
    return this.resourceForm.get('resources') as FormArray;
  }

  addResource(): void {
    if (this.resources.length >= 8) return;
    if (!this.newResourceName.trim()) return;
    if (this.newResourceCount < 1 || this.newResourceCount > 10) return;

    const newResource: ResourceType = {
      id: this.deadlockService.generateResourceId(),
      name: this.newResourceName.trim(),
      totalCount: this.newResourceCount,
      color: RESOURCE_COLORS[this.resources.length % RESOURCE_COLORS.length],
    };

    this.resources.push(newResource);

    for (const info of this.processResourceInfo) {
      info.allocation.push(0);
      info.max.push(0);
    }

    this.newResourceName = '';
    this.newResourceCount = 1;
    this.emitResourceInfo();
    this.clearResults();
  }

  removeResource(resourceId: number): void {
    const idx = this.resources.findIndex((r) => r.id === resourceId);
    if (idx === -1) return;

    this.resources.splice(idx, 1);

    for (const info of this.processResourceInfo) {
      info.allocation.splice(idx, 1);
      info.max.splice(idx, 1);
    }

    this.emitResourceInfo();
    this.clearResults();
  }

  updateResourceCount(resourceId: number, count: number): void {
    const resource = this.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    resource.totalCount = Math.max(1, Math.min(10, count));
    this.clearResults();
  }

  openResourceModal(processId: number): void {
    this.selectedProcessId = processId;
    const info = this.processResourceInfo.find((p) => p.processId === processId);
    if (!info) return;

    this.tempAllocation = [...info.allocation];
    this.tempMax = [...info.max];

    this.resourceModalVisible = true;
  }

  closeResourceModal(): void {
    this.resourceModalVisible = false;
    this.selectedProcessId = null;
  }

  get modalAllocationArray(): FormArray {
    return this.resourceModalForm?.get('allocation') as FormArray;
  }

  get modalMaxArray(): FormArray {
    return this.resourceModalForm?.get('max') as FormArray;
  }

  saveResourceModal(): void {
    if (this.selectedProcessId === null) return;

    const allocation = this.tempAllocation.map((v: number) =>
      Math.max(0, Math.floor(v))
    );
    const max = this.tempMax.map((v: number) =>
      Math.max(0, Math.floor(v))
    );

    const validation = this.deadlockService.validateAllocation(
      allocation,
      max,
      this.resources
    );

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const info = this.processResourceInfo.find(
      (p) => p.processId === this.selectedProcessId
    );
    if (info) {
      info.allocation = allocation;
      info.max = max;
    }

    this.emitResourceInfo();
    this.clearResults();
    this.closeResourceModal();
  }

  runBankerAlgorithm(): void {
    if (this.resources.length === 0 || this.processResourceInfo.length === 0) return;

    this.bankerResult = this.deadlockService.runBankerAlgorithm(
      this.resources,
      this.processResourceInfo
    );

    if (this.bankerPlayMode === 'instant') {
      this.currentBankerStep = this.bankerResult.steps.length - 1;
    } else {
      this.currentBankerStep = 0;
    }
  }

  get currentStep(): BankerStep | null {
    if (!this.bankerResult) return null;
    return this.bankerResult.steps[Math.min(this.currentBankerStep, this.bankerResult.steps.length - 1)];
  }

  nextBankerStep(): void {
    if (!this.bankerResult) return;
    if (this.currentBankerStep < this.bankerResult.steps.length - 1) {
      this.currentBankerStep++;
    }
  }

  prevBankerStep(): void {
    if (this.currentBankerStep > 0) {
      this.currentBankerStep--;
    }
  }

  resetBankerAnimation(): void {
    this.currentBankerStep = 0;
    this.bankerIsPlaying = false;
    this.stopBankerAnimation();
  }

  toggleBankerPlay(): void {
    if (this.bankerIsPlaying) {
      this.stopBankerAnimation();
      this.bankerIsPlaying = false;
    } else {
      this.startBankerAnimation();
      this.bankerIsPlaying = true;
    }
  }

  private startBankerAnimation(): void {
    this.stopBankerAnimation();
    this.bankerTimer = setInterval(() => {
      if (this.bankerResult && this.currentBankerStep < this.bankerResult.steps.length - 1) {
        this.currentBankerStep++;
      } else {
        this.stopBankerAnimation();
        this.bankerIsPlaying = false;
      }
    }, 1500);
  }

  private stopBankerAnimation(): void {
    if (this.bankerTimer) {
      clearInterval(this.bankerTimer);
      this.bankerTimer = null;
    }
  }

  openRequestModal(processId: number): void {
    this.requestProcessId = processId;
    const info = this.processResourceInfo.find((p) => p.processId === processId);
    if (!info) return;

    this.tempRequest = new Array(this.resources.length).fill(0);
    this.requestResult = null;
    this.requestModalVisible = true;
  }

  closeRequestModal(): void {
    this.requestModalVisible = false;
    this.requestProcessId = null;
    this.requestResult = null;
  }

  get requestArray(): FormArray {
    return this.requestForm?.get('request') as FormArray;
  }

  submitRequest(): void {
    if (this.requestProcessId === null) return;

    const request = this.tempRequest.map((v: number) =>
      Math.max(0, Math.floor(v))
    );

    this.requestResult = this.deadlockService.checkResourceRequest(
      this.resources,
      this.processResourceInfo,
      this.requestProcessId,
      request
    );

    if (this.requestResult.success && this.requestResult.newAllocation) {
      const info = this.processResourceInfo.find(
        (p) => p.processId === this.requestProcessId
      );
      if (info) {
        info.allocation = this.requestResult.newAllocation;
      }
      this.emitResourceInfo();
      this.clearResults();
    }
  }

  runDeadlockDetection(): void {
    this.deadlockResult = this.deadlockService.detectDeadlock(
      this.resources,
      this.processResourceInfo
    );
  }

  getProcessById(id: number): Process | undefined {
    return this.processes.find((p) => p.id === id);
  }

  getAvailableResources(): number[] {
    return this.deadlockService.getAvailable(this.resources, this.processResourceInfo);
  }

  isProcessCompleted(processId: number): boolean {
    return this.completedProcessIds.includes(processId);
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  getEdgePosition(edge: { from: string; to: string }): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null {
    if (!this.deadlockResult) return null;

    const processNodes = this.deadlockResult.processNodes;
    const resourceNodes = this.deadlockResult.resourceNodes;

    const getProcessPos = (pid: number) => {
      const idx = processNodes.findIndex((n) => n.id === pid);
      if (idx === -1) return null;
      return {
        x: 80 + (idx % 4) * 130,
        y: 40 + this.intDiv(idx, 4) * 220,
      };
    };

    const getResourcePos = (rid: number) => {
      const idx = resourceNodes.findIndex((n) => n.id === rid);
      if (idx === -1) return null;
      return {
        x: 370 + (idx % 4) * 60,
        y: 50 + this.intDiv(idx, 4) * 220,
      };
    };

    let fromPos: { x: number; y: number } | null = null;
    let toPos: { x: number; y: number } | null = null;

    if (edge.from.startsWith('P')) {
      const pid = parseInt(edge.from.substring(1), 10);
      fromPos = getProcessPos(pid);
      if (fromPos) fromPos.x += 25;
    } else if (edge.from.startsWith('R')) {
      const rid = parseInt(edge.from.substring(1), 10);
      fromPos = getResourcePos(rid);
      if (fromPos) fromPos.x -= 5;
    }

    if (edge.to.startsWith('P')) {
      const pid = parseInt(edge.to.substring(1), 10);
      toPos = getProcessPos(pid);
      if (toPos) toPos.x -= 25;
    } else if (edge.to.startsWith('R')) {
      const rid = parseInt(edge.to.substring(1), 10);
      toPos = getResourcePos(rid);
      if (toPos) toPos.x += 45;
    }

    if (!fromPos || !toPos) return null;

    return {
      x1: fromPos.x,
      y1: fromPos.y,
      x2: toPos.x,
      y2: toPos.y,
    };
  }

  getProcessNodePos(index: number): { cx: number; cy: number; ty: number } {
    return {
      cx: 80 + (index % 4) * 130,
      cy: 40 + this.intDiv(index, 4) * 220,
      ty: 45 + this.intDiv(index, 4) * 220,
    };
  }

  getResourceNodePos(index: number): { x: number; y: number; ty: number } {
    return {
      x: 350 + (index % 4) * 60,
      y: 30 + this.intDiv(index, 4) * 220,
      ty: 55 + this.intDiv(index, 4) * 220,
    };
  }

  private intDiv(a: number, b: number): number {
    return Math.floor(a / b);
  }

  getResourceColor(index: number, alpha: number): string {
    const color = this.resources[index]?.color || '#9ca3af';
    const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0');
    return color + alphaHex;
  }

  getResourceLabel(index: number): string {
    const r = this.resources[index];
    if (!r) return '?';
    return r.name.charAt(0);
  }

  getResourceLabelByResource(resource: ResourceType): string {
    return resource.name.charAt(0);
  }

  isRowHighlighted(index: number): boolean {
    if (!this.currentStep || this.currentStep.currentProcessId === null) return false;
    const info = this.processResourceInfo[index];
    return info?.processId === this.currentStep.currentProcessId;
  }

  getProcessColor(index: number): string {
    const info = this.processResourceInfo[index];
    if (!info) return '#9ca3af';
    return this.getProcessColorById(info.processId);
  }

  getProcessIdByIndex(index: number): number {
    return this.processResourceInfo[index]?.processId ?? 0;
  }

  getSafeSequenceText(): string {
    if (!this.bankerResult?.isSafe) return '';
    return this.bankerResult.safeSequence.map((id) => 'P' + id).join(' → ');
  }

  getDeadlockedProcessesText(): string {
    if (!this.deadlockResult?.hasDeadlock) return '';
    return this.deadlockResult.deadlockedProcesses.map((id) => 'P' + id).join(', ');
  }

  getProcessCx(index: number): number {
    return this.getProcessNodePos(index).cx;
  }

  getProcessCy(index: number): number {
    return this.getProcessNodePos(index).cy;
  }

  getProcessTy(index: number): number {
    return this.getProcessNodePos(index).ty;
  }

  getResourceX(index: number): number {
    return this.getResourceNodePos(index).x;
  }

  getResourceY(index: number): number {
    return this.getResourceNodePos(index).y;
  }

  getResourceTextX(index: number): number {
    const pos = this.getResourceNodePos(index);
    return pos.x + 20;
  }

  getResourceTextY(index: number): number {
    return this.getResourceNodePos(index).ty;
  }

  getResourceFill(index: number): string {
    return this.resources[index]?.color || '#9ca3af';
  }

  getResourceStroke(isInCycle: boolean): string {
    return isInCycle ? '#ef4444' : '#6b7280';
  }

  getResourceStrokeWidth(isInCycle: boolean): number {
    return isInCycle ? 3 : 1.5;
  }

  getProcessStroke(isDeadlocked: boolean): string {
    return isDeadlocked ? '#ef4444' : 'none';
  }

  getProcessStrokeWidth(isDeadlocked: boolean): number {
    return isDeadlocked ? 3 : 0;
  }

  getProcessColorById(id: number): string {
    const process = this.processes.find((p) => p.id === id);
    return process?.color || '#9ca3af';
  }

  getResourceNodeLabel(index: number): string {
    return this.getResourceLabel(index);
  }

  hasEdgePosition(index: number): boolean {
    if (!this.deadlockResult) return false;
    const edge = this.deadlockResult.edges[index];
    return this.getEdgePosition(edge) !== null;
  }

  getEdgeX1(index: number): number {
    if (!this.deadlockResult) return 0;
    const edge = this.deadlockResult.edges[index];
    const pos = this.getEdgePosition(edge);
    return pos?.x1 ?? 0;
  }

  getEdgeY1(index: number): number {
    if (!this.deadlockResult) return 0;
    const edge = this.deadlockResult.edges[index];
    const pos = this.getEdgePosition(edge);
    return pos?.y1 ?? 0;
  }

  getEdgeX2(index: number): number {
    if (!this.deadlockResult) return 0;
    const edge = this.deadlockResult.edges[index];
    const pos = this.getEdgePosition(edge);
    return pos?.x2 ?? 0;
  }

  getEdgeY2(index: number): number {
    if (!this.deadlockResult) return 0;
    const edge = this.deadlockResult.edges[index];
    const pos = this.getEdgePosition(edge);
    return pos?.y2 ?? 0;
  }

  getEdgeStroke(index: number): string {
    if (!this.deadlockResult) return '#6b7280';
    const edge = this.deadlockResult.edges[index];
    return edge.isCycle ? '#ef4444' : '#6b7280';
  }

  getEdgeStrokeWidth(index: number): number {
    if (!this.deadlockResult) return 1.5;
    const edge = this.deadlockResult.edges[index];
    return edge.isCycle ? 2.5 : 1.5;
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
