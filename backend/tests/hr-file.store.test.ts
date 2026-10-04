import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hrFileStore } from '../src/services/hr-file.store';

const storePath = path.resolve(process.cwd(), 'data', 'hr-store.json');

describe('hr file store', () => {
  beforeEach(() => {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  });

  it('seeds default employees and creates another', () => {
    const before = hrFileStore.listEmployees().length;
    expect(before).toBeGreaterThan(0);
    const created = hrFileStore.createEmployee({
      firstName: 'Noor',
      lastName: 'Khan',
      hourlyRate: 400,
      employeeCode: 'EMP-TEST',
    });
    expect(created.employee_code).toBe('EMP-TEST');
    expect(hrFileStore.listEmployees().some((row) => row.id === created.id)).toBe(true);
    expect(() =>
      hrFileStore.createEmployee({ firstName: 'Dup', lastName: 'User', employeeCode: 'EMP-TEST' })
    ).toThrow('Employee code already exists');
  });

  it('updates, rejects a bad rate, and soft-deletes', () => {
    const created = hrFileStore.createEmployee({ firstName: 'Ali', lastName: 'Raza', employeeCode: 'EMP-UPD' });
    const updated = hrFileStore.updateEmployee(created.id, { firstName: 'Aly', hourlyRate: 450 });
    expect(updated.first_name).toBe('Aly');
    expect(updated.hourly_rate).toBe(450);
    expect(() => hrFileStore.updateEmployee(created.id, { hourlyRate: 0 })).toThrow('Hourly rate');
    expect(hrFileStore.deleteEmployee('EMP-UPD').deleted).toBe(true);
    expect(hrFileStore.listEmployees().some((row) => row.id === created.id)).toBe(false);
  });

  it('saves weekly attendance and pays overtime above 8 hours', () => {
    const created = hrFileStore.createEmployee({
      firstName: 'Hira',
      lastName: 'Beg',
      employeeCode: 'EMP-PAY',
      hourlyRate: 100,
    });
    const saved = hrFileStore.saveWeekAttendance('2026-10-05', [
      {
        employeeId: created.id,
        workDate: '2026-10-05',
        mark: 'P',
        startTime: '09:00',
        endTime: '19:00',
      },
    ]);
    const wage = saved.wages.find((row) => row.employeeId === created.id);
    expect(wage?.regularHours).toBe(8);
    expect(wage?.overtimeHours).toBe(2);
    expect(wage?.grossPay).toBe(1100);
    const week = hrFileStore.getWeekAttendance('2026-10-05');
    expect(week.attendance.some((row) => row.employee_id === created.id)).toBe(true);
  });
});
