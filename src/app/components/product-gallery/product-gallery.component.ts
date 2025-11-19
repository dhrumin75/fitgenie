import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ProductMetadata } from '../../models/try-on.models';

@Component({
  selector: 'fg-product-gallery',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gallery">
      <header class="gallery__header">
        <div class="gallery__header-bar">
          <h2>Selected Products</h2>
          <button
            type="button"
            class="gallery__capture-button"
            (click)="onCaptureClick()"
            [disabled]="capturePending() || captureActive()"
          >
            {{ captureButtonLabel() }}
          </button>
        </div>

        <p *ngIf="captureActive()">Hover an item on the store page and click to capture it.</p>
        <p *ngIf="!captureActive() && !products().length">No items yet. Click “Select item on page” to capture one.</p>
        <p *ngIf="!captureActive() && products().length">Tap an item to run a virtual try-on.</p>
      </header>

      <div class="gallery__grid" *ngIf="products().length; else emptyState">
        <article
          class="gallery__item"
          *ngFor="let product of products(); trackBy: trackById"
          [class.gallery__item--active]="product.id === activeProductId()"
          (click)="onSelect(product.id)"
        >
          <img
            [src]="product.imageUrl"
            [alt]="product.name"
            decoding="async"
            loading="lazy"
          />
          <div class="gallery__details">
            <h3>{{ product.name }}</h3>
            <p *ngIf="product.price">{{ product.price }}</p>
            <a *ngIf="product.sourceUrl" [href]="product.sourceUrl" target="_blank" rel="noopener noreferrer">View item</a>
          </div>
        </article>
      </div>

      <ng-template #emptyState>
        <div class="gallery__empty">
          <span aria-hidden="true">🛍️</span>
          <p *ngIf="captureActive()">Hover items on the store page and click to save them.</p>
          <p *ngIf="!captureActive()">Use the capture button above on any store page to add outfits here.</p>
        </div>
      </ng-template>
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

      .gallery__header {
        margin-bottom: 1rem;
        display: grid;
        gap: 0.5rem;
      }

      .gallery__header-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .gallery__header h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      .gallery__header p {
        margin: 0.25rem 0 0;
        opacity: 0.75;
      }

      .gallery__capture-button {
        cursor: pointer;
        border: none;
        border-radius: 999px;
        padding: 0.55rem 1.25rem;
        font-weight: 600;
        font-size: 0.9rem;
        color: #060813;
        background: linear-gradient(135deg, #79c2ff 0%, #7a5cff 100%);
        box-shadow: 0 10px 20px rgba(69, 105, 196, 0.35);
        transition: transform 0.2s ease, opacity 0.2s ease;
      }

      .gallery__capture-button:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .gallery__capture-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
        box-shadow: none;
      }

      .gallery__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 1rem;
      }

      .gallery__item {
        cursor: pointer;
        padding: 0.75rem;
        display: grid;
        gap: 0.75rem;
        border-radius: 1rem;
        background: rgba(9, 11, 19, 0.85);
        border: 1px solid transparent;
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        overflow: hidden;
      }

      .gallery__item:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.25);
        box-shadow: 0 18px 28px rgba(5, 11, 24, 0.5);
      }

      .gallery__item--active {
        border-color: #7e6bff;
        box-shadow: 0 20px 32px rgba(80, 65, 192, 0.45);
      }

      .gallery__item img {
        width: 100%;
        height: 160px;
        object-fit: contain;
        border-radius: 0.75rem;
        background: rgba(255, 255, 255, 0.05);
      }

      .gallery__details h3 {
        margin: 0;
        font-size: 0.95rem;
      }

      .gallery__details p {
        margin: 0.25rem 0 0;
        font-weight: 600;
      }

      .gallery__details a {
        color: #b6baff;
        font-size: 0.85rem;
      }

      .gallery__empty {
        display: grid;
        gap: 0.6rem;
        place-items: center;
        padding: 2rem;
        opacity: 0.7;
      }

      .gallery__empty span {
        font-size: 2rem;
      }
    `
  ]
})
export class ProductGalleryComponent {
  private readonly productList = signal<ProductMetadata[]>([]);
  private readonly selectedId = signal<string | null>(null);
  private readonly captureActiveSignal = signal(false);
  private readonly capturePendingSignal = signal(false);

  @Input({ alias: 'products' })
  set productsInput(value: ProductMetadata[] | null | undefined) {
    this.productList.set(value ?? []);
  }

  readonly products = computed(() => this.productList());

  @Input({ alias: 'activeProduct' })
  set activeProductInput(value: string | null | undefined) {
    this.selectedId.set(value ?? null);
  }

  readonly activeProductId = computed(() => this.selectedId());

  @Input({ alias: 'captureActive' })
  set captureActiveInput(value: boolean | null | undefined) {
    this.captureActiveSignal.set(Boolean(value));
  }

  readonly captureActive = computed(() => this.captureActiveSignal());

  @Input({ alias: 'capturePending' })
  set capturePendingInput(value: boolean | null | undefined) {
    this.capturePendingSignal.set(Boolean(value));
  }

  readonly capturePending = computed(() => this.capturePendingSignal());

  readonly captureButtonLabel = computed(() => {
    if (this.captureActive()) {
      return 'Hover item and click…';
    }
    if (this.capturePending()) {
      return 'Activating…';
    }
    return 'Select item on page';
  });

  @Output() readonly productSelected = new EventEmitter<string>();
  @Output() readonly captureRequested = new EventEmitter<void>();

  trackById(index: number, item: ProductMetadata): string {
    return item.id ?? `${index}`;
  }

  onSelect(productId: string): void {
    this.selectedId.set(productId);
    this.productSelected.emit(productId);
  }

  onCaptureClick(): void {
    if (this.capturePending()) {
      return;
    }

    this.captureRequested.emit();
  }
}

