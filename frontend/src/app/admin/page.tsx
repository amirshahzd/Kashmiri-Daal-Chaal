'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  Users,
  Truck,
  BarChart3,
  ChefHat,
  Wallet,
  ClipboardList,
  KeyRound,
  UserPlus,
  UtensilsCrossed,
  MapPin,
  Monitor,
  Bell,
  History,
} from 'lucide-react';
import { CATEGORIES, formatPKR, type MenuItem } from '@/lib/data';
import { addMenuItemFromAdmin, deleteMenuItemFromAdmin, listAdminMenuItems, refreshMenuCatalogFromServer, updateMenuItemFromAdmin } from '@/lib/menu-catalog';
import { AttendanceRegister } from '@/components/AttendanceRegister';
import { PayrollPanel } from '@/components/PayrollPanel';
import { InventoryPanel } from '@/components/InventoryPanel';
import { MenuImageFx } from '@/components/MenuImageFx';
import {
  AdminOrderUnlockPanel,
  KitchenStation,
  KitchenUpdatesPage,
  ManagerOrderDeliveryPage,
  ManagerStation,
  StaffNotificationBadge,
} from '@/components/OrderStation';
import {
  defaultTabForRole,
  tabsAllowedForRole,
  normalizeStaffRole,
} from '@/lib/order-workflow';
import {
  clearAdminSession,
  readAdminSession,
  writeAdminSession,
} from '@/lib/admin-session';
import { api, ApiError } from '@/lib/api';
import {
  clearAuthSession,
  formatRolesLabel,
  isStaffUser,
  readAuthSession,
  roleDisplayName,
  writeAuthSession,
} from '@/lib/auth-session';
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  fetchDeliveryRadiusKm,
  saveDeliveryRadiusKm,
} from '@/lib/delivery-range';
const NAV = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'manager-station', label: 'Manager station', icon: Monitor },
  { id: 'order-delivery', label: 'Order delivery', icon: Truck },
  { id: 'kitchen-station', label: 'Kitchen station', icon: Bell },
  { id: 'kitchen-updates', label: 'Kitchen updates', icon: History },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'attendance', label: 'Attendance', icon: ClipboardList },
  { id: 'hr', label: 'HR & Payroll', icon: Users },
  { id: 'staff', label: 'User access', icon: KeyRound },
  { id: 'kds', label: 'Kitchen (KDS)', icon: ChefHat },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Wallet },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
];

const ACCESS_LEVELS = [
  { value: 'admin', label: 'Admin — full portal access' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'employee', label: 'Employee' },
  { value: 'customer', label: 'Customer only (online ordering)' },
] as const;

const VALID_TABS = new Set(NAV.map((n) => n.id));

