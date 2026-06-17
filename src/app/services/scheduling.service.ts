import { Injectable } from '@angular/core';
import { Process, ProcessRuntime, ProcessState } from '../models/process.model';
import {
  AlgorithmType,
  EventLog,
  GanttBlock,
  ProcessResult,
  ReadyQueueSnapshot,
  SchedulingConfig,
  SchedulingResult,
  TimelineSegment,
} from '../models/scheduling.model';

@Injectable({ providedIn: 'root' })
export class SchedulingService {
  schedule(processes: Process[], config: SchedulingConfig): SchedulingResult {
    switch (config.algorithm) {
      case AlgorithmType.FCFS:
        return this.simulateFCFS(processes, config);
      case AlgorithmType.SJF:
        return this.simulateSJF(processes, config);
      case AlgorithmType.SRTF:
        return this.simulateSRTF(processes, config);
      case AlgorithmType.PRIORITY_NP:
      case AlgorithmType.PRIORITY_P:
        return this.simulatePriority(processes, config);
      case AlgorithmType.RR:
        return this.simulateRR(processes, config);
      case AlgorithmType.MLFQ:
        return this.simulateMLFQ(processes, config);
      default:
        return this.simulateFCFS(processes, config);
    }
  }

  private initRuntime(processes: Process[]): Map<number, ProcessRuntime> {
    const runtime = new Map<number, ProcessRuntime>();
    for (const p of processes) {
      runtime.set(p.id, {
        remainingTime: p.burstTime,
        startTime: -1,
        completionTime: -1,
        waitingTime: 0,
        turnaroundTime: 0,
        responseTime: 0,
        firstResponseTime: -1,
        executedTime: 0,
        ioExecuted: 0,
        inIo: false,
        queueLevel: 0,
      });
    }
    return runtime;
  }

  private initStates(processes: Process[]): Map<number, ProcessState> {
    const states = new Map<number, ProcessState>();
    for (const p of processes) {
      states.set(p.id, 'NEW');
    }
    return states;
  }

  private initTimelines(processes: Process[]): Map<number, TimelineSegment[]> {
    const timelines = new Map<number, TimelineSegment[]>();
    for (const p of processes) {
      timelines.set(p.id, []);
    }
    return timelines;
  }

  private addEvent(events: EventLog[], time: number, message: string, type: EventLog['type'] = 'info'): void {
    events.push({ time, message, type });
  }

  private sortByArrivalFCFS(ids: number[], processes: Process[]): number[] {
    return [...ids].sort((a, b) => {
      const pa = processes.find(p => p.id === a)!;
      const pb = processes.find(p => p.id === b)!;
      if (pa.arrivalTime !== pb.arrivalTime) return pa.arrivalTime - pb.arrivalTime;
      return a - b;
    });
  }

  private sortByBurstSJF(ids: number[], processes: Process[], runtime: Map<number, ProcessRuntime>): number[] {
    return [...ids].sort((a, b) => {
      const pa = processes.find(p => p.id === a)!;
      const pb = processes.find(p => p.id === b)!;
      if (pa.burstTime !== pb.burstTime) return pa.burstTime - pb.burstTime;
      if (pa.arrivalTime !== pb.arrivalTime) return pa.arrivalTime - pb.arrivalTime;
      return a - b;
    });
  }

  private sortByRemainingSRTF(ids: number[], processes: Process[], runtime: Map<number, ProcessRuntime>): number[] {
    return [...ids].sort((a, b) => {
      const ra = runtime.get(a)!.remainingTime;
      const rb = runtime.get(b)!.remainingTime;
      if (ra !== rb) return ra - rb;
      const pa = processes.find(p => p.id === a)!;
      const pb = processes.find(p => p.id === b)!;
      if (pa.arrivalTime !== pb.arrivalTime) return pa.arrivalTime - pb.arrivalTime;
      return a - b;
    });
  }

