import { StaffUser } from '../types';
import { initialPermissions, PermissionItem } from '../components/permissions/RightsManagement';

export type RoleKey = 'waiter' | 'kitchen' | 'courier' | 'cashier' | 'manager' | 'call_center';

export const ROLE_LABELS: Record<RoleKey, string> = {
  waiter: 'Garson',
  kitchen: 'Mutfak',
  courier: 'Kurye',
  cashier: 'Kasa',
  manager: 'Müdür',
  call_center: 'Çağrı Merkezi',
};

export function normalizeRoleKey(role?: string | null): RoleKey {
  const r = (role || 'manager').toLowerCase().trim();
  if (r === 'waiter' || r === 'garson') return 'waiter';
  if (r === 'kitchen' || r === 'chef' || r === 'mutfak') return 'kitchen';
  if (r === 'courier' || r === 'kurye') return 'courier';
  if (r === 'cashier' || r === 'kasa' || r === 'kasiyer') return 'cashier';
  if (r === 'call_center' || r === 'cagri_merkezi') return 'call_center';
  return 'manager';
}

export function getActivePermissionsMatrix(): PermissionItem[] {
  try {
    const raw = localStorage.getItem('boncore_role_permissions');
    if (!raw) return initialPermissions;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return initialPermissions;

    const map = new Map<string, any>();
    saved.forEach((p: any) => {
      if (p && p.id) map.set(p.id, p);
    });

    return initialPermissions.map((def) => {
      const ex = map.get(def.id);
      if (ex && ex.roles) {
        return {
          ...def,
          roles: {
            waiter: Boolean(ex.roles.waiter),
            kitchen: Boolean(ex.roles.kitchen),
            courier: Boolean(ex.roles.courier),
            cashier: Boolean(ex.roles.cashier),
            manager: Boolean(ex.roles.manager),
            call_center: Boolean(ex.roles.call_center),
          },
        };
      }
      return def;
    });
  } catch {
    return initialPermissions;
  }
}

export function hasRolePermission(
  userOrRole: StaffUser | string | null | undefined,
  permissionId: string
): boolean {
  if (!userOrRole) return true;
  const roleStr = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const roleKey = normalizeRoleKey(roleStr);
  const matrix = getActivePermissionsMatrix();
  const perm = matrix.find((p) => p.id === permissionId);
  if (!perm) return true;
  return Boolean(perm.roles[roleKey]);
}

export function getPermissionTitle(permissionId: string): string {
  const perm = initialPermissions.find((p) => p.id === permissionId);
  return perm ? perm.title : permissionId;
}

export const TAB_PERMISSION_REQUIREMENTS: Record<string, string[]> = {
  dashboard: ['reports_view'],
  restaurant_statistics: ['reports_view'],
  product_sales_report: ['reports_view'],
  cost_profit: ['reports_view'],
  day_end_report: ['reports_z_close'],
  closed_bills_report: ['order_view_closed_cancelled'],
  tables: ['order_general'],
  pos: ['order_general'],
  kds: ['kds_view'],
  delivery: ['courier_ops', 'order_delivery'],
  product_definition: ['prod_manage_menu'],
  kitchen_groups: ['prod_manage_menu'],
  table_definition: ['def_table_area'],
  settings: ['def_general_settings'],
  users: ['def_users_manage'],
  rights: ['def_permissions_manage'],
  inventory: ['def_stock_entry_count', 'def_stock_view'],
  integration_menu: ['prod_integration_manage', 'def_integrations_appstore'],
  app_store: ['def_integrations_appstore'],
  cashier: ['order_take_payment', 'reports_expense', 'expense_add'],
};

export function canAccessTab(
  userOrRole: StaffUser | string | null | undefined,
  tabId: string
): { allowed: boolean; requiredPermTitle?: string } {
  const reqs = TAB_PERMISSION_REQUIREMENTS[tabId];
  if (!reqs || reqs.length === 0) return { allowed: true };

  // Allowed if the user has ANY of the permissions that grant access to this screen
  const allowed = reqs.some((permId) => hasRolePermission(userOrRole, permId));
  if (allowed) return { allowed: true };

  return {
    allowed: false,
    requiredPermTitle: getPermissionTitle(reqs[0]),
  };
}

export function getDefaultTabForRole(userOrRole: StaffUser | string | null | undefined): string {
  const roleKey = normalizeRoleKey(typeof userOrRole === 'string' ? userOrRole : userOrRole?.role);
  if (roleKey === 'kitchen' && hasRolePermission(roleKey, 'kds_view')) return 'kds';
  if (roleKey === 'courier' && hasRolePermission(roleKey, 'courier_ops')) return 'delivery';
  if (hasRolePermission(roleKey, 'order_general')) return 'tables';
  if (hasRolePermission(roleKey, 'kds_view')) return 'kds';
  if (hasRolePermission(roleKey, 'courier_ops')) return 'delivery';
  return 'profile';
}
