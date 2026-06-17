export interface ResourceType {
  id: number;
  name: string;
  totalCount: number;
  color: string;
}

export interface ProcessResourceInfo {
  processId: number;
  allocation: number[];
  max: number[];
}

export interface BankerStep {
  step: number;
  available: number[];
  work: number[];
  need: number[][];
  currentProcessId: number | null;
  canAllocate: boolean;
  finished: boolean[];
  safeSequence: number[];
  message: string;
}

export interface BankerResult {
  isSafe: boolean;
  safeSequence: number[];
  steps: BankerStep[];
  available: number[];
  need: number[][];
}

export interface ResourceRequestResult {
  success: boolean;
  failedCheck?: 'need' | 'available' | 'safety';
  message: string;
  newAllocation?: number[];
  newAvailable?: number[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'allocation' | 'request';
  isCycle: boolean;
}

export interface DeadlockDetectionResult {
  hasDeadlock: boolean;
  deadlockedProcesses: number[];
  cycleEdges: string[];
  edges: GraphEdge[];
  processNodes: { id: number; label: string; isDeadlocked: boolean }[];
  resourceNodes: { id: number; label: string; isInCycle: boolean }[];
}

export interface RequestHistoryEntry {
  id: number;
  timestamp: Date;
  processId: number;
  request: number[];
  result: ResourceRequestResult;
  snapshot: {
    processResourceInfo: ProcessResourceInfo[];
    resources: ResourceType[];
  };
}

export interface RecoverySuggestion {
  processId: number;
  resourceType: number;
  amount: number;
  resourceName: string;
}

export interface TerminatedProcessInfo {
  processId: number;
  terminated: boolean;
}
