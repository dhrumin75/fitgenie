import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ProductMetadata } from '../../models/try-on.models';

@Component({
  selector: 'fg-product-gallery',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gallery">
      <header class="gallery__header">
        <h2>Selected Products</h2>
        <p *ngIf="!products().length">Choose an item on the store page to see it here.</p>
        <p *ngIf="products().length">Tap an item to run a virtual try-on.</p>
      </header>

      <div class="gallery__grid" *ngIf="products().length; else emptyState">
        <article
          class="gallery__item"
          *ngFor="let product of products(); trackBy: trackById"
          [class.gallery__item--active]="product.id === activeProductId()"
          (click)="onSelect(product.id)"
        >
          <img
            NgOptimizedImage
            [priority]="product.id === activeProductId()"
            [src]="product.imageUrl"
            [alt]="product.name"
            width="128"
            height="160"
            decoding="async"
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
          <p>Open a compatible store page and select an outfit to try on.</p>
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
      }

      .gallery__header h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      .gallery__header p {
        margin: 0.25rem 0 0;
        opacity: 0.75;
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

  @Input({ required: false })
  set products(value: ProductMetadata[] | null | undefined) {
    this.productList.set(value ?? []);
  }

  products = () => this.productList();

  @Input({ required: false })
  set activeProduct(value: string | null | undefined) {
    this.selectedId.set(value ?? null);
  }

  activeProductId = () => this.selectedId();

  @Output() readonly productSelected = new EventEmitter<string>();

  trackById(index: number, item: ProductMetadata): string {
    return item.id ?? `${index}`;
  }

  onSelect(productId: string): void {
    this.selectedId.set(productId);
    this.productSelected.emit(productId);
  }
}

