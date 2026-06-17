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
