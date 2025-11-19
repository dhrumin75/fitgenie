// Using REST API directly instead of SDK for better service worker compatibility
// import { GoogleGenAI } from '@google/genai';
import {
  ProductCaptureActivatedMessage,
  ProductCaptureFinishedMessage,
  ProductCaptureStartMessage,
  ProductSelectionMessage,
  ProductSelectionsRequestMessage,
  ProductSelectionsUpdatedMessage,
  TryOnGenerationMessage,
  TryOnResultMessage,
  UserPhotoUpdatedMessage
} from '../app/models/messaging.models';
import { ProductMetadata } from '../app/models/try-on.models';

const GEMINI_API_KEY_STORAGE_KEY = 'fitgenie:geminiApiKey';
const PRODUCT_SELECTIONS_STORAGE_KEY = 'fitgenie:productSelections';
const DEFAULT_PROMPT =
  'You are a virtual try-on assistant. The first image is a photo of a person (the user). The second image shows clothing - either a single item or a complete outfit on a model. Your task is to generate a photorealistic image showing the person from the first image wearing the clothing from the second image. CRITICAL INSTRUCTIONS: 1) If the second image shows a complete outfit (multiple clothing items like jacket, shirt, pants, etc. on a model), transfer ALL visible clothing items to the user - replace the user\'s entire outfit with the complete outfit from the product image. 2) If the second image shows a single clothing item, replace only that corresponding item on the user. 3) Keep the user\'s face, body shape, pose, and background exactly as they appear in the first image. 4) Do NOT return the original images unchanged - always generate a new composite image. 5) Ensure all clothing fits naturally and realistically on the person\'s body, maintaining proper proportions and draping.';
const DEFAULT_MODEL = 'models/gemini-2.5-flash-image';

chrome.runtime.onInstalled.addListener(() => {
  console.info('[FitGenie] Service worker installed.');
});

console.log('[FitGenie] Service worker script loaded');

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  console.log('[FitGenie] Message received:', rawMessage);
  const messageType = (rawMessage as { type?: string }).type;
  console.log('[FitGenie] Message type:', messageType);

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

    case 'product:capture:start':
      handleProductCaptureStart(rawMessage as ProductCaptureStartMessage)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('Failed to initiate product capture', error);
          sendResponse({ ok: false, error: 'Unable to activate capture on this page.' });
        });
      return true;

    case 'product:capture:activated':
      chrome.runtime.sendMessage<ProductCaptureActivatedMessage>(rawMessage as ProductCaptureActivatedMessage);
      sendResponse({ ok: true });
      return false;

    case 'product:capture:finished':
      chrome.runtime.sendMessage<ProductCaptureFinishedMessage>(rawMessage as ProductCaptureFinishedMessage);
      sendResponse({ ok: true });
      return false;

    case 'products:get': {
      handleProductsRequest(rawMessage as ProductSelectionsRequestMessage)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('Failed to resolve product selections', error);
          sendResponse({ ok: false, products: [] });
        });
      return true;
    }

    case 'product:selected':
      handleProductSelected(rawMessage as ProductSelectionMessage)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error('Failed to persist product selection', error);
          sendResponse({ ok: false, error: 'Failed to capture product selection.' });
        });
      return true;

    default:
      return false;
  }
});

