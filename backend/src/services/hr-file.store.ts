import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type FileEmployee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  address: string;
  photo_url: string;
  role_title: string;
  department_name: string;
  hourly_rate: number;
  branch_id: string;
  is_active: boolean;
  joining_date: string;
};

export type FileAttendance = {
  id: string;
  employee_id: string;
  branch_id: string;
  work_date: string;
  mark: 'P' | 'A' | null;
  clock_in: string | null;
  clock_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  status: string;
};

type Store = {
  employees: FileEmployee[];
  attendance: FileAttendance[];
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'hr-store.json');

const DEFAULT_BRANCH = 'a0000000-0000-4000-8000-000000000001';

function defaultStore(): Store {
  return {
    employees: [
      {
        id: 'e1000000-0000-4000-8000-000000000001',
        employee_code: 'EMP-001',
        first_name: 'Imran',
        last_name: 'Ali',
        address: '12 Anarkali Bazaar, Lahore',
        photo_url:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
        role_title: 'Cook',
        department_name: 'Kitchen',
        hourly_rate: 350,
        branch_id: DEFAULT_BRANCH,
        is_active: true,
        joining_date: '2024-01-15',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000002',
        employee_code: 'EMP-002',
        first_name: 'Sana',
        last_name: 'Riaz',
        address: '45 Gulberg III, Lahore',
        photo_url:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
        role_title: 'Cashier',
        department_name: 'Cashier',
        hourly_rate: 320,
        branch_id: DEFAULT_BRANCH,
        is_active: true,
        joining_date: '2024-03-01',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000003',
        employee_code: 'EMP-003',
        first_name: 'Bilal',
        last_name: 'Ahmed',
        address: '88 Hall Road, Lahore',
        photo_url:
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
        role_title: 'Rider',
        department_name: 'Delivery',
        hourly_rate: 300,
        branch_id: DEFAULT_BRANCH,
        is_active: true,
        joining_date: '2024-05-10',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000004',
        employee_code: 'EMP-004',
        first_name: 'Ayesha',
        last_name: 'Khan',
        address: '3 Johar Town Block A, Lahore',
        photo_url:
          'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80',
        role_title: 'Host',
        department_name: 'Front of House',
        hourly_rate: 280,
        branch_id: DEFAULT_BRANCH,
        is_active: true,
        joining_date: '2024-06-20',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000005',
        employee_code: 'EMP-005',
        first_name: 'Usman',
        last_name: 'Farooq',
        address: '21 Ichhra Main Blvd, Lahore',
        photo_url:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
        role_title: 'Cook',
        department_name: 'Kitchen',
        hourly_rate: 350,
        branch_id: DEFAULT_BRANCH,
        is_active: true,
        joining_date: '2024-08-01',
      },
    ],
    attendance: [],
  };
}

function ensureStore(): Store {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Store;
}

