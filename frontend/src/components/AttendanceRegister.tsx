'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPKR } from '@/lib/data';
import { Image3D } from '@/components/Image3D';
import {
  calcEmployeeWeekWage,
  currentWeekStartKey,
  dateForDay,
  dayHours,
  DEFAULT_END,
  DEFAULT_START,
  emptyWeek,
  getWeekAdvances,
  isPastWeekOffset,
  mondayOfOffset,
  previousWeekOptions,
  setEmployeeAdvance,
  timeFromIso,
  toDateKey,
  WEEK_DAYS,
  weekLabel,
  type AttendMark,
  type DayKey,
  type DayShift,
} from '@/lib/payroll';

export type { DayKey, AttendMark };

export type AttendanceEmployee = {
  id: string;
  empId: string;
  name: string;
  address: string;
  photoUrl: string;
  department: string;
  hourlyRate: number;
  days: Record<DayKey, DayShift>;
};

function cycleMark(current: AttendMark): AttendMark {
  if (current === 'P') return 'A';
  if (current === 'A') return '';
  return 'P';
}

function mapApiEmployee(
  emp: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    address?: string;
    photo_url?: string;
    department_name?: string;
    role_title?: string;
    hourly_rate?: number | string;
  },
  attendance: Array<{
    employee_id: string;
    work_date: string;
    mark?: string | null;
    clock_in?: string | null;
    clock_out?: string | null;
  }>,
  weekStart: string
): AttendanceEmployee {
  const days = emptyWeek();
  for (const day of WEEK_DAYS) {
    const workDate = dateForDay(weekStart, day);
    const rec = attendance.find((a) => a.employee_id === emp.id && a.work_date.slice(0, 10) === workDate);
    if (rec) {
      days[day] = {
        mark: (rec.mark as AttendMark) || '',
        start: timeFromIso(rec.clock_in, DEFAULT_START),
        end: timeFromIso(rec.clock_out, DEFAULT_END),
      };
    }
  }
  return {
    id: emp.id,
    empId: emp.employee_code,
    name: `${emp.first_name} ${emp.last_name}`.trim(),
    address: emp.address || '',
    photoUrl:
      emp.photo_url ||
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    department: emp.department_name || emp.role_title || 'Staff',
    hourlyRate: Number(emp.hourly_rate ?? 300),
    days,
  };
}

