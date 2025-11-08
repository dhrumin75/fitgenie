const PRODUCT_SELECTOR = 'img';

document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    if (!target.src) {
      return;
    }

    const activationModifier = event.metaKey || event.ctrlKey || event.altKey;
    if (!activationModifier) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const metadata = buildProductPayload(target);
    chrome.runtime.sendMessage({
      type: 'product:selected',
      payload: metadata
    });

    renderToast('FitGenie captured this item for your virtual try-on.');
  },
  { capture: true }
);

function buildProductPayload(image: HTMLImageElement): {
  productId: string;
  productName: string;
  productImage: string;
  productUrl: string;
} {
  const productName = image.alt?.trim() || inferProductNameFromDom(image) || document.title;
  return {
    productId: hashString(image.currentSrc || image.src),
    productName,
    productImage: image.currentSrc || image.src,
    productUrl: image.closest('a')?.href ?? window.location.href
  };
}

function inferProductNameFromDom(image: HTMLImageElement): string | null {
  let node: HTMLElement | null = image.parentElement;
  const limit = 5;
  let depth = 0;

  while (node && depth < limit) {
    const heading = node.querySelector('h1, h2, h3');
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim();
    }
    depth += 1;
    node = node.parentElement;
  }

  return null;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `product-${Math.abs(hash)}`;
}

function renderToast(message: string): void {
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
  toast.style.transition = 'opacity 0.3s ease';

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