  private sortByPriority(ids: number[], processes: Process[], runtime: Map<number, ProcessRuntime>): number[] {
    return [...ids].sort((a, b) => {
      const pa = processes.find(p => p.id === a)!;
      const pb = processes.find(p => p.id === b)!;
      if (pa.priority !== pb.priority) return pa.priority - pb.priority;
      if (pa.arrivalTime !== pb.arrivalTime) return pa.arrivalTime - pb.arrivalTime;
      return a - b;
    });
  }

  private takeSnapshot(
    history: ReadyQueueSnapshot[],
    time: number,
    queues: number[][],
    currentProcessId: number | null,
  ): void {
    history.push({
      time,
      queues: queues.map(q => [...q]),
      currentProcessId,
    });
  }

  private closeTimelineSegment(
    timeline: TimelineSegment[],
    endTime: number,
    expectedType?: TimelineSegment['type'],
  ): void {
    if (timeline.length === 0) return;
    const last = timeline[timeline.length - 1];
    if (expectedType && last.type !== expectedType) return;
    if (last.end === -1 || last.end === undefined || last.end === null) {
      last.end = endTime;
    }
    if (last.start >= last.end) {
      timeline.pop();
    }
  }

  private openTimelineSegment(
    timeline: TimelineSegment[],
    startTime: number,
    type: TimelineSegment['type'],
  ): void {
    if (timeline.length > 0) {
      const last = timeline[timeline.length - 1];
      if (last.type === type && (last.end === -1 || last.end === undefined || last.end === null)) return;
      if (last.end === -1 || last.end === undefined || last.end === null) {
        last.end = startTime;
        if (last.start >= last.end) {
          timeline.pop();
        }
      }
    }
    timeline.push({ start: startTime, end: -1 as unknown as number, type });
  }

  private finalizeAllTimelines(timelines: Map<number, TimelineSegment[]>, currentTime: number): void {
    for (const [, tl] of timelines) {
      if (tl.length > 0) {
        const last = tl[tl.length - 1];
        if (last.end === -1 || last.end === undefined || last.end === null) {
          last.end = currentTime;
          if (last.start >= last.end) {
            tl.pop();
          }
        }
      }
    }
  }

  private pushGanttBlock(
    gantt: GanttBlock[],
    processId: number | null,
    startTime: number,
    endTime: number,
    isIdle: boolean,
  ): void {
    if (startTime >= endTime) return;
    if (gantt.length > 0) {
      const last = gantt[gantt.length - 1];
      if (last.processId === processId && last.isIdle === isIdle) {
        last.endTime = endTime;
        return;
      }
    }
    gantt.push({ processId, startTime, endTime, isIdle });
  }

  private computeResults(
    processes: Process[],
    runtime: Map<number, ProcessRuntime>,
    timelines: Map<number, TimelineSegment[]>,
    totalTime: number,
    idleTime: number,
  ): SchedulingResult {
    const processResults: ProcessResult[] = [];
    let totalTT = 0;
    let totalWT = 0;
    let totalRT = 0;
    let completedCount = 0;

    for (const p of processes) {
      const rt = runtime.get(p.id)!;
      if (rt.completionTime === -1) continue;
      const tt = rt.completionTime - p.arrivalTime;
      const wt = tt - p.burstTime - p.ioBurstTime;
      const rTime = rt.firstResponseTime === -1 ? 0 : rt.firstResponseTime - p.arrivalTime;
      rt.turnaroundTime = tt;
      rt.waitingTime = Math.max(0, wt);
      rt.responseTime = rTime;
      totalTT += tt;
      totalWT += Math.max(0, wt);
      totalRT += rTime;
      completedCount++;

      processResults.push({
        processId: p.id,
        turnaroundTime: tt,
        waitingTime: Math.max(0, wt),
        responseTime: rTime,
        completionTime: rt.completionTime,
        startTime: rt.startTime,
        timeline: timelines.get(p.id) || [],
      });
    }

    const n = completedCount || 1;
    return {
      ganttChart: [],
      events: [],
      readyQueueHistory: [],
      processResults,
      avgTurnaroundTime: totalTT / n,
      avgWaitingTime: totalWT / n,
      avgResponseTime: totalRT / n,
      cpuUtilization: totalTime === 0 ? 0 : (totalTime - idleTime) / totalTime,
      throughput: totalTime === 0 ? 0 : completedCount / totalTime,
      totalTime,
    };
  }

