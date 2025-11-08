import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TryOnRequest, TryOnResult } from '../models/try-on.models';

interface GenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    index?: number;
    content?: {
      role?: string;
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
}

export interface GeminiGenerationOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly prompt?: string;
  readonly requestId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiApiService {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private readonly defaultModel = 'models/gemini-pro-vision';

  constructor(private readonly http: HttpClient) {}

  generateTryOnImage(request: TryOnRequest, options: GeminiGenerationOptions): Observable<TryOnResult> {
    const apiKey = options.apiKey;
    if (!apiKey) {
      return throwError(() => new Error('Gemini API key is required.'));
    }

    const model = options.model ?? this.defaultModel;
    const endpoint = `${this.baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const userPhotoInline = this.formatDataUrl(request.user.photoDataUrl);
    const productPhotoInline = this.formatDataUrl(request.product.imageUrl);

    const prompt = options.prompt?.trim() || this.buildDefaultPrompt(request);

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: userPhotoInline.mimeType,
                data: userPhotoInline.base64
              }
            },
            {
              inlineData: {
                mimeType: productPhotoInline.mimeType,
                data: productPhotoInline.base64
              }
            }
          ]
        }
      ]
    };

    return this.http.post<GenerateContentResponse>(endpoint, payload).pipe(
      map((response) => this.mapToTryOnResult(response, options.requestId)),
      catchError((error) => {
        console.error('Gemini API request failed', error);
        return throwError(() => new Error('Gemini API request failed. Check your credentials and quota.'));
      })
    );
  }

  private buildDefaultPrompt(request: TryOnRequest): string {
    return [
      'Combine the provided user photo and clothing item.',
      'Generate a realistic image of the user wearing the clothing item.',
      'Use natural lighting and preserve the user identity.',
      `Clothing item: ${request.product.name}${request.product.price ? ` (${request.product.price})` : ''}.`
    ].join(' ');
  }

  private mapToTryOnResult(response: GenerateContentResponse, requestId?: string): TryOnResult {
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const inlineImage = parts.find((part) => part.inlineData?.data)?.inlineData;
    const caption = parts.find((part) => part.text)?.text;

    if (!inlineImage?.data || !inlineImage.mimeType) {
      throw new Error('Gemini response missing image data.');
    }

    return {
      requestId: requestId ?? crypto.randomUUID(),
      generatedImageUrl: `data:${inlineImage.mimeType};base64,${inlineImage.data}`,
      confidence: 0.92,
      generatedAt: new Date().toISOString(),
      notes: caption
    };
  }

  private formatDataUrl(dataUrl: string): { mimeType: string; base64: string } {
    if (!dataUrl.startsWith('data:')) {
      throw new Error('Expected a data URL for inline image payloads.');
    }

    const [header, base64] = dataUrl.split(',', 2);
    if (!header || !base64) {
      throw new Error('Invalid data URL format.');
    }

    const mimeTypeMatch = header.match(/^data:(.*);base64$/);
    const mimeType = mimeTypeMatch?.[1] ?? 'image/png';

    return { mimeType, base64 };
  }
}

