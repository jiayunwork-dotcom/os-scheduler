import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingResult } from '../../models/scheduling.model';
import { Process } from '../../models/process.model';

@Component({
  selector: 'app-animation-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './animation-controls.component.html',
  styleUrl: './animation-controls.component.scss'
})
export class AnimationControlsComponent {
  @Input() totalTime: number = 0;
  @Input() currentTime: number = 0;
  @Input() isPlaying: boolean = false;
  @Input() speed: number = 1;
  @Input() mode: 'instant' | 'animation' = 'animation';

  @Output() modeChange = new EventEmitter<'instant' | 'animation'>();
  @Output() play = new EventEmitter<void>();
  @Output() pause = new EventEmitter<void>();
  @Output() stepForward = new EventEmitter<void>();
  @Output() stepBackward = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();
  @Output() seekTo = new EventEmitter<number>();
  @Output() speedChange = new EventEmitter<number>();

  speedOptions: number[] = [0.5, 1, 2, 4, 8];

  onModeChange(value: 'instant' | 'animation'): void {
    this.modeChange.emit(value);
  }

  onPlayPause(): void {
    if (this.isPlaying) {
      this.pause.emit();
    } else {
      this.play.emit();
    }
  }

  onStepBackward(): void {
    this.stepBackward.emit();
  }

  onStepForward(): void {
    this.stepForward.emit();
  }

  onReset(): void {
    this.reset.emit();
  }

  onSeekTo(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseFloat(target.value);
    this.seekTo.emit(value);
  }

  onSpeedChange(value: number): void {
    this.speedChange.emit(value);
  }
}
