import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReadyQueueSnapshot, EventLog } from '../../models/scheduling.model';
import { Process } from '../../models/process.model';

type EventDisplayType = 'info' | 'arrival' | 'departure' | 'switch' | 'io' | 'preempt';

@Component({
  selector: 'app-ready-queue',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ready-queue.component.html',
  styleUrls: ['./ready-queue.component.scss']
})
export class ReadyQueueComponent implements OnChanges, AfterViewChecked {
  @Input() snapshot: ReadyQueueSnapshot | null = null;
  @Input() processes: Process[] = [];
  @Input() events: EventLog[] = [];
  @Input() currentTime: number = 0;
  @Input() isMlfq: boolean = false;
  @Input() animationMode: boolean = false;

  @ViewChild('eventsContainer') private eventsContainer!: ElementRef;

  private shouldScroll: boolean = false;

  readonly mlfqQuantums = [2, 4, 8];
  readonly mlfqBorderColors = ['#22c55e', '#eab308', '#ef4444'];
  readonly mlfqBgColors = ['rgba(34, 197, 94, 0.08)', 'rgba(234, 179, 8, 0.08)', 'rgba(239, 68, 68, 0.08)'];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['events']) {
      this.shouldScroll = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.eventsContainer) {
      this.eventsContainer.nativeElement.scrollTop = this.eventsContainer.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  getProcessColor(processId: number): string {
    const process = this.processes.find(p => p.id === processId);
    return process?.color || '#6c757d';
  }

  getProcessName(processId: number): string {
    const process = this.processes.find(p => p.id === processId);
    return process ? `P${processId}(${process.name})` : `P${processId}`;
  }

  getCurrentProcessId(): number | null {
    return this.snapshot?.currentProcessId ?? null;
  }

  getReadyQueue(): number[] {
    if (!this.snapshot || !this.snapshot.queues || this.snapshot.queues.length === 0) {
      return [];
    }
    return this.snapshot.queues[0] || [];
  }

  getMlfqQueue(index: number): number[] {
    if (!this.snapshot || !this.snapshot.queues) {
      return [];
    }
    return this.snapshot.queues[index] || [];
  }

  getEventType(event: EventLog): EventDisplayType {
    const msg = event.message;
    if (msg.includes('到达') || msg.includes('进入就绪队列')) {
      return 'arrival';
    }
    if (msg.includes('执行完成') || msg.includes('完成')) {
      return 'departure';
    }
    if (msg.includes('调度') || msg.includes('时间片用完')) {
      return 'switch';
    }
    if (msg.includes('IO') || msg.includes('开始IO') || msg.includes('IO完成')) {
      return 'io';
    }
    if (msg.includes('抢占')) {
      return 'preempt';
    }
    return 'info';
  }

  getEventsUpToCurrentTime(): EventLog[] {
    return this.events.filter(e => e.time <= this.currentTime);
  }

  isLatestEvent(index: number): boolean {
    const filtered = this.getEventsUpToCurrentTime();
    return index === filtered.length - 1;
  }
}
