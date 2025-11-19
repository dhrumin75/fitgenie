const HIGHLIGHT_OUTLINE = 'rgba(122, 92, 255, 0.9)';
const HIGHLIGHT_FILL = 'rgba(122, 92, 255, 0.18)';
const HIGHLIGHT_ID = '__fitgenie_capture_highlight';

type CaptureReason = 'completed' | 'cancelled' | 'error';

interface ProductAsset {
  readonly element: HTMLElement;
  readonly imageUrl: string;
  readonly altText?: string | null;
}

let captureActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let highlightAnimationFrame = 0;
let currentAsset: ProductAsset | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  switch (message.type) {
    case 'product:capture:start':
      try {
        activateCapture();
        sendResponse({ ok: true });
        return true; // Indicates we will send a response
      } catch (error) {
        console.error('Failed to activate capture', error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        return true;
      }
    default:
      return false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (captureActive && document.hidden) {
    deactivateCapture('cancelled');
  }
});

function activateCapture(): void {
  if (captureActive) {
    return;
  }

  if (!ensureHighlightOverlay()) {
    chrome.runtime.sendMessage({
      type: 'product:capture:finished',
      payload: { reason: 'error', message: 'Unable to inject capture overlay on this page.' }
    });
    return;
  }

  captureActive = true;
  currentAsset = null;

  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('mousemove', handlePointerMove, true);
  document.addEventListener('scroll', handleScroll, true);
  document.addEventListener('pointerdown', interceptPointerDown, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  chrome.runtime.sendMessage({ type: 'product:capture:activated' });
  renderToast('Hover an item and click to capture it.');
}

function ensureHighlightOverlay(): boolean {
  if (!document.body) {
    return false;
  }

  if (!highlightOverlay) {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = HIGHLIGHT_ID;
    highlightOverlay.style.position = 'fixed';
    highlightOverlay.style.pointerEvents = 'none';
    highlightOverlay.style.top = '0';
    highlightOverlay.style.left = '0';
    highlightOverlay.style.width = '0';
    highlightOverlay.style.height = '0';
    highlightOverlay.style.borderRadius = '18px';
    highlightOverlay.style.border = `2px solid ${HIGHLIGHT_OUTLINE}`;
    highlightOverlay.style.background = HIGHLIGHT_FILL;
    highlightOverlay.style.boxShadow = '0 0 0 9999px rgba(8, 11, 24, 0.35), 0 22px 40px rgba(10, 12, 28, 0.45)';
    highlightOverlay.style.transition =
      'opacity 0.12s ease-out, transform 0.08s ease-out, width 0.08s ease-out, height 0.08s ease-out';
    highlightOverlay.style.opacity = '0';
    highlightOverlay.style.zIndex = '2147483645';
  }

  if (!document.body.contains(highlightOverlay)) {
    document.body.appendChild(highlightOverlay);
  }

  return true;
}

function handlePointerMove(event: PointerEvent | MouseEvent): void {
  if (!captureActive) {
    return;
  }

  const elementUnderCursor = document.elementFromPoint(event.clientX, event.clientY);
  if (!elementUnderCursor) {
    setCurrentAsset(null);
    return;
  }

  const asset = resolveProductAsset(elementUnderCursor);
  setCurrentAsset(asset);
}

function handleScroll(): void {
  if (!captureActive) {
    return;
  }

  scheduleHighlight(currentAsset?.element ?? null);
}

function interceptPointerDown(event: PointerEvent): void {
  if (!captureActive) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleClick(event: MouseEvent): void {
  if (!captureActive) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const asset =
    currentAsset ?? (event.target instanceof Element ? resolveProductAsset(event.target) : null);

  if (!asset) {
    renderToast('FitGenie could not detect a product image there. Try another spot.');
    return;
  }

  // finalizeSelection is now async, but we don't need to await it
  finalizeSelection(asset).catch((error) => {
    console.error('[FitGenie] Error in finalizeSelection:', error);
  });
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!captureActive) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    deactivateCapture('cancelled', 'Capture cancelled.');
  }
}

async function finalizeSelection(asset: ProductAsset): Promise<void> {
  try {
    renderToast('Processing image...');
    
    // Convert image URL to data URL to avoid CORS issues
    const imageDataUrl = await convertImageToDataUrl(asset.imageUrl);
    
    const metadata = buildProductPayload(asset);
    // Replace the URL with the data URL
    metadata.productImage = imageDataUrl;

    chrome.runtime.sendMessage({
      type: 'product:selected',
      payload: metadata
    });

    renderToast(`Captured "${metadata.productName}"`);
    deactivateCapture('completed');
  } catch (error) {
    console.error('[FitGenie] Failed to process product image:', error);
    renderToast('Failed to capture image. Please try again.');
    deactivateCapture('error');
  }
}

