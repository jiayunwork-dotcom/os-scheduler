import { Component, OnDestroy, OnInit } from '@angular/core';
import { Process } from './models/process.model';
import {
  AlgorithmType,
  SchedulingConfig,
  SchedulingResult,
  ReadyQueueSnapshot,
  EventLog,
  ProcessResult,
  GanttBlock,
} from './models/scheduling.model';
import { SchedulingService } from './services/scheduling.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  processes: Process[] = [];
  config: SchedulingConfig = {
    algorithm: AlgorithmType.FCFS,
    timeQuantum: 4,
    priorityPreemptive: false,
  };
  compareMode = false;

  schedulingResult: SchedulingResult | null = null;
  compareResults: { name: string; result: SchedulingResult }[] | null = null;

  mode: 'instant' | 'animation' = 'instant';
  currentTime = 0;
  isPlaying = false;
  speed = 1;

  copyToastVisible = false;

  private animationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private schedulingService: SchedulingService) {}

  ngOnInit(): void {
    this.loadDefaultProcesses();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private loadDefaultProcesses(): void {
    this.processes = [
      {
        id: 1,
        name: 'P1',
        arrivalTime: 0,
        burstTime: 10,
        priority: 3,
        ioBurstTime: 2,
        ioStartTime: 5,
        color: '#ef4444',
      },
      {
        id: 2,
        name: 'P2',
        arrivalTime: 1,
        burstTime: 4,
        priority: 1,
        ioBurstTime: 0,
        ioStartTime: -1,
        color: '#3b82f6',
      },
      {
        id: 3,
        name: 'P3',
        arrivalTime: 3,
        burstTime: 6,
        priority: 4,
        ioBurstTime: 3,
        ioStartTime: 2,
        color: '#10b981',
      },
      {
        id: 4,
        name: 'P4',
        arrivalTime: 5,
        burstTime: 8,
        priority: 2,
        ioBurstTime: 0,
        ioStartTime: -1,
        color: '#f59e0b',
      },
    ];
  }

  onProcessesChange(processes: Process[]): void {
    this.processes = processes;
    this.resetSimulation();
  }

  onConfigChange(config: SchedulingConfig): void {
    this.config = config;
    this.resetSimulation();
  }

  onCompareModeChange(value: boolean): void {
    this.compareMode = value;
    this.resetSimulation();
  }

  runSimulation(): void {
    if (this.processes.length === 0) return;
    this.stopTimer();
    const result = this.schedulingService.schedule(this.processes, this.config);
    this.schedulingResult = result;
    this.compareResults = null;
    this.currentTime = 0;
    if (this.mode === 'instant') {
      this.currentTime = result.totalTime;
    }
  }

  runAllSimulation(): void {
    if (this.processes.length === 0) return;
    this.stopTimer();
    const algorithms: { name: string; config: SchedulingConfig }[] = [
      { name: 'FCFS', config: { algorithm: AlgorithmType.FCFS } },
      { name: 'SJF', config: { algorithm: AlgorithmType.SJF } },
      { name: 'SRTF', config: { algorithm: AlgorithmType.SRTF } },
      { name: '优先级(非抢占)', config: { algorithm: AlgorithmType.PRIORITY_NP } },
      { name: '优先级(抢占)', config: { algorithm: AlgorithmType.PRIORITY_P } },
      { name: 'RR(q=4)', config: { algorithm: AlgorithmType.RR, timeQuantum: 4 } },
      { name: 'MLFQ', config: { algorithm: AlgorithmType.MLFQ } },
    ];
    this.compareResults = algorithms.map((a) => ({
      name: a.name,
      result: this.schedulingService.schedule(this.processes, a.config),
    }));
    this.schedulingResult = null;
    this.currentTime = 0;
  }

  private resetSimulation(): void {
    this.stopTimer();
    this.schedulingResult = null;
    this.compareResults = null;
    this.currentTime = 0;
  }

  onModeChange(mode: 'instant' | 'animation'): void {
    this.mode = mode;
    this.stopTimer();
    if (mode === 'instant' && this.schedulingResult) {
      this.currentTime = this.schedulingResult.totalTime;
    } else {
      this.currentTime = 0;
    }
  }

  onPlay(): void {
    if (!this.schedulingResult || this.currentTime >= this.schedulingResult.totalTime) {
      return;
    }
    this.isPlaying = true;
    this.startTimer();
  }

  onPause(): void {
    this.isPlaying = false;
    this.stopTimer();
  }

  onStepForward(): void {
    if (this.schedulingResult && this.currentTime < this.schedulingResult.totalTime) {
      this.currentTime = Math.min(this.currentTime + 1, this.schedulingResult.totalTime);
    }
  }

  onStepBackward(): void {
    if (this.currentTime > 0) {
      this.currentTime = Math.max(0, this.currentTime - 1);
    }
  }

  onReset(): void {
    this.stopTimer();
    this.currentTime = 0;
    this.isPlaying = false;
  }

  onSeekTo(time: number): void {
    this.currentTime = time;
  }

  onSpeedChange(speed: number): void {
    this.speed = speed;
    if (this.isPlaying) {
      this.stopTimer();
      this.startTimer();
    }
  }

  private startTimer(): void {
    if (!this.schedulingResult) return;
    const interval = 1000 / this.speed;
    this.animationTimer = setInterval(() => {
      if (this.currentTime >= this.schedulingResult!.totalTime) {
        this.onPause();
        return;
      }
      this.currentTime++;
    }, interval);
  }

  private stopTimer(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  onGanttBlockClick(time: number): void {
    if (!this.schedulingResult) return;
    this.mode = 'animation';
    this.currentTime = time;
    this.isPlaying = false;
    this.stopTimer();
  }

  get isMlfq(): boolean {
    return this.config.algorithm === AlgorithmType.MLFQ;
  }

  get totalTime(): number {
    return this.schedulingResult?.totalTime ?? 0;
  }

  get currentSnapshot(): ReadyQueueSnapshot | null {
    if (!this.schedulingResult) return null;
    const history = this.schedulingResult.readyQueueHistory;
    if (history.length === 0) return null;
    let best = history[0];
    for (const snap of history) {
      if (snap.time <= this.currentTime) {
        best = snap;
      } else {
        break;
      }
    }
    return best;
  }

  get currentEvents(): EventLog[] {
    if (!this.schedulingResult) return [];
    return this.schedulingResult.events;
  }

  get currentGantt(): GanttBlock[] {
    if (!this.schedulingResult) return [];
    if (this.mode === 'instant') return this.schedulingResult.ganttChart;
    return this.schedulingResult.ganttChart.filter((b) => b.startTime <= this.currentTime);
  }

  get currentProcessResults(): ProcessResult[] {
    return this.schedulingResult?.processResults ?? [];
  }

  exportReport(): void {
    const lines: string[] = [];
    lines.push('========================================');
    lines.push('  操作系统进程调度算法模拟器 - 模拟报告');
    lines.push('========================================');
    lines.push('');

    lines.push('【进程配置】');
    lines.push('进程ID | 到达时间 | CPU Burst | 优先级 | IO Burst | IO时机');
    lines.push('-------|----------|----------|--------|----------|-------');
    for (const p of this.processes) {
      lines.push(
        `P${p.id}(${p.name}) | ${p.arrivalTime}        | ${p.burstTime}         | ${p.priority}       | ${p.ioBurstTime}         | ${p.ioStartTime === -1 ? '-' : p.ioStartTime}`
      );
    }
    lines.push('');

    if (this.schedulingResult && !this.compareMode) {
      lines.push('【调度算法】');
      lines.push(`算法: ${this.config.algorithm}`);
      if (this.config.timeQuantum) {
        lines.push(`时间片: ${this.config.timeQuantum}`);
      }
      lines.push('');

      lines.push('【甘特图】');
      lines.push('起止时间       | 进程     | 持续');
      lines.push('--------------|----------|-----');
      for (const block of this.schedulingResult.ganttChart) {
        const name = block.isIdle ? '空闲' : `P${block.processId}`;
        const dur = block.endTime - block.startTime;
        lines.push(`${block.startTime}-${block.endTime}          | ${name.padEnd(8)} | ${dur}`);
      }
      lines.push('');

      lines.push('【性能指标】');
      const r = this.schedulingResult;
      lines.push(`平均周转时间: ${r.avgTurnaroundTime.toFixed(2)}`);
      lines.push(`平均等待时间: ${r.avgWaitingTime.toFixed(2)}`);
      lines.push(`平均响应时间: ${r.avgResponseTime.toFixed(2)}`);
      lines.push(`CPU利用率: ${(r.cpuUtilization * 100).toFixed(1)}%`);
      lines.push(`吞吐量: ${r.throughput.toFixed(4)} 个/单位时间`);
      lines.push(`总运行时间: ${r.totalTime} 时间单位`);
      lines.push(`上下文切换次数: ${r.contextSwitchCount}`);
      lines.push(`CPU空闲时间片: ${r.cpuIdleTicks}`);
      lines.push('');
      lines.push('【进程抢占次数】');
      for (const p of this.processes) {
        const count = r.preemptionCounts?.get(p.id) || 0;
        lines.push(`P${p.id}(${p.name}): ${count}`);
      }
    }

    if (this.compareResults && this.compareMode) {
      lines.push('【算法对比模式】');
      lines.push('');
      lines.push('算法            | 平均周转 | 平均等待 | 平均响应 | CPU利用率 | 吞吐量   | 上下文切换 | CPU空闲');
      lines.push('----------------|----------|----------|----------|-----------|----------|------------|--------');
      for (const item of this.compareResults) {
        const r = item.result;
        lines.push(
          `${item.name.padEnd(16)}| ${r.avgTurnaroundTime.toFixed(2).padEnd(9)}| ${r.avgWaitingTime.toFixed(2).padEnd(9)}| ${r.avgResponseTime.toFixed(2).padEnd(9)}| ${((r.cpuUtilization * 100).toFixed(1) + '%').padEnd(10)}| ${r.throughput.toFixed(4).padEnd(9)}| ${String(r.contextSwitchCount).padEnd(11)}| ${r.cpuIdleTicks}`
        );
      }
    }

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.copyToastVisible = true;
      setTimeout(() => {
        this.copyToastVisible = false;
      }, 2000);
    });
  }
}