async function handleTryOnRequest(message: TryOnGenerationMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log('[FitGenie] Starting try-on generation');
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      console.error('[FitGenie] Missing API key');
      return { ok: false, error: 'Missing Gemini API key. Save one via chrome.storage before generating.' };
    }
    console.log('[FitGenie] API key resolved');

    console.log('[FitGenie] Parsing user photo');
    const userPhoto = parseDataUrl(message.payload.userPhoto);
    console.log('[FitGenie] User photo parsed, mimeType:', userPhoto.mimeType);

    // Product image might be a data URL (new captures) or a regular URL (old captures)
    const productImage = message.payload.productImage;
    console.log('[FitGenie] Product image type:', productImage.startsWith('data:') ? 'data URL' : 'URL', productImage.substring(0, 80) + '...');
    
    let productAsset: GeminiInlineData;
    if (productImage.startsWith('data:')) {
      // Already a data URL - parse it
      productAsset = parseDataUrl(productImage);
      console.log('[FitGenie] Product image parsed from data URL, mimeType:', productAsset.mimeType);
    } else {
      // It's a URL - try to fetch it (might fail due to CORS)
      console.log('[FitGenie] Attempting to fetch product image from URL');
      try {
        productAsset = await toDataUrl(productImage);
        console.log('[FitGenie] Product image fetched successfully, mimeType:', productAsset.mimeType);
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.error('[FitGenie] Failed to fetch product image:', errorMsg);
        return { 
          ok: false, 
          error: `Cannot access product image. Please re-select the product from the page to capture it properly. Error: ${errorMsg}` 
        };
      }
    }

    console.log('[FitGenie] Calling Gemini API with model:', DEFAULT_MODEL);
    const result = await requestTryOnFromGemini({
      apiKey,
      prompt: DEFAULT_PROMPT,
      model: DEFAULT_MODEL,
      userPhoto,
      productAsset
    });
    console.log('[FitGenie] Gemini API response received:', result);

    const resultMessage = createTryOnResultMessage(message.requestId ?? crypto.randomUUID(), result);
    console.log('[FitGenie] Result message created');

    chrome.runtime.sendMessage(resultMessage);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[FitGenie] Unexpected error while generating try-on:', errorMessage, errorStack || '', error);
    return { ok: false, error: `Try-on generation failed: ${errorMessage}` };
  }
}

async function resolveApiKey(): Promise<string | null> {
  const storedKey = await readApiKeyFromStorage();
  if (storedKey) {
    return storedKey;
  }

  const localKey = await readApiKeyFromLocalConfig();
  if (localKey) {
    await cacheApiKey(localKey);
    return localKey;
  }

  return null;
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

async function readApiKeyFromStorage(): Promise<string | null> {
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

async function cacheApiKey(apiKey: string): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [GEMINI_API_KEY_STORAGE_KEY]: apiKey }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.warn('Failed to cache Gemini API key in storage', error);
      }
      resolve();
    });
  });
}

async function readApiKeyFromLocalConfig(): Promise<string | null> {
  try {
    const url = chrome.runtime.getURL('config/api-key.local.json');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { apiKey?: string | null };
    const key = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
    return key ? key : null;
  } catch (error) {
    console.debug('No local Gemini API key configuration found', error);
    return null;
  }
}

function parseDataUrl(dataUrl: string): GeminiInlineData {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Expected data URL.');
  }

  const [header, base64] = dataUrl.split(',', 2);
  if (!header || !base64) {
    throw new Error('Invalid data URL.');
  }

  const mimeTypeMatch = header.match(/^data:(.*);base64$/);
  const mimeType = mimeTypeMatch?.[1] ?? 'image/png';
  return { mimeType, data: base64 };
}