const STATS = [
  { label: "Today's Sales", value: 'Rs 48,500' },
  { label: 'Weekly Sales', value: 'Rs 3,15,000' },
  { label: 'Monthly Sales', value: 'Rs 12,40,000' },
  { label: 'Yearly Sales', value: 'Rs 1.45 Cr' },
  { label: 'Pending Orders', value: '7' },
  { label: 'Completed', value: '34' },
  { label: 'Cancelled', value: '2' },
  { label: 'Inventory Value', value: 'Rs 4,85,000' },
  { label: 'Profit (month)', value: 'Rs 3,90,000' },
  { label: 'Expenses', value: 'Rs 8,50,000' },
  { label: 'Customers', value: '1,284' },
  { label: 'Low Stock Alerts', value: '3' },
];

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-center text-sm text-muted">Loading admin…</p>}>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') || 'overview';
  const urlTab = VALID_TABS.has(rawTab) ? rawTab : 'overview';

  const [tab, setTabState] = useState(urlTab);
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState('admin');
  const [email, setEmail] = useState('admin@admin.com');
  const [orders, setOrders] = useState<
    Array<{ id: string; type: string; status: string; total: string; customer: string }>
  >([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [accounts, setAccounts] = useState<{
    users: Array<Record<string, unknown>>;
    customers: Array<Record<string, unknown>>;
    storage?: string;
  } | null>(null);
  const [staffUsers, setStaffUsers] = useState<Array<Record<string, unknown>>>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [accessLevel, setAccessLevel] = useState<string>('employee');
  const [myCredMsg, setMyCredMsg] = useState('');
  const [myCredErr, setMyCredErr] = useState('');
  const [myCredBusy, setMyCredBusy] = useState(false);
  /** Isolated per-user credential form feedback: key = user id */
  const [userCredState, setUserCredState] = useState<
    Record<string, { msg?: string; err?: string; busy?: boolean }>
  >({});
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuMsg, setMenuMsg] = useState('');
  const [menuErr, setMenuErr] = useState('');
  const [menuBusy, setMenuBusy] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Array<Record<string, unknown>>>([]);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierMsg, setSupplierMsg] = useState('');
  const [supplierErr, setSupplierErr] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(DEFAULT_DELIVERY_RADIUS_KM);
  const [deliveryRadiusInput, setDeliveryRadiusInput] = useState(String(DEFAULT_DELIVERY_RADIUS_KM));
  const [deliveryRadiusBusy, setDeliveryRadiusBusy] = useState(false);
  const [deliveryRadiusMsg, setDeliveryRadiusMsg] = useState('');
  const [deliveryRadiusErr, setDeliveryRadiusErr] = useState('');

  // Keep local tab in sync when user uses Back or a direct link
  useEffect(() => {
    setTabState(urlTab);
  }, [urlTab]);

  const allowedTabs = tabsAllowedForRole(role);
  const visibleNav = NAV.filter((n) => allowedTabs === 'all' || allowedTabs.includes(n.id));

  function setTab(id: string) {
    if (allowedTabs !== 'all' && !allowedTabs.includes(id)) {
      id = defaultTabForRole(role);
    }
    setTabState(id);
    if (id === 'overview') router.push('/admin');
    else router.push(`/admin?tab=${id}`);
  }

  // Enforce role tab access
  useEffect(() => {
    if (!authed) return;
    if (allowedTabs === 'all') return;
    if (!allowedTabs.includes(tab)) {
      const d = defaultTabForRole(role);
      setTabState(d);
      router.replace(d === 'overview' ? '/admin' : `/admin?tab=${d}`);
    }
  }, [authed, role, tab, allowedTabs, router]);

  useEffect(() => {
    const session = readAdminSession();
    const auth = readAuthSession();
    if (session) {
      setAuthed(true);
      setRole(session.role);
      setEmail(session.email);
      if (auth?.user?.id) setSessionUserId(auth.user.id);
    } else if (auth && isStaffUser(auth.user)) {
      const r = auth.user.roles.find((x) => x !== 'customer') || 'admin';
      writeAdminSession({ role: r === 'owner' ? 'admin' : r, email: auth.user.email });
      setAuthed(true);
      setRole(r === 'owner' ? 'admin' : r);
      setEmail(auth.user.email);
      setSessionUserId(auth.user.id);
    }
    setSessionReady(true);
  }, []);

  // Load delivery radius setting when admin is authenticated
  useEffect(() => {
    if (!authed) return;
    void fetchDeliveryRadiusKm().then((km) => {
      setDeliveryRadiusKm(km);
      setDeliveryRadiusInput(String(km));
    });
  }, [authed]);

  async function saveDeliveryRadius(e: FormEvent) {
    e.preventDefault();
    setDeliveryRadiusMsg('');
    setDeliveryRadiusErr('');
    const n = Number(deliveryRadiusInput);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      setDeliveryRadiusErr('Enter a radius between 1 and 50 km.');
      return;
    }
    setDeliveryRadiusBusy(true);
    try {
      const saved = await saveDeliveryRadiusKm(n);
      setDeliveryRadiusKm(saved);
      setDeliveryRadiusInput(String(saved));
      setDeliveryRadiusMsg(
        `Delivery radius updated to ${saved} km. Online checkout will use this limit for customers.`
      );
    } catch (err) {
      setDeliveryRadiusErr(err instanceof Error ? err.message : 'Could not save delivery radius.');
    } finally {
      setDeliveryRadiusBusy(false);
    }
  }

  async function loadAccountsList() {
    try {
      const data = await api<{
        users: Array<Record<string, unknown>>;
        customers: Array<Record<string, unknown>>;
        storage?: string;
      }>('/auth/accounts');
      setStaffUsers(data.users || []);
      return data;
    } catch {
      setStaffUsers([]);
      return null;
    }
  }

  useEffect(() => {
    if (!authed || tab !== 'customers') return;
    void (async () => {
      try {
        const data = await api<{
          customers: Array<Record<string, unknown>>;
          recentOrders?: Array<Record<string, unknown>>;
          storage?: string;
          users?: Array<Record<string, unknown>>;
        }>('/customers');
        setAccounts({
          users: (data.customers || []).map((c) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            phone: c.phone,
            roles: c.loyalty
              ? `customer · ${(c.loyalty as { tierLabel?: string }).tierLabel || ''} · ${c.loyalty_points || 0} pts`
              : `customer · ${c.loyalty_points || 0} pts`,
            total_orders: c.total_orders,
            total_spent: c.total_spent,
            loyalty_points: c.loyalty_points,
          })),
          customers: data.customers || [],
          storage: data.storage,
        });
      } catch {
        setAccounts({ users: [], customers: [] });
      }
    })();
  }, [authed, tab]);

  useEffect(() => {
    if (!authed || tab !== 'suppliers') return;
    void loadSuppliers();
  }, [authed, tab]);

  async function loadSuppliers() {
    try {
      const data = await api<{ suppliers: Array<Record<string, unknown>>; storage?: string }>(
        '/suppliers'
      );
      setSuppliers(data.suppliers || []);
    } catch {
      setSuppliers([]);
    }
  }

  async function handleAddSupplier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSupplierErr('');
    setSupplierMsg('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) {
      setSupplierErr('Supplier name is required.');
      return;
    }
    setSupplierBusy(true);
    try {
      await api('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          contactName: String(fd.get('contactName') || '').trim() || undefined,
          email: String(fd.get('email') || '').trim() || undefined,
          phone: String(fd.get('phone') || '').trim() || undefined,
          city: String(fd.get('city') || '').trim() || undefined,
          postcode: String(fd.get('postcode') || '').trim() || undefined,
          notes: String(fd.get('notes') || '').trim() || undefined,
        }),
      });
      setSupplierMsg(`Supplier “${name}” saved.`);
      form.reset();
      await loadSuppliers();
    } catch (err) {
      setSupplierErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed');
    } finally {
      setSupplierBusy(false);
    }
  }

  useEffect(() => {
    if (!authed || tab !== 'staff') return;
    void loadAccountsList();
  }, [authed, tab]);

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateErr('');
    setCreateMsg('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirmPassword') || '');
    const phone = String(fd.get('phone') || '').trim();
    const loginId = String(fd.get('loginId') || '').trim();
    if (!loginId) {
      setCreateErr('User id is required.');
      return;
    }
    if (!phone) {
      setCreateErr('Contact number is required.');
      return;
    }
    if (password !== confirm) {
      setCreateErr('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setCreateErr('Password must be at least 8 characters.');
      return;
    }

    setCreateBusy(true);
    try {
      const session = readAuthSession();
      const result = await api<{ message?: string; user?: { email: string; roles: string[] } }>(
        '/auth/create-user',
        {
          method: 'POST',
          token: session?.accessToken,
          body: JSON.stringify({
            firstName: String(fd.get('firstName') || '').trim(),
            lastName: String(fd.get('lastName') || '').trim(),
            email: loginId,
            phone,
            password,
            accountType: accessLevel,
          }),
        }
      );
      setCreateMsg(
        result.message ||
          `Account created. Access: ${roleDisplayName(accessLevel === 'admin' ? 'owner' : accessLevel)}.`
      );
      form.reset();
      setAccessLevel('employee');
      await loadAccountsList();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed';
      setCreateErr(msg);
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleUpdateMyLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMyCredErr('');
    setMyCredMsg('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const session = readAuthSession();
    if (!session?.user?.id) {
      setMyCredErr('Session expired. Sign in again.');
      return;
    }
    const newLoginId = String(fd.get('newLoginId') || '').trim();
    const newPassword = String(fd.get('newPassword') || '');
    const confirm = String(fd.get('confirmPassword') || '');
    const currentPassword = String(fd.get('currentPassword') || '');
    if (!newLoginId && !newPassword) {
      setMyCredErr('Enter a new user id and/or new password.');
      return;
    }
    if (newPassword && newPassword !== confirm) {
      setMyCredErr('New passwords do not match.');
      return;
    }
    if (!currentPassword) {
      setMyCredErr('Enter your current password to confirm.');
      return;
    }
    setMyCredBusy(true);
    try {
      const result = await api<{
        message?: string;
        user?: { id: string; email: string; firstName: string; lastName: string; roles: string[] };
      }>('/auth/update-login', {
        method: 'POST',
        token: session.accessToken,
        body: JSON.stringify({
          userId: session.user.id,
          newLoginId: newLoginId || undefined,
          newPassword: newPassword || undefined,
          currentPassword,
        }),
      });
      if (result.user) {
        writeAuthSession({
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            roles: result.user.roles,
          },
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          storage: session.storage,
        });
        writeAdminSession({
          role: (result.user.roles.find((r) => r !== 'customer') || 'admin') === 'owner'
            ? 'admin'
            : result.user.roles.find((r) => r !== 'customer') || 'admin',
          email: result.user.email,
        });
        setEmail(result.user.email);
      }
      setMyCredMsg(result.message || 'Your login details were updated.');
      form.reset();
      await loadAccountsList();
    } catch (err) {
      setMyCredErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed');
    } finally {
      setMyCredBusy(false);
    }
  }

  async function handleUpdateOtherLogin(userId: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const session = readAuthSession();
    const newLoginId = String(fd.get('newLoginId') || '').trim();
    const newPassword = String(fd.get('newPassword') || '');
    if (!newLoginId && !newPassword) {
      setUserCredState((s) => ({
        ...s,
        [userId]: { err: 'Enter a new user id and/or password for this account only.' },
      }));
      return;
    }
    setUserCredState((s) => ({ ...s, [userId]: { busy: true } }));
    try {
      const result = await api<{ message?: string }>('/auth/update-login', {
        method: 'POST',
        token: session?.accessToken,
        body: JSON.stringify({
          userId,
          newLoginId: newLoginId || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      setUserCredState((s) => ({
        ...s,
        [userId]: { msg: result.message || 'Updated for this account only.' },
      }));
      form.reset();
      await loadAccountsList();
    } catch (err) {
      setUserCredState((s) => ({
        ...s,
        [userId]: {
          err: err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed',
        },
      }));
    }
  }

  useEffect(() => {
    function loadLiveOrders() {
      try {
        const history = JSON.parse(localStorage.getItem('kdc-orders') || '[]') as Array<{
          id: string;
          orderType: string;
          status?: string;
          total: number;
          customerName?: string;
        }>;
        if (history.length) {
          const live = history.map((o) => ({
            id: o.id,
            type: o.orderType,
            status: o.status || 'received',
            total: formatPKR(o.total),
            customer: o.customerName || 'Guest',
          }));
          setOrders(live);
        }
      } catch {
        /* ignore */
      }
    }
    loadLiveOrders();
    window.addEventListener('kdc-orders-change', loadLiveOrders);
    window.addEventListener('storage', loadLiveOrders);
    return () => {
      window.removeEventListener('kdc-orders-change', loadLiveOrders);
      window.removeEventListener('storage', loadLiveOrders);
    };
  }, []);

  useEffect(() => {
    if (tab !== 'menu') return;
    void refreshMenuCatalogFromServer().then(() => setMenuItems(listAdminMenuItems()));
  }, [tab]);

  async function handleAddMenuItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMenuErr('');
    setMenuMsg('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const price = Number(fd.get('price') || 0);
    if (!name) {
      setMenuErr('Dish name is required.');
      return;
    }
    if (!(price > 0)) {
      setMenuErr('Enter a valid price.');
      return;
    }
    setMenuBusy(true);
    try {
      await addMenuItemFromAdmin({
        name,
        description: String(fd.get('description') || '').trim(),
        price,
        categorySlug: String(fd.get('category') || 'mains'),
        prepTimeMinutes: Number(fd.get('prep') || 15) || 15,
        imageUrl: String(fd.get('imageUrl') || '').trim() || undefined,
      });
      setMenuMsg(`“${name}” added for all customers (menu, order, home).`);
      setMenuItems(listAdminMenuItems());
      form.reset();
    } catch {
      setMenuErr('Could not add menu item.');
    } finally {
      setMenuBusy(false);
    }
  }

  async function handleUpdateMenuItem(id: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMenuErr('');
    setMenuMsg('');
    const fd = new FormData(e.currentTarget);
    const price = Number(fd.get('price') || 0);
    const name = String(fd.get('name') || '').trim();
    if (!name) {
      setMenuErr('Dish name is required.');
      return;
    }
    if (!(price > 0)) {
      setMenuErr('Enter a valid price.');
      return;
    }
    setMenuBusy(true);
    try {
      const discountRaw = String(fd.get('discountPercent') || '').trim();
      const discountPercent = discountRaw === '' ? undefined : Number(discountRaw);
      const updated = await updateMenuItemFromAdmin(id, {
        name,
        description: String(fd.get('description') || '').trim(),
        price,
        categorySlug: String(fd.get('category') || 'mains'),
        prepTimeMinutes: Number(fd.get('prep') || 15) || 15,
        imageUrl: String(fd.get('imageUrl') || '').trim() || undefined,
        discountPercent:
          discountPercent != null && !Number.isNaN(discountPercent) ? discountPercent : 0,
        isAvailable: fd.get('isAvailable') === 'on',
      });
      if (!updated) {
        setMenuErr('Menu item not found.');
        return;
      }
      setMenuMsg(`Updated “${updated.name}” — price ${formatPKR(updated.price)}. Live for everyone.`);
      setMenuItems(listAdminMenuItems());
      setEditingMenuId(null);
    } catch {
      setMenuErr('Could not update menu item.');
    } finally {
      setMenuBusy(false);
    }
  }

  async function handleDeleteMenuItem(id: string, name: string) {
    setMenuErr('');
    setMenuMsg('');
    if (
      !window.confirm(
        `Remove “${name}” from the menu? Customers will no longer see this dish. You can add it again later if needed.`
      )
    ) {
      return;
    }
    try {
      await deleteMenuItemFromAdmin(id);
      setMenuMsg(`“${name}” removed from the menu for all customers.`);
      setEditingMenuId((cur) => (cur === id ? null : cur));
      setMenuItems(listAdminMenuItems());
    } catch {
      setMenuErr('Could not remove menu item.');
    }
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError('');
    const form = e.currentTarget;
    const formEmail =
      (form.elements.namedItem('admin-email') as HTMLInputElement | null)?.value?.trim() || email;
    const password =
      (form.elements.namedItem('admin-password') as HTMLInputElement | null)?.value || '';

    if (!formEmail || !password) {
      setLoginError('Invalid login details');
      return;
    }

    setLoginBusy(true);
    try {
      const result = await api<{
        user: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          roles: string[];
        };
        accessToken: string;
        refreshToken?: string;
        storage?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: formEmail, password }),
      });

      if (!isStaffUser(result.user)) {
        setLoginError(
          'Invalid login details for admin. Use a staff account (owner/manager), not a customer account.'
        );
        return;
      }

      const r = result.user.roles.find((x) => x !== 'customer') || role || 'admin';
      const roleLabel = r === 'owner' ? 'admin' : r;
      writeAuthSession({
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          roles: result.user.roles,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        storage: result.storage,
      });
      writeAdminSession({ role: roleLabel, email: result.user.email });
      setRole(roleLabel);
      setEmail(result.user.email);
      setSessionUserId(result.user.id);
      setAuthed(true);
      const home = defaultTabForRole(roleLabel);
      setTabState(home);
      router.replace(home === 'overview' ? '/admin' : `/admin?tab=${home}`);
    } catch {
      setLoginError('Invalid login details');
    } finally {
      setLoginBusy(false);
    }
  }

  function handleSignOut() {
    clearAdminSession();
    clearAuthSession();
    // Full refresh → home; nav shows Sign in / Sign up again
    window.location.assign('/');
  }

  function advanceOrder(id: string) {
    const flow = [
      'received',
      'accepted',
      'preparing',
      'cooking',
      'ready',
      'out_for_delivery',
      'delivered',
    ];

    let nextStatus = 'received';
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const i = flow.indexOf(o.status);
        nextStatus = flow[Math.min(i < 0 ? 0 : i + 1, flow.length - 1)];
        // Skip delivery-only stage for non-delivery orders
        if (nextStatus === 'out_for_delivery' && o.type !== 'delivery') {
          nextStatus = 'delivered';
        }
        return { ...o, status: nextStatus };
      })
    );

    // Persist status so customer tracking only updates when admin advances
    try {
      const history = JSON.parse(localStorage.getItem('kdc-orders') || '[]') as Array<
        Record<string, unknown>
      >;
      let found = false;
      const updated = history.map((o) => {
        if (String(o.id) !== id) return o;
        found = true;
        const i = flow.indexOf(String(o.status || 'received'));
        let next = flow[Math.min(i < 0 ? 0 : i + 1, flow.length - 1)];
        if (next === 'out_for_delivery' && String(o.orderType || o.type) !== 'delivery') {
          next = 'delivered';
        }
        nextStatus = next;
        return { ...o, status: next };
      });
      if (found) {
        localStorage.setItem('kdc-orders', JSON.stringify(updated));
      }
      const lastRaw = localStorage.getItem('kdc-last-order');
      if (lastRaw) {
        const last = JSON.parse(lastRaw) as Record<string, unknown>;
        if (String(last.id) === id) {
          localStorage.setItem('kdc-last-order', JSON.stringify({ ...last, status: nextStatus }));
        }
      }
      window.dispatchEvent(new Event('kdc-orders-change'));
    } catch {
      /* ignore */
    }
  }

  if (!sessionReady) {
    return <p className="px-4 py-16 text-center text-sm text-muted">Loading admin…</p>;
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Staff portal</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
          Admin login
        </h1>
        <p className="mt-2 text-sm text-muted">
          Staff sign-in. Default administrator:{' '}
          <span className="font-medium text-ink">admin@admin.com</span> /{' '}
          <span className="font-medium text-ink">admin1234</span>
          . Change login details anytime under <span className="font-medium text-ink">User access</span>
          — each account keeps separate credentials.
        </p>
        <form className="mt-8 space-y-4" onSubmit={(e) => void handleLogin(e)}>
          <input
            name="admin-email"
            type="email"
            required
            className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm placeholder:text-ink/35"
            placeholder="admin@admin.com"
            autoComplete="username"
          />
          <input
            type="password"
            name="admin-password"
            required
            className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm placeholder:text-ink/35"
            placeholder="admin1234"
            autoComplete="current-password"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-4 py-3 text-sm"
          >
            {['admin', 'manager', 'cashier', 'kitchen', 'delivery', 'employee'].map((r) => (
              <option key={r} value={r}>
                {roleDisplayName(r)}
              </option>
            ))}
          </select>
          {loginError && (
            <p className="rounded-xl bg-crimson/10 px-3 py-2 text-sm text-crimson" role="alert">
              {loginError}
            </p>
          )}
          <button type="submit" disabled={loginBusy} className="kdc-button kdc-button-primary w-full disabled:opacity-60">
            {loginBusy ? 'Signing in…' : 'Sign in to dashboard'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[1400px] flex-col gap-6 px-3 py-6 md:flex-row md:px-4">
      <aside className="print-hide w-full shrink-0 rounded-2xl border border-[var(--kdc-border)] bg-crimson-deep p-4 text-white md:w-60">
        <p className="font-[family-name:var(--font-display)] text-xl text-gold-soft">KDC Admin</p>
        <p className="mt-1 text-xs text-white/60">Role: {roleDisplayName(role)}</p>
        <nav className="mt-6 space-y-1">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setTab(n.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  tab === n.id ? 'bg-white/15 text-gold-soft' : 'hover:bg-white/10'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1">{n.label}</span>
                {(n.id === 'manager-station' ||
                  n.id === 'kitchen-station' ||
                  n.id === 'order-delivery' ||
                  n.id === 'kitchen-updates') && (
                  <StaffNotificationBadge role={normalizeStaffRole(role)} />
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 text-xs text-white/60 underline"
        >
          Sign out
        </button>
      </aside>

      <section className="flex-1 rounded-2xl border border-[var(--kdc-border)] bg-surface p-5 md:p-7">
        {tab === 'overview' && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">Operations dashboard</h1>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--kdc-border)] p-4">
                  <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-crimson">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--kdc-border)] p-4">
                <p className="font-semibold">Revenue (14-day sparkline)</p>
                <div className="mt-4 flex h-28 items-end gap-1">
                  {[42, 55, 48, 70, 63, 80, 74, 90, 68, 85, 92, 78, 88, 95].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-crimson to-gold"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--kdc-border)] p-4">
                <p className="font-semibold">AI sales forecast</p>
                <p className="mt-3 text-sm text-muted">
                  Predicted tomorrow: <strong className="text-ink">Rs 52,000</strong> (moving-average-v1)
                </p>
                <p className="mt-2 text-sm text-muted">
                  Inventory prediction: Restock Pepsi & chicken within 3 days based on burn rate.
                </p>
                <p className="mt-4 text-xs text-muted">Attendance today: 8 present · 1 late · 0 absent</p>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-[var(--kdc-border)] p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-crimson/10 p-2 text-crimson">
                  <MapPin size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">Food delivery radius</p>
                  <p className="mt-1 text-sm text-muted">
                    Customers can only order delivery within this distance of the Hall Road kitchen.
                    Default is {DEFAULT_DELIVERY_RADIUS_KM} km. Change it below — checkout will use the
                    new limit.
                  </p>
                  <p className="mt-2 text-sm">
                    Current radius:{' '}
                    <strong className="text-crimson">{deliveryRadiusKm} km</strong>
                  </p>
                  <form
                    onSubmit={saveDeliveryRadius}
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <label className="text-sm">
                      <span className="text-muted">Radius (km)</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        step={0.5}
                        value={deliveryRadiusInput}
                        onChange={(e) => setDeliveryRadiusInput(e.target.value)}
                        className="mt-1 block w-32 rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-crimson"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={deliveryRadiusBusy}
                      className="kdc-button kdc-button-primary disabled:opacity-60"
                    >
                      {deliveryRadiusBusy ? 'Saving…' : 'Save radius'}
                    </button>
                    <button
                      type="button"
                      disabled={deliveryRadiusBusy}
                      onClick={() => setDeliveryRadiusInput(String(DEFAULT_DELIVERY_RADIUS_KM))}
                      className="rounded-xl border border-[var(--kdc-border)] px-4 py-2 text-sm text-muted hover:text-ink"
                    >
                      Reset to {DEFAULT_DELIVERY_RADIUS_KM} km
                    </button>
                  </form>
                  {deliveryRadiusMsg && (
                    <p className="mt-3 text-sm text-emerald-700">{deliveryRadiusMsg}</p>
                  )}
                  {deliveryRadiusErr && (
                    <p className="mt-3 text-sm text-crimson">{deliveryRadiusErr}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'manager-station' && (
          <ManagerStation role={normalizeStaffRole(role)} actor={email || 'manager'} />
        )}

        {tab === 'order-delivery' && (
          <ManagerOrderDeliveryPage
            role={normalizeStaffRole(role)}
            actor={email || 'manager'}
          />
        )}

        {tab === 'kitchen-station' && (
          <KitchenStation role={normalizeStaffRole(role)} actor={email || 'kitchen'} />
        )}

        {tab === 'kitchen-updates' && (
          <KitchenUpdatesPage role={normalizeStaffRole(role)} />
        )}

        {tab === 'orders' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-3xl">Customer orders</h1>
              <Link href="/admin?tab=kitchen-station" className="text-sm text-crimson underline">
                Kitchen station →
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted">
              Full list. Prefer <strong>Manager station</strong> for payment verification and{' '}
              <strong>Kitchen station</strong> for preparation. Stages lock after each action.
            </p>
            {(normalizeStaffRole(role) === 'admin') && (
              <AdminOrderUnlockPanel actor={email || 'admin'} />
            )}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[var(--kdc-border)] text-muted">
                  <tr>
                    <th className="py-2">Order</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-muted">
                        No customer orders yet.
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-[var(--kdc-border)]">
                      <td className="py-3 font-mono text-xs">{o.id}</td>
                      <td>{o.customer}</td>
                      <td>{o.type}</td>
                      <td>
                        <span className="rounded-full bg-crimson/10 px-2 py-0.5 text-xs text-crimson">
                          {o.status}
                        </span>
                      </td>
                      <td>{o.total}</td>
                      <td className="space-x-2">
                        {normalizeStaffRole(role) === 'admin' ? (
                          <button
                            type="button"
                            onClick={() => advanceOrder(o.id)}
                            className="text-xs text-crimson underline"
                          >
                            Admin advance
                          </button>
                        ) : (
                          <span className="text-xs text-muted">Use station boards</span>
                        )}
                        <Link
                          href={`/admin/print-slip/${o.id}`}
                          className="text-xs text-muted underline"
                          target="_blank"
                        >
                          Slip
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'menu' && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">Menu</h1>
            <p className="mt-2 text-sm text-muted">
              Add dishes, and update prices or other details for any item on the customer menu.
            </p>

            {menuErr && (
              <p className="mt-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">
                {menuErr}
              </p>
            )}
            {menuMsg && (
              <p className="mt-4 rounded-xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
                {menuMsg}
              </p>
            )}

            <form
              onSubmit={handleAddMenuItem}
              className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-[var(--kdc-border)] p-5"
            >
              <p className="text-sm font-semibold">Add new menu item</p>
              <input
                name="name"
                required
                placeholder="Dish name"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <textarea
                name="description"
                rows={3}
                placeholder="Description"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="price"
                  type="number"
                  min={1}
                  required
                  placeholder="Price (PKR)"
                  className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                />
                <input
                  name="prep"
                  type="number"
                  min={1}
                  defaultValue={15}
                  placeholder="Prep minutes"
                  className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                />
              </div>
              <select
                name="category"
                defaultValue="mains"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                name="imageUrl"
                type="url"
                placeholder="Image URL (shown as 3D on menu — optional)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-muted">
                Any image URL is saved and displayed with 3D motion (tilt, depth, food smoke or drink
                drips) on the live menu.
              </p>
              <button
                type="submit"
                disabled={menuBusy}
                className="kdc-button kdc-button-primary disabled:opacity-60"
              >
                {menuBusy ? 'Adding…' : 'Add to menu'}
              </button>
            </form>

            <h2 className="mt-10 text-lg font-semibold">Current menu ({menuItems.length})</h2>
            <p className="mt-1 text-xs text-muted">
              Open Edit to change price or details. Use Delete to remove a discontinued dish from the
              customer menu.
            </p>
            <ul className="mt-4 space-y-3">
              {menuItems.map((m) => {
                const open = editingMenuId === m.id;
                return (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-[var(--kdc-border)] px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="relative h-14 w-14 shrink-0 overflow-visible rounded-xl">
                          <MenuImageFx
                            categorySlug={m.categorySlug}
                            variant="compact"
                            className="absolute inset-0 rounded-xl"
                          >
                            <Image
                              src={m.imageUrl}
                              alt={m.name}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </MenuImageFx>
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted"> · {m.categoryName}</span>
                          {m.id.startsWith('admin-') && (
                            <span className="ml-2 text-xs text-crimson">added</span>
                          )}
                          {m.isAvailable === false && (
                            <span className="ml-2 text-xs text-muted">unavailable</span>
                          )}
                          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-gold">
                            3D display
                          </span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-crimson">{formatPKR(m.price)}</span>
                        <button
                          type="button"
                          className="text-xs text-crimson underline"
                          onClick={() => {
                            setMenuErr('');
                            setMenuMsg('');
                            setEditingMenuId(open ? null : m.id);
                          }}
                        >
                          {open ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted underline hover:text-crimson"
                          disabled={menuBusy}
                          onClick={() => handleDeleteMenuItem(m.id, m.name)}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                    {open && (
                      <form
                        onSubmit={(e) => handleUpdateMenuItem(m.id, e)}
                        className="mt-4 grid gap-3 border-t border-[var(--kdc-border)] pt-4 sm:grid-cols-2"
                      >
                        <input
                          name="name"
                          required
                          defaultValue={m.name}
                          placeholder="Dish name"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm sm:col-span-2"
                        />
                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={m.description}
                          placeholder="Description"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm sm:col-span-2"
                        />
                        <input
                          name="price"
                          type="number"
                          min={1}
                          required
                          defaultValue={m.price}
                          placeholder="Price (PKR)"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                        />
                        <input
                          name="discountPercent"
                          type="number"
                          min={0}
                          max={90}
                          defaultValue={m.discountPercent || 0}
                          placeholder="Discount %"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                        />
                        <input
                          name="prep"
                          type="number"
                          min={1}
                          defaultValue={m.prepTimeMinutes}
                          placeholder="Prep minutes"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                        />
                        <select
                          name="category"
                          defaultValue={m.categorySlug}
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <input
                          name="imageUrl"
                          type="url"
                          defaultValue={m.imageUrl}
                          placeholder="Image URL"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm sm:col-span-2"
                        />
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                          <input
                            name="isAvailable"
                            type="checkbox"
                            defaultChecked={m.isAvailable !== false}
                          />
                          Available for customers to order
                        </label>
                        <button
                          type="submit"
                          disabled={menuBusy}
                          className="kdc-button kdc-button-primary sm:col-span-2 disabled:opacity-60"
                        >
                          {menuBusy ? 'Saving…' : 'Save menu details'}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === 'inventory' && <InventoryPanel />}

        {tab === 'attendance' && <AttendanceRegister />}

        {tab === 'hr' && <PayrollPanel onOpenAttendance={() => setTab('attendance')} />}

        {tab === 'kds' && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">Kitchen Display</h1>
            <p className="mt-2 text-sm text-muted">
              Quick view. Use the full <strong>Kitchen station</strong> for ready-to-deliver and print
              slips.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {orders
                .filter((o) => ['received', 'preparing', 'cooking', 'accepted'].includes(o.status))
                .map((o) => (
                <div key={o.id} className="rounded-xl border-2 border-gold bg-crimson-deep p-4 text-white">
                  <p className="font-mono text-xs text-gold">{o.id}</p>
                  <p className="mt-2 text-lg font-semibold">{o.customer}</p>
                  <p className="text-sm text-white/70">{o.type} · {o.status}</p>
                  <Link
                    href="/admin?tab=kitchen-station"
                    className="kdc-button kdc-button-gold mt-4 w-full !py-2 text-center text-sm"
                  >
                    Open kitchen station
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'staff' && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">User access</h1>
            <p className="mt-2 text-sm text-muted">
              Create accounts and set access. Update login details per person only — changing one
              account never affects another.
            </p>

            <form
              onSubmit={(e) => void handleUpdateMyLogin(e)}
              className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-[var(--kdc-border)] p-5"
            >
              <p className="text-sm font-semibold text-ink">My login details (this signed-in account)</p>
              <p className="text-xs text-muted">
                Signed in as <span className="font-medium text-ink">{email}</span>
                {sessionUserId ? ` · id ${sessionUserId.slice(0, 8)}…` : ''}
              </p>
              <input
                name="newLoginId"
                placeholder="New user id (optional)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                autoComplete="off"
              />
              <input
                name="currentPassword"
                type="password"
                required
                placeholder="Current password (required)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                autoComplete="current-password"
              />
              <input
                name="newPassword"
                type="password"
                minLength={8}
                placeholder="New password (optional, min 8)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                autoComplete="new-password"
              />
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                placeholder="Confirm new password"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                autoComplete="new-password"
              />
              {myCredErr && <p className="text-sm text-crimson">{myCredErr}</p>}
              {myCredMsg && <p className="text-sm text-green-700 dark:text-green-400">{myCredMsg}</p>}
              <button
                type="submit"
                disabled={myCredBusy}
                className="kdc-button kdc-button-primary disabled:opacity-60"
              >
                {myCredBusy ? 'Saving…' : 'Update my login'}
              </button>
            </form>

            {createErr && (
              <p className="mt-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson" role="alert">
                {createErr}
              </p>
            )}
            {createMsg && (
              <p className="mt-4 rounded-xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-sm text-green-800 dark:text-green-300" role="status">
                {createMsg}
              </p>
            )}

            <form
              onSubmit={(e) => void handleCreateUser(e)}
              className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-[var(--kdc-border)] p-5"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <UserPlus size={16} /> Create user
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="firstName"
                  required
                  placeholder="First name"
                  className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                />
                <input
                  name="lastName"
                  required
                  placeholder="Last name"
                  className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                />
              </div>
              <input
                name="loginId"
                required
                minLength={2}
                placeholder="User id (login)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                autoComplete="off"
              />
              <input
                name="phone"
                type="tel"
                required
                minLength={7}
                placeholder="Contact number"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Password (min 8)"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="Confirm password"
                className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
              />
              <label className="block text-sm text-ink">
                Access level (restrict portal access)
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                >
                  {ACCESS_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={createBusy}
                className="kdc-button kdc-button-primary mt-1 disabled:opacity-60"
              >
                {createBusy ? 'Creating…' : 'Create account'}
              </button>
            </form>

            <h2 className="mt-10 text-lg font-semibold">All accounts</h2>
            <p className="mt-1 text-xs text-muted">
              Update each row only for that user — credentials are never shared between accounts.
            </p>
            <div className="mt-4 space-y-4">
              {staffUsers.length === 0 && (
                <p className="text-sm text-muted">No accounts yet.</p>
              )}
              {staffUsers.map((u) => {
                const uid = String(u.id);
                const roles = u.roles;
                const roleLabel = Array.isArray(roles)
                  ? formatRolesLabel(roles as string[])
                  : String(roles || '—');
                const isMe = sessionUserId === uid;
                const st = userCredState[uid] || {};
                return (
                  <div
                    key={uid}
                    className="rounded-2xl border border-[var(--kdc-border)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {`${String(u.first_name || '')} ${String(u.last_name || '')}`.trim() || '—'}
                          {isMe ? ' (you)' : ''}
                        </p>
                        <p className="text-sm text-muted">
                          User id: <span className="text-ink">{String(u.email || '—')}</span>
                          {' · '}
                          {String(u.phone || '—')}
                          {' · '}
                          {roleLabel}
                        </p>
                      </div>
                    </div>
                    {!isMe && (
                      <form
                        onSubmit={(e) => void handleUpdateOtherLogin(uid, e)}
                        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                      >
                        <input
                          name="newLoginId"
                          placeholder="New user id"
                          defaultValue=""
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm"
                          autoComplete="off"
                        />
                        <input
                          name="newPassword"
                          type="password"
                          minLength={8}
                          placeholder="New password"
                          className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2 text-sm"
                          autoComplete="new-password"
                        />
                        <button
                          type="submit"
                          disabled={st.busy}
                          className="kdc-button kdc-button-primary !py-2 text-sm disabled:opacity-60 sm:col-span-2 lg:col-span-1"
                        >
                          {st.busy ? 'Saving…' : 'Update this user'}
                        </button>
                        {st.err && (
                          <p className="text-sm text-crimson sm:col-span-2 lg:col-span-4">{st.err}</p>
                        )}
                        {st.msg && (
                          <p className="text-sm text-green-700 dark:text-green-400 sm:col-span-2 lg:col-span-4">
                            {st.msg}
                          </p>
                        )}
                      </form>
                    )}
                    {isMe && (
                      <p className="mt-2 text-xs text-muted">
                        Use “My login details” above to change your own credentials.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'reports' && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">Reports</h1>
            <p className="mt-2 text-sm text-muted">
              Daily / weekly / monthly / yearly sales, inventory, attendance, P&amp;L, tax, expenses,
              product performance, customer analytics — export PDF, Excel, CSV via API.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['PDF', 'Excel', 'CSV'].map((f) => (
                <button key={f} type="button" className="kdc-button kdc-button-primary !py-2 text-sm">
                  Export {f}
                </button>
              ))}
            </div>
          </>
        )}

        {(tab === 'customers' || tab === 'suppliers') && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-3xl capitalize">{tab}</h1>
            {tab === 'suppliers' && (
              <>
                <p className="mt-2 text-sm text-muted">
                  Add and view suppliers for stock and purchasing.
                </p>
                {supplierErr && (
                  <p className="mt-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">
                    {supplierErr}
                  </p>
                )}
                {supplierMsg && (
                  <p className="mt-4 rounded-xl border border-green-700/30 bg-green-700/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
                    {supplierMsg}
                  </p>
                )}
                <form
                  onSubmit={(e) => void handleAddSupplier(e)}
                  className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-[var(--kdc-border)] p-5"
                >
                  <p className="text-sm font-semibold">Add new supplier</p>
                  <input
                    name="name"
                    required
                    placeholder="Supplier / company name"
                    className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                  />
                  <input
                    name="contactName"
                    placeholder="Contact person"
                    className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      name="phone"
                      placeholder="Phone"
                      className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                    />
                    <input
                      name="email"
                      type="email"
                      placeholder="Email"
                      className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      name="city"
                      placeholder="City"
                      defaultValue="Lahore"
                      className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                    />
                    <input
                      name="postcode"
                      placeholder="Postcode"
                      className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                    />
                  </div>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Notes (optional)"
                    className="rounded-xl border border-[var(--kdc-border)] bg-surface px-3 py-2.5 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={supplierBusy}
                    className="kdc-button kdc-button-primary disabled:opacity-60"
                  >
                    {supplierBusy ? 'Saving…' : 'Add supplier'}
                  </button>
                </form>
                <h2 className="mt-10 text-lg font-semibold">Suppliers ({suppliers.length})</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-[var(--kdc-border)] text-muted">
                      <tr>
                        <th className="py-2">Name</th>
                        <th>Contact</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>City</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-muted">
                            No suppliers yet — add one above.
                          </td>
                        </tr>
                      )}
                      {suppliers.map((s) => (
                        <tr key={String(s.id)} className="border-b border-[var(--kdc-border)]">
                          <td className="py-3 font-medium">{String(s.name || '—')}</td>
                          <td>{String(s.contact_name || '—')}</td>
                          <td>{String(s.phone || '—')}</td>
                          <td>{String(s.email || '—')}</td>
                          <td>{String(s.city || '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === 'customers' && (
              <>
                <p className="mt-3 text-sm text-muted">
                  Customers from sign-up and online orders (name, phone, email, address saved for future
                  use)
                  {accounts?.storage ? ` · storage: ${accounts.storage}` : ''}.
                </p>
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b border-[var(--kdc-border)] text-muted">
                      <tr>
                        <th className="py-2">Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Address</th>
                        <th>Orders</th>
                        <th>Spent</th>
                        <th>Loyalty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(accounts?.customers || []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-4 text-muted">
                            No customers yet — online orders and sign-ups appear here.
                          </td>
                        </tr>
                      )}
                      {(accounts?.customers || []).map((c) => (
                        <tr key={String(c.id)} className="border-b border-[var(--kdc-border)]">
                          <td className="py-3 font-medium">
                            {`${String(c.first_name || '')} ${String(c.last_name || '')}`.trim() || '—'}
                          </td>
                          <td>{String(c.email || '—')}</td>
                          <td>{String(c.phone || '—')}</td>
                          <td className="max-w-[200px] truncate">
                            {String(
                              c.full_address ||
                                [c.address_line1, c.city, c.postcode].filter(Boolean).join(', ') ||
                                '—'
                            )}
                          </td>
                          <td>{String(c.total_orders ?? c.orders_count ?? 0)}</td>
                          <td>{formatPKR(Number(c.total_spent || 0))}</td>
                          <td>
                            {String(
                              (c.loyalty as { tierLabel?: string } | undefined)?.tierLabel || 'Bronze'
                            )}{' '}
                            · {String(c.loyalty_points || 0)} pts
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