  private allTerminated(states: Map<number, ProcessState>): boolean {
    for (const [, s] of states) {
      if (s !== 'TERMINATED') return false;
    }
    return true;
  }

  private handleArrivals(
    time: number,
    processes: Process[],
    states: Map<number, ProcessState>,
    runtime: Map<number, ProcessRuntime>,
    timelines: Map<number, TimelineSegment[]>,
    events: EventLog[],
    readyQueue: number[],
  ): void {
    for (const p of processes) {
      if (p.arrivalTime === time && states.get(p.id) === 'NEW') {
        states.set(p.id, 'READY');
        readyQueue.push(p.id);
        this.addEvent(events, time, `进程 P${p.id}(${p.name}) 到达，进入就绪队列`, 'info');
        const tl = timelines.get(p.id)!;
        tl.push({ start: time, end: time, type: 'arrival' });
        this.openTimelineSegment(tl, time, 'waiting');
      }
    }
  }

  private handleIoCompletion(
    time: number,
    processes: Process[],
    states: Map<number, ProcessState>,
    runtime: Map<number, ProcessRuntime>,
    timelines: Map<number, TimelineSegment[]>,
    events: EventLog[],
    waiting: { id: number; endTime: number; queueLevel: number }[],
    readyQueue: number[],
    queues?: number[][],
  ): void {
    for (let i = waiting.length - 1; i >= 0; i--) {
      const w = waiting[i];
      if (time >= w.endTime) {
        const rt = runtime.get(w.id)!;
        rt.inIo = false;
        rt.ioExecuted = 0;
        states.set(w.id, 'READY');
        if (queues) {
          rt.queueLevel = Math.min(w.queueLevel, queues.length - 1);
          queues[rt.queueLevel].push(w.id);
        } else {
          readyQueue.push(w.id);
        }
        this.addEvent(events, time, `进程 P${w.id} IO完成，重新进入就绪队列`, 'success');
        this.closeTimelineSegment(timelines.get(w.id)!, time, 'io');
        this.openTimelineSegment(timelines.get(w.id)!, time, 'waiting');
        waiting.splice(i, 1);
      }
    }
  }

