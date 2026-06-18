import { Injectable } from '@angular/core';
import {
  DiskConfig,
  DiskScheduleResult,
  DiskScheduleStep,
  HeadDirection,
  DiskAlgorithmType,
} from '../models/disk.model';

@Injectable({
  providedIn: 'root',
})
export class DiskService {
  schedule(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const reqs = [...requests];
    switch (config.algorithm) {
      case 'FCFS':
        return this.fcfs(config, reqs);
      case 'SSTF':
        return this.sstf(config, reqs);
      case 'SCAN':
        return this.scan(config, reqs);
      case 'C-SCAN':
        return this.cscan(config, reqs);
      case 'LOOK':
        return this.look(config, reqs);
      default:
        return this.fcfs(config, reqs);
    }
  }

  private fcfs(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const steps: DiskScheduleStep[] = [];
    const path: number[] = [config.initialPosition];
    let currentPos = config.initialPosition;
    let totalDistance = 0;

    for (let i = 0; i < requests.length; i++) {
      const nextTrack = requests[i];
      const distance = Math.abs(nextTrack - currentPos);
      const direction: HeadDirection = nextTrack >= currentPos ? 'outward' : 'inward';

      steps.push({
        step: i + 1,
        currentPosition: currentPos,
        nextTrack: nextTrack,
        moveDistance: distance,
        direction: direction,
      });

      totalDistance += distance;
      currentPos = nextTrack;
      path.push(nextTrack);
    }

    return {
      algorithm: 'FCFS',
      totalTracks: config.totalTracks,
      initialPosition: config.initialPosition,
      requests: [...requests],
      steps,
      totalMoveDistance: totalDistance,
      averageSeekLength: requests.length > 0 ? totalDistance / requests.length : 0,
      path,
    };
  }

  private sstf(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const steps: DiskScheduleStep[] = [];
    const path: number[] = [config.initialPosition];
    let currentPos = config.initialPosition;
    let totalDistance = 0;
    const remaining = [...requests];
    let stepCount = 0;

    while (remaining.length > 0) {
      let minDist = Infinity;
      let minIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const dist = Math.abs(remaining[i] - currentPos);
        if (dist < minDist || (dist === minDist && remaining[i] < remaining[minIndex])) {
          minDist = dist;
          minIndex = i;
        }
      }

      const nextTrack = remaining[minIndex];
      const direction: HeadDirection = nextTrack >= currentPos ? 'outward' : 'inward';

      stepCount++;
      steps.push({
        step: stepCount,
        currentPosition: currentPos,
        nextTrack: nextTrack,
        moveDistance: minDist,
        direction: direction,
      });

      totalDistance += minDist;
      currentPos = nextTrack;
      path.push(nextTrack);
      remaining.splice(minIndex, 1);
    }

