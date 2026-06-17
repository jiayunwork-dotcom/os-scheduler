import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Process } from '../../models/process.model';

const COLOR_PALETTE: string[] = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
  '#F8B500',
  '#00CED1'
];

@Component({
  selector: 'app-process-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './process-config.component.html',
  styleUrls: ['./process-config.component.scss']
})
export class ProcessConfigComponent implements OnInit {
  @Input() processes: Process[] = [];
  @Output() processesChange = new EventEmitter<Process[]>();

  processForm!: FormGroup;

  selectedPreset: string = '';

  presetOptions = [
    { value: '', label: '选择预设方案...' },
    { value: 'cpu-intensive', label: 'CPU密集对比' },
    { value: 'io-intensive', label: 'IO密集场景' },
    { value: 'priority-inversion', label: '优先级反转演示' },
    { value: 'starvation', label: '短进程饥饿演示' },
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.processForm = this.fb.group({
      arrivalTime: [0, [Validators.required, Validators.min(0)]],
      burstTime: [5, [Validators.required, Validators.min(0)]],
      priority: [1, [Validators.required, Validators.min(1)]],
      ioBurstTime: [0, [Validators.required, Validators.min(0)]],
      ioStartTime: [-1, [Validators.required, Validators.min(-1)]]
    }, { validators: this.ioValidation });
  }

  private ioValidation(control: AbstractControl): ValidationErrors | null {
    const ioBurstTime = control.get('ioBurstTime')?.value;
    const ioStartTime = control.get('ioStartTime')?.value;
    const burstTime = control.get('burstTime')?.value;

    if (ioBurstTime > 0) {
      if (ioStartTime < 0) {
        return { ioStartTimeRequired: true };
      }
      if (ioStartTime >= burstTime) {
        return { ioStartTimeInvalid: true };
      }
    }
    return null;
  }

  private getNextColor(): string {
    const index = this.processes.length % COLOR_PALETTE.length;
    return COLOR_PALETTE[index];
  }

  private getNextId(): number {
    if (this.processes.length === 0) {
      return 1;
    }
    return Math.max(...this.processes.map(p => p.id)) + 1;
  }

  addProcess(): void {
    if (this.processForm.invalid) {
      return;
    }

    const formValue = this.processForm.value;
    const newProcess: Process = {
      id: this.getNextId(),
      name: `P${this.getNextId()}`,
      arrivalTime: formValue.arrivalTime,
      burstTime: formValue.burstTime,
      priority: formValue.priority,
      ioBurstTime: formValue.ioBurstTime,
      ioStartTime: formValue.ioStartTime,
      color: this.getNextColor()
    };

    const updatedProcesses = [...this.processes, newProcess];
    this.emitProcesses(updatedProcesses);
    this.resetForm();
  }

  generateRandom(): void {
    const count = Math.floor(Math.random() * 6) + 5;
    const newProcesses: Process[] = [];
    let currentId = this.getNextId();

    for (let i = 0; i < count; i++) {
      const hasIo = Math.random() < 0.3;
      const burstTime = Math.floor(Math.random() * 14) + 2;
      const ioBurstTime = hasIo ? Math.floor(Math.random() * 5) + 1 : 0;
      const ioStartTime = hasIo
        ? Math.floor(burstTime * (0.5 + Math.random() * 0.3))
        : -1;

      const process: Process = {
        id: currentId,
        name: `P${currentId}`,
        arrivalTime: Math.floor(Math.random() * 21),
        burstTime: burstTime,
        priority: Math.floor(Math.random() * 10) + 1,
        ioBurstTime: ioBurstTime,
        ioStartTime: ioStartTime,
        color: COLOR_PALETTE[(currentId - 1) % COLOR_PALETTE.length]
      };

      newProcesses.push(process);
      currentId++;
    }

    const updatedProcesses = [...this.processes, ...newProcesses];
    this.emitProcesses(updatedProcesses);
  }

  clearAll(): void {
    this.emitProcesses([]);
  }

