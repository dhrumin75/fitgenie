export interface UserProfile {
  readonly photoDataUrl: string;
  readonly uploadedAt: string;
}

export interface ProductMetadata {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly price?: string;
  readonly sourceUrl?: string;
}

export interface TryOnRequest {
  readonly user: UserProfile;
  readonly product: ProductMetadata;
}

export interface TryOnResult {
  readonly requestId: string;
  readonly generatedImageUrl: string;
  readonly confidence: number;
  readonly generatedAt: string;
  readonly notes?: string;
}

