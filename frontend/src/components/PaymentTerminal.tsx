'use client';

import { useMemo, useState } from 'react';
import { formatPKR } from '@/lib/data';
import { Lock, CreditCard, CheckCircle2 } from 'lucide-react';

export type CardPayload = {
  brand: string;
  last4: string;
  holderName: string;
};

type Props = {
  amount: number;
  orderRef: string;
  onCancel: () => void;
  onPaid: (card: CardPayload) => void;
};

function detectBrand(number: string): string {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  return 'Card';
}

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function PaymentTerminal({ amount, orderRef, onCancel, onPaid }: Props) {
  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'form' | 'processing' | 'approved'>('form');

  const brand = useMemo(() => detectBrand(cardNumber), [cardNumber]);

  function formatCardNumber(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  function formatExpiry(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function validate(): string | null {
    const number = cardNumber.replace(/\s/g, '');
    if (!holderName.trim() || holderName.trim().length < 3) return 'Enter the name on the card';
    if (!luhnCheck(number)) return 'Enter a valid card number';
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return 'Enter expiry as MM/YY';
    const [mm, yy] = expiry.split('/').map(Number);
    if (mm < 1 || mm > 12) return 'Invalid expiry month';
    const now = new Date();
    const exp = new Date(2000 + yy, mm);
    if (exp <= now) return 'Card has expired';
    if (!/^\d{3,4}$/.test(cvv)) return 'Enter a valid CVV';
    return null;
  }

  async function pay() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    setProcessing(true);
    setStage('processing');

    // Simulated secure terminal / acquiring network round-trip
    await new Promise((r) => setTimeout(r, 1800));

    const number = cardNumber.replace(/\s/g, '');
    setStage('approved');
    await new Promise((r) => setTimeout(r, 900));

    onPaid({
      brand,
      last4: number.slice(-4),
      holderName: holderName.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-terminal-title"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-[#0f1a24] text-white shadow-2xl"
      >
        <div className="border-b border-white/10 bg-[#152433] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/90">
                Secure card terminal
              </p>
              <h2 id="payment-terminal-title" className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <CreditCard size={18} /> Bank card payment
              </h2>
            </div>
            <Lock size={16} className="text-emerald-300" />
          </div>
          <p className="mt-2 text-xs text-white/60">
            Order {orderRef} · Amount due{' '}
            <span className="font-semibold text-emerald-300">{formatPKR(amount)}</span>
          </p>
        </div>

        {stage === 'processing' && (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
            <p className="mt-4 text-sm text-white/80">Contacting payment network…</p>
            <p className="mt-1 text-xs text-white/50">Do not close this window</p>
          </div>
        )}

        {stage === 'approved' && (
          <div className="px-5 py-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-400" size={42} />
            <p className="mt-3 text-lg font-semibold text-emerald-300">Payment approved</p>
            <p className="mt-1 text-xs text-white/60">Confirming order…</p>
          </div>
        )}

        {stage === 'form' && (
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1c3448] to-[#12202c] p-4">
              <p className="text-[10px] uppercase tracking-wider text-white/50">{brand}</p>
              <p className="mt-3 font-mono text-lg tracking-widest">
                {cardNumber || '•••• •••• •••• ••••'}
              </p>
              <div className="mt-4 flex justify-between text-xs text-white/70">
                <span>{holderName || 'CARDHOLDER NAME'}</span>
                <span>{expiry || 'MM/YY'}</span>
              </div>
            </div>

            <label className="block text-xs text-white/70">
              Name on card
              <input
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                autoComplete="cc-name"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
                placeholder="As printed on card"
              />
            </label>

            <label className="block text-xs text-white/70">
              Card number
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                inputMode="numeric"
                autoComplete="cc-number"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-emerald-400"
                placeholder="4242 4242 4242 4242"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-white/70">
                Expiry
                <input
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-emerald-400"
                  placeholder="MM/YY"
                />
              </label>
              <label className="block text-xs text-white/70">
                CVV
                <input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  type="password"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-emerald-400"
                  placeholder="123"
                />
              </label>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <p className="text-[11px] leading-relaxed text-white/45">
              Demo terminal — use test card <span className="font-mono text-white/70">4242 4242 4242 4242</span>,
              any future expiry, any 3-digit CVV. Card data is not sent to a live bank in this demo.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={processing}
                className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm text-white/80 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pay}
                disabled={processing}
                className="flex-[1.4] rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#0b1620] hover:bg-emerald-400 disabled:opacity-60"
              >
                Pay {formatPKR(amount)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
