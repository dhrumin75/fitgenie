import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductMetadata, TryOnResult, UserProfile } from '../../models/try-on.models';
import { MessageService } from '../../services/message.service';
import { ChromeStorageService } from '../../services/chrome-storage.service';
import {
  ProductSelectionMessage,
  RuntimeMessage,
  TryOnResultMessage,
  UserPhotoUpdatedMessage
} from '../../models/messaging.models';
import { UserPhotoUploadComponent } from '../user-photo-upload/user-photo-upload.component';
import { ProductGalleryComponent } from '../product-gallery/product-gallery.component';
import { ResultViewerComponent } from '../result-viewer/result-viewer.component';

@Component({
  selector: 'fg-popup',
  standalone: true,
  imports: [CommonModule, UserPhotoUploadComponent, ProductGalleryComponent, ResultViewerComponent],
  template: `
    <main class="popup">
      <fg-user-photo-upload
        [photoDataUrl]="userPhoto()?.photoDataUrl ?? null"
        [uploading]="isBusy()"
        (photoSelected)="handlePhotoSelected($event)"
        (photoCleared)="handlePhotoCleared()"
      />

      <fg-product-gallery
        [products]="products()"
        [activeProduct]="activeProductId()"
        (productSelected)="onProductSelected($event)"
      />

      <section class="actions">
        <button type="button" (click)="requestTryOn()" [disabled]="!canRequestTryOn() || isBusy()">
          {{ isBusy() ? 'Generating...' : 'Generate virtual try-on' }}
        </button>
        <p class="hint">
          Tip: Highlight an outfit image on the store page to add it to your gallery instantly.
        </p>
      </section>

      <fg-result-viewer [result]="tryOnResult()" [loading]="isBusy()" [error]="errorMessage()" />
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        color: #f0f4ff;
      }

      .popup {
        display: grid;
        gap: 1.5rem;
        padding: 1.5rem;
      }

      .actions {
        display: grid;
        gap: 0.75rem;
        padding: 1.5rem;
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .actions button {
        cursor: pointer;
        border: none;
        border-radius: 999px;
        padding: 0.9rem 1.75rem;
        font-size: 1rem;
        font-weight: 600;
        background: linear-gradient(135deg, #7a5cff 0%, #8ee7ff 100%);
        color: #060813;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }

      .actions button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .hint {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.8;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PopupComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly storageService = inject(ChromeStorageService);

  private readonly profile = signal<UserProfile | null>(null);
  private readonly productSelections = signal<ProductMetadata[]>([]);
  private readonly selectedProductId = signal<string | null>(null);
  private readonly latestResult = signal<TryOnResult | null>(null);
  private readonly busy = signal(false);
  private readonly error = signal<string | null>(null);

  constructor() {
    this.restoreUserProfile();
    this.listenForMessages();
    this.observeStorageUpdates();
  }

  userPhoto = () => this.profile();
  products = () => this.productSelections();
  activeProductId = () => this.selectedProductId();
  tryOnResult = () => this.latestResult();
  isBusy = () => this.busy();
  errorMessage = () => this.error();

  canRequestTryOn = () => Boolean(this.profile() && this.selectedProductId());

  async handlePhotoSelected(photoDataUrl: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const savedProfile = await this.storageService.saveUserPhoto(photoDataUrl);
      this.profile.set(savedProfile);
      await this.messageService.sendMessage({
        type: 'user-photo:updated',
        payload: {
          dataUrl: savedProfile.photoDataUrl,
          uploadedAt: savedProfile.uploadedAt
        }
      });
    } catch (err) {
      console.error('Failed to store user photo', err);
      this.error.set('Unable to store your photo. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async handlePhotoCleared(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.storageService.clearUserPhoto();
      this.profile.set(null);
      await this.messageService.sendMessage({
        type: 'user-photo:updated',
        payload: {
          dataUrl: '',
          uploadedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Failed to clear user photo', err);
      this.error.set('Unable to remove your photo at this time.');
    } finally {
      this.busy.set(false);
    }
  }

  onProductSelected(productId: string): void {
    this.selectedProductId.set(productId);
  }

  async requestTryOn(): Promise<void> {
    if (!this.canRequestTryOn()) {
      this.error.set('Please upload a photo and choose an outfit.');
      return;
    }

    const product = this.productSelections().find((item) => item.id === this.selectedProductId());
    const profile = this.profile();

    if (!product || !profile) {
      this.error.set('Missing product or profile details.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    const requestId = crypto.randomUUID();

    try {
      const response = await this.messageService.sendMessage<{ ok: boolean; error?: string }>({
        type: 'try-on:generate',
        requestId,
        payload: {
          userPhoto: profile.photoDataUrl,
          productImage: product.imageUrl,
          context: {
            productId: product.id,
            productName: product.name
          }
        }
      });

      if (response && !response.ok) {
        this.error.set(response.error ?? 'Try-on request failed.');
        this.busy.set(false);
      }
    } catch (err) {
      console.error('Failed to send try-on request', err);
      this.error.set('Unable to start the try-on. Please try again.');
      this.busy.set(false);
    }
  }

  private async restoreUserProfile(): Promise<void> {
    try {
      const stored = await this.storageService.getUserPhoto();
      if (stored) {
        this.profile.set(stored);
      }
    } catch (err) {
      console.error('Failed to restore user profile', err);
    }
  }

  private listenForMessages(): void {
    this.messageService
      .messages()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleRuntimeMessage(message));
  }

  private observeStorageUpdates(): void {
    this.storageService
      .watchUserPhoto()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((profile) => this.profile.set(profile));
  }

  private handleRuntimeMessage(message: RuntimeMessage): void {
    switch (message.type) {
      case 'product:selected':
        this.applyProductSelection(message);
        break;
      case 'try-on:result':
        this.consumeTryOnResult(message);
        break;
      case 'user-photo:updated':
        this.applyUserPhotoUpdate(message);
        break;
      default:
        break;
    }
  }

  private applyProductSelection(message: ProductSelectionMessage): void {
    const products = [...this.productSelections()];
    const existsIndex = products.findIndex((item) => item.id === message.payload.productId);

    const nextProduct: ProductMetadata = {
      id: message.payload.productId,
      name: message.payload.productName,
      imageUrl: message.payload.productImage,
      sourceUrl: message.payload.productUrl
    };

    if (existsIndex >= 0) {
      products.splice(existsIndex, 1, nextProduct);
    } else {
      products.unshift(nextProduct);
    }

    this.productSelections.set(products.slice(0, 12));
    this.selectedProductId.set(nextProduct.id);
  }

  private consumeTryOnResult(message: TryOnResultMessage): void {
    this.busy.set(false);
    this.latestResult.set({
      requestId: message.payload.requestId,
      generatedImageUrl: message.payload.generatedImageUrl,
      confidence: message.payload.confidence,
      generatedAt: new Date().toISOString()
    });
  }

  private applyUserPhotoUpdate(message: UserPhotoUpdatedMessage): void {
    const payload = message.payload;
    if (!payload.dataUrl) {
      this.profile.set(null);
      return;
    }

    this.profile.set({
      photoDataUrl: payload.dataUrl,
      uploadedAt: payload.uploadedAt
    });
  }
}

