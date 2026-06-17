import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SchedulingConfig, AlgorithmType } from '../../models/scheduling.model';

interface AlgorithmOption {
  value: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-algorithm-selector',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './algorithm-selector.component.html',
  styleUrls: ['./algorithm-selector.component.scss']
})
export class AlgorithmSelectorComponent implements OnChanges {
  @Input() config!: SchedulingConfig;
  @Output() configChange = new EventEmitter<SchedulingConfig>();

  @Input() compareMode: boolean = false;
  @Output() compareModeChange = new EventEmitter<boolean>();

  @Output() runSimulation = new EventEmitter<void>();
  @Output() runAllSimulation = new EventEmitter<void>();

  form: FormGroup;

  algorithmOptions: AlgorithmOption[] = [
    { value: 'FCFS', label: 'FCFS', description: '先来先服务' },
    { value: 'SJF', label: 'SJF', description: '短作业优先-非抢占' },
    { value: 'SRTF', label: 'SRTF', description: '最短剩余时间优先-抢占式' },
    { value: 'PRIORITY', label: 'PRIORITY', description: '优先级调度' },
    { value: 'RR', label: 'RR', description: '时间片轮转' },
    { value: 'MLFQ', label: 'MLFQ', description: '多级反馈队列' }
  ];

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      algorithm: ['FCFS'],
      priorityPreemptive: [false],
      timeQuantum: [4]
    });

    this.form.valueChanges.subscribe(() => {
      this.emitConfigChange();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      this.patchFormFromConfig(this.config);
    }
  }

  private patchFormFromConfig(config: SchedulingConfig): void {
    let algorithmValue: string;
    let priorityPreemptive = false;

    if (config.algorithm === AlgorithmType.PRIORITY_NP) {
      algorithmValue = 'PRIORITY';
      priorityPreemptive = false;
    } else if (config.algorithm === AlgorithmType.PRIORITY_P) {
      algorithmValue = 'PRIORITY';
      priorityPreemptive = true;
    } else {
      algorithmValue = config.algorithm;
    }

    this.form.patchValue({
      algorithm: algorithmValue,
      priorityPreemptive: priorityPreemptive,
      timeQuantum: config.timeQuantum ?? 4
    }, { emitEvent: false });
  }

  private emitConfigChange(): void {
    const value = this.form.value;
    const newConfig: SchedulingConfig = {
      algorithm: this.mapToAlgorithmType(value.algorithm, value.priorityPreemptive),
      timeQuantum: value.algorithm === 'RR' ? value.timeQuantum : undefined,
      priorityPreemptive: value.algorithm === 'PRIORITY' ? value.priorityPreemptive : undefined
    };
    this.configChange.emit(newConfig);
  }

  private mapToAlgorithmType(selected: string, preemptive: boolean): AlgorithmType {
    if (selected === 'PRIORITY') {
      return preemptive ? AlgorithmType.PRIORITY_P : AlgorithmType.PRIORITY_NP;
    }
    return selected as AlgorithmType;
  }

  get selectedAlgorithm(): string {
    return this.form.get('algorithm')?.value || 'FCFS';
  }

  get isPrioritySelected(): boolean {
    return this.selectedAlgorithm === 'PRIORITY';
  }

  get isRRSelected(): boolean {
    return this.selectedAlgorithm === 'RR';
  }

  get isMLFQSelected(): boolean {
    return this.selectedAlgorithm === 'MLFQ';
  }

  onCompareModeToggle(): void {
    this.compareMode = !this.compareMode;
    this.compareModeChange.emit(this.compareMode);
  }

  onRunSimulation(): void {
    this.runSimulation.emit();
  }

  onRunAllSimulation(): void {
    this.runAllSimulation.emit();
  }
}