function deactivateCapture(reason: CaptureReason, toastMessage?: string): void {
  if (!captureActive) {
    return;
  }

  captureActive = false;
  currentAsset = null;

  if (highlightAnimationFrame) {
    cancelAnimationFrame(highlightAnimationFrame);
    highlightAnimationFrame = 0;
  }

  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('mousemove', handlePointerMove, true);
  document.removeEventListener('scroll', handleScroll, true);
  document.removeEventListener('pointerdown', interceptPointerDown, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }

  chrome.runtime.sendMessage({
    type: 'product:capture:finished',
    payload: { reason, message: toastMessage }
  });

  if (toastMessage) {
    renderToast(toastMessage);
  }
}

function setCurrentAsset(asset: ProductAsset | null): void {
  currentAsset = asset;
  scheduleHighlight(asset?.element ?? null);
}

function scheduleHighlight(element: HTMLElement | null): void {
  if (!highlightOverlay) {
    return;
  }

  if (highlightAnimationFrame) {
    cancelAnimationFrame(highlightAnimationFrame);
  }

  highlightAnimationFrame = requestAnimationFrame(() => {
    highlightAnimationFrame = 0;
    paintHighlight(element);
  });
}

function paintHighlight(element: HTMLElement | null): void {
  if (!highlightOverlay) {
    return;
  }

  if (!element) {
    highlightOverlay.style.opacity = '0';
    return;
  }

  const rect = element.getBoundingClientRect();
  highlightOverlay.style.opacity = rect.width === 0 || rect.height === 0 ? '0' : '1';
  highlightOverlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  highlightOverlay.style.width = `${rect.width}px`;
  highlightOverlay.style.height = `${rect.height}px`;
}

function resolveProductAsset(start: Element): ProductAsset | null {
  let element: HTMLElement | null = start instanceof HTMLElement ? start : null;

  if (!element && 'closest' in start) {
    const closest = (start as Element).closest('img, picture, figure, [role="img"]');
    element = closest instanceof HTMLElement ? closest : null;
  }

  let depth = 0;
  const maxDepth = 8;

  while (element && depth < maxDepth) {
    const asset = extractProductAsset(element);
    if (asset) {
      return asset;
    }

    const nestedImage = element.querySelector('img');
    if (nestedImage instanceof HTMLImageElement) {
      const nestedAsset = extractProductAsset(nestedImage);
      if (nestedAsset) {
        return nestedAsset;
      }
    }

    element = element.parentElement;
    depth += 1;
  }

  return null;
}

function extractProductAsset(element: HTMLElement): ProductAsset | null {
  if (element instanceof HTMLImageElement) {
    const url = extractImageFromImg(element);
    if (url) {
      return {
        element,
        imageUrl: url,
        altText: element.alt || element.title
      };
    }
    return null;
  }

  const dataUrl = extractImageFromDataAttributes(element);
  if (dataUrl) {
    return {
      element,
      imageUrl: dataUrl,
      altText: element.getAttribute('aria-label') || element.getAttribute('data-alt')
    };
  }

  const backgroundUrl = extractImageFromBackground(element);
  if (backgroundUrl) {
    return {
      element,
      imageUrl: backgroundUrl,
      altText: element.getAttribute('aria-label') || element.getAttribute('title')
    };
  }

  return null;
}

function extractImageFromImg(image: HTMLImageElement): string | null {
  if (image.currentSrc) {
    return toAbsoluteUrl(image.currentSrc);
  }
  if (image.src) {
    return toAbsoluteUrl(image.src);
  }

  const srcset = image.getAttribute('srcset');
  if (srcset) {
    const candidate = parseSrcset(srcset);
    if (candidate) {
      return toAbsoluteUrl(candidate);
    }
  }

  return null;
}

