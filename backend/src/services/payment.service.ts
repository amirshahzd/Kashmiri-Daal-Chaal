import Stripe from 'stripe';
import { query } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { getOrderById, updateOrderStatus } from './order.service';

const stripe = env.stripeSecretKey
  ? new Stripe(env.stripeSecretKey)
  : null;

export async function createPaymentIntent(orderId: string, method: string) {
  const order = await getOrderById(orderId);
  if (['cancelled', 'refunded'].includes(order.status)) {
    throw new AppError(400, 'ORDER_CLOSED', 'Cannot pay for closed order');
  }

  const amount = Number(order.total_amount);
  let providerRef: string | null = null;
  let clientSecret: string | null = null;

  if (method === 'stripe' || method === 'card' || method === 'apple_pay' || method === 'google_pay') {
    if (!stripe) {
      // Dev fallback — simulated intent
      providerRef = `sim_pi_${order.order_number}`;
      clientSecret = `sim_secret_${order.id}`;
    } else {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'pkr',
        metadata: { orderId: order.id, orderNumber: order.order_number },
        automatic_payment_methods: { enabled: true },
      });
      providerRef = intent.id;
      clientSecret = intent.client_secret;
    }
  } else if (method === 'paypal') {
    providerRef = `paypal_sim_${order.order_number}`;
    clientSecret = providerRef;
  } else if (method === 'square') {
    providerRef = `square_sim_${order.order_number}`;
    clientSecret = providerRef;
  } else if (method === 'cash') {
    providerRef = `cash_${order.order_number}`;
  } else {
    throw new AppError(400, 'PAYMENT_METHOD', 'Unsupported payment method');
  }

  const payment = await query(
    `INSERT INTO payments (order_id, amount, method, status, provider_ref)
     VALUES ($1, $2, $3::payment_method, 'pending', $4)
     RETURNING *`,
    [order.id, amount, method === 'card' ? 'card' : method, providerRef]
  );

  return {
    payment: payment.rows[0],
    clientSecret,
    publishableHint: 'Use Stripe/PayPal/Square test credentials in production',
  };
}

export async function confirmPayment(paymentId: string, providerPayload?: unknown) {
  const paymentRes = await query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
  if (!paymentRes.rowCount) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  const payment = paymentRes.rows[0];

  await query(
    `UPDATE payments SET status = 'succeeded', paid_at = NOW(), provider_payload = $2, updated_at = NOW()
     WHERE id = $1`,
    [paymentId, providerPayload ? JSON.stringify(providerPayload) : null]
  );

  await updateOrderStatus(payment.order_id, 'accepted', undefined, 'Payment confirmed');

  // Generate invoice
  const invNumber = `INV-${payment.order_id.slice(0, 8).toUpperCase()}`;
  await query(
    `INSERT INTO invoices (order_id, invoice_number)
     VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING`,
    [payment.order_id, invNumber]
  );

  return getOrderById(payment.order_id);
}

export async function refundPayment(paymentId: string, amount?: number, userId?: string) {
  const paymentRes = await query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
  if (!paymentRes.rowCount) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  const payment = paymentRes.rows[0];
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
    throw new AppError(400, 'REFUND_INVALID', 'Payment cannot be refunded');
  }

  const refundAmt = amount ?? Number(payment.amount) - Number(payment.refunded_amount);
  const newRefunded = Number(payment.refunded_amount) + refundAmt;
  const fully = newRefunded >= Number(payment.amount);

  if (stripe && String(payment.provider_ref).startsWith('pi_')) {
    await stripe.refunds.create({
      payment_intent: payment.provider_ref,
      amount: Math.round(refundAmt * 100),
    });
  }

  await query(
    `UPDATE payments SET refunded_amount = $2,
      status = $3::payment_status, updated_at = NOW() WHERE id = $1`,
    [paymentId, newRefunded, fully ? 'refunded' : 'partially_refunded']
  );

  if (fully) {
    await updateOrderStatus(payment.order_id, 'refunded', userId, `Refunded Rs ${refundAmt}`);
  }

  return { refunded: refundAmt, status: fully ? 'refunded' : 'partially_refunded' };
}
