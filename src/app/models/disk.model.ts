export type DiskAlgorithmType = 'FCFS' | 'SSTF' | 'SCAN' | 'C-SCAN' | 'LOOK';

export type HeadDirection = 'inward' | 'outward';

export interface DiskConfig {
  totalTracks: number;
  initialPosition: number;
  direction: HeadDirection;
  algorithm: DiskAlgorithmType;
}

export interface DiskScheduleStep {
  step: number;
  currentPosition: number;
  nextTrack: number;
  moveDistance: number;
  direction: HeadDirection;
}

export interface DiskScheduleResult {
  algorithm: DiskAlgorithmType;
  totalTracks: number;
  initialPosition: number;
  requests: number[];
  steps: DiskScheduleStep[];
  totalMoveDistance: number;
  averageSeekLength: number;
  path: number[];
}

export interface DiskCompareResult {
  name: string;
  result: DiskScheduleResult;
}
