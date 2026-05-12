'use client';

import { useState, useEffect, useCallback } from 'react';
import { rolesApi, type Role } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Pencil, Loader2, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// ── 權限定義 ──────────────────────────────────────────

interface PermissionGroup {
  label: string;
  keys: { key: string; label: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: '客戶管理',
    keys: [
      { key: 'contacts.read', label: '檢視客戶' },
      { key: 'contacts.write', label: '編輯客戶' },
    ],
  },
  {
    label: '收件匣',
    keys: [
      { key: 'inbox.read', label: '檢視訊息' },
      { key: 'inbox.send', label: '發送訊息' },
    ],
  },
  {
    label: '待辦',
    keys: [
      { key: 'actions.manage', label: '管理待辦' },
    ],
  },
  {
    label: '庫存',
    keys: [
      { key: 'inventory.read', label: '檢視庫存' },
      { key: 'inventory.write', label: '編輯庫存' },
    ],
  },
  {
    label: '設定',
    keys: [
      { key: 'settings.view', label: '檢視設定' },
      { key: 'settings.admin', label: '管理設定' },
    ],
  },
  {
    label: '使用者',
    keys: [
      { key: 'users.manage', label: '管理使用者' },
    ],
  },
];

// ── 主元件 ────────────────────────────────────────────

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Dialog 狀態
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // 表單狀態
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({});

  const loadRoles = useCallback(async () => {
    try {
      setError(null);
      const data = await rolesApi.getAll();
      setRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('載入身份組失敗:', err);
      setError('無法載入身份組資料');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName('');
    setFormColor('#6366f1');
    setFormPermissions({});
    setDialogOpen(true);
  };

  const openEditDialog = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormColor(role.color);
    setFormPermissions({ ...role.permissions });
    setDialogOpen(true);
  };

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);

    // 只傳 true 的權限
    const cleanPermissions: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(formPermissions)) {
      if (v) cleanPermissions[k] = true;
    }

    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, {
          name: formName.trim(),
          color: formColor,
          permissions: cleanPermissions,
        });
      } else {
        await rolesApi.create({
          name: formName.trim(),
          color: formColor,
          permissions: cleanPermissions,
        });
      }
      setDialogOpen(false);
      await loadRoles();
    } catch (err) {
      console.error('儲存身份組失敗:', err);
      setError(editingRole ? '更新失敗' : '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (role.is_system) return;
    setSaving(true);
    setError(null);
    try {
      await rolesApi.delete(role.id);
      await loadRoles();
    } catch (err) {
      console.error('刪除身份組失敗:', err);
      setError('刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  const countPermissions = (permissions: Record<string, boolean>) =>
    Object.values(permissions).filter(Boolean).length;

  // ── 載入狀態 ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        <span className="ml-2 text-sm text-zinc-400">載入中...</span>
      </div>
    );
  }

  if (error && roles.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        <button
          onClick={() => { setLoading(true); loadRoles(); }}
          className="mt-2 text-xs text-indigo-500 hover:text-indigo-600"
        >
          重新載入
        </button>
      </div>
    );
  }

  // ── 主渲染 ──

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          管理身份組與權限，類似 Discord 的角色系統。
        </p>
        <button
          onClick={openCreateDialog}
          className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
        >
          <Plus className="w-3.5 h-3.5" /> 新增身份組
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* 身份組列表 */}
      <div className="space-y-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700 group"
          >
            {/* 色點 */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: role.color }}
            />

            {/* 名稱 + 權限數 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
                  {role.name}
                </span>
                {role.is_system && (
                  <Lock className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {countPermissions(role.permissions)} 項權限
              </p>
            </div>

            {/* 操作按鈕 */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => openEditDialog(role)}
                className="p-1.5 text-zinc-400 hover:text-indigo-500 transition-colors"
                aria-label={`編輯 ${role.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {!role.is_system && (
                <button
                  onClick={() => handleDelete(role)}
                  disabled={saving}
                  className="p-1.5 text-zinc-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                  aria-label={`刪除 ${role.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {roles.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-6">尚無身份組</p>
        )}
      </div>

      {/* 編輯/新增 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? `編輯身份組 - ${editingRole.name}` : '新增身份組'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* 名稱 */}
            <div>
              <Label htmlFor="role-name" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                名稱
              </Label>
              <input
                id="role-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={editingRole?.is_system}
                placeholder="例如：行銷主管"
                className={cn(
                  'w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2',
                  'text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              />
            </div>

            {/* 顏色 */}
            <div>
              <Label htmlFor="role-color" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                顏色
              </Label>
              <div className="flex items-center gap-2">
                <input
                  id="role-color"
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  placeholder="#6366f1"
                  className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* 權限 */}
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                權限
              </p>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                      {group.label}
                    </p>
                    <div className="space-y-1.5 pl-1">
                      {group.keys.map((perm) => (
                        <div key={perm.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`perm-${perm.key}`}
                            checked={!!formPermissions[perm.key]}
                            onCheckedChange={() => togglePermission(perm.key)}
                          />
                          <Label
                            htmlFor={`perm-${perm.key}`}
                            className="text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer"
                          >
                            {perm.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="text-xs font-medium text-zinc-500 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!formName.trim() || saving}
              className="flex items-center gap-1 text-xs font-medium bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingRole ? '儲存' : '新增'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
