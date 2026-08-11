'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Short single-line action labels only (no descriptions). */
function actionTipForButton(label: string): string {
  const t = label.replace(/\s+/g, ' ').trim();
  if (!t) return 'Action';

  if (/^add$/i.test(t)) return 'Add';
  if (/add to cart/i.test(t)) return 'Add to cart';
  if (/proceed order/i.test(t)) return 'Proceed order';
  if (/checkout/i.test(t)) return 'Checkout';
  if (/track your order/i.test(t)) return 'Track order';
  if (/track/i.test(t)) return 'Track';
  if (/logout|sign out/i.test(t)) return 'Logout';
  if (/sign in|sign up/i.test(t)) return 'Sign in';
  if (/print/i.test(t)) return 'Print';
  if (/^back$/i.test(t) || /^← back/i.test(t)) return 'Back';
  if (/^home$/i.test(t)) return 'Home';
  if (/order now/i.test(t)) return 'Order';
  if (/view menu|full menu|open full/i.test(t)) return 'Menu';
  if (/order again/i.test(t)) return 'Order again';
  if (/close/i.test(t)) return 'Close';
  if (/save/i.test(t)) return 'Save';
  if (/delete/i.test(t)) return 'Delete';
  if (/edit|amend/i.test(t)) return 'Edit';
  if (/submit|create account/i.test(t)) return 'Submit';
  if (/send reset/i.test(t)) return 'Reset password';
  if (/pay by card|pay now/i.test(t)) return 'Pay';
  if (/place order|confirm/i.test(t)) return 'Confirm';
  if (/go back/i.test(t)) return 'Back';
  if (/remove/i.test(t)) return 'Remove';

  // Single short word / phrase — max ~3 words for auto tips
  const words = t.split(' ').filter(Boolean);
  if (words.length <= 3 && t.length <= 24) return t;
  return words.slice(0, 2).join(' ');
}

function actionTipForLink(href: string, label: string): string {
  const t = label.replace(/\s+/g, ' ').trim();
  if (href.startsWith('mailto:')) return 'Email';
  if (href.startsWith('tel:')) return 'Call';
  if (href.startsWith('http') || href.startsWith('//')) return 'Open';

  if (href === '/' || href === '') return 'Home';
  if (href.startsWith('/menu/') || /^\/menu\/.+/.test(href)) return 'View';
  if (href === '/menu' || href.startsWith('/menu?')) return 'Menu';
  if (href.startsWith('/order')) return 'Order';
  if (href.startsWith('/cart')) return 'Cart';
  if (href.startsWith('/checkout')) return 'Checkout';
  if (href.startsWith('/account')) return 'Account';
  if (href.startsWith('/admin')) return 'Admin';
  if (href.startsWith('/track')) return 'Track';
  if (href.startsWith('/receipt')) return 'Receipt';
  if (href.startsWith('/driver')) return 'Driver';

  if (t && t.length <= 18) return t;
  if (t) return actionTipForButton(t);
  return 'Open';
}

/**
 * Short single-line action tooltips on links and buttons.
 */
export function NavTooltips() {
  const pathname = usePathname();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function inferTooltip(el: Element): string | null {
      if (!(el instanceof HTMLElement)) return null;
      if (el.hasAttribute('data-no-tooltip')) return null;
      if (el.closest('[data-no-tooltip]')) return null;

      // Explicit developer tip — use as-is (should already be short)
      if (el.hasAttribute('data-tooltip') && el.getAttribute('data-tooltip-auto') !== '1') {
        return null;
      }

      const aria = el.getAttribute('aria-label')?.trim();
      if (aria) {
        // Reduce long aria labels to action verbs only
        if (/previous page|go back/i.test(aria)) return 'Back';
        if (/home page|go to home/i.test(aria)) return 'Home';
        if (/cart/i.test(aria)) return 'Cart';
        if (/dark mode|light mode/i.test(aria)) return aria.includes('light') ? 'Light mode' : 'Dark mode';
        if (/open menu|close menu|navigation menu/i.test(aria)) {
          return /close/i.test(aria) ? 'Close' : 'Menu';
        }
        if (aria.length <= 18) return aria;
        return actionTipForButton(aria);
      }

      if (el instanceof HTMLAnchorElement) {
        const href = el.getAttribute('href') || '';
        const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return actionTipForLink(href, label);
      }

      if (
        el instanceof HTMLButtonElement ||
        el.getAttribute('role') === 'button' ||
        (el instanceof HTMLInputElement &&
          (el.type === 'submit' || el.type === 'button'))
      ) {
        const label =
          el instanceof HTMLInputElement
            ? (el.value || el.getAttribute('aria-label') || '').trim()
            : (el.textContent || '').replace(/\s+/g, ' ').trim();
        return actionTipForButton(label || 'Action');
      }

      return null;
    }

    function applyTooltips() {
      const nodes = document.querySelectorAll(
        'a[href], button, [role="button"], input[type="submit"], input[type="button"]'
      );
      nodes.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (el.hasAttribute('data-no-tooltip')) return;
        if (el.dataset.tooltipLocked === '1') return;

        if (el.hasAttribute('data-tooltip') && el.getAttribute('data-tooltip-auto') !== '1') {
          // Keep explicit short tip; enforce single-line via CSS
          el.dataset.tooltipLocked = '1';
          const tip = el.getAttribute('data-tooltip')?.trim();
          if (tip) el.setAttribute('title', tip);
          return;
        }

        const tip = inferTooltip(el);
        if (tip) {
          el.setAttribute('data-tooltip', tip);
          el.setAttribute('data-tooltip-auto', '1');
          el.setAttribute('title', tip);
        }
      });
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyTooltips, 80);
    }

    applyTooltips();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      mo.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
