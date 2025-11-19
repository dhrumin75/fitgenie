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
        <img 
          [src]="result()?.generatedImageUrl" 
          alt="FitGenie try-on result"
          (click)="openPreview()"
          class="result__image"
        />
        <footer class="result__meta">
          <span>Confidence: {{ result()?.confidence | number: '1.0-2' }}</span>
          <span>{{ result()?.generatedAt | date: 'short' }}</span>
        </footer>
        <p class="result__notes" *ngIf="result()?.notes">{{ result()?.notes }}</p>
        <p class="result__hint">Click image to view full size</p>
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

    <!-- Preview Modal -->
    <div class="preview-modal" *ngIf="showPreview()" (click)="closePreview()">
      <div class="preview-modal__content" (click)="$event.stopPropagation()">
        <button class="preview-modal__close" (click)="closePreview()" aria-label="Close preview">×</button>
        <img [src]="result()?.generatedImageUrl" alt="FitGenie try-on result - full size" />
      </div>
    </div>
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

      .result__image {
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .result__image:hover {
        transform: scale(1.02);
        box-shadow: 0 32px 48px rgba(11, 16, 32, 0.7);
      }

      .result__hint {
        margin: 0.5rem 0 0;
        font-size: 0.75rem;
        opacity: 0.6;
        font-style: italic;
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

      .preview-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 2rem;
        animation: fadeIn 0.2s ease;
      }

      .preview-modal__content {
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .preview-modal__content img {
        max-width: 100%;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 1rem;
        box-shadow: 0 40px 60px rgba(0, 0, 0, 0.8);
      }

      .preview-modal__close {
        position: absolute;
        top: -2.5rem;
        right: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        font-size: 1.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease;
      }

      .preview-modal__close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `
  ]
})
export class ResultViewerComponent {
  private readonly latestResult = signal<TryOnResult | null>(null);
  private readonly busy = signal(false);
  private readonly errorMessage = signal<string | null>(null);
  private readonly previewVisible = signal(false);

  @Input({ alias: 'result' })
  set resultInput(value: TryOnResult | null | undefined) {
    this.latestResult.set(value ?? null);
  }

  readonly result = computed(() => this.latestResult());

  @Input({ alias: 'loading' })
  set loadingInput(value: boolean | null | undefined) {
    this.busy.set(Boolean(value));
  }

  readonly loading = computed(() => this.busy());

  @Input({ alias: 'error' })
  set errorInput(value: string | null | undefined) {
    this.errorMessage.set(value ?? null);
  }

  readonly error = computed(() => this.errorMessage());
  readonly showPreview = computed(() => this.previewVisible());

  openPreview(): void {
    if (this.result()) {
      this.previewVisible.set(true);
    }
  }

  closePreview(): void {
    this.previewVisible.set(false);
  }
}