function extractImageFromDataAttributes(element: HTMLElement): string | null {
  const datasetKeys = ['src', 'source', 'image', 'img', 'thumb', 'thumbnail', 'hero', 'fallback', 'original', 'href'];
  const dataset = element.dataset as Record<string, string | undefined>;

  for (const key of datasetKeys) {
    const value = dataset[key];
    if (typeof value === 'string' && value.trim()) {
      return toAbsoluteUrl(value.trim());
    }
  }

  const attributeKeys = [
    'data-src',
    'data-srcset',
    'data-original',
    'data-image',
    'data-thumbnail',
    'data-href',
    'data-full',
    'data-zoom-image',
    'data-asset'
  ];

  for (const key of attributeKeys) {
    const value = element.getAttribute(key);
    if (typeof value === 'string' && value.trim()) {
      if (key === 'data-srcset') {
        const candidate = parseSrcset(value);
        if (candidate) {
          return toAbsoluteUrl(candidate);
        }
      } else {
        return toAbsoluteUrl(value.trim());
      }
    }
  }

  return null;
}

function extractImageFromBackground(element: HTMLElement): string | null {
  const style = window.getComputedStyle(element);
  const background = style.backgroundImage;
  if (!background || background === 'none') {
    return null;
  }

  const match = background.match(/url\((['"]?)(.*?)\1\)/);
  if (!match || !match[2]) {
    return null;
  }

  const url = match[2].trim();
  if (!url || url.startsWith('linear-gradient')) {
    return null;
  }

  return toAbsoluteUrl(url);
}

function buildProductPayload(asset: ProductAsset): {
  productId: string;
  productName: string;
  productImage: string;
  productUrl: string;
} {
  const productName = inferProductName(asset) ?? document.title;
  const productAnchor = asset.element.closest('a, [role="link"], [data-href]');
  const anchorHref =
    productAnchor instanceof HTMLAnchorElement
      ? productAnchor.href
      : typeof productAnchor?.getAttribute === 'function'
        ? productAnchor.getAttribute('data-href') || productAnchor.getAttribute('href')
        : null;

  return {
    productId: hashString(`${asset.imageUrl}|${anchorHref ?? window.location.href}`),
    productName,
    productImage: asset.imageUrl,
    productUrl: toAbsoluteUrl(anchorHref ?? window.location.href)
  };
}

function inferProductName(asset: ProductAsset): string | null {
  const directName =
    asset.altText ||
    asset.element.getAttribute('aria-label') ||
    asset.element.getAttribute('title') ||
    asset.element.getAttribute('data-product-name') ||
    asset.element.dataset['productName'] ||
    asset.element.dataset['name'];

  if (directName?.trim()) {
    return directName.trim();
  }

  let node: HTMLElement | null = asset.element;
  const maxDepth = 6;
  let depth = 0;

  while (node && depth < maxDepth) {
    const labelledById = node.getAttribute('aria-labelledby');
    if (labelledById) {
      const labelElement = document.getElementById(labelledById);
      const labelText = labelElement?.textContent?.trim();
      if (labelText) {
        return labelText;
      }
    }

    const datasetName =
      node.getAttribute('data-product-name') ||
      node.getAttribute('data-name') ||
      node.getAttribute('data-title') ||
      node.getAttribute('data-description');

    if (datasetName?.trim()) {
      return datasetName.trim();
    }

    const heading = node.querySelector<HTMLElement>('h1, h2, h3, h4');
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim();
    }

    depth += 1;
    node = node.parentElement;
  }

  const metaOgTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  if (metaOgTitle?.trim()) {
    return metaOgTitle.trim();
  }

  return null;
}

function parseSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates.length ? candidates[0] : null;
}

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return url;
  }
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `product-${Math.abs(hash)}`;
}

async function convertImageToDataUrl(imageUrl: string): Promise<string> {
  // If it's already a data URL, return it
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  try {
    // Fetch the image using the page's context (bypasses CORS)
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to data URL'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[FitGenie] Error converting image to data URL:', error);
    throw error;
  }
}

function renderToast(message: string): void {
  if (!document.body) {
    return;
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.left = '50%';
  toast.style.bottom = '32px';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '12px 20px';
  toast.style.background = 'rgba(10, 14, 36, 0.92)';
  toast.style.color = '#fff';
  toast.style.borderRadius = '999px';
  toast.style.boxShadow = '0 18px 32px rgba(10, 10, 30, 0.45)';
  toast.style.zIndex = '2147483646';
  toast.style.fontFamily = 'system-ui, sans-serif';
  toast.style.fontSize = '14px';
  toast.style.pointerEvents = 'none';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.25s ease';

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener(
      'transitionend',
      () => {
        toast.remove();
      },
      { once: true }
    );
  }, 2200);
}

