'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart, OrderType } from '@/lib/cart';
import { BRANCH, formatPKR, itemPrice } from '@/lib/data';
import {
  formatMobileDisplay,
  isValidPakistanMobile,
  mobileValidationMessage,
  normalizeMobileInput,
} from '@/lib/phone';
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  fetchDeliveryRadiusKm,
  measureDeliveryDistance,
  type DeliveryDistanceResult,
} from '@/lib/delivery-range';
import { PaymentTerminal, CardPayload } from '@/components/PaymentTerminal';
import { api } from '@/lib/api';
import { readAuthSession } from '@/lib/auth-session';

const TYPES_BASE: { id: OrderType; label: string; hint: string }[] = [
  { id: 'takeaway', label: 'Take Away', hint: 'Collect from Hall Road, Lahore' },
  { id: 'delivery', label: 'Delivery', hint: 'Within kitchen delivery radius' },
];

/** Cash on collection/delivery OR online — standard restaurant checkout mix */
type PaymentMethod = 'cash_collection' | 'jazzcash' | 'easypaisa' | 'card';

function paymentOptions(orderType: OrderType): {
  id: PaymentMethod;
  label: string;
  hint: string;
  group: 'cash' | 'online';
}[] {
  const cashLabel =
    orderType === 'delivery' ? 'Cash on delivery' : 'Cash on collection';
  const cashHint =
    orderType === 'delivery'
      ? 'Pay the rider when your order arrives'
      : 'Pay at the counter when you pick up';

  return [
    { id: 'cash_collection', label: cashLabel, hint: cashHint, group: 'cash' },
    {
      id: 'jazzcash',
      label: 'JazzCash',
      hint: 'Pay online via JazzCash wallet',
      group: 'online',
    },
    {
      id: 'easypaisa',
      label: 'EasyPaisa',
      hint: 'Pay online via EasyPaisa wallet',
      group: 'online',
    },
    {
      id: 'card',
      label: 'Debit / credit card',
      hint: 'Secure card payment',
      group: 'online',
    },
  ];
}

type DraftOrder = {
  id: string;
  status: string;
  paymentStatus: 'pending' | 'paid' | 'cod';
  orderType: OrderType;
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
  couponCode?: string;
  specialInstructions?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    specialInstructions?: string;
    imageUrl: string;
  }>;
  createdAt: string;
  payment: string;
  paymentRef?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress?: string;
  tableNumber?: string;
  restaurant: string;
  restaurantAddress: string;
  restaurantPhone: string;
  loyaltyPointsEarned?: number;
};

type LoyaltyInfo = {
  tierLabel: string;
  points: number;
  tierPercent: number;
  codes: Array<{ code: string; label: string; available: boolean }>;
  nextTierHint: string;
  earnRule: string;
};

