import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchedulingResult, ProcessResult } from '../../models/scheduling.model';
import { Process } from '../../models/process.model';

interface CompareItem {
  name: string;
  result: SchedulingResult;
}

@Component({
  selector: 'app-metrics-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics-panel.component.html',
  styleUrls: ['./metrics-panel.component.scss']
})
export class MetricsPanelComponent {
  @Input() result: SchedulingResult | null = null;
  @Input() processes: Process[] = [];
  @Input() compareResults: CompareItem[] | null = null;
  @Input() compareMode: boolean = false;

  statsExpanded: boolean = false;

  readonly barColors = [
    '#4285F4',
    '#EA4335',
    '#FBBC04',
    '#34A853',
    '#9C27B0',
    '#00BCD4',
    '#FF5722'
  ];

  toggleStats(): void {
    this.statsExpanded = !this.statsExpanded;
  }

  getPreemptionEntries(result: SchedulingResult): { name: string; count: number }[] {
    const entries: { name: string; count: number }[] = [];
    if (!result.preemptionCounts) return entries;
    for (const p of this.processes) {
      const count = result.preemptionCounts.get(p.id) || 0;
      entries.push({ name: p.name, count });
    }
    return entries;
  }

  getProcessColor(processId: number): string {
    const process = this.processes.find(p => p.id === processId);
    return process?.color || '#6c757d';
  }

  getAverageRow(processResults: ProcessResult[] | undefined) {
    if (!processResults || processResults.length === 0) {
      return { turnaroundTime: 0, waitingTime: 0, responseTime: 0, startTime: 0, completionTime: 0 };
    }
    const count = processResults.length;
    return {
      turnaroundTime: processResults.reduce((sum, p) => sum + p.turnaroundTime, 0) / count,
      waitingTime: processResults.reduce((sum, p) => sum + p.waitingTime, 0) / count,
      responseTime: processResults.reduce((sum, p) => sum + p.responseTime, 0) / count,
      startTime: processResults.reduce((sum, p) => sum + p.startTime, 0) / count,
      completionTime: processResults.reduce((sum, p) => sum + p.completionTime, 0) / count
    };
  }

  getBarHeight(value: number, max: number): number {
    if (max === 0) return 0;
    return (value / max) * 100;
  }

  getMaxAvgWaitingTime(): number {
    if (!this.compareResults || this.compareResults.length === 0) return 0;
    return Math.max(...this.compareResults.map(c => c.result.avgWaitingTime));
  }

  getMaxAvgTurnaroundTime(): number {
    if (!this.compareResults || this.compareResults.length === 0) return 0;
    return Math.max(...this.compareResults.map(c => c.result.avgTurnaroundTime));
  }

  getBarColor(index: number): string {
    return this.barColors[index % this.barColors.length];
  }

  isBestTurnaround(index: number): boolean {
    if (!this.compareResults || this.compareResults.length === 0) return false;
    const values = this.compareResults.map(c => c.result.avgTurnaroundTime);
    const min = Math.min(...values);
    return this.compareResults[index].result.avgTurnaroundTime === min;
  }

  isBestWaiting(index: number): boolean {
    if (!this.compareResults || this.compareResults.length === 0) return false;
    const values = this.compareResults.map(c => c.result.avgWaitingTime);
    const min = Math.min(...values);
    return this.compareResults[index].result.avgWaitingTime === min;
  }

  isBestResponse(index: number): boolean {
    if (!this.compareResults || this.compareResults.length === 0) return false;
    const values = this.compareResults.map(c => c.result.avgResponseTime);
    const min = Math.min(...values);
    return this.compareResults[index].result.avgResponseTime === min;
  }

  isBestCpu(index: number): boolean {
    if (!this.compareResults || this.compareResults.length === 0) return false;
    const values = this.compareResults.map(c => c.result.cpuUtilization);
    const max = Math.max(...values);
    return this.compareResults[index].result.cpuUtilization === max;
  }

  isBestThroughput(index: number): boolean {
    if (!this.compareResults || this.compareResults.length === 0) return false;
    const values = this.compareResults.map(c => c.result.throughput);
    const max = Math.max(...values);
    return this.compareResults[index].result.throughput === max;
  }

  formatNumber(value: number): string {
    return value.toFixed(2);
  }

  formatPercent(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }
}
