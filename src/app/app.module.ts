import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AppComponent } from './app.component';
import { ProcessConfigComponent } from './components/process-config/process-config.component';
import { AlgorithmSelectorComponent } from './components/algorithm-selector/algorithm-selector.component';
import { GanttChartComponent } from './components/gantt-chart/gantt-chart.component';
import { ReadyQueueComponent } from './components/ready-queue/ready-queue.component';
import { MetricsPanelComponent } from './components/metrics-panel/metrics-panel.component';
import { AnimationControlsComponent } from './components/animation-controls/animation-controls.component';
import { SchedulingService } from './services/scheduling.service';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ProcessConfigComponent,
    AlgorithmSelectorComponent,
    GanttChartComponent,
    ReadyQueueComponent,
    MetricsPanelComponent,
    AnimationControlsComponent,
  ],
  providers: [SchedulingService],
  bootstrap: [AppComponent],
})
export class AppModule {}
