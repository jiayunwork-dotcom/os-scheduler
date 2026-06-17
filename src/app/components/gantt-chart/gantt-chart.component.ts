import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GanttBlock, ProcessResult, TimelineSegment } from '../../models/scheduling.model';
import { Process } from '../../models/process.model';

@Component({
  selector: 'app-gantt-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-chart.component.html',
  styleUrls: ['./gantt-chart.component.scss']
})
export class GanttChartComponent implements OnInit, OnChanges {
  @Input() ganttChart: GanttBlock[] = [];
  @Input() processes: Process[] = [];
  @Input() processResults: ProcessResult[] = [];
  @Input() currentTime: number = 0;
  @Input() animationMode: boolean = false;
  @Output() blockClick = new EventEmitter<number>();

  readonly TIME_UNIT_WIDTH = 30;
  readonly ROW_HEIGHT = 40;
  readonly LABEL_WIDTH = 80;

  totalTime: number = 0;
  chartWidth: number = 0;

  tooltipVisible: boolean = false;
  tooltipX: number = 0;
  tooltipY: number = 0;
  tooltipProcessName: string = '';
  tooltipStartTime: number = 0;
  tooltipEndTime: number = 0;
  tooltipDuration: number = 0;

  ngOnInit(): void {
    this.calculateDimensions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateDimensions();
  }

  private calculateDimensions(): void {
    if (this.ganttChart.length > 0) {
      this.totalTime = Math.max(...this.ganttChart.map(b => b.endTime));
    }
    if (this.processResults.length > 0) {
      const maxCompletion = Math.max(...this.processResults.map(r => r.completionTime));
      this.totalTime = Math.max(this.totalTime, maxCompletion);
    }
    this.chartWidth = this.totalTime * this.TIME_UNIT_WIDTH;
  }

  getProcessColor(processId: number | null): string {
    if (processId === null) return '#ccc';
    const process = this.processes.find(p => p.id === processId);
    return process ? process.color : '#ccc';
  }

  getProcessName(processId: number | null): string {
    if (processId === null) return '空闲';
    const process = this.processes.find(p => p.id === processId);
    return process ? process.name : '空闲';
  }

  getBlockWidth(block: GanttBlock): number {
    return (block.endTime - block.startTime) * this.TIME_UNIT_WIDTH;
  }

  getBlockLeft(block: GanttBlock): number {
    return block.startTime * this.TIME_UNIT_WIDTH;
  }

  getSegmentWidth(segment: TimelineSegment): number {
    if (segment.type === 'arrival' || segment.type === 'completion') {
      return 2;
    }
    return (segment.end - segment.start) * this.TIME_UNIT_WIDTH;
  }

  getSegmentLeft(segment: TimelineSegment): number {
    return segment.start * this.TIME_UNIT_WIDTH;
  }

  getSegmentColor(segment: TimelineSegment, processId: number): string {
    switch (segment.type) {
      case 'arrival':
        return '#333';
      case 'waiting':
        return '#a8d8ea';
      case 'execution':
        return this.getProcessColor(processId);
      case 'io':
        return '#ffa62b';
      case 'completion':
        return '#333';
      default:
        return '#ccc';
    }
  }

  getTimeAxisTicks(): number[] {
    const ticks: number[] = [];
    for (let i = 0; i <= this.totalTime; i++) {
      ticks.push(i);
    }
    return ticks;
  }

  getProcessResult(processId: number): ProcessResult | undefined {
    return this.processResults.find(r => r.processId === processId);
  }

  getCompletionTimeLabel(segment: TimelineSegment): string {
    return segment.start.toString();
  }

  isSegmentVisible(segment: TimelineSegment): boolean {
    if (!this.animationMode) return true;
    return segment.start <= this.currentTime;
  }

  isBlockVisible(block: GanttBlock): boolean {
    if (!this.animationMode) return true;
    return block.startTime <= this.currentTime;
  }

  onBlockHover(event: MouseEvent, block: GanttBlock): void {
    this.tooltipVisible = true;
    this.tooltipProcessName = block.isIdle ? '空闲' : this.getProcessName(block.processId);
    this.tooltipStartTime = block.startTime;
    this.tooltipEndTime = block.endTime;
    this.tooltipDuration = block.endTime - block.startTime;
    const target = event.currentTarget as HTMLElement;
    const cpuRow = target.closest('.gantt-cpu-row') as HTMLElement;
    if (cpuRow) {
      const rowRect = cpuRow.getBoundingClientRect();
      this.tooltipX = event.clientX - rowRect.left;
      this.tooltipY = event.clientY - rowRect.top - 10;
    }
  }

  onBlockLeave(): void {
    this.tooltipVisible = false;
  }

  onBlockClick(block: GanttBlock): void {
    this.blockClick.emit(block.startTime);
  }
}
