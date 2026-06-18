import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DiskConfig,
  DiskScheduleResult,
  DiskAlgorithmType,
  HeadDirection,
  DiskCompareResult,
} from '../../models/disk.model';
import { DiskService } from '../../services/disk.service';

@Component({
  selector: 'app-disk-scheduler',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './disk-scheduler.component.html',
  styleUrls: ['./disk-scheduler.component.scss'],
})
export class DiskSchedulerComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() processCount = 0;

  @ViewChild('trackCanvas') trackCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('compareCanvas') compareCanvas!: ElementRef<HTMLCanvasElement>;

  isExpanded = true;

  totalTracksOptions = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
  totalTracks = 200;
  initialPosition = 100;
  direction: HeadDirection = 'inward';
  algorithm: DiskAlgorithmType = 'FCFS';

  requestInput = '';
  requests: number[] = [];

  compareMode = false;

  scheduleResult: DiskScheduleResult | null = null;
  compareResults: DiskCompareResult[] | null = null;

  warningMessage = '';

  canvasWidth = 900;
  canvasHeight = 400;
  paddingLeft = 60;
  paddingRight = 40;
  paddingTop = 30;
  paddingBottom = 40;

  compareCanvasWidth = 700;
  compareCanvasHeight = 300;

  readonly algorithmNames: Record<DiskAlgorithmType, string> = {
    FCFS: 'FCFS (先来先服务)',
    SSTF: 'SSTF (最短寻道时间优先)',
    SCAN: 'SCAN (电梯算法)',
    'C-SCAN': 'C-SCAN (循环扫描)',
    LOOK: 'LOOK (改进电梯)',
  };

  readonly algorithmColors: Record<string, string> = {
    FCFS: '#ef4444',
    SSTF: '#3b82f6',
    SCAN: '#10b981',
    'C-SCAN': '#f59e0b',
    LOOK: '#8b5cf6',
  };

  constructor(private diskService: DiskService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['processCount']) {
      if (changes['processCount'].currentValue === 0) {
        this.requests = [];
        this.requestInput = '';
        this.scheduleResult = null;
        this.compareResults = null;
        this.warningMessage = '请先添加进程后再配置磁盘请求';
      } else {
        this.warningMessage = '';
      }
    }
  }

  ngAfterViewInit(): void {
    this.drawEmptyCanvas();
    this.drawEmptyCompareCanvas();
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      setTimeout(() => {
        if (this.scheduleResult) {
          this.drawTrackChart();
        } else {
          this.drawEmptyCanvas();
        }
        if (this.compareResults) {
          this.drawCompareChart();
        } else {
          this.drawEmptyCompareCanvas();
        }
      }, 0);
    }
  }

  onTotalTracksChange(): void {
    if (this.initialPosition >= this.totalTracks) {
      this.initialPosition = this.totalTracks - 1;
    }
    this.resetResults();
  }

  onInitialPositionChange(): void {
    this.initialPosition = Math.max(0, Math.min(this.totalTracks - 1, Math.floor(this.initialPosition)));
    this.resetResults();
  }

  addRequests(): void {
    if (this.processCount === 0) {
      this.warningMessage = '请先添加进程后再配置磁盘请求';
      return;
    }

    const parts = this.requestInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n >= 0 && n < this.totalTracks);

    for (const n of parts) {
      if (!this.requests.includes(n)) {
        this.requests.push(n);
      }
    }

    this.requestInput = '';
    this.resetResults();
  }

  removeRequest(index: number): void {
    this.requests.splice(index, 1);
    this.resetResults();
  }

  clearRequests(): void {
    this.requests = [];
    this.resetResults();
  }

  generateRandomRequests(): void {
    if (this.processCount === 0) {
      this.warningMessage = '请先添加进程后再配置磁盘请求';
      return;
    }

    const count = Math.floor(Math.random() * 8) + 8;
    this.requests = this.diskService.generateRandomRequests(this.totalTracks, count);
    this.resetResults();
  }

  runSchedule(): void {
    if (this.requests.length === 0) {
      alert('请先添加磁道请求');
      return;
    }

    const config: DiskConfig = {
      totalTracks: this.totalTracks,
      initialPosition: this.initialPosition,
      direction: this.direction,
      algorithm: this.algorithm,
    };

    this.scheduleResult = this.diskService.schedule(config, this.requests);
    this.compareResults = null;

    setTimeout(() => {
      this.drawTrackChart();
    }, 0);
  }

  runCompare(): void {
    if (this.requests.length === 0) {
      alert('请先添加磁道请求');
      return;
    }

    this.compareResults = this.diskService.compareAlgorithms(
      this.totalTracks,
      this.initialPosition,
      this.direction,
      this.requests
    );
    this.scheduleResult = null;

    setTimeout(() => {
      this.drawCompareChart();
    }, 0);
  }

  private resetResults(): void {
    this.scheduleResult = null;
    this.compareResults = null;
  }

  private drawEmptyCanvas(): void {
    if (!this.trackCanvas?.nativeElement) return;
    const ctx = this.trackCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawTrackAxes(ctx);
  }

  private drawEmptyCompareCanvas(): void {
    if (!this.compareCanvas?.nativeElement) return;
    const ctx = this.compareCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.compareCanvasWidth, this.compareCanvasHeight);
  }

  private drawTrackChart(): void {
    if (!this.trackCanvas?.nativeElement || !this.scheduleResult) return;
    const ctx = this.trackCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const path = this.scheduleResult.path;
    if (path.length === 0) return;

    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const chartWidth = this.canvasWidth - this.paddingLeft - this.paddingRight;
    const chartHeight = this.canvasHeight - this.paddingTop - this.paddingBottom;
    const maxTrack = this.totalTracks - 1;
    const maxStep = path.length - 1;

    this.drawTrackAxes(ctx);

    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < path.length; i++) {
      const x = this.paddingLeft + (path[i] / maxTrack) * chartWidth;
      const y = this.paddingTop + (i / Math.max(1, maxStep)) * chartHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    for (let i = 0; i < path.length; i++) {
      const x = this.paddingLeft + (path[i] / maxTrack) * chartWidth;
      const y = this.paddingTop + (i / Math.max(1, maxStep)) * chartHeight;

      ctx.fillStyle = i === 0 ? '#10b981' : '#667eea';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#374151';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const labelY = i === 0 ? y - 12 : y + 16;
      ctx.fillText(String(path[i]), x, labelY);

      if (i < path.length - 1) {
        const nextX = this.paddingLeft + (path[i + 1] / maxTrack) * chartWidth;
        const nextY = this.paddingTop + ((i + 1) / Math.max(1, maxStep)) * chartHeight;
        this.drawArrow(ctx, x, y, nextX, nextY);
      }
    }
  }

  private drawTrackAxes(ctx: CanvasRenderingContext2D): void {
    const chartWidth = this.canvasWidth - this.paddingLeft - this.paddingRight;
    const chartHeight = this.canvasHeight - this.paddingTop - this.paddingBottom;

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.paddingLeft, this.paddingTop);
    ctx.lineTo(this.paddingLeft, this.paddingTop + chartHeight);
    ctx.lineTo(this.paddingLeft + chartWidth, this.paddingTop + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';

    const trackStep = Math.ceil(this.totalTracks / 10);
    for (let t = 0; t < this.totalTracks; t += trackStep) {
      const x = this.paddingLeft + (t / (this.totalTracks - 1)) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, this.paddingTop + chartHeight);
      ctx.lineTo(x, this.paddingTop + chartHeight + 5);
      ctx.stroke();
      ctx.fillText(String(t), x, this.paddingTop + chartHeight + 20);
    }

    ctx.fillStyle = '#374151';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('磁道号', this.paddingLeft + chartWidth / 2, this.canvasHeight - 5);

    ctx.save();
    ctx.translate(15, this.paddingTop + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('时间步', 0, 0);
    ctx.restore();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = 6;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    ctx.fillStyle = '#667eea';
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(
      midX - headLength * Math.cos(angle - Math.PI / 6),
      midY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      midX - headLength * Math.cos(angle + Math.PI / 6),
      midY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  private drawCompareChart(): void {
    if (!this.compareCanvas?.nativeElement || !this.compareResults) return;
    const ctx = this.compareCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.compareCanvasWidth, this.compareCanvasHeight);

    const results = [...this.compareResults].sort(
      (a, b) => a.result.totalMoveDistance - b.result.totalMoveDistance
    );

    const maxDistance = Math.max(...results.map((r) => r.result.totalMoveDistance));
    const barCount = results.length;
    const chartWidth = this.compareCanvasWidth - this.paddingLeft - this.paddingRight;
    const chartHeight = this.compareCanvasHeight - this.paddingTop - this.paddingBottom;
    const barWidth = Math.min(80, (chartWidth - (barCount - 1) * 20) / barCount);
    const gap = barCount > 1 ? (chartWidth - barWidth * barCount) / (barCount - 1) : 0;

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.paddingLeft, this.paddingTop + chartHeight);
    ctx.lineTo(this.paddingLeft + chartWidth, this.paddingTop + chartHeight);
    ctx.stroke();

    for (let i = 0; i < 5; i++) {
      const y = this.paddingTop + (i / 4) * chartHeight;
      const value = Math.round(maxDistance - (i / 4) * maxDistance);
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(this.paddingLeft, y);
      ctx.lineTo(this.paddingLeft + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#6b7280';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(value), this.paddingLeft - 8, y + 4);
    }

    for (let i = 0; i < results.length; i++) {
      const x = this.paddingLeft + i * (barWidth + gap);
      const barHeight = (results[i].result.totalMoveDistance / maxDistance) * chartHeight;
      const y = this.paddingTop + chartHeight - barHeight;

      const gradient = ctx.createLinearGradient(x, y, x, this.paddingTop + chartHeight);
      const color = this.algorithmColors[results[i].name] || '#667eea';
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '80');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#374151';
      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(results[i].result.totalMoveDistance), x + barWidth / 2, y - 8);

      ctx.fillStyle = '#4b5563';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText(results[i].name, x + barWidth / 2, this.paddingTop + chartHeight + 18);
    }

    ctx.fillStyle = '#374151';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('总移动距离', this.compareCanvasWidth / 2, this.compareCanvasHeight - 5);
  }

  get sortedCompareResults(): DiskCompareResult[] {
    if (!this.compareResults) return [];
    return [...this.compareResults].sort(
      (a, b) => a.result.totalMoveDistance - b.result.totalMoveDistance
    );
  }

  getDirectionText(dir: HeadDirection): string {
    return dir === 'inward' ? '向内 (磁道号减小)' : '向外 (磁道号增大)';
  }

  getAlgorithmColor(name: string): string {
    return this.algorithmColors[name] || '#667eea';
  }
}
