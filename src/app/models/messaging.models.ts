import { ProductMetadata } from './try-on.models';

export type CaptureCompletionReason = 'completed' | 'cancelled' | 'error';

export type RuntimeMessage =
  | TryOnGenerationMessage
  | TryOnResultMessage
  | ProductSelectionMessage
  | ProductSelectionsUpdatedMessage
  | ProductCaptureActivatedMessage
  | ProductCaptureFinishedMessage
  | UserPhotoUpdatedMessage;

export interface BaseMessage<TType extends string = string> {
  readonly type: TType;
  readonly requestId?: string;
}

export interface TryOnGenerationMessage extends BaseMessage<'try-on:generate'> {
  readonly payload: {
    readonly userPhoto: string;
    readonly productImage: string;
    readonly context?: Record<string, unknown>;
  };
}

export interface TryOnResultMessage extends BaseMessage<'try-on:result'> {
  readonly payload: {
    readonly requestId: string;
    readonly generatedImageUrl: string;
    readonly confidence: number;
  };
}

export interface ProductCaptureStartMessage extends BaseMessage<'product:capture:start'> {}

export interface ProductCaptureActivatedMessage extends BaseMessage<'product:capture:activated'> {}

export interface ProductCaptureFinishedMessage extends BaseMessage<'product:capture:finished'> {
  readonly payload?: {
    readonly reason: CaptureCompletionReason;
    readonly message?: string;
  };
}

export interface ProductSelectionMessage extends BaseMessage<'product:selected'> {
  readonly payload: {
    readonly productId: string;
    readonly productName: string;
    readonly productImage: string;
    readonly productUrl?: string;
  };
}

export interface ProductSelectionsRequestMessage extends BaseMessage<'products:get'> {}

export interface ProductSelectionsUpdatedMessage extends BaseMessage<'products:updated'> {
  readonly payload: {
    readonly products: ProductMetadata[];
  };
}

export interface UserPhotoUpdatedMessage extends BaseMessage<'user-photo:updated'> {
  readonly payload: {
    readonly dataUrl: string;
    readonly uploadedAt: string;
  };
}

export type OutboundMessage =
  | TryOnGenerationMessage
  | UserPhotoUpdatedMessage
  | ProductSelectionsRequestMessage
  | ProductCaptureStartMessage;