  loadPreset(presetKey: string): void {
    if (!presetKey) return;
    let presetProcesses: Process[];
    switch (presetKey) {
      case 'cpu-intensive':
        presetProcesses = [
          { id: 1, name: 'P1', arrivalTime: 0, burstTime: 20, priority: 3, ioBurstTime: 0, ioStartTime: -1, color: '#FF6B6B' },
          { id: 2, name: 'P2', arrivalTime: 1, burstTime: 3, priority: 2, ioBurstTime: 0, ioStartTime: -1, color: '#4ECDC4' },
          { id: 3, name: 'P3', arrivalTime: 2, burstTime: 2, priority: 2, ioBurstTime: 0, ioStartTime: -1, color: '#45B7D1' },
          { id: 4, name: 'P4', arrivalTime: 3, burstTime: 15, priority: 4, ioBurstTime: 0, ioStartTime: -1, color: '#96CEB4' },
        ];
        break;
      case 'io-intensive':
        presetProcesses = [
          { id: 1, name: 'P1', arrivalTime: 0, burstTime: 6, priority: 2, ioBurstTime: 4, ioStartTime: 3, color: '#FF6B6B' },
          { id: 2, name: 'P2', arrivalTime: 0, burstTime: 8, priority: 2, ioBurstTime: 5, ioStartTime: 4, color: '#4ECDC4' },
          { id: 3, name: 'P3', arrivalTime: 1, burstTime: 5, priority: 3, ioBurstTime: 6, ioStartTime: 2, color: '#45B7D1' },
          { id: 4, name: 'P4', arrivalTime: 2, burstTime: 4, priority: 1, ioBurstTime: 3, ioStartTime: 2, color: '#96CEB4' },
        ];
        break;
      case 'priority-inversion':
        presetProcesses = [
          { id: 1, name: 'P1(低)', arrivalTime: 0, burstTime: 10, priority: 5, ioBurstTime: 0, ioStartTime: -1, color: '#FF6B6B' },
          { id: 2, name: 'P2(中)', arrivalTime: 2, burstTime: 6, priority: 3, ioBurstTime: 0, ioStartTime: -1, color: '#4ECDC4' },
          { id: 3, name: 'P3(高)', arrivalTime: 4, burstTime: 3, priority: 1, ioBurstTime: 0, ioStartTime: -1, color: '#45B7D1' },
        ];
        break;
      case 'starvation':
        presetProcesses = [
          { id: 1, name: 'P1(长)', arrivalTime: 0, burstTime: 30, priority: 3, ioBurstTime: 0, ioStartTime: -1, color: '#FF6B6B' },
          { id: 2, name: 'P2(短)', arrivalTime: 1, burstTime: 2, priority: 5, ioBurstTime: 0, ioStartTime: -1, color: '#4ECDC4' },
          { id: 3, name: 'P3(短)', arrivalTime: 3, burstTime: 3, priority: 5, ioBurstTime: 0, ioStartTime: -1, color: '#45B7D1' },
          { id: 4, name: 'P4(高优)', arrivalTime: 2, burstTime: 8, priority: 1, ioBurstTime: 0, ioStartTime: -1, color: '#96CEB4' },
          { id: 5, name: 'P5(高优)', arrivalTime: 5, burstTime: 6, priority: 1, ioBurstTime: 0, ioStartTime: -1, color: '#FFEAA7' },
        ];
        break;
      default:
        return;
    }
    this.emitProcesses(presetProcesses);
    this.selectedPreset = '';
  }

  removeProcess(id: number): void {
    const updatedProcesses = this.processes.filter(p => p.id !== id);
    this.emitProcesses(updatedProcesses);
  }

  private emitProcesses(processes: Process[]): void {
    this.processesChange.emit(processes);
  }

  private resetForm(): void {
    this.processForm.reset({
      arrivalTime: 0,
      burstTime: 5,
      priority: 1,
      ioBurstTime: 0,
      ioStartTime: -1
    });
  }

  get arrivalTimeControl() {
    return this.processForm.get('arrivalTime');
  }

  get burstTimeControl() {
    return this.processForm.get('burstTime');
  }

  get priorityControl() {
    return this.processForm.get('priority');
  }

  get ioBurstTimeControl() {
    return this.processForm.get('ioBurstTime');
  }

  get ioStartTimeControl() {
    return this.processForm.get('ioStartTime');
  }
}
