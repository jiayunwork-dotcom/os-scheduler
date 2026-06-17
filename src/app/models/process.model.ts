export type ProcessState = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';

export interface Process {
  id: number;
  name: string;
  arrivalTime: number;
  burstTime: number;
  priority: number;
  ioBurstTime: number;
  ioStartTime: number;
  color: string;
}

export interface ProcessRuntime {
  remainingTime: number;
  startTime: number;
  completionTime: number;
  waitingTime: number;
  turnaroundTime: number;
  responseTime: number;
  firstResponseTime: number;
  executedTime: number;
  ioExecuted: number;
  inIo: boolean;
  queueLevel: number;
}