export function AttendanceRegister() {
  const [rows, setRows] = useState<AttendanceEmployee[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [storageHint, setStorageHint] = useState('');
  const [advances, setAdvances] = useState<Record<string, number>>({});
  const weekStart = useMemo(() => toDateKey(mondayOfOffset(weekOffset)), [weekOffset]);
  const viewOnly = isPastWeekOffset(weekOffset);
  const prevWeekChoices = useMemo(() => previousWeekOptions(12), []);

  // When the calendar week ends, reload so the register opens on the new week
  useEffect(() => {
    let lastMonday = currentWeekStartKey();
    const tick = () => {
      const nowMonday = currentWeekStartKey();
      if (nowMonday !== lastMonday) {
        lastMonday = nowMonday;
        window.location.reload();
      }
    };
    const id = window.setInterval(tick, 30_000);
    const warm = window.setTimeout(tick, 2000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(warm);
    };
  }, []);

  useEffect(() => {
    setAdvances(getWeekAdvances(weekStart));
  }, [weekStart]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const data = await api<{
        employees: Array<{
          id: string;
          employee_code: string;
          first_name: string;
          last_name: string;
          address?: string;
          photo_url?: string;
          department_name?: string;
          role_title?: string;
          hourly_rate?: number | string;
        }>;
        attendance: Array<{
          employee_id: string;
          work_date: string;
          mark?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
        }>;
        storage?: string;
      }>(`/hr/attendance/week?weekStart=${weekStart}`);
      setRows(data.employees.map((e) => mapApiEmployee(e, data.attendance, weekStart)));
      setAdvances(getWeekAdvances(weekStart));
      setStorageHint(data.storage === 'file' ? 'Saved to local HR store (Postgres offline)' : 'Connected to database');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load attendance');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const weeklyWages = useMemo(
    () => rows.map((r) => calcEmployeeWeekWage(r, advances[r.id] || 0)),
    [rows, advances]
  );

  const wageTotals = useMemo(() => {
    return weeklyWages.reduce(
      (acc, w) => ({
        hours: acc.hours + w.weeklyHours,
        advance: acc.advance + w.advance,
        net: acc.net + w.net,
      }),
      { hours: 0, advance: 0, net: 0 }
    );
  }, [weeklyWages]);

  function updateAdvance(employeeId: string, value: string) {
    if (viewOnly) return;
    const amount = Math.max(0, Number(value) || 0);
    setEmployeeAdvance(weekStart, employeeId, amount);
    setAdvances(getWeekAdvances(weekStart));
  }

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let hours = 0;
    for (const r of rows) {
      for (const d of WEEK_DAYS) {
        const cell = r.days[d];
        if (cell.mark === 'P') {
          present += 1;
          hours += dayHours(cell.start, cell.end);
        }
        if (cell.mark === 'A') absent += 1;
      }
    }
    return { present, absent, staff: rows.length, hours: Number(hours.toFixed(1)) };
  }, [rows]);

  function setMark(id: string, day: DayKey) {
    if (viewOnly) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = cycleMark(r.days[day].mark);
        return {
          ...r,
          days: {
            ...r.days,
            [day]: {
              ...r.days[day],
              mark: next,
              start: r.days[day].start || DEFAULT_START,
              end: r.days[day].end || DEFAULT_END,
            },
          },
        };
      })
    );
  }

  function setTime(id: string, day: DayKey, field: 'start' | 'end', value: string) {
    if (viewOnly) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, days: { ...r.days, [day]: { ...r.days[day], [field]: value } } }
          : r
      )
    );
  }

  async function saveWeek() {
    if (viewOnly) {
      setStatus('Past weeks are view only. Switch to this week to edit.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const entries = rows.flatMap((emp) =>
        WEEK_DAYS.map((day) => ({
          employeeId: emp.id,
          workDate: dateForDay(weekStart, day),
          mark: emp.days[day].mark,
          startTime: emp.days[day].start,
          endTime: emp.days[day].end,
        }))
      );

      const result = await api<{
        storage?: string;
        saved: number;
      }>('/hr/attendance/week', {
        method: 'POST',
        body: JSON.stringify({ weekStart, entries }),
      });

      setStorageHint(
        result.storage === 'file'
          ? 'Saved to local HR store for weekly wages'
          : 'Saved to database — weekly wages updated'
      );
      setStatus(`Saved ${result.saved} day entries. Weekly wages: ${formatPKR(wageTotals.net)} net.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function removeEmployee(emp: AttendanceEmployee) {
    if (viewOnly) return;
    if (!window.confirm(`Remove ${emp.name} (${emp.empId}) from the database?`)) return;
    try {
      await api(`/hr/employees/${emp.id}`, { method: 'DELETE' });
      setStatus(`${emp.name} removed`);
      await loadWeek();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Remove failed');
    }
  }

  async function addEmployee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (viewOnly) return;
    const fd = new FormData(e.currentTarget);
    try {
      await api('/hr/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: String(fd.get('employeeCode') || '').trim() || undefined,
          firstName: String(fd.get('firstName') || '').trim(),
          lastName: String(fd.get('lastName') || '').trim(),
          address: String(fd.get('address') || '').trim(),
          departmentName: String(fd.get('department') || '').trim() || 'General',
          roleTitle: String(fd.get('roleTitle') || '').trim() || 'Staff',
          hourlyRate: Number(fd.get('hourlyRate') || 300),
          photoUrl: String(fd.get('photoUrl') || '').trim() || undefined,
        }),
      });
      setShowAdd(false);
      setStatus('Employee added');
      await loadWeek();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Add employee failed');
    }
  }

  function resetWeek() {
    if (viewOnly) return;
    setRows((prev) => prev.map((r) => ({ ...r, days: emptyWeek() })));
  }

  function printRegister() {
    window.print();
  }

  return (
    <div id="attendance-print-area">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Attendance register</h1>
          <p className="mt-1 text-sm text-muted">
            Kashmiri Daal Chawal · Hall Road, Lahore · Week of{' '}
            <strong className="text-ink">{weekLabel(weekOffset)}</strong>
            {viewOnly && (
              <span className="ml-2 rounded bg-muted/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">
                View only
              </span>
            )}
          </p>
          {storageHint && <p className="print-hide mt-1 text-xs text-muted">{storageHint}</p>}
        </div>
        <div className="print-hide flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm">
            <span className="text-xs text-muted">Previous weeks</span>
            <select
              value={viewOnly ? String(weekOffset) : ''}
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
            disabled
            title="Future weeks are locked. When this week ends the page refreshes automatically."
            className="cursor-not-allowed rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm opacity-50"
          >
            Next week
          </button>
          {!viewOnly && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
            >
              <Plus size={14} /> Add employee
            </button>
          )}
          {!viewOnly && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void saveWeek()}
              className="inline-flex items-center gap-1.5 rounded-full bg-crimson px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button
            type="button"
            onClick={printRegister}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kdc-border)] px-3 py-1.5 text-sm"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {viewOnly && (
        <p className="print-hide mt-3 rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm text-muted">
          This finished week is <strong className="text-ink">view only</strong>. Marks, times and
          advances cannot be changed. Use <strong className="text-ink">This week</strong> to edit
          the current register.
        </p>
      )}

      <div className="print-hide mt-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800 dark:text-emerald-300">
          Staff: {summary.staff}
        </span>
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800 dark:text-emerald-300">
          Present (P): {summary.present}
        </span>
        <span className="rounded-full bg-crimson/10 px-3 py-1 text-crimson">
          Absent (A): {summary.absent}
        </span>
        <span className="rounded-full bg-gold/20 px-3 py-1 text-ink">
          Hours this week: {summary.hours}
        </span>
        {status && <span className="text-muted">{status}</span>}
      </div>

      <p className="print-hide mt-3 text-xs text-muted">
        Tap P/A to mark attendance. Set <strong>start</strong> and <strong>finish</strong> times when Present —
        weekly wages below use hours × rate, minus any advance.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading register…</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--kdc-border)]">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-crimson-deep text-white">
              <tr>
                <th className="px-3 py-3 font-medium">Photo</th>
                <th className="px-3 py-3 font-medium">Emp ID</th>
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Address / rate</th>
                {WEEK_DAYS.map((d) => (
                  <th key={d} className="min-w-[108px] px-2 py-3 text-center font-medium">
                    {d}
                  </th>
                ))}
                <th className="print-hide px-3 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id} className="border-t border-[var(--kdc-border)] bg-surface align-top">
                  <td className="px-3 py-3">
                    <div className="relative h-14 w-14 overflow-visible rounded-xl border-2 border-gold/60 bg-crimson/5">
                      <Image3D variant="avatar" className="absolute inset-0 rounded-xl">
                        <Image
                          src={emp.photoUrl}
                          alt={emp.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      </Image3D>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-crimson">{emp.empId}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-ink">{emp.name}</p>
                    <p className="text-xs text-muted">{emp.department}</p>
                  </td>
                  <td className="max-w-[200px] px-3 py-3">
                    <p className="text-muted">{emp.address || '—'}</p>
                    <p className="mt-1 text-xs font-medium text-ink">{formatPKR(emp.hourlyRate)}/hr</p>
                  </td>
                  {WEEK_DAYS.map((d) => {
                    const cell = emp.days[d];
                    return (
                      <td key={d} className="px-1.5 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setMark(emp.id, d)}
                          disabled={viewOnly}
                          aria-label={`${emp.name} ${d} attendance`}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition ${
                            cell.mark === 'P'
                              ? 'border-emerald-600 bg-emerald-500 text-white'
                              : cell.mark === 'A'
                                ? 'border-crimson bg-crimson text-white'
                                : 'border-[var(--kdc-border)] bg-transparent text-muted hover:border-crimson/40'
                          } ${viewOnly ? 'cursor-default opacity-90' : ''}`}
                        >
                          {cell.mark || '·'}
                        </button>
                        {cell.mark === 'P' && (
                          <div className="mt-1.5 space-y-1">
                            <label className="block text-[10px] text-muted">
                              Start
                              <input
                                type="time"
                                value={cell.start}
                                readOnly={viewOnly}
                                disabled={viewOnly}
                                onChange={(e) => setTime(emp.id, d, 'start', e.target.value)}
                                className="mt-0.5 w-full rounded border border-[var(--kdc-border)] bg-transparent px-1 py-0.5 text-[11px] text-ink disabled:opacity-80"
                              />
                            </label>
                            <label className="block text-[10px] text-muted">
                              Finish
                              <input
                                type="time"
                                value={cell.end}
                                readOnly={viewOnly}
                                disabled={viewOnly}
                                onChange={(e) => setTime(emp.id, d, 'end', e.target.value)}
                                className="mt-0.5 w-full rounded border border-[var(--kdc-border)] bg-transparent px-1 py-0.5 text-[11px] text-ink disabled:opacity-80"
                              />
                            </label>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="print-hide px-3 py-3">
                    {!viewOnly && (
                      <button
                        type="button"
                        title="Remove employee"
                        onClick={() => void removeEmployee(emp)}
                        className="inline-flex items-center gap-1 rounded-full border border-crimson/30 px-2.5 py-1 text-xs text-crimson hover:bg-crimson/10"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted">
                    No employees yet. Use Add employee to create the first staff record.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="print-hide mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-xs text-muted">
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-emerald-500" /> P = Present (+ times)
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-crimson" /> A = Absent
          </span>
        </div>
        {!viewOnly && (
          <button type="button" onClick={resetWeek} className="text-xs text-crimson underline">
            Clear week marks
          </button>
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Weekly wages</h2>
        <p className="mt-1 text-sm text-muted">
          Net = weekly hours × rate − advance.
          {viewOnly ? ' Advances are locked for finished weeks.' : ' Enter advance when staff takes money early.'}
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--kdc-border)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-crimson-deep text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Emp ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Weekly hours</th>
                <th className="px-3 py-2 font-medium">Rate / hr</th>
                <th className="px-3 py-2 font-medium">Advance</th>
                <th className="px-3 py-2 font-medium">Net wage</th>
              </tr>
            </thead>
            <tbody>
              {weeklyWages.map((w) => (
                <tr key={w.id} className="border-t border-[var(--kdc-border)] bg-surface">
                  <td className="px-3 py-2 font-mono text-xs text-crimson">{w.code}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{w.name}</span>
                    {w.advance > 0 && (
                      <span className="ml-2 inline-flex rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        Advance
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{w.weeklyHours}</td>
                  <td className="px-3 py-2">{formatPKR(w.rate)}</td>
                  <td className="px-3 py-2">
                    {viewOnly ? (
                      <span>{formatPKR(w.advance)}</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={advances[w.id] ?? 0}
                          onChange={(e) => updateAdvance(w.id, e.target.value)}
                          className="print-hide w-24 rounded border border-[var(--kdc-border)] bg-transparent px-2 py-1 text-sm text-ink"
                          aria-label={`${w.name} advance`}
                        />
                        <span className="hidden print:inline">{formatPKR(w.advance)}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold text-crimson">{formatPKR(w.net)}</td>
                </tr>
              ))}
              {!weeklyWages.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No wage rows yet.
                  </td>
                </tr>
              )}
            </tbody>
            {weeklyWages.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-crimson/30 bg-crimson/5 font-semibold">
                  <td className="px-3 py-3" colSpan={2}>
                    Weekly total
                  </td>
                  <td className="px-3 py-3">{Number(wageTotals.hours.toFixed(2))}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3">{formatPKR(wageTotals.advance)}</td>
                  <td className="px-3 py-3 text-crimson">{formatPKR(wageTotals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="print-hide fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={(e) => void addEmployee(e)}
            className="w-full max-w-md space-y-3 rounded-2xl border border-[var(--kdc-border)] bg-surface p-6 shadow-xl"
          >
            <h3 className="font-[family-name:var(--font-display)] text-2xl">Add employee</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                First name
                <input name="firstName" required className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
              </label>
              <label className="text-xs text-muted">
                Last name
                <input name="lastName" required className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Emp ID (optional)
              <input name="employeeCode" placeholder="EMP-006" className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
            </label>
            <label className="block text-xs text-muted">
              Address
              <input name="address" className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                Department
                <input name="department" defaultValue="Kitchen" className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
              </label>
              <label className="text-xs text-muted">
                Role
                <input name="roleTitle" defaultValue="Staff" className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Hourly rate (PKR)
              <input name="hourlyRate" type="number" min={1} step={1} defaultValue={300} className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
            </label>
            <label className="block text-xs text-muted">
              Photo URL (optional)
              <input name="photoUrl" type="url" className="mt-1 w-full rounded-lg border border-[var(--kdc-border)] bg-transparent px-3 py-2 text-sm text-ink" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-full px-4 py-2 text-sm text-muted">
                Cancel
              </button>
              <button type="submit" className="rounded-full bg-crimson px-4 py-2 text-sm text-white">
                Add to database
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