function writeStore(store: Store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export const hrFileStore = {
  listEmployees() {
    return ensureStore().employees.filter((e) => e.is_active);
  },

  createEmployee(input: {
    employeeCode?: string;
    firstName: string;
    lastName: string;
    address?: string;
    photoUrl?: string;
    roleTitle?: string;
    departmentName?: string;
    hourlyRate?: number;
  }) {
    const store = ensureStore();
    const code =
      input.employeeCode ||
      `EMP-${String(store.employees.length + 1).padStart(3, '0')}`;
    if (store.employees.some((e) => e.employee_code === code && e.is_active)) {
      throw new Error('Employee code already exists');
    }
    const emp: FileEmployee = {
      id: randomUUID(),
      employee_code: code,
      first_name: input.firstName,
      last_name: input.lastName,
      address: input.address || '',
      photo_url:
        input.photoUrl ||
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      role_title: input.roleTitle || 'Staff',
      department_name: input.departmentName || 'General',
      hourly_rate: input.hourlyRate ?? 300,
      branch_id: DEFAULT_BRANCH,
      is_active: true,
      joining_date: new Date().toISOString().slice(0, 10),
    };
    store.employees.push(emp);
    writeStore(store);
    return emp;
  },

  deleteEmployee(idOrCode: string) {
    const store = ensureStore();
    const emp = store.employees.find(
      (e) => e.id === idOrCode || e.employee_code === idOrCode
    );
    if (!emp) throw new Error('Employee not found');
    emp.is_active = false;
    writeStore(store);
    return { deleted: true, id: emp.id };
  },

  updateEmployee(
    idOrCode: string,
    input: {
      employeeCode?: string;
      firstName?: string;
      lastName?: string;
      address?: string;
      photoUrl?: string;
      roleTitle?: string;
      departmentName?: string;
      hourlyRate?: number;
    }
  ) {
    const store = ensureStore();
    const emp = store.employees.find(
      (e) => (e.id === idOrCode || e.employee_code === idOrCode) && e.is_active
    );
    if (!emp) throw new Error('Employee not found');

    if (input.employeeCode !== undefined) {
      const code = input.employeeCode.trim();
      if (!code) throw new Error('Employee code is required');
      if (
        store.employees.some(
          (e) => e.is_active && e.employee_code === code && e.id !== emp.id
        )
      ) {
        throw new Error('Employee code already exists');
      }
      emp.employee_code = code;
    }
    if (input.firstName !== undefined) emp.first_name = input.firstName.trim() || emp.first_name;
    if (input.lastName !== undefined) emp.last_name = input.lastName.trim() || emp.last_name;
    if (input.address !== undefined) emp.address = input.address;
    if (input.photoUrl !== undefined) {
      emp.photo_url =
        input.photoUrl ||
        emp.photo_url ||
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80';
    }
    if (input.roleTitle !== undefined) emp.role_title = input.roleTitle.trim() || emp.role_title;
    if (input.departmentName !== undefined) {
      emp.department_name = input.departmentName.trim() || emp.department_name;
    }
    if (input.hourlyRate !== undefined) {
      const rate = Number(input.hourlyRate);
      if (!(rate > 0)) throw new Error('Hourly rate must be greater than 0');
      emp.hourly_rate = rate;
    }

    writeStore(store);
    return emp;
  },

  getWeekAttendance(weekStart: string) {
    const store = ensureStore();
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const employees = store.employees.filter((e) => e.is_active);
    const attendance = store.attendance.filter((a) => {
      const d = new Date(a.work_date);
      return d >= start && d < end;
    });
    return { employees, attendance, weekStart, storage: 'file' as const };
  },

  saveWeekAttendance(
    weekStart: string,
    entries: Array<{
      employeeId: string;
      workDate: string;
      mark: 'P' | 'A' | '';
      startTime?: string;
      endTime?: string;
    }>
  ) {
    const store = ensureStore();
    for (const entry of entries) {
      const existingIdx = store.attendance.findIndex(
        (a) => a.employee_id === entry.employeeId && a.work_date === entry.workDate
      );

      if (!entry.mark) {
        if (existingIdx >= 0) store.attendance.splice(existingIdx, 1);
        continue;
      }

      const hours = hoursBetween(entry.startTime, entry.endTime, entry.mark);
      const record: FileAttendance = {
        id: existingIdx >= 0 ? store.attendance[existingIdx].id : randomUUID(),
        employee_id: entry.employeeId,
        branch_id: DEFAULT_BRANCH,
        work_date: entry.workDate,
        mark: entry.mark,
        clock_in:
          entry.mark === 'P' && entry.startTime
            ? `${entry.workDate}T${entry.startTime}:00`
            : null,
        clock_out:
          entry.mark === 'P' && entry.endTime
            ? `${entry.workDate}T${entry.endTime}:00`
            : null,
        regular_hours: hours.regular,
        overtime_hours: hours.overtime,
        status: entry.mark === 'A' ? 'absent' : hours.overtime > 0 ? 'overtime' : 'present',
      };

      if (existingIdx >= 0) store.attendance[existingIdx] = record;
      else store.attendance.push(record);
    }
    writeStore(store);

    const wages = store.employees
      .filter((e) => e.is_active)
      .map((e) => {
        const weekRows = store.attendance.filter((a) => {
          const d = new Date(a.work_date);
          const start = new Date(weekStart);
          const end = new Date(start);
          end.setDate(start.getDate() + 7);
          return a.employee_id === e.id && d >= start && d < end;
        });
        const regular = weekRows.reduce((s, r) => s + r.regular_hours, 0);
        const overtime = weekRows.reduce((s, r) => s + r.overtime_hours, 0);
        const gross = regular * e.hourly_rate + overtime * e.hourly_rate * 1.5;
        return {
          employeeId: e.id,
          employeeCode: e.employee_code,
          employeeName: `${e.first_name} ${e.last_name}`,
          regularHours: Number(regular.toFixed(2)),
          overtimeHours: Number(overtime.toFixed(2)),
          hourlyRate: e.hourly_rate,
          grossPay: Number(gross.toFixed(2)),
          netPay: Number((gross * 0.9).toFixed(2)),
        };
      });

    return { saved: entries.length, weekStart, wages, storage: 'file' as const };
  },
};

function hoursBetween(
  start?: string,
  end?: string,
  mark: 'P' | 'A' | '' = 'P'
): { regular: number; overtime: number } {
  if (mark !== 'P' || !start || !end) return { regular: 0, overtime: 0 };
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const total = mins / 60;
  return {
    regular: Number(Math.min(8, total).toFixed(2)),
    overtime: Number(Math.max(0, total - 8).toFixed(2)),
  };
}