  private simulateFCFS(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      this.handleArrivals(currentTime, processes, states, runtime, timelines, events, readyQueue);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;

        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: 0 });
          if (currentGanttPid !== null || !currentGanttIdle) {
            this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          }
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (currentProcessId === null && readyQueue.length > 0) {
        readyQueue.sort((a, b) => {
          const pa = processes.find(p => p.id === a)!;
          const pb = processes.find(p => p.id === b)!;
          if (pa.arrivalTime !== pb.arrivalTime) return pa.arrivalTime - pb.arrivalTime;
          return a - b;
        });
        const nextId = readyQueue.shift()!;
        currentProcessId = nextId;
        states.set(nextId, 'RUNNING');
        const rt = runtime.get(nextId)!;
        if (rt.startTime === -1) {
          rt.startTime = currentTime;
        }
        if (rt.firstResponseTime === -1) {
          rt.firstResponseTime = currentTime;
        }
        const proc = processes.find(p => p.id === nextId)!;
        this.addEvent(events, currentTime, `调度进程 P${nextId}(${proc.name}) 执行`, 'success');
        this.closeTimelineSegment(timelines.get(nextId)!, currentTime, 'waiting');
        this.openTimelineSegment(timelines.get(nextId)!, currentTime, 'execution');
        if (currentGanttPid !== nextId || currentGanttIdle) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = false;
          currentGanttPid = nextId;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          if (currentGanttPid !== currentProcessId || currentGanttIdle) {
            this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, currentGanttIdle);
          } else {
            this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          }
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, [readyQueue], currentProcessId);

      if (currentProcessId === null && readyQueue.length === 0 && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime && (currentGanttPid !== null || currentGanttIdle)) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }

  private simulateSJF(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      this.handleArrivals(currentTime, processes, states, runtime, timelines, events, readyQueue);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;
        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: 0 });
          if (currentGanttPid !== null || !currentGanttIdle) {
            this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          }
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (currentProcessId === null && readyQueue.length > 0) {
        this.sortByBurstSJF(readyQueue, processes, runtime);
        const nextId = readyQueue.shift()!;
        currentProcessId = nextId;
        states.set(nextId, 'RUNNING');
        const rt = runtime.get(nextId)!;
        if (rt.startTime === -1) rt.startTime = currentTime;
        if (rt.firstResponseTime === -1) rt.firstResponseTime = currentTime;
        const proc = processes.find(p => p.id === nextId)!;
        this.addEvent(events, currentTime, `调度进程 P${nextId}(${proc.name}) 执行 [burst=${proc.burstTime}]`, 'success');
        this.closeTimelineSegment(timelines.get(nextId)!, currentTime, 'waiting');
        this.openTimelineSegment(timelines.get(nextId)!, currentTime, 'execution');
        if (currentGanttPid !== nextId || currentGanttIdle) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = false;
          currentGanttPid = nextId;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, [readyQueue], currentProcessId);

      if (currentProcessId === null && readyQueue.length === 0 && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }

  private simulateSRTF(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      this.handleArrivals(currentTime, processes, states, runtime, timelines, events, readyQueue);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;
        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: 0 });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (readyQueue.length > 0 && currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        this.sortByRemainingSRTF(readyQueue, processes, runtime);
        const bestReady = readyQueue[0];
        const bestRt = runtime.get(bestReady)!.remainingTime;
        const curRt = runtime.get(currentProcessId)!.remainingTime;
        if (bestRt < curRt) {
          this.addEvent(events, currentTime, `抢占发生：P${bestReady}(剩余${bestRt}) 抢占 P${currentProcessId}(剩余${curRt})`, 'warning');
          states.set(currentProcessId, 'READY');
          readyQueue.push(currentProcessId);
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'waiting');
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, false);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (currentProcessId === null && readyQueue.length > 0) {
        this.sortByRemainingSRTF(readyQueue, processes, runtime);
        const nextId = readyQueue.shift()!;
        currentProcessId = nextId;
        states.set(nextId, 'RUNNING');
        const rt = runtime.get(nextId)!;
        if (rt.startTime === -1) rt.startTime = currentTime;
        if (rt.firstResponseTime === -1) rt.firstResponseTime = currentTime;
        const proc = processes.find(p => p.id === nextId)!;
        this.addEvent(events, currentTime, `调度进程 P${nextId}(${proc.name}) 执行 [剩余=${rt.remainingTime}]`, 'success');
        this.closeTimelineSegment(timelines.get(nextId)!, currentTime, 'waiting');
        this.openTimelineSegment(timelines.get(nextId)!, currentTime, 'execution');
        if (currentGanttPid !== nextId || currentGanttIdle) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = false;
          currentGanttPid = nextId;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, [readyQueue], currentProcessId);

      if (currentProcessId === null && readyQueue.length === 0 && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }

  private simulatePriority(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const preemptive = config.algorithm === AlgorithmType.PRIORITY_P;
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      this.handleArrivals(currentTime, processes, states, runtime, timelines, events, readyQueue);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;
        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: 0 });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (preemptive && readyQueue.length > 0 && currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        this.sortByPriority(readyQueue, processes, runtime);
        const bestReady = readyQueue[0];
        const bestProc = processes.find(p => p.id === bestReady)!;
        const curProc = processes.find(p => p.id === currentProcessId)!;
        if (bestProc.priority < curProc.priority) {
          this.addEvent(events, currentTime, `抢占发生：P${bestReady}(优先级${bestProc.priority}) 抢占 P${currentProcessId}(优先级${curProc.priority})`, 'warning');
          states.set(currentProcessId, 'READY');
          readyQueue.push(currentProcessId);
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'waiting');
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, false);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      }

      if (currentProcessId === null && readyQueue.length > 0) {
        this.sortByPriority(readyQueue, processes, runtime);
        const nextId = readyQueue.shift()!;
        currentProcessId = nextId;
        states.set(nextId, 'RUNNING');
        const rt = runtime.get(nextId)!;
        if (rt.startTime === -1) rt.startTime = currentTime;
        if (rt.firstResponseTime === -1) rt.firstResponseTime = currentTime;
        const proc = processes.find(p => p.id === nextId)!;
        this.addEvent(events, currentTime, `调度进程 P${nextId}(${proc.name}) 执行 [优先级=${proc.priority}]`, 'success');
        this.closeTimelineSegment(timelines.get(nextId)!, currentTime, 'waiting');
        this.openTimelineSegment(timelines.get(nextId)!, currentTime, 'execution');
        if (currentGanttPid !== nextId || currentGanttIdle) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = false;
          currentGanttPid = nextId;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, [readyQueue], currentProcessId);

      if (currentProcessId === null && readyQueue.length === 0 && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }

  private simulateRR(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const timeQuantum = config.timeQuantum ?? 4;
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let timeSliceUsed = 0;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      this.handleArrivals(currentTime, processes, states, runtime, timelines, events, readyQueue);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;
        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: 0 });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
          timeSliceUsed = 0;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING' && timeSliceUsed >= timeQuantum) {
        this.addEvent(events, currentTime, `进程 P${currentProcessId} 时间片用完（${timeQuantum}），重新进入就绪队列`, 'warning');
        states.set(currentProcessId, 'READY');
        readyQueue.push(currentProcessId);
        this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
        this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'waiting');
        this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, false);
        currentGanttStart = currentTime;
        currentGanttIdle = true;
        currentGanttPid = null;
        currentProcessId = null;
        timeSliceUsed = 0;
      }

      if (currentProcessId === null && readyQueue.length > 0) {
        const nextId = readyQueue.shift()!;
        currentProcessId = nextId;
        states.set(nextId, 'RUNNING');
        timeSliceUsed = 0;
        const rt = runtime.get(nextId)!;
        if (rt.startTime === -1) rt.startTime = currentTime;
        if (rt.firstResponseTime === -1) rt.firstResponseTime = currentTime;
        const proc = processes.find(p => p.id === nextId)!;
        this.addEvent(events, currentTime, `调度进程 P${nextId}(${proc.name}) 执行 [时间片=${timeQuantum}]`, 'success');
        this.closeTimelineSegment(timelines.get(nextId)!, currentTime, 'waiting');
        this.openTimelineSegment(timelines.get(nextId)!, currentTime, 'execution');
        if (currentGanttPid !== nextId || currentGanttIdle) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = false;
          currentGanttPid = nextId;
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;
        timeSliceUsed++;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
          timeSliceUsed = 0;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, [readyQueue], currentProcessId);

      if (currentProcessId === null && readyQueue.length === 0 && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }

  private simulateMLFQ(processes: Process[], config: SchedulingConfig): SchedulingResult {
    const quantums = [2, 4, 8];
    const runtime = this.initRuntime(processes);
    const states = this.initStates(processes);
    const timelines = this.initTimelines(processes);
    const events: EventLog[] = [];
    const gantt: GanttBlock[] = [];
    const history: ReadyQueueSnapshot[] = [];

    let currentTime = 0;
    let idleTime = 0;
    let currentProcessId: number | null = null;
    let currentQueueLevel = -1;
    let timeSliceUsed = 0;
    let currentGanttStart = 0;
    let currentGanttIdle = true;
    let currentGanttPid: number | null = null;
    const queues: number[][] = [[], [], []];
    const readyQueue: number[] = [];
    const waiting: { id: number; endTime: number; queueLevel: number }[] = [];
    const maxSteps = 100000;
    let steps = 0;

    const handleArrivalsMLFQ = (time: number) => {
      for (const p of processes) {
        if (p.arrivalTime === time && states.get(p.id) === 'NEW') {
          states.set(p.id, 'READY');
          runtime.get(p.id)!.queueLevel = 0;
          queues[0].push(p.id);
          this.addEvent(events, time, `进程 P${p.id}(${p.name}) 到达，进入 Q1 队列`, 'info');
          const tl = timelines.get(p.id)!;
          tl.push({ start: time, end: time, type: 'arrival' });
          this.openTimelineSegment(tl, time, 'waiting');
        }
      }
    };

    const pickNextMLFQ = (): { id: number; level: number } | null => {
      for (let i = 0; i < queues.length; i++) {
        if (queues[i].length > 0) {
          return { id: queues[i].shift()!, level: i };
        }
      }
      return null;
    };

    const snapshotQueues = (): number[][] => [
      [...queues[0]],
      [...queues[1]],
      [...queues[2]],
    ];

    while (steps++ < maxSteps && !this.allTerminated(states)) {
      handleArrivalsMLFQ(currentTime);
      this.handleIoCompletion(currentTime, processes, states, runtime, timelines, events, waiting, readyQueue, queues);

      if (currentProcessId !== null) {
        const curProc = processes.find(p => p.id === currentProcessId)!;
        const curRt = runtime.get(currentProcessId)!;
        if (
          !curRt.inIo &&
          curProc.ioBurstTime > 0 &&
          curProc.ioStartTime >= 0 &&
          curRt.executedTime === curProc.ioStartTime &&
          curRt.ioExecuted < curProc.ioBurstTime
        ) {
          curRt.inIo = true;
          states.set(currentProcessId, 'WAITING');
          this.addEvent(events, currentTime, `进程 P${currentProcessId} 开始IO（${curProc.ioBurstTime}个时间单位）`, 'warning');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
          this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'io');
          waiting.push({ id: currentProcessId, endTime: currentTime + curProc.ioBurstTime, queueLevel: currentQueueLevel });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
          currentGanttStart = currentTime;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
          currentQueueLevel = -1;
          timeSliceUsed = 0;
        }
      }

      let higherReady = false;
      if (currentProcessId !== null && currentQueueLevel > 0) {
        for (let i = 0; i < currentQueueLevel; i++) {
          if (queues[i].length > 0) {
            higherReady = true;
            break;
          }
        }
      }
      if (higherReady && currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        this.addEvent(events, currentTime, `MLFQ抢占：高优先级队列有进程，P${currentProcessId} 回到 Q${currentQueueLevel + 1}`, 'warning');
        states.set(currentProcessId, 'READY');
        queues[currentQueueLevel].push(currentProcessId);
        this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
        this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'waiting');
        this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, false);
        currentGanttStart = currentTime;
        currentGanttIdle = true;
        currentGanttPid = null;
        currentProcessId = null;
        currentQueueLevel = -1;
        timeSliceUsed = 0;
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING' && timeSliceUsed >= quantums[currentQueueLevel]) {
        const nextLevel = Math.min(currentQueueLevel + 1, queues.length - 1);
        if (nextLevel > currentQueueLevel) {
          this.addEvent(events, currentTime, `MLFQ降级：P${currentProcessId} 从 Q${currentQueueLevel + 1} 降级到 Q${nextLevel + 1}`, 'warning');
        } else {
          this.addEvent(events, currentTime, `MLFQ：P${currentProcessId} 时间片用完，留在 Q${nextLevel + 1}`, 'warning');
        }
        states.set(currentProcessId, 'READY');
        runtime.get(currentProcessId)!.queueLevel = nextLevel;
        queues[nextLevel].push(currentProcessId);
        this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'execution');
        this.openTimelineSegment(timelines.get(currentProcessId)!, currentTime, 'waiting');
        this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, false);
        currentGanttStart = currentTime;
        currentGanttIdle = true;
        currentGanttPid = null;
        currentProcessId = null;
        currentQueueLevel = -1;
        timeSliceUsed = 0;
      }

      if (currentProcessId === null) {
        const next = pickNextMLFQ();
        if (next !== null) {
          currentProcessId = next.id;
          currentQueueLevel = next.level;
          timeSliceUsed = 0;
          states.set(next.id, 'RUNNING');
          const rt = runtime.get(next.id)!;
          if (rt.startTime === -1) rt.startTime = currentTime;
          if (rt.firstResponseTime === -1) rt.firstResponseTime = currentTime;
          rt.queueLevel = next.level;
          const proc = processes.find(p => p.id === next.id)!;
          this.addEvent(events, currentTime, `MLFQ调度：P${next.id}(${proc.name}) 从 Q${next.level + 1} 执行 [时间片=${quantums[next.level]}]`, 'success');
          this.closeTimelineSegment(timelines.get(next.id)!, currentTime, 'waiting');
          this.openTimelineSegment(timelines.get(next.id)!, currentTime, 'execution');
          if (currentGanttPid !== next.id || currentGanttIdle) {
            this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
            currentGanttStart = currentTime;
            currentGanttIdle = false;
            currentGanttPid = next.id;
          }
        }
      }

      if (currentProcessId !== null && states.get(currentProcessId) === 'RUNNING') {
        const curRt = runtime.get(currentProcessId)!;
        curRt.executedTime++;
        curRt.remainingTime--;
        timeSliceUsed++;

        if (curRt.remainingTime <= 0) {
          curRt.completionTime = currentTime + 1;
          states.set(currentProcessId, 'TERMINATED');
          const proc = processes.find(p => p.id === currentProcessId)!;
          this.addEvent(events, currentTime + 1, `进程 P${currentProcessId}(${proc.name}) 执行完成`, 'success');
          this.closeTimelineSegment(timelines.get(currentProcessId)!, currentTime + 1, 'execution');
          const tl = timelines.get(currentProcessId)!;
          tl.push({ start: currentTime + 1, end: currentTime + 1, type: 'completion' });
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, false);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
          currentProcessId = null;
          currentQueueLevel = -1;
          timeSliceUsed = 0;
        }
      } else if (currentProcessId === null) {
        idleTime++;
        if (!currentGanttIdle || currentGanttPid !== null) {
          this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime + 1, true);
          currentGanttStart = currentTime + 1;
          currentGanttIdle = true;
          currentGanttPid = null;
        }
      }

      this.takeSnapshot(history, currentTime, snapshotQueues(), currentProcessId);

      if (currentProcessId === null && queues.every(q => q.length === 0) && waiting.length === 0) {
        let hasMore = false;
        for (const p of processes) {
          if (states.get(p.id) !== 'TERMINATED' && p.arrivalTime > currentTime) {
            hasMore = true;
            break;
          }
        }
        if (!hasMore) break;
      }

      currentTime++;
    }

    if (currentGanttStart < currentTime) {
      this.pushGanttBlock(gantt, currentGanttPid, currentGanttStart, currentTime, currentGanttIdle);
    }
    this.finalizeAllTimelines(timelines, currentTime);

    const result = this.computeResults(processes, runtime, timelines, currentTime, idleTime);
    result.ganttChart = gantt;
    result.events = events;
    result.readyQueueHistory = history;
    return result;
  }
}