async function toDataUrl(resource: string): Promise<GeminiInlineData> {
  if (resource.startsWith('data:')) {
    return parseDataUrl(resource);
  }

  try {
    console.log('[FitGenie] Fetching image from URL:', resource);
    const response = await fetch(resource);
    if (!response.ok) {
      throw new Error(`Failed to fetch resource ${resource}: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const data = arrayBufferToBase64(buffer);
    console.log('[FitGenie] Image fetched successfully, size:', buffer.byteLength, 'bytes, mimeType:', mimeType);
    return { mimeType, data };
  } catch (error) {
    console.error('[FitGenie] Error fetching image:', error);
    if (error instanceof Error && error.message.includes('CORS')) {
      throw new Error(`Cannot fetch image due to CORS restrictions. The image URL may need to be proxied.`);
    }
    throw error;
  }
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
  if (!candidate) {
    throw new Error('Gemini response missing candidates.');
  }

  // According to documentation, response.parts contains the image data
  // Check both candidate.content.parts and direct parts array
  const parts = candidate.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  
  if (!imagePart?.inlineData?.data) {
    // Try to find text part for debugging
    const textPart = parts.find((part) => part.text);
    console.error('[FitGenie] No image data found in response. Parts:', parts);
    if (textPart?.text) {
      console.error('[FitGenie] Response text:', textPart.text);
    }
    throw new Error('Gemini response missing inline image data.');
  }

  const mimeType = imagePart.inlineData.mimeType ?? 'image/png';
  const base64 = imagePart.inlineData.data;

  return {
    type: 'try-on:result',
    payload: {
      requestId,
      generatedImageUrl: `data:${mimeType};base64,${base64}`,
      confidence: 0.9
    }
  };
}

interface GeminiInlineData {
  readonly mimeType: string;
  readonly data: string;
}

interface GeminiRequestContext {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly userPhoto: GeminiInlineData;
  readonly productAsset: GeminiInlineData;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: Array<GeminiCandidate>;
}

interface GeminiCandidate {
  readonly index?: number;
  readonly content?: {
    readonly parts?: Array<GeminiPart>;
  };
}

interface GeminiPart {
  readonly text?: string;
  readonly inlineData?: {
    readonly mimeType?: string;
    readonly data?: string;
  };
}

async function requestTryOnFromGemini(context: GeminiRequestContext): Promise<GeminiGenerateContentResponse> {
  try {
    // Use REST API directly - following official documentation format
    // https://ai.google.dev/gemini-api/docs/image-generation
    const modelName = context.model.startsWith('models/') 
      ? context.model 
      : `models/${context.model}`;
    
    // Use header for API key instead of query parameter (per documentation)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent`;
    
    console.log('[FitGenie] Calling Gemini API:', apiUrl);
    console.log('[FitGenie] Model:', modelName);
    console.log('[FitGenie] User photo size:', context.userPhoto.data.length, 'bytes, mimeType:', context.userPhoto.mimeType);
    console.log('[FitGenie] Product asset size:', context.productAsset.data.length, 'bytes, mimeType:', context.productAsset.mimeType);

    // Format according to documentation: contents is an array, parts contain text and inlineData
    const requestBody = {
      contents: [
        {
          parts: [
            { text: context.prompt },
            {
              inlineData: {
                mimeType: context.userPhoto.mimeType,
                data: context.userPhoto.data
              }
            },
            {
              inlineData: {
                mimeType: context.productAsset.mimeType,
                data: context.productAsset.data
              }
            }
          ]
        }
      ]
    };

    console.log('[FitGenie] Sending request to Gemini API...');
    console.log('[FitGenie] Request URL:', apiUrl);
    console.log('[FitGenie] Request body size:', JSON.stringify(requestBody).length, 'bytes');
    
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': context.apiKey  // Use header instead of query param (per documentation)
        },
        body: JSON.stringify(requestBody)
      });
    } catch (fetchError) {
      console.error('[FitGenie] Fetch failed:', fetchError);
      if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
        throw new Error(`Network error: Unable to reach Gemini API. Check your internet connection and API key. Original error: ${fetchError.message}`);
      }
      throw fetchError;
    }

    console.log('[FitGenie] Gemini API response status:', response.status, response.statusText);
    console.log('[FitGenie] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
        console.error('[FitGenie] Gemini API error response:', errorText);
      } catch (textError) {
        console.error('[FitGenie] Failed to read error response:', textError);
        errorText = `HTTP ${response.status} ${response.statusText}`;
      }
      throw new Error(`Gemini API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const result = await response.json() as GeminiGenerateContentResponse;
    console.log('[FitGenie] Gemini API success, candidates:', result.candidates?.length ?? 0);
    return result;
  } catch (error) {
    console.error('[FitGenie] Error in requestTryOnFromGemini:', error);
    if (error instanceof Error) {
      console.error('[FitGenie] Error message:', error.message);
      console.error('[FitGenie] Error stack:', error.stack);
    }
    throw error;
  }
}

async function handleProductCaptureStart(_message: ProductCaptureStartMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      console.error('[FitGenie] No active tab found');
      return { ok: false, error: 'No active tab available to capture from.' };
    }

    console.log('[FitGenie] Attempting to activate capture on tab', activeTab.id, activeTab.url);

    // Ensure content script is injected (it may not be loaded yet even if declared in manifest)
    const injection = await ensureContentScript(activeTab.id);
    if (!injection.ok) {
      console.error('[FitGenie] Content script injection failed:', injection.error);
      return injection;
    }

    console.log('[FitGenie] Content script injected successfully');

    // Wait a brief moment for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const response = await sendMessageToTabWithResponse<{ ok?: boolean; error?: string }>(
        activeTab.id,
        { type: 'product:capture:start' } satisfies ProductCaptureStartMessage
      );
      
      console.log('[FitGenie] Content script response:', response);
      
      if (response && response.ok === false) {
        return { ok: false, error: response.error ?? 'Content script failed to activate capture.' };
      }
    } catch (sendError) {
      console.error('[FitGenie] Failed to send message to content script:', sendError);
      return buildCaptureErrorResponse(sendError);
    }

    console.log('[FitGenie] Capture activated successfully');
    return { ok: true };
  } catch (error) {
    console.error('[FitGenie] Unable to dispatch capture start message', error);
    return { ok: false, error: 'Unable to activate capture on this page. Ensure FitGenie is allowed for this site.' };
  }
}

async function handleProductsRequest(_message: ProductSelectionsRequestMessage): Promise<{ ok: boolean; products: ProductMetadata[] }> {
  const products = await readStoredProductSelections();
  return { ok: true, products };
}

async function handleProductSelected(message: ProductSelectionMessage): Promise<void> {
  const products = await readStoredProductSelections();
  const nextProducts = upsertProduct(products, {
    id: message.payload.productId,
    name: message.payload.productName,
    imageUrl: message.payload.productImage,
    sourceUrl: message.payload.productUrl
  });

  await persistProductSelections(nextProducts);
  chrome.runtime.sendMessage<ProductSelectionsUpdatedMessage>({
    type: 'products:updated',
    payload: { products: nextProducts }
  });
  chrome.runtime.sendMessage<ProductCaptureFinishedMessage>({
    type: 'product:capture:finished',
    payload: { reason: 'completed' }
  });
}

async function readStoredProductSelections(): Promise<ProductMetadata[]> {
  return new Promise<ProductMetadata[]>((resolve) => {
    chrome.storage.local.get(PRODUCT_SELECTIONS_STORAGE_KEY, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.warn('Failed to read product selections', error);
        resolve([]);
        return;
      }

      const value = items[PRODUCT_SELECTIONS_STORAGE_KEY];
      resolve(Array.isArray(value) ? (value as ProductMetadata[]) : []);
    });
  });
}

async function persistProductSelections(products: ProductMetadata[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [PRODUCT_SELECTIONS_STORAGE_KEY]: products }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function upsertProduct(products: ProductMetadata[], incoming: ProductMetadata): ProductMetadata[] {
  const next = [...products];
  const existingIndex = next.findIndex((product) => product.id === incoming.id);

  if (existingIndex >= 0) {
    next.splice(existingIndex, 1, incoming);
  } else {
    next.unshift(incoming);
  }

  return next.slice(0, 12);
}

async function sendMessageToTab<TMessage extends { type: string }>(tabId: number, message: TMessage): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function sendMessageToTabWithResponse<TResponse>(
  tabId: number,
  message: { type: string }
): Promise<TResponse | undefined> {
  return new Promise<TResponse | undefined>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse | undefined) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

async function ensureContentScript(
  tabId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/product-selector.js']
    });
    return { ok: true };
  } catch (error) {
    console.warn('Failed to inject FitGenie content script', error);
    return buildCaptureErrorResponse(error);
  }
}

function buildCaptureErrorResponse(error: unknown): { ok: false; error: string } {
  const message = extractErrorMessage(error);

  if (message.includes('chrome-extension://') || message.includes('Cannot access a chrome:// URL')) {
    return {
      ok: false,
      error: 'FitGenie cannot run on this page type.'
    };
  }

  if (message.includes('Could not establish connection') || message.includes('Receiving end does not exist')) {
    return {
      ok: false,
      error: 'Reload the tab and try again so FitGenie can attach to this page.'
    };
  }

  if (message) {
    return { ok: false, error: message };
  }

  return {
    ok: false,
    error: 'Unable to activate capture on this page. Allow FitGenie for this site and try again.'
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ?? '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return '';
}