    return {
      algorithm: 'SSTF',
      totalTracks: config.totalTracks,
      initialPosition: config.initialPosition,
      requests: [...requests],
      steps,
      totalMoveDistance: totalDistance,
      averageSeekLength: requests.length > 0 ? totalDistance / requests.length : 0,
      path,
    };
  }

  private scan(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const steps: DiskScheduleStep[] = [];
    const path: number[] = [config.initialPosition];
    let currentPos = config.initialPosition;
    let totalDistance = 0;
    let stepCount = 0;
    let direction = config.direction;

    const sorted = [...requests].sort((a, b) => a - b);
    const remaining = [...sorted];

    const maxTrack = config.totalTracks - 1;
    const minTrack = 0;

    while (remaining.length > 0) {
      if (direction === 'outward') {
        const candidates = remaining.filter((r) => r >= currentPos).sort((a, b) => a - b);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'outward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          const boundaryDist = maxTrack - currentPos;
          if (boundaryDist > 0) {
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: maxTrack,
              moveDistance: boundaryDist,
              direction: 'outward',
            });
            totalDistance += boundaryDist;
            currentPos = maxTrack;
            path.push(maxTrack);
          }
          direction = 'inward';
        }
      } else {
        const candidates = remaining.filter((r) => r <= currentPos).sort((a, b) => b - a);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'inward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          const boundaryDist = currentPos - minTrack;
          if (boundaryDist > 0) {
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: minTrack,
              moveDistance: boundaryDist,
              direction: 'inward',
            });
            totalDistance += boundaryDist;
            currentPos = minTrack;
            path.push(minTrack);
          }
          direction = 'outward';
        }
      }
    }

    return {
      algorithm: 'SCAN',
      totalTracks: config.totalTracks,
      initialPosition: config.initialPosition,
      requests: [...requests],
      steps,
      totalMoveDistance: totalDistance,
      averageSeekLength: requests.length > 0 ? totalDistance / requests.length : 0,
      path,
    };
  }

  private cscan(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const steps: DiskScheduleStep[] = [];
    const path: number[] = [config.initialPosition];
    let currentPos = config.initialPosition;
    let totalDistance = 0;
    let stepCount = 0;
    let direction = config.direction;

    const sorted = [...requests].sort((a, b) => a - b);
    const remaining = [...sorted];

    const maxTrack = config.totalTracks - 1;
    const minTrack = 0;

    while (remaining.length > 0) {
      if (direction === 'outward') {
        const candidates = remaining.filter((r) => r >= currentPos).sort((a, b) => a - b);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'outward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          const boundaryDist = maxTrack - currentPos;
          if (boundaryDist > 0) {
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: maxTrack,
              moveDistance: boundaryDist,
              direction: 'outward',
            });
            totalDistance += boundaryDist;
            currentPos = maxTrack;
            path.push(maxTrack);
          }

          currentPos = minTrack;
          path.push(minTrack);
        }
      } else {
        const candidates = remaining.filter((r) => r <= currentPos).sort((a, b) => b - a);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'inward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          const boundaryDist = currentPos - minTrack;
          if (boundaryDist > 0) {
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: minTrack,
              moveDistance: boundaryDist,
              direction: 'inward',
            });
            totalDistance += boundaryDist;
            currentPos = minTrack;
            path.push(minTrack);
          }

          currentPos = maxTrack;
          path.push(maxTrack);
        }
      }
    }

    return {
      algorithm: 'C-SCAN',
      totalTracks: config.totalTracks,
      initialPosition: config.initialPosition,
      requests: [...requests],
      steps,
      totalMoveDistance: totalDistance,
      averageSeekLength: requests.length > 0 ? totalDistance / requests.length : 0,
      path,
    };
  }

  private look(config: DiskConfig, requests: number[]): DiskScheduleResult {
    const steps: DiskScheduleStep[] = [];
    const path: number[] = [config.initialPosition];
    let currentPos = config.initialPosition;
    let totalDistance = 0;
    let stepCount = 0;
    let direction = config.direction;

    const sorted = [...requests].sort((a, b) => a - b);
    const remaining = [...sorted];

    while (remaining.length > 0) {
      if (direction === 'outward') {
        const candidates = remaining.filter((r) => r >= currentPos).sort((a, b) => a - b);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'outward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          direction = 'inward';
        }
      } else {
        const candidates = remaining.filter((r) => r <= currentPos).sort((a, b) => b - a);
        if (candidates.length > 0) {
          for (const track of candidates) {
            const distance = Math.abs(track - currentPos);
            stepCount++;
            steps.push({
              step: stepCount,
              currentPosition: currentPos,
              nextTrack: track,
              moveDistance: distance,
              direction: 'inward',
            });
            totalDistance += distance;
            currentPos = track;
            path.push(track);
            const idx = remaining.indexOf(track);
            if (idx !== -1) remaining.splice(idx, 1);
          }
        }

        if (remaining.length > 0) {
          direction = 'outward';
        }
      }
    }

    return {
      algorithm: 'LOOK',
      totalTracks: config.totalTracks,
      initialPosition: config.initialPosition,
      requests: [...requests],
      steps,
      totalMoveDistance: totalDistance,
      averageSeekLength: requests.length > 0 ? totalDistance / requests.length : 0,
      path,
    };
  }

  generateRandomRequests(totalTracks: number, count: number): number[] {
    const result: number[] = [];
    const minCount = 8;
    const maxCount = 15;
    const n = Math.min(Math.max(count, minCount), maxCount);

    while (result.length < n) {
      const track = Math.floor(Math.random() * totalTracks);
      if (!result.includes(track)) {
        result.push(track);
      }
    }

    return result;
  }

  compareAlgorithms(
    totalTracks: number,
    initialPosition: number,
    direction: HeadDirection,
    requests: number[]
  ): { name: string; result: DiskScheduleResult }[] {
    const algorithms: DiskAlgorithmType[] = ['FCFS', 'SSTF', 'SCAN', 'C-SCAN', 'LOOK'];
    return algorithms.map((algo) => ({
      name: algo,
      result: this.schedule(
        {
          totalTracks,
          initialPosition,
          direction,
          algorithm: algo,
        },
        requests
      ),
    }));
  }
}
