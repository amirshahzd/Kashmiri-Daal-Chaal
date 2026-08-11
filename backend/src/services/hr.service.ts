import { query, pool } from '../config/db';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { hrFileStore } from './hr-file.store';

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function hoursFromTimes(start?: string, end?: string, mark?: string) {
  if (mark !== 'P' || !start || !end) return { regular: 0, overtime: 0, total: 0 };
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const total = mins / 60;
  return {
    total: Number(total.toFixed(2)),
    regular: Number(Math.min(8, total).toFixed(2)),
    overtime: Number(Math.max(0, total - 8).toFixed(2)),
  };
}

export async function listEmployees(branchId = env.defaultBranchId) {
  if (!(await dbAvailable())) {
    return hrFileStore.listEmployees();
  }
  try {
    return (
      await query(
        `SELECT e.*, d.name AS department_name
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.branch_id = $1 AND e.is_active = TRUE
         ORDER BY e.employee_code`,
        [branchId]
      )
    ).rows;
  } catch {
    return hrFileStore.listEmployees();
  }
}

export async function createEmployee(input: {
  employeeCode?: string;
  firstName: string;
  lastName: string;
  address?: string;
  photoUrl?: string;
  roleTitle?: string;
  departmentName?: string;
  hourlyRate?: number;
  branchId?: string;
}) {
  if (!(await dbAvailable())) {
    try {
      return hrFileStore.createEmployee(input);
    } catch (err) {
      throw new AppError(400, 'EMPLOYEE_CREATE_FAILED', err instanceof Error ? err.message : 'Create failed');
    }
  }

  try {
    const branchId = input.branchId ?? env.defaultBranchId;
    const code =
      input.employeeCode ||
      `EMP-${Date.now().toString().slice(-4)}`;

    const existing = await query(`SELECT id FROM employees WHERE employee_code = $1`, [code]);
    if (existing.rowCount) throw new AppError(409, 'EMP_CODE_TAKEN', 'Employee code already exists');

    let departmentId: string | null = null;
    if (input.departmentName) {
      const dep = await query(
        `INSERT INTO departments (branch_id, name)
         VALUES ($1, $2)
         ON CONFLICT (branch_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [branchId, input.departmentName]
      );
      departmentId = dep.rows[0]?.id ?? null;
    }

    const res = await query(
      `INSERT INTO employees (
        branch_id, department_id, employee_code, first_name, last_name, address,
        photo_url, role_title, joining_date, hourly_rate, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,TRUE)
      RETURNING *`,
      [
        branchId,
        departmentId,
        code,
        input.firstName,
        input.lastName,
        input.address ?? '',
        input.photoUrl ?? null,
        input.roleTitle ?? 'Staff',
        input.hourlyRate ?? 300,
      ]
    );
    return res.rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return hrFileStore.createEmployee(input);
    } catch (fileErr) {
      throw new AppError(
        400,
        'EMPLOYEE_CREATE_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Create failed'
      );
    }
  }
}

export async function deleteEmployee(idOrCode: string) {
  if (!(await dbAvailable())) {
    try {
      return hrFileStore.deleteEmployee(idOrCode);
    } catch (err) {
      throw new AppError(404, 'EMPLOYEE_NOT_FOUND', err instanceof Error ? err.message : 'Not found');
    }
  }
  try {
    const res = await query(
      `UPDATE employees SET is_active = FALSE, leaving_date = CURRENT_DATE, updated_at = NOW()
       WHERE id::text = $1 OR employee_code = $1
       RETURNING id, employee_code`,
      [idOrCode]
    );
    if (!res.rowCount) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    return { deleted: true, ...res.rows[0] };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return hrFileStore.deleteEmployee(idOrCode);
    } catch (fileErr) {
      throw new AppError(404, 'EMPLOYEE_NOT_FOUND', fileErr instanceof Error ? fileErr.message : 'Not found');
    }
  }
}

export async function updateEmployee(
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
    branchId?: string;
  }
) {
  if (!(await dbAvailable())) {
    try {
      return hrFileStore.updateEmployee(idOrCode, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      const code = msg.toLowerCase().includes('not found') ? 404 : 400;
      throw new AppError(code, 'EMPLOYEE_UPDATE_FAILED', msg);
    }
  }

  try {
    const existing = await query(
      `SELECT * FROM employees WHERE (id::text = $1 OR employee_code = $1) AND is_active = TRUE`,
      [idOrCode]
    );
    if (!existing.rowCount) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    const emp = existing.rows[0] as {
      id: string;
      branch_id: string;
      employee_code: string;
      department_id: string | null;
    };

    if (input.employeeCode && input.employeeCode !== emp.employee_code) {
      const duel = await query(
        `SELECT id FROM employees WHERE employee_code = $1 AND id <> $2 AND is_active = TRUE`,
        [input.employeeCode, emp.id]
      );
      if (duel.rowCount) throw new AppError(409, 'EMP_CODE_TAKEN', 'Employee code already exists');
    }

    let departmentId = emp.department_id;
    if (input.departmentName !== undefined) {
      const branchId = input.branchId ?? emp.branch_id ?? env.defaultBranchId;
      if (input.departmentName.trim()) {
        const dep = await query(
          `INSERT INTO departments (branch_id, name)
           VALUES ($1, $2)
           ON CONFLICT (branch_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [branchId, input.departmentName.trim()]
        );
        departmentId = dep.rows[0]?.id ?? departmentId;
      }
    }

    const res = await query(
      `UPDATE employees SET
         employee_code = COALESCE($2, employee_code),
         first_name = COALESCE($3, first_name),
         last_name = COALESCE($4, last_name),
         address = COALESCE($5, address),
         photo_url = CASE WHEN $6::text IS NULL THEN photo_url WHEN $6 = '' THEN photo_url ELSE $6 END,
         role_title = COALESCE($7, role_title),
         department_id = COALESCE($8, department_id),
         hourly_rate = COALESCE($9, hourly_rate),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        emp.id,
        input.employeeCode ?? null,
        input.firstName ?? null,
        input.lastName ?? null,
        input.address ?? null,
        input.photoUrl === undefined ? null : input.photoUrl || '',
        input.roleTitle ?? null,
        departmentId,
        input.hourlyRate ?? null,
      ]
    );

    const row = res.rows[0];
    if (input.departmentName) {
      return { ...row, department_name: input.departmentName };
    }
    const depName = await query(`SELECT name FROM departments WHERE id = $1`, [row.department_id]);
    return { ...row, department_name: depName.rows[0]?.name || null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    try {
      return hrFileStore.updateEmployee(idOrCode, input);
    } catch (fileErr) {
      throw new AppError(
        400,
        'EMPLOYEE_UPDATE_FAILED',
        fileErr instanceof Error ? fileErr.message : 'Update failed'
      );
    }
  }
}

export async function getWeeklyRegister(weekStart: string, branchId = env.defaultBranchId) {
  if (!(await dbAvailable())) {
    return hrFileStore.getWeekAttendance(weekStart);
  }

  try {
    const employees = await listEmployees(branchId);
    const rows = await query(
      `SELECT *
       FROM attendance_records
       WHERE branch_id = $1
         AND work_date >= $2::date
         AND work_date < $2::date + INTERVAL '7 days'`,
      [branchId, weekStart]
    );
    return {
      employees,
      attendance: rows.rows,
      weekStart,
      storage: 'postgres' as const,
    };
  } catch {
    return hrFileStore.getWeekAttendance(weekStart);
  }
}

export async function saveWeeklyRegister(input: {
  weekStart: string;
  branchId?: string;
  entries: Array<{
    employeeId: string;
    workDate: string;
    mark: 'P' | 'A' | '';
    startTime?: string;
    endTime?: string;
  }>;
  approvedBy?: string;
}) {
  const branchId = input.branchId ?? env.defaultBranchId;

  if (!(await dbAvailable())) {
    return hrFileStore.saveWeekAttendance(input.weekStart, input.entries);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const entry of input.entries) {
      if (!entry.mark) {
        await client.query(
          `DELETE FROM attendance_records WHERE employee_id = $1 AND work_date = $2`,
          [entry.employeeId, entry.workDate]
        );
        continue;
      }

      const hours = hoursFromTimes(entry.startTime, entry.endTime, entry.mark);
      const status =
        entry.mark === 'A' ? 'absent' : hours.overtime > 0 ? 'overtime' : 'present';
      const clockIn =
        entry.mark === 'P' && entry.startTime
          ? `${entry.workDate} ${entry.startTime}:00`
          : null;
      const clockOut =
        entry.mark === 'P' && entry.endTime ? `${entry.workDate} ${entry.endTime}:00` : null;

      await client.query(
        `INSERT INTO attendance_records (
          employee_id, branch_id, work_date, clock_in, clock_out,
          scheduled_start, scheduled_end, status, mark,
          regular_hours, overtime_hours, approved_by
        ) VALUES (
          $1, $2, $3::date,
          $4::timestamptz, $5::timestamptz,
          COALESCE($6::time, '09:00'), COALESCE($7::time, '17:00'),
          $8::attendance_status, $9,
          $10, $11, $12
        )
        ON CONFLICT (employee_id, work_date) DO UPDATE SET
          clock_in = EXCLUDED.clock_in,
          clock_out = EXCLUDED.clock_out,
          scheduled_start = EXCLUDED.scheduled_start,
          scheduled_end = EXCLUDED.scheduled_end,
          status = EXCLUDED.status,
          mark = EXCLUDED.mark,
          regular_hours = EXCLUDED.regular_hours,
          overtime_hours = EXCLUDED.overtime_hours,
          approved_by = EXCLUDED.approved_by,
          updated_at = NOW()`,
        [
          entry.employeeId,
          branchId,
          entry.workDate,
          clockIn,
          clockOut,
          entry.startTime ?? null,
          entry.endTime ?? null,
          status,
          entry.mark,
          hours.regular,
          hours.overtime,
          input.approvedBy ?? null,
        ]
      );
    }

    await client.query('COMMIT');

    const weekEndDate = new Date(input.weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const payroll = await generatePayslip(branchId, input.weekStart, weekEnd);
    const employees = await listEmployees(branchId);
    const wages = payroll.payslips.map((p: Record<string, unknown>) => {
      const emp = employees.find((e) => String(e.id) === String(p.employee_id));
      return {
        employeeId: p.employee_id,
        employeeCode: emp?.employee_code,
        employeeName: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
        regularHours: Number(p.regular_hours),
        overtimeHours: Number(p.overtime_hours),
        hourlyRate: Number(p.hourly_rate),
        grossPay: Number(p.gross_pay),
        netPay: Number(p.net_pay),
      };
    });

    return {
      saved: input.entries.length,
      weekStart: input.weekStart,
      wages,
      period: payroll.period,
      storage: 'postgres' as const,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    return hrFileStore.saveWeekAttendance(input.weekStart, input.entries);
  } finally {
    client.release();
  }
}

export async function clockIn(employeeId: string, branchId = env.defaultBranchId) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await query(
    `SELECT id FROM attendance_records WHERE employee_id = $1 AND work_date = $2`,
    [employeeId, today]
  );
  if (existing.rowCount) throw new AppError(400, 'ALREADY_CLOCKED', 'Already clocked in today');

  const emp = await query(`SELECT shift_pattern FROM employees WHERE id = $1`, [employeeId]);
  if (!emp.rowCount) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');

  const now = new Date();
  const scheduledStart = '09:00';
  const [h, m] = scheduledStart.split(':').map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const lateMinutes = Math.max(0, Math.floor((now.getTime() - scheduled.getTime()) / 60000));
  const status = lateMinutes > 5 ? 'late' : 'present';

  const res = await query(
    `INSERT INTO attendance_records
      (employee_id, branch_id, work_date, clock_in, scheduled_start, scheduled_end, status, late_minutes, mark)
     VALUES ($1, $2, $3, NOW(), $4, '17:00', $5::attendance_status, $6, 'P')
     RETURNING *`,
    [employeeId, branchId, today, scheduledStart, status, lateMinutes]
  );
  return res.rows[0];
}

export async function clockOut(employeeId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await query(
    `SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2`,
    [employeeId, today]
  );
  if (!row.rowCount) throw new AppError(400, 'NO_CLOCK_IN', 'No clock-in found for today');
  const rec = row.rows[0];
  if (rec.clock_out) throw new AppError(400, 'ALREADY_CLOCKED_OUT', 'Already clocked out');

  const clockIn = new Date(rec.clock_in);
  const clockOut = new Date();
  const hours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  const regularHours = Math.min(8, hours);
  const overtimeHours = Math.max(0, hours - 8);

  const res = await query(
    `UPDATE attendance_records SET
      clock_out = NOW(),
      regular_hours = $2,
      overtime_hours = $3,
      status = CASE WHEN $3 > 0 THEN 'overtime'::attendance_status ELSE status END
     WHERE id = $1 RETURNING *`,
    [rec.id, Number(regularHours.toFixed(2)), Number(overtimeHours.toFixed(2))]
  );
  return res.rows[0];
}

export async function calculateWeeklyPayroll(employeeId: string, weekStart: string) {
  if (!(await dbAvailable())) {
    const week = hrFileStore.getWeekAttendance(weekStart);
    const emp = week.employees.find((e) => e.id === employeeId);
    if (!emp) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    const rows = week.attendance.filter((a) => a.employee_id === employeeId);
    const regularHours = rows.reduce((s, r) => s + r.regular_hours, 0);
    const overtimeHours = rows.reduce((s, r) => s + r.overtime_hours, 0);
    const hourlyRate = emp.hourly_rate;
    const overtimeRate = hourlyRate * 1.5;
    const gross = regularHours * hourlyRate + overtimeHours * overtimeRate;
    return {
      employeeId,
      employeeName: `${emp.first_name} ${emp.last_name}`,
      weekStart,
      regularHours,
      overtimeHours,
      hourlyRate,
      overtimeRate,
      grossPay: Number(gross.toFixed(2)),
      tax: Number((gross * 0.1).toFixed(2)),
      niContribution: 0,
      bonus: 0,
      deductions: 0,
      netPay: Number((gross * 0.9).toFixed(2)),
    };
  }

  const empRes = await query(`SELECT * FROM employees WHERE id = $1`, [employeeId]);
  if (!empRes.rowCount) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  const emp = empRes.rows[0];

  const att = await query(
    `SELECT
      COALESCE(SUM(regular_hours),0) AS regular_hours,
      COALESCE(SUM(overtime_hours),0) AS overtime_hours
     FROM attendance_records
     WHERE employee_id = $1
       AND work_date >= $2::date
       AND work_date < $2::date + INTERVAL '7 days'`,
    [employeeId, weekStart]
  );

  const regularHours = Number(att.rows[0].regular_hours);
  const overtimeHours = Number(att.rows[0].overtime_hours);
  const hourlyRate = Number(emp.hourly_rate);
  const overtimeRate = hourlyRate * 1.5;
  const gross = regularHours * hourlyRate + overtimeHours * overtimeRate;
  const tax = Number((gross * 0.1).toFixed(2));
  const ni = 0;
  const bonus = 0;
  const deductions = 0;
  const net = Number((gross - tax - ni + bonus - deductions).toFixed(2));

  return {
    employeeId,
    employeeName: `${emp.first_name} ${emp.last_name}`,
    weekStart,
    regularHours,
    overtimeHours,
    hourlyRate,
    overtimeRate,
    grossPay: Number(gross.toFixed(2)),
    tax,
    niContribution: ni,
    bonus,
    deductions,
    netPay: net,
  };
}

export async function generatePayslip(branchId: string, weekStart: string, weekEnd: string) {
  if (!(await dbAvailable())) {
    const saved = hrFileStore.saveWeekAttendance(weekStart, []);
    return { period: { period_start: weekStart, period_end: weekEnd }, payslips: saved.wages };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const period = await client.query(
      `INSERT INTO payroll_periods (branch_id, period_start, period_end, status)
       VALUES ($1, $2, $3, 'draft')
       ON CONFLICT (branch_id, period_start, period_end) DO UPDATE SET status = payroll_periods.status
       RETURNING *`,
      [branchId, weekStart, weekEnd]
    );
    const periodId = period.rows[0].id;
    const employees = await client.query(
      `SELECT id FROM employees WHERE branch_id = $1 AND is_active = TRUE`,
      [branchId]
    );

    const payslips = [];
    for (const e of employees.rows) {
      const calc = await calculateWeeklyPayroll(e.id, weekStart);
      const slip = await client.query(
        `INSERT INTO payslips (
          payroll_period_id, employee_id, regular_hours, overtime_hours, hourly_rate, overtime_rate,
          gross_pay, tax, ni_contribution, bonus, deductions, net_pay
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (payroll_period_id, employee_id) DO UPDATE SET
          regular_hours = EXCLUDED.regular_hours,
          overtime_hours = EXCLUDED.overtime_hours,
          gross_pay = EXCLUDED.gross_pay,
          tax = EXCLUDED.tax,
          ni_contribution = EXCLUDED.ni_contribution,
          net_pay = EXCLUDED.net_pay
        RETURNING *`,
        [
          periodId,
          e.id,
          calc.regularHours,
          calc.overtimeHours,
          calc.hourlyRate,
          calc.overtimeRate,
          calc.grossPay,
          calc.tax,
          calc.niContribution,
          calc.bonus,
          calc.deductions,
          calc.netPay,
        ]
      );
      payslips.push(slip.rows[0]);
    }

    await client.query('COMMIT');
    return { period: period.rows[0], payslips };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
