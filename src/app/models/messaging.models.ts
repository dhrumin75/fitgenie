export type RuntimeMessage =
  | TryOnGenerationMessage
  | ProductSelectionMessage
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

export interface ProductSelectionMessage extends BaseMessage<'product:selected'> {
  readonly payload: {
    readonly productId: string;
    readonly productName: string;
    readonly productImage: string;
    readonly productUrl?: string;
  };
}

export interface UserPhotoUpdatedMessage extends BaseMessage<'user-photo:updated'> {
  readonly payload: {
    readonly dataUrl: string;
    readonly uploadedAt: string;
  };
}

export type OutboundMessage = TryOnGenerationMessage | UserPhotoUpdatedMessage;

