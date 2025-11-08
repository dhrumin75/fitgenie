import { TryOnGenerationMessage, TryOnResultMessage, UserPhotoUpdatedMessage } from '../app/models/messaging.models';

const GEMINI_API_KEY_STORAGE_KEY = 'fitgenie:geminiApiKey';
const DEFAULT_PROMPT =
  'Combine the provided user portrait with the clothing item and render a photorealistic try-on. Maintain the users identity and pose while adapting the clothing naturally.';

chrome.runtime.onInstalled.addListener(() => {
  console.info('FitGenie service worker installed.');
});

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const messageType = (rawMessage as { type?: string }).type;

  switch (messageType) {
    case 'try-on:generate':
      handleTryOnRequest(rawMessage as TryOnGenerationMessage)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('Try-on generation failed', error);
          sendResponse({ ok: false, error: 'Try-on generation failed. Check logs for details.' });
        });
      return true;

    case 'user-photo:updated':
      persistUserPhotoMetadata(rawMessage as UserPhotoUpdatedMessage);
      sendResponse({ ok: true });
      return false;

    case 'product:selected':
      chrome.runtime.sendMessage(rawMessage);
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});

async function handleTryOnRequest(message: TryOnGenerationMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      return { ok: false, error: 'Missing Gemini API key. Save one via chrome.storage before generating.' };
    }

    const userPhoto = parseDataUrl(message.payload.userPhoto);
    const productAsset = await toDataUrl(message.payload.productImage);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: DEFAULT_PROMPT },
              {
                inlineData: {
                  mimeType: userPhoto.mimeType,
                  data: userPhoto.base64
                }
              },
              {
                inlineData: {
                  mimeType: productAsset.mimeType,
                  data: productAsset.base64
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API responded with error', errorBody);
      return { ok: false, error: 'Gemini API rejected the request.' };
    }

    const json = (await response.json()) as GeminiGenerateContentResponse;
    const resultMessage = createTryOnResultMessage(message.requestId ?? crypto.randomUUID(), json);

    chrome.runtime.sendMessage(resultMessage);
    return { ok: true };
  } catch (error) {
    console.error('Unexpected error while generating try-on', error);
    return { ok: false, error: 'Unexpected error while generating try-on.' };
  }
}

async function resolveApiKey(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    chrome.storage.local.get(GEMINI_API_KEY_STORAGE_KEY, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('Failed to read Gemini API key', error);
        resolve(null);
        return;
      }

      const key = items[GEMINI_API_KEY_STORAGE_KEY];
      resolve(typeof key === 'string' && key.trim() ? key.trim() : null);
    });
  });
}

async function persistUserPhotoMetadata(message: UserPhotoUpdatedMessage): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(
        {
          'fitgenie:userPhotoMeta': {
            uploadedAt: message.payload.uploadedAt,
            hasPhoto: Boolean(message.payload.dataUrl)
          }
        },
        () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.warn('Unable to persist user photo metadata', error);
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Expected data URL.');
  }

  const [header, base64] = dataUrl.split(',', 2);
  if (!header || !base64) {
    throw new Error('Invalid data URL.');
  }

  const mimeTypeMatch = header.match(/^data:(.*);base64$/);
  const mimeType = mimeTypeMatch?.[1] ?? 'image/png';
  return { mimeType, base64 };
}

async function toDataUrl(resource: string): Promise<{ mimeType: string; base64: string }> {
  if (resource.startsWith('data:')) {
    return parseDataUrl(resource);
  }

  const response = await fetch(resource);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource ${resource}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
  return { mimeType, base64 };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function createTryOnResultMessage(requestId: string, response: GeminiGenerateContentResponse): TryOnResultMessage {
  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data);
  const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png';
  const base64 = imagePart?.inlineData?.data;

  if (!base64) {
    throw new Error('Gemini response missing inline image data.');
  }

  return {
    type: 'try-on:result',
    payload: {
      requestId,
      generatedImageUrl: `data:${mimeType};base64,${base64}`,
      confidence: 0.9
    }
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
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

