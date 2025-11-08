import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TryOnResult } from '../../models/try-on.models';

@Component({
  selector: 'fg-result-viewer',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result">
      <header>
        <h2>Try-On Preview</h2>
        <p *ngIf="!result()">Run a try-on to generate a preview.</p>
      </header>

      <div class="result__canvas" *ngIf="result(); else waiting">
        <img [src]="result()?.generatedImageUrl" alt="FitGenie try-on result" />
        <footer class="result__meta">
          <span>Confidence: {{ result()?.confidence | number: '1.0-2' }}</span>
          <span>{{ result()?.generatedAt | date: 'short' }}</span>
        </footer>
        <p class="result__notes" *ngIf="result()?.notes">{{ result()?.notes }}</p>
      </div>

      <ng-template #waiting>
        <div class="result__placeholder" [class.result__placeholder--busy]="loading()">
          <ng-container *ngIf="loading(); else idle">
            <div class="spinner" aria-hidden="true"></div>
            <p>Generating your virtual fit...</p>
          </ng-container>
          <ng-template #idle>
            <span aria-hidden="true">✨</span>
            <p>Results will appear here instantly once ready.</p>
          </ng-template>
        </div>
      </ng-template>

      <p class="result__error" *ngIf="error()">{{ error() }}</p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 1.5rem;
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      header h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      header p {
        margin: 0.25rem 0 1rem;
        opacity: 0.7;
      }

      .result__canvas {
        display: grid;
        gap: 0.75rem;
        justify-items: center;
        text-align: center;
      }

      .result__canvas img {
        width: min(280px, 100%);
        border-radius: 1.25rem;
        box-shadow: 0 28px 44px rgba(11, 16, 32, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .result__meta {
        display: flex;
        gap: 1rem;
        font-size: 0.85rem;
        opacity: 0.8;
      }

      .result__notes {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.8;
      }

      .result__placeholder {
        display: grid;
        place-items: center;
        padding: 2rem;
        gap: 1rem;
        border-radius: 1rem;
        border: 2px dashed rgba(255, 255, 255, 0.16);
        min-height: 200px;
        transition: opacity 0.2s ease;
      }

      .result__placeholder--busy {
        opacity: 0.7;
      }

      .spinner {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 4px solid rgba(255, 255, 255, 0.15);
        border-top-color: #8a4bff;
        animation: spin 1s linear infinite;
      }

      .result__error {
        margin-top: 1rem;
        color: #ff8a8a;
        font-size: 0.9rem;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `
  ]
})
export class ResultViewerComponent {
  private readonly latestResult = signal<TryOnResult | null>(null);
  private readonly busy = signal(false);
  private readonly errorMessage = signal<string | null>(null);

  @Input({ required: false })
  set result(value: TryOnResult | null | undefined) {
    this.latestResult.set(value ?? null);
  }

  result = () => this.latestResult();

  @Input({ required: false })
  set loading(value: boolean | null | undefined) {
    this.busy.set(Boolean(value));
  }

  loading = () => this.busy();

  @Input({ required: false })
  set error(value: string | null | undefined) {
    this.errorMessage.set(value ?? null);
  }

  error = () => this.errorMessage();
}

