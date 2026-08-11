export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type AttendMark = 'P' | 'A' | '';

export type DayShift = {
  mark: AttendMark;
  start: string;
  end: string;
};

export type PayrollEmployee = {
  id: string;
  empId: string;
  name: string;
  department: string;
  hourlyRate: number;
  days: Record<DayKey, DayShift>;
};

export type WageRow = {
  id: string;
  code: string;
  name: string;
  department: string;
  weeklyHours: number;
  rate: number;
  advance: number;
  gross: number;
  net: number;
};

export const WEEK_DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DEFAULT_START = '09:00';
export const DEFAULT_END = '17:00';

const ADVANCE_STORAGE_KEY = 'kdc-wage-advances';

export function emptyWeek(): Record<DayKey, DayShift> {
  return {
    Mon: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Tue: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Wed: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Thu: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Fri: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Sat: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
    Sun: { mark: '', start: DEFAULT_START, end: DEFAULT_END },
  };
}

export function mondayOfOffset(offset = 0): Date {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + mondayOffset + offset * 7);
  return monday;
}

export function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function weekLabel(offset = 0) {
  const monday = mondayOfOffset(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/** Past weeks only (negative offsets): read-only attendance history. */
export function isPastWeekOffset(offset: number) {
  return offset < 0;
}

export function isFutureWeekOffset(offset: number) {
  return offset > 0;
}

/** Calendar Monday key for “this week”. */
export function currentWeekStartKey() {
  return toDateKey(mondayOfOffset(0));
}

/** Last N completed weeks for previous-week selector (offsets -1 … -n). */
export function previousWeekOptions(count = 12): Array<{ offset: number; label: string; weekStart: string }> {
  const list: Array<{ offset: number; label: string; weekStart: string }> = [];
  for (let o = -1; o >= -count; o--) {
    list.push({
      offset: o,
      label: weekLabel(o),
      weekStart: toDateKey(mondayOfOffset(o)),
    });
  }
  return list;
}

// ---- Manager wage payments (with employee signature) ----

export type EmployeePayment = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  weekStart: string;
  amount: number;
  paidAt: string;
  notes: string;
  signatureDataUrl: string;
  paidBy: string;
};

const PAYMENT_STORAGE_KEY = 'kdc-hr-wage-payments';

function readPayments(): EmployeePayment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as EmployeePayment[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePayments(list: EmployeePayment[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(list.slice(0, 500)));
}

export function listPaymentsForWeek(weekStart: string): EmployeePayment[] {
  return readPayments()
    .filter((p) => p.weekStart === weekStart)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function getPaymentForEmployee(
  weekStart: string,
  employeeId: string
): EmployeePayment | undefined {
  return readPayments().find((p) => p.weekStart === weekStart && p.employeeId === employeeId);
}

export function recordEmployeePayment(input: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  weekStart: string;
  amount: number;
  notes: string;
  signatureDataUrl: string;
  paidBy?: string;
}): EmployeePayment {
  const payment: EmployeePayment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    employeeCode: input.employeeCode,
    weekStart: input.weekStart,
    amount: Math.max(0, Number(input.amount) || 0),
    paidAt: new Date().toISOString(),
    notes: input.notes.trim(),
    signatureDataUrl: input.signatureDataUrl,
    paidBy: input.paidBy?.trim() || 'manager',
  };
  const rest = readPayments().filter(
    (p) => !(p.weekStart === payment.weekStart && p.employeeId === payment.employeeId)
  );
  writePayments([payment, ...rest]);
  return payment;
}


export function dateForDay(weekStart: string, day: DayKey) {
  const idx = WEEK_DAYS.indexOf(day);
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + idx);
  return toDateKey(d);
}

export function dayHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, mins / 60);
}

export function timeFromIso(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const m = value.match(/T(\d{2}:\d{2})/) || value.match(/ (\d{2}:\d{2})/);
  return m ? m[1] : fallback;
}

type AdvanceMap = Record<string, Record<string, number>>;

function readAdvances(): AdvanceMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(ADVANCE_STORAGE_KEY) || '{}') as AdvanceMap;
  } catch {
    return {};
  }
}

function writeAdvances(map: AdvanceMap) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADVANCE_STORAGE_KEY, JSON.stringify(map));
}

export function getWeekAdvances(weekStart: string): Record<string, number> {
  return readAdvances()[weekStart] || {};
}

export function setEmployeeAdvance(weekStart: string, employeeId: string, amount: number) {
  const map = readAdvances();
  if (!map[weekStart]) map[weekStart] = {};
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0) delete map[weekStart][employeeId];
  else map[weekStart][employeeId] = value;
  writeAdvances(map);
}

/** Weekly hours × rate, then deduct advance → net wage. */
export function calcEmployeeWeekWage(emp: PayrollEmployee, advance = 0): WageRow {
  let weeklyHours = 0;
  for (const d of WEEK_DAYS) {
    const cell = emp.days[d];
    if (cell.mark !== 'P') continue;
    weeklyHours += dayHours(cell.start, cell.end);
  }
  weeklyHours = Number(weeklyHours.toFixed(2));
  const gross = Number((weeklyHours * emp.hourlyRate).toFixed(2));
  const advanceAmt = Math.max(0, Number(advance) || 0);
  const net = Number(Math.max(0, gross - advanceAmt).toFixed(2));
  return {
    id: emp.id,
    code: emp.empId,
    name: emp.name,
    department: emp.department,
    weeklyHours,
    rate: emp.hourlyRate,
    advance: advanceAmt,
    gross,
    net,
  };
}

export function mapAttendanceToEmployee(
  emp: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
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
): PayrollEmployee {
  const days = emptyWeek();
  for (const day of WEEK_DAYS) {
    const workDate = dateForDay(weekStart, day);
    const rec = attendance.find(
      (a) => a.employee_id === emp.id && a.work_date.slice(0, 10) === workDate
    );
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
    department: emp.department_name || emp.role_title || 'Staff',
    hourlyRate: Number(emp.hourly_rate ?? 300),
    days,
  };
}
