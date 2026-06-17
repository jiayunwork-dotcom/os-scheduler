import { Injectable } from '@angular/core';
import {
  ResourceType,
  ProcessResourceInfo,
  BankerResult,
  BankerStep,
  ResourceRequestResult,
  DeadlockDetectionResult,
  GraphEdge,
} from '../models/deadlock.model';

@Injectable({ providedIn: 'root' })
export class DeadlockService {
  private resourceCounter = 0;

  generateResourceId(): number {
    return ++this.resourceCounter;
  }

  getAvailable(resources: ResourceType[], processes: ProcessResourceInfo[]): number[] {
    const available: number[] = resources.map((r, i) => {
      let allocated = 0;
      for (const p of processes) {
        allocated += p.allocation[i] || 0;
      }
      return r.totalCount - allocated;
    });
    return available;
  }

  getNeed(processes: ProcessResourceInfo[]): number[][] {
    return processes.map((p) =>
      p.max.map((m, i) => m - (p.allocation[i] || 0))
    );
  }

  runBankerAlgorithm(
    resources: ResourceType[],
    processes: ProcessResourceInfo[]
  ): BankerResult {
    const n = processes.length;
    const m = resources.length;

    const available = this.getAvailable(resources, processes);
    const need = this.getNeed(processes);
    const work = [...available];
    const finish: boolean[] = new Array(n).fill(false);
    const safeSequence: number[] = [];
    const steps: BankerStep[] = [];

    steps.push({
      step: 0,
      available: [...available],
      work: [...work],
      need: need.map((row) => [...row]),
      currentProcessId: null,
      canAllocate: false,
      finished: [...finish],
      safeSequence: [...safeSequence],
      message: '初始化：Work = Available，Finish数组全为false',
    });

    let count = 0;
    while (count < n) {
      let found = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i]) {
          let canAllocate = true;
          for (let j = 0; j < m; j++) {
            if (need[i][j] > work[j]) {
              canAllocate = false;
              break;
            }
          }

          if (canAllocate) {
            for (let j = 0; j < m; j++) {
              work[j] += processes[i].allocation[j] || 0;
            }
            finish[i] = true;
            safeSequence.push(processes[i].processId);
            found = true;
            count++;

            steps.push({
              step: steps.length,
              available: [...available],
              work: [...work],
              need: need.map((row) => [...row]),
              currentProcessId: processes[i].processId,
              canAllocate: true,
              finished: [...finish],
              safeSequence: [...safeSequence],
              message: `进程 P${processes[i].processId} 的需求可被满足，执行后释放资源，Work更新为 [${work.join(', ')}]`,
            });
            break;
          }
        }
      }
      if (!found) {
        steps.push({
          step: steps.length,
          available: [...available],
          work: [...work],
          need: need.map((row) => [...row]),
          currentProcessId: null,
          canAllocate: false,
          finished: [...finish],
          safeSequence: [...safeSequence],
          message: '找不到可满足的进程，系统处于不安全状态',
        });
        break;
      }
    }

    const isSafe = finish.every((f) => f);
    if (isSafe) {
      steps.push({
        step: steps.length,
        available: [...available],
        work: [...work],
        need: need.map((row) => [...row]),
        currentProcessId: null,
        canAllocate: false,
        finished: [...finish],
        safeSequence: [...safeSequence],
        message: `所有进程都能完成，安全序列为: ${safeSequence.map((id) => 'P' + id).join(' → ')}`,
      });
    }

    return {
      isSafe,
      safeSequence,
      steps,
      available,
      need,
    };
  }

  checkResourceRequest(
    resources: ResourceType[],
    processes: ProcessResourceInfo[],
    processId: number,
    request: number[]
  ): ResourceRequestResult {
    const processIdx = processes.findIndex((p) => p.processId === processId);
    if (processIdx === -1) {
      return { success: false, message: '进程不存在' };
    }

    const process = processes[processIdx];
    const need = process.max.map((m, i) => m - (process.allocation[i] || 0));

    for (let i = 0; i < request.length; i++) {
      if (request[i] > need[i]) {
        return {
          success: false,
          failedCheck: 'need',
          message: `请求资源${i + 1}的数量(${request[i]})超过进程最大需求剩余量(${need[i]})`,
        };
      }
    }

    const available = this.getAvailable(resources, processes);
    for (let i = 0; i < request.length; i++) {
      if (request[i] > available[i]) {
        return {
          success: false,
          failedCheck: 'available',
          message: `请求资源${i + 1}的数量(${request[i]})超过当前可用数量(${available[i]})`,
        };
      }
    }

    const newProcesses = processes.map((p, idx) => {
      if (idx === processIdx) {
        return {
          ...p,
          allocation: p.allocation.map((a, i) => a + request[i]),
        };
      }
      return { ...p, allocation: [...p.allocation] };
    });

    const result = this.runBankerAlgorithm(resources, newProcesses);
    if (!result.isSafe) {
      return {
        success: false,
        failedCheck: 'safety',
        message: '试分配后系统处于不安全状态，请求被拒绝',
      };
    }

    return {
      success: true,
      message: '请求成功，资源已分配',
      newAllocation: newProcesses[processIdx].allocation,
      newAvailable: result.available,
    };
  }

  detectDeadlock(
    resources: ResourceType[],
    processes: ProcessResourceInfo[]
  ): DeadlockDetectionResult {
    const edges: GraphEdge[] = [];
    const processNodes = processes.map((p) => ({
      id: p.processId,
      label: `P${p.processId}`,
      isDeadlocked: false,
    }));
    const resourceNodes = resources.map((r, i) => ({
      id: r.id,
      label: r.name,
      isInCycle: false,
    }));

    for (let i = 0; i < processes.length; i++) {
      const p = processes[i];
      for (let j = 0; j < resources.length; j++) {
        if (p.allocation[j] > 0) {
          edges.push({
            from: `R${resources[j].id}`,
            to: `P${p.processId}`,
            type: 'allocation',
            isCycle: false,
          });
        }
      }
    }

    const need = this.getNeed(processes);
    const available = this.getAvailable(resources, processes);
    for (let i = 0; i < processes.length; i++) {
      const p = processes[i];
      for (let j = 0; j < resources.length; j++) {
        if (need[i][j] > 0) {
          edges.push({
            from: `P${p.processId}`,
            to: `R${resources[j].id}`,
            type: 'request',
            isCycle: false,
          });
        }
      }
    }

    const adjacencyMap = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacencyMap.has(edge.from)) {
        adjacencyMap.set(edge.from, []);
      }
      adjacencyMap.get(edge.from)!.push(edge.to);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycleEdges: string[] = [];
    const cycleNodes: string[] = [];
    let foundCycle = false;

    const dfs = (node: string, path: string[]): boolean => {
      if (foundCycle) return false;
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adjacencyMap.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          foundCycle = true;
          const cycleStartIdx = path.indexOf(neighbor);
          const cyclePath = path.slice(cycleStartIdx);
          cyclePath.push(neighbor);
          for (let i = 0; i < cyclePath.length - 1; i++) {
            cycleEdges.push(`${cyclePath[i]}->${cyclePath[i + 1]}`);
          }
          cycleNodes.push(...cyclePath.slice(0, -1));
          return true;
        }
      }

      path.pop();
      recStack.delete(node);
      return false;
    };

    for (const p of processes) {
      const nodeKey = `P${p.processId}`;
      if (!visited.has(nodeKey)) {
        dfs(nodeKey, []);
        if (foundCycle) break;
      }
    }

    const deadlockedProcessIds: number[] = [];
    const cycleResourceIds: number[] = [];

    if (foundCycle) {
      for (const node of cycleNodes) {
        if (node.startsWith('P')) {
          const pid = parseInt(node.substring(1), 10);
          deadlockedProcessIds.push(pid);
          const pNode = processNodes.find((n) => n.id === pid);
          if (pNode) pNode.isDeadlocked = true;
        } else if (node.startsWith('R')) {
          const rid = parseInt(node.substring(1), 10);
          cycleResourceIds.push(rid);
          const rNode = resourceNodes.find((n) => n.id === rid);
          if (rNode) rNode.isInCycle = true;
        }
      }

      for (const edge of edges) {
        const edgeKey = `${edge.from}->${edge.to}`;
        if (cycleEdges.includes(edgeKey)) {
          edge.isCycle = true;
        }
      }
    }

    return {
      hasDeadlock: foundCycle,
      deadlockedProcesses: deadlockedProcessIds,
      cycleEdges,
      edges,
      processNodes,
      resourceNodes,
    };
  }

  validateAllocation(
    allocation: number[],
    max: number[],
    resources: ResourceType[]
  ): { valid: boolean; message?: string } {
    for (let i = 0; i < allocation.length; i++) {
      if (allocation[i] < 0) {
        return { valid: false, message: `资源${i + 1}的已分配数量不能为负数` };
      }
      if (max[i] < 0) {
        return { valid: false, message: `资源${i + 1}的最大需求不能为负数` };
      }
      if (allocation[i] > max[i]) {
        return {
          valid: false,
          message: `资源${i + 1}的已分配数量(${allocation[i]})不能超过最大需求(${max[i]})`,
        };
      }
      if (resources[i] && max[i] > resources[i].totalCount) {
        return {
          valid: false,
          message: `资源${i + 1}的最大需求(${max[i]})不能超过资源总数(${resources[i].totalCount})`,
        };
      }
    }
    return { valid: true };
  }
}
