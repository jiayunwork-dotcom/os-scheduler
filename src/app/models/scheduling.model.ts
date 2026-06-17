export enum AlgorithmType {
  FCFS = 'FCFS',
  SJF = 'SJF',
  SRTF = 'SRTF',
  PRIORITY_NP = 'PRIORITY_NP',
  PRIORITY_P = 'PRIORITY_P',
  RR = 'RR',
  MLFQ = 'MLFQ'
}

export interface SchedulingConfig {
  algorithm: AlgorithmType;
  timeQuantum?: number;
  priorityPreemptive?: boolean;
}

export interface GanttBlock {
  processId: number | null;
  startTime: number;
  endTime: number;
  isIdle: boolean;
}

export interface EventLog {
  time: number;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

export interface ReadyQueueSnapshot {
  time: number;
  queues: number[][];
  currentProcessId: number | null;
}

export interface TimelineSegment {
  start: number;
  end: number;
  type: 'arrival' | 'waiting' | 'execution' | 'io' | 'completion';
}

export interface ProcessResult {
  processId: number;
  turnaroundTime: number;
  waitingTime: number;
  responseTime: number;
  completionTime: number;
  startTime: number;
  timeline: TimelineSegment[];
}

export interface SchedulingResult {
  ganttChart: GanttBlock[];
  events: EventLog[];
  readyQueueHistory: ReadyQueueSnapshot[];
  processResults: ProcessResult[];
  avgTurnaroundTime: number;
  avgWaitingTime: number;
  avgResponseTime: number;
  cpuUtilization: number;
  throughput: number;
  totalTime: number;
  contextSwitchCount: number;
  cpuIdleTicks: number;
  preemptionCounts: Map<number, number>;
}