export default function CheckoutPage() {
  const cart = useCart();
  const [payment, setPayment] = useState<PaymentMethod>('cash_collection');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCardTerminal, setShowCardTerminal] = useState(false);
  const [draft, setDraft] = useState<DraftOrder | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [distanceCheck, setDistanceCheck] = useState<DeliveryDistanceResult | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(DEFAULT_DELIVERY_RADIUS_KM);

  const phoneError = phoneTouched ? mobileValidationMessage(customerPhone) : null;
  const payments = paymentOptions(cart.orderType);
  const deliveryBlocked =
    cart.orderType === 'delivery' &&
    (distanceLoading || !distanceCheck?.withinRange);
  const types = TYPES_BASE.map((t) =>
    t.id === 'delivery'
      ? { ...t, hint: `Within ${deliveryRadiusKm} km of Hall Road` }
      : t
  );

  // Live admin-set radius for labels
  useEffect(() => {
    void fetchDeliveryRadiusKm().then(setDeliveryRadiusKm);
  }, []);

  // Eat-in removed from web checkout — map any saved eat_in cart to takeaway
  useEffect(() => {
    if (cart.orderType === 'eat_in') {
      cart.setOrderType('takeaway');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when orderType changes
  }, [cart.orderType]);

  // Measure distance from Hall Road kitchen when delivery address changes
  useEffect(() => {
    if (cart.orderType !== 'delivery') {
      setDistanceCheck(null);
      setDistanceLoading(false);
      return;
    }

    const addr = deliveryAddress.trim();
    if (addr.length < 8) {
      setDistanceCheck(null);
      setDistanceLoading(false);
      return;
    }

    const ac = new AbortController();
    setDistanceLoading(true);
    const timer = window.setTimeout(() => {
      void measureDeliveryDistance(addr, ac.signal).then((result) => {
        if (ac.signal.aborted) return;
        setDistanceCheck(result);
        setDistanceLoading(false);
      });
    }, 700);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [cart.orderType, deliveryAddress]);

  useEffect(() => {
    const session = readAuthSession();
    if (!session?.accessToken) {
      setProfileLoaded(true);
      return;
    }
    setSignedIn(true);
    void (async () => {
      try {
        const profile = await api<{
          first_name?: string;
          last_name?: string;
          phone?: string;
          email?: string;
          full_address?: string;
          address_line1?: string;
          city?: string;
          postcode?: string;
          country?: string;
          loyalty?: LoyaltyInfo;
        }>('/customers/me', { token: session.accessToken });

        const name = `${profile.first_name || session.user.firstName || ''} ${
          profile.last_name || session.user.lastName || ''
        }`.trim();
        if (name) setCustomerName(name);
        if (profile.phone) setCustomerPhone(normalizeMobileInput(profile.phone));
        if (profile.email) setCustomerEmail(profile.email);
        else if (session.user.email && !session.user.email.includes('@order.kashmiridaalchawal'))
          setCustomerEmail(session.user.email);
        const addr =
          profile.full_address ||
          [profile.address_line1, profile.city, profile.postcode, profile.country]
            .filter(Boolean)
            .join(', ');
        if (addr) setDeliveryAddress(addr);
        if (profile.loyalty) setLoyalty(profile.loyalty);
      } catch {
        const name = `${session.user.firstName} ${session.user.lastName}`.trim();
        if (name) setCustomerName(name);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  if (!cart.lines.length && !placing && !draft && !orderSuccess) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/menu" className="mt-4 inline-block text-crimson underline">
          Back to menu
        </Link>
      </div>
    );
  }

  function buildDraft(): DraftOrder | null {
    setPhoneTouched(true);
    const name = customerName.trim();
    if (!name) {
      setFormError('Full name is required and cannot be empty.');
      return null;
    }
    const phoneMsg = mobileValidationMessage(customerPhone);
    if (phoneMsg) {
      setFormError(phoneMsg);
      return null;
    }
    if (cart.orderType === 'delivery') {
      const addr = deliveryAddress.trim();
      if (!addr) {
        setFormError('Delivery address is required and cannot be empty.');
        return null;
      }
      if (addr.length < 8) {
        setFormError('Please enter a complete delivery address (street, area, city).');
        return null;
      }
      if (distanceLoading) {
        setFormError('Please wait while we check the delivery distance from our kitchen…');
        return null;
      }
      if (!distanceCheck?.withinRange) {
        setFormError(
          distanceCheck?.message ||
            `Delivery is only available within ${deliveryRadiusKm} km of our Hall Road kitchen.`
        );
        return null;
      }
    }

    const code = cart.couponCode.trim().toUpperCase();
    if (
      (code === 'LOYAL5' || code === 'LOYAL10') &&
      loyalty &&
      !loyalty.codes.find((c) => c.code === code)?.available
    ) {
      setFormError(`${code} is not available on your loyalty tier (${loyalty.tierLabel}).`);
      return null;
    }
    if ((code === 'REDEEM' || code === 'LOYALTY') && loyalty && loyalty.points < 50) {
      setFormError('You need at least 50 loyalty points to redeem.');
      return null;
    }

    setFormError('');
    const orderId = `KDC-${Date.now().toString().slice(-8)}`;
    const methodLabel = payments.find((p) => p.id === payment)?.label || payment;
    const isDelivery = cart.orderType === 'delivery';

    return {
      id: orderId,
      status: 'pending_payment',
      paymentStatus: 'pending',
      orderType: cart.orderType === 'eat_in' ? 'takeaway' : cart.orderType,
      subtotal: cart.subtotal(),
      discount: cart.discount(),
      tax: cart.tax(),
      deliveryFee: cart.deliveryFee(),
      total: cart.total(),
      couponCode: cart.couponCode || undefined,
      specialInstructions: cart.specialInstructions || undefined,
      items: cart.lines.map((l) => ({
        name: l.item.name,
        quantity: l.quantity,
        unitPrice: itemPrice(l.item),
        lineTotal: itemPrice(l.item) * l.quantity,
        specialInstructions: l.specialInstructions,
        imageUrl: l.item.imageUrl,
      })),
      createdAt: new Date().toISOString(),
      payment: methodLabel,
      customerName: name,
      customerPhone: normalizeMobileInput(customerPhone),
      customerEmail: customerEmail.trim() || undefined,
      deliveryAddress: isDelivery ? deliveryAddress.trim() : deliveryAddress.trim() || undefined,
      tableNumber: undefined,
      restaurant: BRANCH.name,
      restaurantAddress: BRANCH.address,
      restaurantPhone: BRANCH.phone,
    };
  }

  function startPaymentFlow() {
    const next = buildDraft();
    if (!next) return;
    setDraft(next);
    if (payment === 'card') {
      setShowCardTerminal(true);
      return;
    }
    // Cash on collection/delivery: place order and go straight to confirmation
    if (payment === 'cash_collection') {
      void finalizeOrder({
        ...next,
        status: 'received',
        paymentStatus: 'cod',
        paymentRef: `COLLECT-${next.id}`,
      });
      return;
    }
    setShowConfirm(true);
  }

  async function finalizeOrder(order: DraftOrder) {
    setPlacing(true);
    setShowConfirm(false);
    setShowCardTerminal(false);

    const session = readAuthSession();
    let saved = order;

    // Always persist order contact into customers database for admin future use
    try {
      await api('/customers/from-order', {
        method: 'POST',
        body: JSON.stringify({
          fullName: order.customerName,
          phone: order.customerPhone,
          email: order.customerEmail || undefined,
          address: order.deliveryAddress || undefined,
          // purchase totals for signed-in path come from placeStorefrontOrder
          orderTotal: session?.accessToken ? undefined : order.total,
        }),
      });
    } catch {
      /* offline — still complete order */
    }

    if (session?.accessToken) {
      try {
        const code = (order.couponCode || '').toUpperCase();
        const redeem =
          code === 'REDEEM' || code === 'LOYALTY'
            ? cart.loyaltyRedeemPoints || loyalty?.points || 0
            : code === 'REDEEM100'
              ? 100
              : 0;
        const result = await api<{
          order: DraftOrder & { loyaltyPointsEarned?: number };
          loyalty?: LoyaltyInfo;
        }>('/customers/me/orders', {
          method: 'POST',
          token: session.accessToken,
          body: JSON.stringify({
            order,
            redeemPoints: redeem,
            saveProfile: true,
          }),
        });
        saved = {
          ...order,
          ...result.order,
          loyaltyPointsEarned: result.order.loyaltyPointsEarned,
        };
        if (result.loyalty) setLoyalty(result.loyalty);
      } catch {
        /* keep local copy */
      }
    }

    localStorage.setItem('kdc-last-order', JSON.stringify(saved));
    const history = JSON.parse(localStorage.getItem('kdc-orders') || '[]') as DraftOrder[];
    history.unshift(saved);
    localStorage.setItem('kdc-orders', JSON.stringify(history.slice(0, 30)));
    cart.clear();
    try {
      window.dispatchEvent(new Event('kdc-orders-change'));
      // Notify manager/admin stations of new online order
      const { notifyOrderPlaced } = await import('@/lib/order-workflow');
      notifyOrderPlaced(saved as Parameters<typeof notifyOrderPlaced>[0]);
    } catch {
      /* ignore */
    }

    const isDelivery = saved.orderType === 'delivery';
    const successMsg = isDelivery
      ? 'Your delivery order has been placed successfully.'
      : 'Your order has been placed successfully.';
    setOrderSuccess(successMsg);

    // Logged-in → account home; guest → site home (not track or other pages)
    const dest = session?.accessToken ? '/account?placed=1' : '/?placed=1';
    window.setTimeout(() => {
      window.location.assign(dest);
    }, 1800);
  }

  function confirmOfflinePayment() {
    if (!draft) return;
    const isCash = payment === 'cash_collection';
    const paid: DraftOrder = {
      ...draft,
      status: 'received',
      paymentStatus: isCash ? 'cod' : 'paid',
      paymentRef: isCash
        ? `COLLECT-${draft.id}`
        : `${payment.toUpperCase()}-CONFIRMED-${Date.now().toString().slice(-6)}`,
    };
    void finalizeOrder(paid);
  }

  function onCardPaid(card: CardPayload) {
    if (!draft) return;
    const paid: DraftOrder = {
      ...draft,
      status: 'received',
      paymentStatus: 'paid',
      payment: `Bank card (${card.brand} ••${card.last4})`,
      paymentRef: `CARD-${card.brand.toUpperCase()}-${card.last4}-${Date.now().toString().slice(-6)}`,
    };
    void finalizeOrder(paid);
  }

  function applyLoyaltyCode(code: string) {
    cart.setCoupon(code);
    if (code === 'REDEEM' && loyalty) {
      cart.setLoyaltyRedeemPoints(Math.min(loyalty.points, Math.floor(cart.subtotal() * 0.3)));
    }
  }

  const confirmCopy = (() => {
    if (!draft) return { title: '', body: '', cta: 'Place order' };
    const amount = formatPKR(draft.total);
    const ref = draft.id;
    const when =
      draft.orderType === 'delivery'
        ? 'on delivery to your address'
        : `when you collect at ${BRANCH.address}`;

    if (payment === 'cash_collection') {
      return {
        title: draft.orderType === 'delivery' ? 'Confirm cash on delivery' : 'Confirm cash on collection',
        body: `You will pay ${amount} in cash ${when}. Please bring exact change where possible. Your order reference is ${ref}. Kitchen will prepare your order after you confirm.`,
        cta: 'Confirm & place order',
      };
    }
    if (payment === 'jazzcash') {
      return {
        title: 'Complete JazzCash payment',
        body: `Transfer ${amount} to JazzCash account ${BRANCH.phone} (or scan at the counter). Use order number ${ref} as the payment reference. After payment, tap below to place your order — our team will verify the transaction.`,
        cta: 'I have paid — place order',
      };
    }
    if (payment === 'easypaisa') {
      return {
        title: 'Complete EasyPaisa payment',
        body: `Transfer ${amount} to EasyPaisa account ${BRANCH.phone}. Use order number ${ref} as the payment reference. After payment, tap below to place your order — our team will verify the transaction.`,
        cta: 'I have paid — place order',
      };
    }
    return {
      title: 'Confirm payment',
      body: `Please complete payment of ${amount} before placing your order. Reference: ${ref}.`,
      cta: 'Place order',
    };
  })();

  const primaryCta =
    payment === 'card'
      ? 'Pay by card'
      : payment === 'cash_collection'
        ? 'Proceed order'
        : 'Continue to payment';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Checkout</h1>
      <p className="mt-2 text-muted">
        Take away from {BRANCH.address}, or delivery within {deliveryRadiusKm} km of our kitchen.
        Choose cash on collection or pay online before your order is confirmed.
      </p>

      {signedIn && profileLoaded && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
          Details filled from your account. Change them if needed — we save updates for next time.
          {loyalty && (
            <span className="mt-1 block text-muted">
              Loyalty: <strong className="text-crimson">{loyalty.tierLabel}</strong> · {loyalty.points}{' '}
              pts · {loyalty.earnRule}
            </span>
          )}
        </div>
      )}

      {!signedIn && (
        <p className="mt-4 text-sm text-muted">
          <Link href="/account?mode=login" className="text-crimson underline">
            Sign in
          </Link>{' '}
          to save your details, earn loyalty points, and see order history.
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => cart.setOrderType(t.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              cart.orderType === t.id
                ? 'border-crimson bg-crimson/5 ring-2 ring-crimson'
                : 'border-[var(--kdc-border)]'
            }`}
          >
            <p className="font-semibold">{t.label}</p>
            <p className="mt-1 text-xs text-muted">{t.hint}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">
            Full name <span className="text-crimson">*</span>
          </label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Your name"
            required
            aria-required="true"
            autoComplete="name"
            className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            Contact number <span className="text-crimson">*</span>
          </label>
          <input
            value={formatMobileDisplay(customerPhone)}
            onChange={(e) => {
              setCustomerPhone(normalizeMobileInput(e.target.value));
              setPhoneTouched(true);
            }}
            onBlur={() => setPhoneTouched(true)}
            inputMode="numeric"
            maxLength={13}
            placeholder="03XX XXX XXXX"
            required
            aria-required="true"
            autoComplete="tel"
            className={`mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson ${
              phoneError ? 'border-crimson' : 'border-[var(--kdc-border)]'
            }`}
          />
          <p className={`mt-1 text-xs ${phoneError ? 'text-crimson' : 'text-muted'}`}>
            {phoneError ||
              (isValidPakistanMobile(customerPhone)
                ? 'Valid 11-digit Pakistani mobile'
                : 'Exactly 11 digits, starting with 03 (e.g. 03001234567)')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Email (optional)</label>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
          />
        </div>
      </div>

      {cart.orderType === 'delivery' ? (
        <div className="mt-4">
          <label className="text-sm font-medium">
            Delivery address <span className="text-crimson">*</span>
          </label>
          <p className="mt-1 text-xs text-muted">
            Required. We measure distance from our kitchen at {BRANCH.address}. Delivery is available
            up to {deliveryRadiusKm} km away.
          </p>
          <textarea
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            rows={2}
            placeholder="Full street / area address in Lahore"
            className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
            required
            aria-required="true"
            autoComplete="street-address"
          />
          {distanceLoading && (
            <p className="mt-2 rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm text-muted">
              Measuring travel distance from our Hall Road kitchen…
            </p>
          )}
          {!distanceLoading && distanceCheck && (
            <p
              className={`mt-2 rounded-xl border px-3 py-2 text-sm ${
                distanceCheck.withinRange
                  ? 'border-emerald-300/80 bg-emerald-50 text-emerald-900'
                  : 'border-crimson/40 bg-crimson/10 text-crimson'
              }`}
              role="status"
            >
              {!distanceCheck.withinRange && (
                <span className="mb-1 block font-semibold">Delivery out of reach</span>
              )}
              {distanceCheck.message}
              {distanceCheck.withinRange && distanceCheck.km != null && (
                <span className="mt-1 block text-xs opacity-80">
                  Estimated distance: {distanceCheck.km} km
                </span>
              )}
            </p>
          )}
        </div>
      ) : (
        <textarea
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          rows={2}
          placeholder="Home address (optional — saved for future delivery orders)"
          className="mt-4 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
        />
      )}

      <div className="mt-6">
        <label className="text-sm font-medium">Coupon / loyalty code</label>
        <input
          value={cart.couponCode}
          onChange={(e) => cart.setCoupon(e.target.value)}
          placeholder="WELCOME10, BIRYANI200, LOYAL5, LOYAL10, REDEEM"
          className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
        />
        {loyalty && (
          <div className="mt-2 flex flex-wrap gap-2">
            {loyalty.codes
              .filter((c) => c.available)
              .map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => applyLoyaltyCode(c.code)}
                  className="rounded-full border border-crimson/30 bg-crimson/5 px-3 py-1 text-xs text-crimson"
                >
                  {c.code}
                </button>
              ))}
          </div>
        )}
        {(cart.couponCode.toUpperCase() === 'REDEEM' || cart.couponCode.toUpperCase() === 'LOYALTY') &&
          loyalty && (
            <label className="mt-3 block text-xs text-muted">
              Points to redeem (max {Math.min(loyalty.points, Math.floor(cart.subtotal() * 0.3))})
              <input
                type="number"
                min={50}
                max={loyalty.points}
                value={cart.loyaltyRedeemPoints || Math.min(loyalty.points, 100)}
                onChange={(e) => cart.setLoyaltyRedeemPoints(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm"
              />
            </label>
          )}
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium">Order notes</label>
        <textarea
          value={cart.specialInstructions}
          onChange={(e) => cart.setInstructions(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-crimson"
          placeholder="Allergies, spice level, leave at gate…"
        />
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium">Payment method</p>
        <p className="mt-1 text-xs text-muted">
          Pay when you collect (or on delivery), or pay online now — same options used by major
          food-ordering apps.
        </p>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          Pay later
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {payments
            .filter((p) => p.group === 'cash')
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPayment(p.id)}
                className={`rounded-2xl border p-4 text-left ${
                  payment === p.id
                    ? 'border-crimson bg-crimson/5 ring-2 ring-crimson'
                    : 'border-[var(--kdc-border)]'
                }`}
              >
                <p className="font-semibold">{p.label}</p>
                <p className="mt-1 text-xs text-muted">{p.hint}</p>
              </button>
            ))}
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          Pay online
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {payments
            .filter((p) => p.group === 'online')
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPayment(p.id)}
                className={`rounded-2xl border p-4 text-left ${
                  payment === p.id
                    ? 'border-crimson bg-crimson/5 ring-2 ring-crimson'
                    : 'border-[var(--kdc-border)]'
                }`}
              >
                <p className="font-semibold">{p.label}</p>
                <p className="mt-1 text-xs text-muted">{p.hint}</p>
              </button>
            ))}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--kdc-border)] bg-surface p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPKR(cart.subtotal())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Discount</dt>
            <dd>-{formatPKR(cart.discount())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sales tax (5%)</dt>
            <dd>{formatPKR(cart.tax())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>{formatPKR(cart.deliveryFee())}</dd>
          </div>
          <div className="flex justify-between border-t border-[var(--kdc-border)] pt-3 text-lg font-semibold">
            <dt>Total due</dt>
            <dd className="text-crimson">{formatPKR(cart.total())}</dd>
          </div>
        </dl>

        {formError && (
          <p className="mt-4 rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson">{formError}</p>
        )}

        <button
          type="button"
          disabled={placing || deliveryBlocked}
          onClick={startPaymentFlow}
          className="kdc-button kdc-button-gold mt-5 w-full disabled:opacity-60"
        >
          {cart.orderType === 'delivery' && distanceLoading
            ? 'Checking delivery range…'
            : cart.orderType === 'delivery' && distanceCheck && !distanceCheck.withinRange
              ? 'Delivery not available for this address'
              : primaryCta}
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          You will see a clear payment confirmation for your chosen method before the order is
          placed.
          {signedIn
            ? ' Points and profile are saved to your account for the kitchen/admin team.'
            : ''}
        </p>
      </div>

      {orderSuccess && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Order placed"
        >
          <div className="w-full max-w-md rounded-2xl border border-green-700/30 bg-surface p-6 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Success</p>
            <p className="mt-3 text-lg font-semibold text-ink">{orderSuccess}</p>
            <p className="mt-2 text-sm text-muted">Redirecting you now…</p>
          </div>
        </div>
      )}

      {showConfirm && draft && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Payment confirmation
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-ink">
              {confirmCopy.title}
            </h2>
            <p className="mt-3 text-sm text-muted">{confirmCopy.body}</p>
            <dl className="mt-4 space-y-1 rounded-xl border border-[var(--kdc-border)] p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Order type</dt>
                <dd className="capitalize">
                  {draft.orderType === 'takeaway' ? 'Take away' : 'Delivery'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Payment</dt>
                <dd>{draft.payment}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Customer</dt>
                <dd>{draft.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Mobile</dt>
                <dd>{formatMobileDisplay(draft.customerPhone)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Order no.</dt>
                <dd className="font-mono text-xs">{draft.id}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Amount</dt>
                <dd className="text-crimson">{formatPKR(draft.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              By placing this order you agree that payment details above are correct. False payment
              claims may delay or cancel your order.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setDraft(null);
                }}
                className="flex-1 rounded-xl border border-[var(--kdc-border)] px-4 py-3 text-sm"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={confirmOfflinePayment}
                className="kdc-button kdc-button-primary flex-[1.3]"
              >
                {confirmCopy.cta}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCardTerminal && draft && (
        <PaymentTerminal
          amount={draft.total}
          orderRef={draft.id}
          onCancel={() => {
            setShowCardTerminal(false);
            setDraft(null);
          }}
          onPaid={onCardPaid}
        />
      )}
    </div>
  );
}

