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
        burstTime: 8,
        priority: 3,
        ioBurstTime: 2,
        ioStartTime: 4,
        color: '#ef4444',
      },
      {
        id: 2,
        name: 'P2',
        arrivalTime: 2,
        burstTime: 4,
        priority: 1,
        ioBurstTime: 0,
        ioStartTime: -1,
        color: '#3b82f6',
      },
      {
        id: 3,
        name: 'P3',
        arrivalTime: 4,
        burstTime: 5,
        priority: 4,
        ioBurstTime: 3,
        ioStartTime: 2,
        color: '#10b981',
      },
      {
        id: 4,
        name: 'P4',
        arrivalTime: 6,
        burstTime: 6,
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

  get isMlfq(): boolean {
    return this.config.algorithm === AlgorithmType.MLFQ;
  }

  get totalTime(): number {
    return this.schedulingResult?.totalTime ?? 0;
  }

  get currentSnapshot(): ReadyQueueSnapshot | null {
    if (!this.schedulingResult) return null;
    const idx = Math.min(
      this.currentTime,
      this.schedulingResult.readyQueueHistory.length - 1
    );
    return this.schedulingResult.readyQueueHistory[idx] ?? null;
  }

  get currentEvents(): EventLog[] {
    if (!this.schedulingResult) return [];
    return this.schedulingResult.events.filter((e) => e.time <= this.currentTime);
  }

  get currentGantt(): GanttBlock[] {
    if (!this.schedulingResult) return [];
    if (this.mode === 'instant') return this.schedulingResult.ganttChart;
    return this.schedulingResult.ganttChart.filter((b) => b.startTime <= this.currentTime);
  }

  get currentProcessResults(): ProcessResult[] {
    return this.schedulingResult?.processResults ?? [];
  }
}
