'use client';

import {
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Banknote, Pencil, Printer, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPKR } from '@/lib/data';
import {
  calcEmployeeWeekWage,
  getPaymentForEmployee,
  getWeekAdvances,
  listPaymentsForWeek,
  mapAttendanceToEmployee,
  mondayOfOffset,
  previousWeekOptions,
  recordEmployeePayment,
  setEmployeeAdvance,
  toDateKey,
  weekLabel,
  type EmployeePayment,
  type WageRow,
} from '@/lib/payroll';

type Props = {
  onOpenAttendance?: () => void;
};

type HrEmployee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  address?: string;
  photo_url?: string;
  department_name?: string;
  role_title?: string;
  hourly_rate?: number | string;
};

type AmendForm = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  address: string;
  photoUrl: string;
  departmentName: string;
  roleTitle: string;
  hourlyRate: string;
};

function formatPaidAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function PayrollPanel({ onOpenAttendance }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [wages, setWages] = useState<WageRow[]>([]);
  const [advances, setAdvances] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [storageHint, setStorageHint] = useState('');
  const [payTarget, setPayTarget] = useState<WageRow | null>(null);
  const [viewPayment, setViewPayment] = useState<EmployeePayment | null>(null);
  const [notes, setNotes] = useState('');
  const [payError, setPayError] = useState('');
  const [profiles, setProfiles] = useState<HrEmployee[]>([]);
  const [amendForm, setAmendForm] = useState<AmendForm | null>(null);
  const [amending, setAmending] = useState(false);
  const [amendError, setAmendError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const weekStart = useMemo(() => toDateKey(mondayOfOffset(weekOffset)), [weekOffset]);
  const prevWeekChoices = useMemo(() => previousWeekOptions(12), []);

  const refreshPayments = useCallback(() => {
    setPayments(listPaymentsForWeek(weekStart));
  }, [weekStart]);

  const loadPayroll = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const data = await api<{
        employees: HrEmployee[];
        attendance: Array<{
          employee_id: string;
          work_date: string;
          mark?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
        }>;
        storage?: string;
      }>(`/hr/attendance/week?weekStart=${weekStart}`);

      const advanceMap = getWeekAdvances(weekStart);
      setAdvances(advanceMap);
      setProfiles(data.employees);

      const rows = data.employees.map((e) =>
        mapAttendanceToEmployee(e, data.attendance, weekStart)
      );
      const calculated = rows.map((r) => calcEmployeeWeekWage(r, advanceMap[r.id] || 0));
      setWages(calculated);
      setPayments(listPaymentsForWeek(weekStart));
      setStorageHint(
        data.storage === 'file'
          ? 'From attendance store (Postgres offline)'
          : 'From attendance database'
      );
      setStatus(
        calculated.some((w) => w.weeklyHours > 0)
          ? 'Net = weekly hours × rate − advance. Use Payment made when wages are paid.'
          : 'No present hours this week yet — mark attendance first.'
      );
    } catch (err) {
      setWages([]);
      setProfiles([]);
      setStatus(err instanceof Error ? err.message : 'Failed to load payroll');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadPayroll();
  }, [loadPayroll]);

  function updateAdvance(employeeId: string, value: string) {
    const amount = Math.max(0, Number(value) || 0);
    setEmployeeAdvance(weekStart, employeeId, amount);
    const next = getWeekAdvances(weekStart);
    setAdvances(next);
    setWages((prev) =>
      prev.map((w) =>
        w.id === employeeId
          ? {
              ...w,
              advance: amount,
              net: Number(Math.max(0, w.gross - amount).toFixed(2)),
            }
          : w
      )
    );
  }

  const totals = useMemo(
    () =>
      wages.reduce(
        (acc, w) => ({
          hours: acc.hours + w.weeklyHours,
          advance: acc.advance + w.advance,
          net: acc.net + w.net,
          paid: acc.paid + (payments.find((p) => p.employeeId === w.id)?.amount || 0),
        }),
        { hours: 0, advance: 0, net: 0, paid: 0 }
      ),
    [wages, payments]
  );

  function paymentFor(employeeId: string) {
    return payments.find((p) => p.employeeId === employeeId);
  }

  function openAmend(employeeId: string) {
    const p = profiles.find((e) => e.id === employeeId);
    if (!p) {
      setStatus('Employee profile not found. Recalculate and try again.');
      return;
    }
    setAmendError('');
    setAmendForm({
      id: p.id,
      employeeCode: p.employee_code || '',
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      address: p.address || '',
      photoUrl: p.photo_url || '',
      departmentName: p.department_name || '',
      roleTitle: p.role_title || '',
      hourlyRate: String(Number(p.hourly_rate ?? 300) || 300),
    });
  }

  async function submitAmend(e: FormEvent) {
    e.preventDefault();
    if (!amendForm) return;
    const rate = Number(amendForm.hourlyRate);
    if (!(rate > 0)) {
      setAmendError('Hourly rate must be greater than 0.');
      return;
    }
    if (!amendForm.firstName.trim() || !amendForm.lastName.trim()) {
      setAmendError('First and last name are required.');
      return;
    }
    if (!amendForm.employeeCode.trim()) {
      setAmendError('Employee ID / code is required.');
      return;
    }
    setAmending(true);
    setAmendError('');
    try {
      await api(`/hr/employees/${amendForm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          employeeCode: amendForm.employeeCode.trim(),
          firstName: amendForm.firstName.trim(),
          lastName: amendForm.lastName.trim(),
          address: amendForm.address.trim(),
          photoUrl: amendForm.photoUrl.trim() || '',
          departmentName: amendForm.departmentName.trim() || 'General',
          roleTitle: amendForm.roleTitle.trim() || 'Staff',
          hourlyRate: rate,
        }),
      });
      setAmendForm(null);
      setStatus(
        `Updated ${amendForm.firstName} ${amendForm.lastName} — pay rate ${formatPKR(rate)}/hr.`
      );
      await loadPayroll();
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Could not save employee changes');
    } finally {
      setAmending(false);
    }
  }

  function openPayModal(w: WageRow) {
    const existing = getPaymentForEmployee(weekStart, w.id);
    if (existing) {
      setViewPayment(existing);
      return;
    }
    setPayTarget(w);
    setNotes('');
    setPayError('');
    // clear canvas after mount
    requestAnimationFrame(() => clearSignature());
  }

  function getCanvas() {
    return canvasRef.current;
  }

  function clearSignature() {
    const canvas = getCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function isSignatureEmpty() {
    const canvas = getCanvas();
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // blank canvas is filled white
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return false;
    }
    return true;
  }

  function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    if (isSignatureEmpty()) {
      setPayError('Employee signature is required.');
      return;
    }
    const canvas = getCanvas();
    if (!canvas) return;
    const payment = recordEmployeePayment({
      employeeId: payTarget.id,
      employeeName: payTarget.name,
      employeeCode: payTarget.code,
      weekStart,
      amount: payTarget.net,
      notes,
      signatureDataUrl: canvas.toDataURL('image/png'),
      paidBy: 'manager',
    });
    setPayTarget(null);
    setNotes('');
    setPayError('');
    refreshPayments();
    setViewPayment(payment);
    setStatus(`Payment recorded for ${payment.employeeName} at ${formatPaidAt(payment.paidAt)}.`);
  }

  useEffect(() => {
    if (payTarget) {
      const t = window.setTimeout(() => clearSignature(), 50);
      return () => window.clearTimeout(t);
    }
  }, [payTarget]);

  return (
    <div id="payroll-print-area">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">HR & payroll</h1>
          <p className="mt-1 text-sm text-muted">
            Week of <strong className="text-ink">{weekLabel(weekOffset)}</strong> · wages from attendance
          </p>
          {storageHint && <p className="print-hide mt-1 text-xs text-muted">{storageHint}</p>}
        </div>
        <div className="print-hide flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm">
            <span className="text-xs text-muted">Previous weeks</span>
            <select
              value={weekOffset < 0 ? String(weekOffset) : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setWeekOffset(0);
                else setWeekOffset(Number(v));
              }}
              className="max-w-[200px] bg-transparent text-sm font-medium text-ink outline-none"
              aria-label="Previous week menu"
            >
              <option value="">— Select past week —</option>
              {prevWeekChoices.map((w) => (
                <option key={w.offset} value={w.offset}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(0, w - 1))}
            className="rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            Previous week
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => void loadPayroll()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <RefreshCw size={14} /> Recalculate
          </button>
          {onOpenAttendance && (
            <button
              type="button"
              onClick={onOpenAttendance}
              className="rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm text-crimson"
            >
              Open attendance
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-crimson px-3 py-1.5 text-sm text-white"
          >
            <Printer size={14} /> Print payslips
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Total hours</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{Number(totals.hours.toFixed(1))}</p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Advances deducted</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">
            {formatPKR(totals.advance)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Net payroll</p>
          <p className="mt-1 text-2xl font-semibold text-crimson">{formatPKR(totals.net)}</p>
        </div>
        <div className="rounded-xl border border-[var(--kdc-border)] p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Paid this week</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
            {formatPKR(totals.paid)}
          </p>
        </div>
      </div>

      <p className="print-hide mt-3 text-sm text-muted">
        Use <strong className="text-ink">Amend employee</strong> to change pay rate, name, role, or
        other details. Manager records each payout with{' '}
        <strong className="text-ink">Payment made</strong> — date & time, notes, and signature.{' '}
        {status}
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Calculating wages from attendance…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--kdc-border)]">
          <table className="w-full min-w-[940px] border-collapse text-left text-sm">
            <thead className="bg-crimson-deep text-white">
              <tr>
                <th className="px-3 py-3 font-medium">Emp ID</th>
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Weekly hours</th>
                <th className="px-3 py-3 font-medium">Rate / hr</th>
                <th className="px-3 py-3 font-medium">Advance</th>
                <th className="px-3 py-3 font-medium">Net wage</th>
                <th className="print-hide px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wages.map((w) => {
                const paid = paymentFor(w.id);
                return (
                  <tr key={w.id} className="border-t border-[var(--kdc-border)] bg-surface">
                    <td className="px-3 py-3 font-mono text-xs text-crimson">{w.code}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink">
                        {w.name}
                        {w.advance > 0 && (
                          <span className="ml-2 inline-flex rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                            Advance
                          </span>
                        )}
                        {paid && (
                          <span className="ml-2 inline-flex rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                            Paid
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{w.department}</p>
                      {paid && (
                        <p className="mt-1 text-[11px] text-muted">
                          Paid {formatPaidAt(paid.paidAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium">{w.weeklyHours}</td>
                    <td className="px-3 py-3">{formatPKR(w.rate)}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={advances[w.id] ?? 0}
                        onChange={(e) => updateAdvance(w.id, e.target.value)}
                        disabled={Boolean(paid)}
                        className="print-hide w-28 rounded border border-[var(--kdc-border)] bg-transparent px-2 py-1.5 text-sm text-ink disabled:opacity-60"
                        aria-label={`${w.name} advance`}
                      />
                      <span className="hidden print:inline">{formatPKR(w.advance)}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-crimson">{formatPKR(w.net)}</td>
                    <td className="print-hide px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAmend(w.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-xs font-medium text-ink hover:border-crimson/40"
                        >
                          <Pencil size={12} /> Amend employee
                        </button>
                        {paid ? (
                          <button
                            type="button"
                            onClick={() => setViewPayment(paid)}
                            className="rounded-full border border-emerald-600/40 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"
                          >
                            View receipt
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPayModal(w)}
                            disabled={w.net <= 0 && w.weeklyHours <= 0}
                            className="inline-flex items-center gap-1 rounded-full bg-crimson px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                          >
                            <Banknote size={12} /> Payment made
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!wages.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No employees found. Add staff in the attendance register.
                  </td>
                </tr>
              )}
            </tbody>
            {wages.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-crimson/30 bg-crimson/5 font-semibold">
                  <td className="px-3 py-3" colSpan={2}>
                    Weekly payroll total
                  </td>
                  <td className="px-3 py-3">{Number(totals.hours.toFixed(2))}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3">{formatPKR(totals.advance)}</td>
                  <td className="px-3 py-3 text-crimson">{formatPKR(totals.net)}</td>
                  <td className="print-hide px-3 py-3 text-emerald-700 dark:text-emerald-300">
                    {formatPKR(totals.paid)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!loading && wages.some((w) => w.weeklyHours > 0 || w.advance > 0) && (
        <div className="mt-8 space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">Payslips</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {wages
              .filter((w) => w.weeklyHours > 0 || w.advance > 0)
              .map((w) => {
                const paid = paymentFor(w.id);
                return (
                  <article
                    key={w.id}
                    className="rounded-xl border border-[var(--kdc-border)] bg-surface p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-crimson">{w.code}</p>
                        <p className="text-lg font-semibold text-ink">
                          {w.name}
                          {paid && (
                            <span className="ml-2 inline-flex rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                              Paid
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{w.department}</p>
                      </div>
                      <p className="text-xs text-muted">{weekLabel(weekOffset)}</p>
                    </div>
                    <dl className="mt-4 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted">Weekly hours</dt>
                        <dd>{w.weeklyHours}h</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Rate</dt>
                        <dd>{formatPKR(w.rate)}/hr</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Earned</dt>
                        <dd>{formatPKR(w.gross)}</dd>
                      </div>
                      {w.advance > 0 && (
                        <div className="flex justify-between text-amber-800 dark:text-amber-300">
                          <dt>Advance deducted</dt>
                          <dd>−{formatPKR(w.advance)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-[var(--kdc-border)] pt-1.5 font-semibold text-crimson">
                        <dt>Net wage</dt>
                        <dd>{formatPKR(w.net)}</dd>
                      </div>
                      {paid && (
                        <>
                          <div className="flex justify-between text-xs">
                            <dt className="text-muted">Paid at</dt>
                            <dd>{formatPaidAt(paid.paidAt)}</dd>
                          </div>
                          {paid.notes && (
                            <div className="text-xs">
                              <dt className="text-muted">Notes</dt>
                              <dd className="mt-0.5 text-ink">{paid.notes}</dd>
                            </div>
                          )}
                          {paid.signatureDataUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={paid.signatureDataUrl}
                              alt={`${w.name} signature`}
                              className="mt-2 h-16 w-full max-w-[220px] rounded border border-[var(--kdc-border)] bg-white object-contain"
                            />
                          )}
                        </>
                      )}
                    </dl>
                  </article>
                );
              })}
          </div>
        </div>
      )}

      {amendForm && (
        <div className="print-hide fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={(e) => void submitAmend(e)}
            className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl"
          >
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl">Amend employee</h3>
              <p className="mt-1 text-sm text-muted">
                Update pay rate, name, role, department, address, and photo. Wages recalculate after
                save.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                First name
                <input
                  required
                  value={amendForm.firstName}
                  onChange={(e) => setAmendForm({ ...amendForm, firstName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-muted">
                Last name
                <input
                  required
                  value={amendForm.lastName}
                  onChange={(e) => setAmendForm({ ...amendForm, lastName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Emp ID
              <input
                required
                value={amendForm.employeeCode}
                onChange={(e) => setAmendForm({ ...amendForm, employeeCode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Hourly pay rate (PKR)
              <input
                type="number"
                min={1}
                step={1}
                required
                value={amendForm.hourlyRate}
                onChange={(e) => setAmendForm({ ...amendForm, hourlyRate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                Department
                <input
                  value={amendForm.departmentName}
                  onChange={(e) => setAmendForm({ ...amendForm, departmentName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-muted">
                Role
                <input
                  value={amendForm.roleTitle}
                  onChange={(e) => setAmendForm({ ...amendForm, roleTitle: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Address
              <input
                value={amendForm.address}
                onChange={(e) => setAmendForm({ ...amendForm, address: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Photo URL (optional)
              <input
                type="url"
                value={amendForm.photoUrl}
                onChange={(e) => setAmendForm({ ...amendForm, photoUrl: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
                placeholder="https://..."
              />
            </label>
            {amendError && <p className="text-sm text-crimson">{amendError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={amending}
                onClick={() => setAmendForm(null)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={amending}
                className="rounded-full bg-crimson px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {amending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {payTarget && (
        <div className="print-hide fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitPayment}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl"
          >
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl">Payment made</h3>
              <p className="mt-1 text-sm text-muted">
                {payTarget.name} · {payTarget.code} · {weekLabel(weekOffset)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--kdc-border)] bg-crimson/5 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted">Amount</p>
              <p className="text-xl font-semibold text-crimson">{formatPKR(payTarget.net)}</p>
              <p className="mt-1 text-xs text-muted">
                Payment date & time will be saved when you confirm ({new Date().toLocaleString('en-PK')})
              </p>
            </div>
            <label className="block text-xs text-muted">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Cash paid, partial week, etc."
                className="mt-1 w-full resize-none rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink"
              />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-muted">Employee signature</p>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-xs text-crimson underline"
                >
                  Clear
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={360}
                height={140}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className="w-full touch-none rounded-lg border border-[var(--kdc-border)] bg-white"
                style={{ touchAction: 'none' }}
              />
              <p className="mt-1 text-[11px] text-muted">Sign with finger or mouse.</p>
            </div>
            {payError && <p className="text-sm text-crimson">{payError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-full bg-crimson px-4 py-2 text-sm text-white">
                Confirm payment
              </button>
            </div>
          </form>
        </div>
      )}

      {viewPayment && (
        <div className="print-hide fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl">Payment receipt</h3>
              <p className="mt-1 text-sm text-muted">
                {viewPayment.employeeName} · {viewPayment.employeeCode}
              </p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Amount</dt>
                <dd className="font-semibold text-crimson">{formatPKR(viewPayment.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Date & time</dt>
                <dd>{formatPaidAt(viewPayment.paidAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Week</dt>
                <dd>{viewPayment.weekStart}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Recorded by</dt>
                <dd className="capitalize">{viewPayment.paidBy}</dd>
              </div>
              {viewPayment.notes && (
                <div>
                  <dt className="text-muted">Notes</dt>
                  <dd className="mt-0.5 text-ink">{viewPayment.notes}</dd>
                </div>
              )}
            </dl>
            {viewPayment.signatureDataUrl && (
              <div>
                <p className="mb-1 text-xs text-muted">Employee signature</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewPayment.signatureDataUrl}
                  alt="Employee signature"
                  className="h-24 w-full rounded-lg border border-[var(--kdc-border)] bg-white object-contain"
                />
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewPayment(null)}
                className="rounded-full bg-crimson px-4 py-2 text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
