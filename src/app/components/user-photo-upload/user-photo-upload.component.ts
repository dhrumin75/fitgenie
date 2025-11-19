import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'fg-user-photo-upload',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="user-photo">
      <header>
        <h2>Virtual Fit Profile</h2>
        <p>Add a clear full-body photo to get started.</p>
      </header>

      <div class="preview" *ngIf="photoDataUrl(); else uploadPrompt">
        <img class="preview__image" [src]="photoDataUrl()" alt="FitGenie user preview" />
        <div class="actions">
          <button type="button" (click)="triggerFilePicker()" [disabled]="isBusy()">Replace photo</button>
          <button type="button" class="link" (click)="clearPhoto()" [disabled]="isBusy()">Remove</button>
        </div>
      </div>

      <ng-template #uploadPrompt>
        <label class="upload-tile" [class.upload-tile--busy]="isBusy()">
          <input #fileInput type="file" accept="image/*" (change)="onFileSelected($event)" [disabled]="isBusy()" hidden />
          <div class="upload-tile__content">
            <span class="emoji" aria-hidden="true">🧞‍♀️</span>
            <h3>Upload your look</h3>
            <p>Supported formats: JPG, PNG, WebP</p>
            <button type="button" (click)="triggerFilePicker()">Select photo</button>
          </div>
        </label>
      </ng-template>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 1.5rem;
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      .user-photo header h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      .user-photo header p {
        margin: 0.25rem 0 1.5rem;
        opacity: 0.75;
      }

      .preview {
        display: grid;
        gap: 1rem;
        place-items: center;
        text-align: center;
      }

      .preview__image {
        width: min(240px, 100%);
        border-radius: 1rem;
        object-fit: cover;
        box-shadow: 0 20px 35px rgba(12, 14, 24, 0.65);
      }

      .actions {
        display: flex;
        gap: 0.75rem;
      }

      button {
        cursor: pointer;
        border: none;
        border-radius: 999px;
        padding: 0.6rem 1.5rem;
        font-weight: 600;
        background: linear-gradient(120deg, #6a5af9, #8a4bff);
        color: #fff;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .link {
        background: transparent;
        color: #b6baff;
        padding-inline: 0.5rem;
      }

      .upload-tile {
        display: grid;
        place-items: center;
        padding: 2rem;
        border: 2px dashed rgba(255, 255, 255, 0.12);
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.02);
        transition: border-color 0.2s ease, transform 0.2s ease;
      }

      .upload-tile:hover {
        border-color: rgba(255, 255, 255, 0.32);
        transform: translateY(-2px);
      }

      .upload-tile--busy {
        opacity: 0.6;
        pointer-events: none;
      }

      .upload-tile__content {
        text-align: center;
        display: grid;
        gap: 0.5rem;
      }

      .emoji {
        font-size: 2rem;
      }
    `
  ]
})
export class UserPhotoUploadComponent {
  private readonly photo = signal<string | null>(null);
  private readonly busy = signal(false);
  @ViewChild('fileInput', { static: false }) private readonly fileInputRef?: ElementRef<HTMLInputElement>;

  @Input({ alias: 'photoDataUrl' })
  set photoDataUrlInput(value: string | null | undefined) {
    this.photo.set(value ?? null);
  }

  readonly photoDataUrl = computed(() => this.photo());

  @Input({ alias: 'uploading' })
  set uploadingInput(value: boolean | null | undefined) {
    this.busy.set(Boolean(value));
  }

  readonly isBusy = computed(() => this.busy());

  @Output() readonly photoSelected = new EventEmitter<string>();
  @Output() readonly photoCleared = new EventEmitter<void>();

  triggerFilePicker(): void {
    const input = this.fileInputRef?.nativeElement;
    if (input) {
      input.click();
      return;
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files?.length) {
      return;
    }

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      console.warn('Unsupported file type for user photo:', file.type);
      return;
    }

    this.busy.set(true);
    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.photo.set(dataUrl);
      this.photoSelected.emit(dataUrl);
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  clearPhoto(): void {
    this.photo.set(null);
    this.photoCleared.emit();
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
}

