import { query } from '../config/db';
import { env } from '../config/env';
import { inventorySummary } from './inventory.service';

export async function getDashboardStats(branchId = env.defaultBranchId) {
  const sales = await query(
    `SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE created_at::date = CURRENT_DATE AND status NOT IN ('cancelled','rejected')),0) AS today_sales,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE) AND status NOT IN ('cancelled','rejected')),0) AS weekly_sales,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE) AND status NOT IN ('cancelled','rejected')),0) AS monthly_sales,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('year', CURRENT_DATE) AND status NOT IN ('cancelled','rejected')),0) AS yearly_sales,
      COUNT(*) FILTER (WHERE status IN ('pending','received','accepted','preparing','cooking','ready','out_for_delivery'))::int AS pending_orders,
      COUNT(*) FILTER (WHERE status IN ('completed','delivered') AND created_at::date = CURRENT_DATE)::int AS completed_orders,
      COUNT(*) FILTER (WHERE status IN ('cancelled','rejected') AND created_at::date = CURRENT_DATE)::int AS cancelled_orders
     FROM orders WHERE branch_id = $1`,
    [branchId]
  );

  const topItems = await query(
    `SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS qty, SUM(oi.line_total)::numeric AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.branch_id = $1 AND o.status NOT IN ('cancelled','rejected')
       AND o.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY oi.name_snapshot
     ORDER BY qty DESC
     LIMIT 10`,
    [branchId]
  );

  const revenueChart = await query(
    `SELECT created_at::date AS day, ROUND(SUM(total_amount)::numeric,2) AS revenue, COUNT(*)::int AS orders
     FROM orders
     WHERE branch_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '14 days'
       AND status NOT IN ('cancelled','rejected')
     GROUP BY 1 ORDER BY 1`,
    [branchId]
  );

  const customers = await query(
    `SELECT COUNT(*)::int AS total_customers,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_customers
     FROM customers`
  );

  const expenses = await query(
    `SELECT COALESCE(SUM(amount),0) AS month_expenses
     FROM expenses
     WHERE branch_id = $1 AND expense_date >= date_trunc('month', CURRENT_DATE)`,
    [branchId]
  );

  const attendance = await query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'present')::int AS present,
      COUNT(*) FILTER (WHERE status = 'late')::int AS late,
      COUNT(*) FILTER (WHERE status = 'absent')::int AS absent
     FROM attendance_records
     WHERE branch_id = $1 AND work_date = CURRENT_DATE`,
    [branchId]
  );

  const inventory = await inventorySummary(branchId);
  const todaySales = Number(sales.rows[0].today_sales);
  const monthExpenses = Number(expenses.rows[0].month_expenses);
  const monthlySales = Number(sales.rows[0].monthly_sales);

  // Simple AI-style forecast: average of last 7 days * weekday factor
  const forecast = await query(
    `SELECT ROUND(AVG(daily)::numeric, 2) AS avg_daily FROM (
       SELECT created_at::date d, SUM(total_amount) daily
       FROM orders
       WHERE branch_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
         AND status NOT IN ('cancelled','rejected')
       GROUP BY 1
     ) t`,
    [branchId]
  );

  return {
    sales: sales.rows[0],
    topSellingItems: topItems.rows,
    revenueChart: revenueChart.rows,
    customers: customers.rows[0],
    inventory,
    attendance: attendance.rows[0],
    profit: {
      monthlySales,
      monthExpenses,
      estimatedProfit: Number((monthlySales - monthExpenses).toFixed(2)),
    },
    aiForecast: {
      predictedTomorrowSales: Number(forecast.rows[0]?.avg_daily ?? 0),
      model: 'moving-average-v1',
    },
  };
}
