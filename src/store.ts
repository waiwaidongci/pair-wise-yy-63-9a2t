import { defineStore } from 'pinia';

export type TokenCategory = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'component';
export type Token = {
  id: string;
  name: string;
  category: TokenCategory;
  value: string;
  ref?: string;
  themes: Record<string, string>;
  usage: number;
  status: 'stable' | 'deprecated' | 'proposed';
  description: string;
};

export type ChangeRequest = {
  id: string;
  title: string;
  requester: string;
  scope: string;
  impact: number;
  status: '待评审' | '已接受' | '已退回';
  diff: { token: string; before: string; after: string };
};

export type Role = 'maintainer' | 'editor';

export type Product = {
  id: string;
  name: string;
  pulledReleaseId: string | null;
  frozen: boolean;
};

export type ProductReceipt = {
  id: string;
  productId: string;
  releaseId: string;
  pulledAt: string;
  items: number;
};

export type DependencyEntry = { tokenId: string; ref: string | null };

export type ReleaseSnapshot = {
  id: string;
  version: string;
  publishedAt: string;
  publisher: string;
  dependencyList: DependencyEntry[] | null;
  tokenCount: number;
};

export type DeactivationStatus = 'pending' | 'confirmed' | 'failed' | 'reenabled';

export type DeactivationRecord = {
  id: string;
  tokenId: string;
  tokenName: string;
  reason: string;
  fixValue: string;
  status: DeactivationStatus;
  createdAt: string;
  createdBy: string;
  confirmedAt?: string;
  confirmedBy?: string;
  failureReason?: string;
  affectedProductIds: string[];
  recalculatedAliasIds: string[];
  originalBaseValue: string;
  originalAliasValues: Record<string, string>;
  version: number;
  restoredAt?: string;
  reenabledAt?: string;
};

const initialTokens: Token[] = [
  { id: 'color.base.blue.600', name: '品牌主色 600', category: 'color', value: '#2864dc', themes: { light: '#2864dc', dark: '#6f96ff', ops: '#24786a', contrast: '#0b4dba' }, usage: 184, status: 'stable', description: '主操作、链接和重点状态' },
  { id: 'color.semantic.primary', name: '语义主色', category: 'color', value: '{color.base.blue.600}', ref: 'color.base.blue.600', themes: { light: '{color.base.blue.600}', dark: '{color.base.blue.400}', ops: '{color.base.green.600}', contrast: '{color.base.blue.800}' }, usage: 126, status: 'stable', description: '组件库统一主色别名' },
  { id: 'color.base.blue.400', name: '品牌蓝 400', category: 'color', value: '#6f96ff', themes: { light: '#6f96ff', dark: '#6f96ff', ops: '#58a99a', contrast: '#2878e8' }, usage: 42, status: 'stable', description: '暗色主题主色' },
  { id: 'color.base.blue.800', name: '品牌蓝 800', category: 'color', value: '#0b4dba', themes: { light: '#0b4dba', dark: '#9ab9ff', ops: '#145c51', contrast: '#06358a' }, usage: 31, status: 'stable', description: '高对比主题主色' },
  { id: 'color.base.green.600', name: '运营绿 600', category: 'color', value: '#24786a', themes: { light: '#24786a', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' }, usage: 67, status: 'proposed', description: '运营产品品牌替换色' },
  { id: 'color.text.primary', name: '正文主色', category: 'color', value: '#17202b', themes: { light: '#17202b', dark: '#f5f7fa', ops: '#152a25', contrast: '#000000' }, usage: 293, status: 'stable', description: '主要正文和标题' },
  { id: 'color.text.secondary', name: '正文次色', category: 'color', value: '#667582', themes: { light: '#667582', dark: '#a8b2bd', ops: '#62766f', contrast: '#303b46' }, usage: 211, status: 'stable', description: '辅助信息和说明' },
  { id: 'color.surface.canvas', name: '页面背景', category: 'color', value: '#f2f5f7', themes: { light: '#f2f5f7', dark: '#121821', ops: '#f1f6f4', contrast: '#ffffff' }, usage: 54, status: 'stable', description: '应用一级背景' },
  { id: 'font.family.sans', name: '无衬线字体', category: 'font', value: '"Noto Sans SC", sans-serif', themes: { light: '"Noto Sans SC", sans-serif', dark: '"Noto Sans SC", sans-serif', ops: '"Noto Sans SC", sans-serif', contrast: 'system-ui, sans-serif' }, usage: 388, status: 'stable', description: '产品界面默认真体' },
  { id: 'font.size.body', name: '正文字号', category: 'font', value: '14px', themes: { light: '14px', dark: '14px', ops: '14px', contrast: '16px' }, usage: 255, status: 'stable', description: '正文与表单文本' },
  { id: 'spacing.base.2', name: '基础间距 2', category: 'spacing', value: '8px', themes: { light: '8px', dark: '8px', ops: '8px', contrast: '8px' }, usage: 312, status: 'stable', description: '紧凑布局基础间距' },
  { id: 'radius.control', name: '控件圆角', category: 'radius', value: '6px', themes: { light: '6px', dark: '6px', ops: '4px', contrast: '4px' }, usage: 167, status: 'stable', description: '按钮、输入框和卡片' },
  { id: 'shadow.raised', name: '浮层阴影', category: 'shadow', value: '0 8px 28px rgba(22,35,48,.14)', themes: { light: '0 8px 28px rgba(22,35,48,.14)', dark: '0 8px 28px rgba(0,0,0,.42)', ops: '0 8px 28px rgba(21,54,45,.14)', contrast: '0 0 0 2px #303b46' }, usage: 36, status: 'stable', description: '菜单、弹窗和浮层' },
  { id: 'component.button.primary.bg', name: '主按钮背景', category: 'component', value: '{color.semantic.primary}', ref: 'color.semantic.primary', themes: { light: '{color.semantic.primary}', dark: '{color.semantic.primary}', ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}' }, usage: 98, status: 'stable', description: '主要操作按钮' },
  { id: 'component.button.primary.text', name: '主按钮文字', category: 'component', value: '#ffffff', themes: { light: '#ffffff', dark: '#ffffff', ops: '#ffffff', contrast: '#ffffff' }, usage: 98, status: 'stable', description: '主要操作按钮文字' }
];

const changes: ChangeRequest[] = [
  { id: 'CR-412', title: '运营产品切换语义主色', requester: '运营设计组', scope: '4 个产品 · 238 处引用', impact: 86, status: '待评审', diff: { token: 'color.semantic.primary', before: '{color.base.blue.600}', after: '{color.base.green.600}' } },
  { id: 'CR-418', title: '高对比度正文尺寸调整', requester: '无障碍专项组', scope: '2 个产品 · 74 处引用', impact: 42, status: '待评审', diff: { token: 'font.size.body', before: '14px', after: '16px' } },
  { id: 'CR-423', title: '统一浮层圆角', requester: '组件维护组', scope: '12 个组件 · 36 处引用', impact: 28, status: '待评审', diff: { token: 'radius.control', before: '8px', after: '6px' } }
];

const initialProducts: Product[] = [
  { id: 'prod-component', name: '组件库', pulledReleaseId: 'DS 4.6.0-rc.2', frozen: false },
  { id: 'prod-ops', name: '运营后台', pulledReleaseId: 'DS 4.5.2', frozen: false },
  { id: 'prod-mobile', name: '移动端组件', pulledReleaseId: 'DS 4.5.1', frozen: false },
  { id: 'prod-data', name: '数据平台', pulledReleaseId: null, frozen: false }
];

const initialReceipts: ProductReceipt[] = [
  { id: 'RCP-1001', productId: 'prod-component', releaseId: 'DS 4.6.0-rc.2', pulledAt: '2026-10-05 09:12', items: 15 },
  { id: 'RCP-0987', productId: 'prod-ops', releaseId: 'DS 4.5.2', pulledAt: '2026-09-24 17:40', items: 15 },
  { id: 'RCP-0954', productId: 'prod-mobile', releaseId: 'DS 4.5.1', pulledAt: '2026-09-12 11:08', items: 14 }
];

const initialSnapshots: ReleaseSnapshot[] = [
  { id: 'DS 4.6.0-rc.2', version: '4.6.0-rc.2', publishedAt: '2026-10-05', publisher: '顾清', dependencyList: null, tokenCount: 15 },
  { id: 'DS 4.5.2', version: '4.5.2', publishedAt: '2026-09-24', publisher: '顾清', dependencyList: null, tokenCount: 15 },
  { id: 'DS 4.5.1', version: '4.5.1', publishedAt: '2026-09-12', publisher: '周序', dependencyList: null, tokenCount: 14 },
  { id: 'DS 4.5.0', version: '4.5.0', publishedAt: '2026-08-28', publisher: '顾清', dependencyList: null, tokenCount: 14 }
];

const storageKey = 'yy63-token-governance';
const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
const saved = raw ? JSON.parse(raw) : null;

function nowStamp() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export const useTokenStore = defineStore('tokens', {
  state: () => ({
    tokens: (saved?.tokens as Token[]) ?? initialTokens,
    changes: (saved?.changes as ChangeRequest[]) ?? changes,
    activeTheme: (saved?.activeTheme as string) ?? 'light',
    selectedTokenId: (saved?.selectedTokenId as string) ?? 'color.semantic.primary',
    search: (saved?.search as string) ?? '',
    category: (saved?.category as string) ?? '全部',
    releaseVersion: '4.6.0-rc.2',
    locked: (saved?.locked as boolean) ?? false,
    lastPublished: (saved?.lastPublished as string) ?? 'DS 4.5.2',
    baseline: initialTokens.map((token) => ({ id: token.id, value: token.value })),
    role: (saved?.role as Role) ?? 'maintainer',
    operatorName: (saved?.operatorName as string) ?? '顾清',
    products: (saved?.products as Product[]) ?? initialProducts,
    receipts: (saved?.receipts as ProductReceipt[]) ?? initialReceipts,
    releaseSnapshots: (saved?.releaseSnapshots as ReleaseSnapshot[]) ?? initialSnapshots,
    deactivations: (saved?.deactivations as DeactivationRecord[]) ?? []
  }),
  getters: {
    selectedToken(state): Token | undefined {
      return state.tokens.find((token) => token.id === state.selectedTokenId);
    },
    filteredTokens(state): Token[] {
      const query = state.search.toLowerCase();
      return state.tokens.filter((token) => {
        const matchesSearch = !query || token.id.toLowerCase().includes(query) || token.name.includes(state.search);
        const matchesCategory = state.category === '全部' || token.category === state.category;
        return matchesSearch && matchesCategory;
      });
    },
    dependencyEdges(state) {
      return state.tokens.filter((token) => token.ref).map((token) => ({ from: token.ref!, to: token.id }));
    },
    cycleNodes(state): string[] {
      const graph = new Map<string, string>();
      state.tokens.filter((token) => token.ref).forEach((token) => graph.set(token.id, token.ref!));
      const cycle = new Set<string>();
      graph.forEach((_, start) => {
        const path: string[] = [];
        let current: string | undefined = start;
        while (current && !path.includes(current)) {
          path.push(current);
          current = graph.get(current);
        }
        if (current && path.includes(current)) path.slice(path.indexOf(current)).forEach((id) => cycle.add(id));
      });
      return [...cycle];
    },
    invalidReferences(state) {
      const ids = new Set(state.tokens.map((token) => token.id));
      return state.tokens.filter((token) => token.ref && !ids.has(token.ref));
    },
    contrastIssues(state) {
      const text = state.tokens.find((token) => token.id === 'color.text.primary');
      const surface = state.tokens.find((token) => token.id === 'color.surface.canvas');
      const values = [text?.themes[state.activeTheme], surface?.themes[state.activeTheme]].filter(Boolean) as string[];
      if (values.length < 2) return [];
      const ratio = contrastRatio(values[0], values[1]);
      return ratio < 4.5 ? [{ title: '正文与页面背景对比度不足', detail: `当前 ${ratio.toFixed(2)}:1，要求至少 4.5:1。` }] : [];
    },
    diffRows(state) {
      return state.tokens.filter((token) => {
        const base = state.baseline.find((item) => item.id === token.id);
        return !base || base.value !== token.value;
      }).map((token) => {
        const base = state.baseline.find((item) => item.id === token.id);
        return { id: token.id, before: base?.value ?? '新增', after: token.value, name: token.name };
      });
    },
    releaseReadiness(state): number {
      const base = 100 - this.cycleNodes.length * 25 - this.invalidReferences.length * 20 - this.contrastIssues.length * 15;
      return Math.max(0, base);
    },
    resolvedValue(state) {
      return (id: string): string => {
        const seen = new Set<string>();
        const walk = (current: string): string => {
          const token = state.tokens.find((item) => item.id === current);
          if (!token) return '';
          if (!token.ref || seen.has(current)) return token.value;
          seen.add(current);
          return walk(token.ref);
        };
        return walk(id);
      };
    },
    dependentsOf(state) {
      return (tokenId: string): string[] => {
        const result = new Set<string>();
        const walk = (current: string) => {
          state.tokens.filter((token) => token.ref === current).forEach((token) => {
            if (!result.has(token.id)) {
              result.add(token.id);
              walk(token.id);
            }
          });
        };
        walk(tokenId);
        return [...result];
      };
    },
    latestReleaseId(state): string {
      const sorted = [...state.releaseSnapshots].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
      return sorted[0]?.id ?? `DS ${state.releaseVersion}`;
    },
    unpulledProductIds(state): string[] {
      return state.products.filter((product) => product.pulledReleaseId !== this.latestReleaseId).map((product) => product.id);
    },
    missingDependencyReleases(state): string[] {
      return state.releaseSnapshots.filter((snapshot) => snapshot.dependencyList === null).map((snapshot) => snapshot.id);
    }
  },
  actions: {
    selectToken(id: string) {
      this.selectedTokenId = id;
      this.persist();
    },
    updateTokenValue(id: string, value: string) {
      const token = this.tokens.find((item) => item.id === id);
      if (!token) return;
      token.value = value;
      token.themes[this.activeTheme] = value;
      if (value.startsWith('{') && value.endsWith('}')) token.ref = value.slice(1, -1);
      else delete token.ref;
      this.persist();
    },
    addToken(token: Token) {
      if (!this.tokens.some((item) => item.id === token.id)) this.tokens.push(token);
      this.persist();
    },
    setTheme(theme: string) {
      this.activeTheme = theme;
      this.persist();
    },
    setSearch(value: string) { this.search = value; this.persist(); },
    setCategory(value: string) { this.category = value; this.persist(); },
    acceptChange(id: string) {
      const change = this.changes.find((item) => item.id === id);
      if (!change) return;
      const token = this.tokens.find((item) => item.id === change.diff.token);
      if (token) this.updateTokenValue(token.id, change.diff.after);
      change.status = '已接受';
      this.persist();
    },
    rejectChange(id: string) {
      const change = this.changes.find((item) => item.id === id);
      if (change) change.status = '已退回';
      this.persist();
    },
    rollback() {
      this.baseline.forEach((base) => {
        const token = this.tokens.find((item) => item.id === base.id);
        if (token) token.value = base.value;
      });
      this.persist();
    },
    lockRelease() {
      if (this.cycleNodes.length === 0 && this.invalidReferences.length === 0 && this.contrastIssues.length === 0 && this.changes.every((item) => item.status !== '待评审')) {
        this.locked = true;
        this.lastPublished = `DS ${this.releaseVersion}`;
      }
      this.persist();
    },
    setRole(role: Role) {
      this.role = role;
      this.persist();
    },
    createDeactivation(tokenId: string, reason: string, fixValue: string): DeactivationRecord | null {
      const token = this.tokens.find((item) => item.id === tokenId);
      if (!token) return null;
      const dependentIds = this.dependentsOf(tokenId);
      const aliasIds = dependentIds.filter((id) => {
        const item = this.tokens.find((x) => x.id === id);
        return item?.category === 'component';
      });
      const originalAliasValues: Record<string, string> = {};
      aliasIds.forEach((id) => {
        const alias = this.tokens.find((item) => item.id === id);
        if (alias) originalAliasValues[id] = alias.value;
      });
      const seq = this.deactivations.length + 1;
      const record: DeactivationRecord = {
        id: `DT-${String(seq).padStart(3, '0')}`,
        tokenId,
        tokenName: token.name,
        reason,
        fixValue: fixValue || token.value,
        status: 'pending',
        createdAt: nowStamp(),
        createdBy: this.operatorName,
        affectedProductIds: [],
        recalculatedAliasIds: aliasIds,
        originalBaseValue: token.value,
        originalAliasValues,
        version: 1
      };
      this.deactivations.push(record);
      this.persist();
      return record;
    },
    confirmDeactivation(id: string, expectedVersion: number): { ok: boolean; conflict?: boolean; reason?: string } {
      if (this.role !== 'maintainer') {
        return { ok: false, reason: '越权提交已拒绝：仅发布维护员可确认停用，普通编辑无此权限。' };
      }
      const record = this.deactivations.find((item) => item.id === id);
      if (!record) return { ok: false, reason: '停用记录不存在。' };
      if (record.version !== expectedVersion) {
        const reason = `并发冲突：停用编号 ${id} 已被先到者写入（版本 ${record.version}），本次提交版本 ${expectedVersion} 已过期，请刷新后重试。`;
        if (record.status === 'pending') {
          record.status = 'failed';
          record.failureReason = reason;
        }
        this.persist();
        return { ok: false, conflict: true, reason };
      }
      if (record.status !== 'pending') return { ok: false, reason: `当前状态为「${record.status}」，无需确认。` };
      const token = this.tokens.find((item) => item.id === record.tokenId);
      if (token) {
        token.value = record.fixValue;
        token.themes[this.activeTheme] = record.fixValue;
      }
      const unpulled = this.unpulledProductIds;
      unpulled.forEach((pid) => {
        const product = this.products.find((item) => item.id === pid);
        if (!product) return;
        if (!record.affectedProductIds.includes(pid)) record.affectedProductIds.push(pid);
        product.frozen = true;
      });
      record.recalculatedAliasIds.forEach((aid) => {
        const alias = this.tokens.find((item) => item.id === aid);
        if (alias) {
          const resolved = this.resolvedValue(aid);
          alias.value = resolved;
          Object.keys(alias.themes).forEach((theme) => { alias.themes[theme] = resolved; });
        }
      });
      record.status = 'confirmed';
      record.confirmedAt = nowStamp();
      record.confirmedBy = this.operatorName;
      record.version += 1;
      this.persist();
      return { ok: true };
    },
    simulateFailure(id: string): { ok: boolean; reason?: string } {
      const record = this.deactivations.find((item) => item.id === id);
      if (!record) return { ok: false, reason: '停用记录不存在。' };
      if (record.status !== 'pending') return { ok: false, reason: `当前状态为「${record.status}」，无法模拟失败。` };
      const target = this.unpulledProductIds.find((pid) => !record.affectedProductIds.includes(pid));
      if (target) {
        record.affectedProductIds.push(target);
        const product = this.products.find((item) => item.id === target);
        if (product) product.frozen = true;
        record.failureReason = `模拟确认失败：处理至第 1 个产品（${product?.name}）时超时，已冻结的产品需按停用编号 ${id} 恢复。`;
      } else {
        record.failureReason = `模拟确认失败：停用编号 ${id} 处理超时，需按停用编号恢复。`;
      }
      record.status = 'failed';
      this.persist();
      return { ok: true, reason: record.failureReason };
    },
    restoreDeactivation(id: string): { ok: boolean; reason?: string } {
      const record = this.deactivations.find((item) => item.id === id);
      if (!record) return { ok: false, reason: '停用记录不存在。' };
      if (record.status !== 'failed') return { ok: false, reason: `当前状态为「${record.status}」，无需恢复。` };
      const token = this.tokens.find((item) => item.id === record.tokenId);
      if (token) {
        token.value = record.originalBaseValue;
        token.themes[this.activeTheme] = record.originalBaseValue;
      }
      record.affectedProductIds.forEach((pid) => {
        const product = this.products.find((item) => item.id === pid);
        if (product && product.frozen) product.frozen = false;
      });
      record.recalculatedAliasIds.forEach((aid) => {
        const alias = this.tokens.find((item) => item.id === aid);
        if (alias && record.originalAliasValues[aid] !== undefined) {
          const original = record.originalAliasValues[aid];
          alias.value = original;
          Object.keys(alias.themes).forEach((theme) => { alias.themes[theme] = original; });
        }
      });
      record.status = 'pending';
      record.restoredAt = nowStamp();
      record.failureReason = undefined;
      this.persist();
      return { ok: true };
    },
    fillDependencyList(releaseId: string): { ok: boolean; reason?: string } {
      const snapshot = this.releaseSnapshots.find((item) => item.id === releaseId);
      if (!snapshot) return { ok: false, reason: '发布快照不存在。' };
      if (snapshot.dependencyList !== null) return { ok: false, reason: '依赖清单已存在，无需补齐。' };
      snapshot.dependencyList = this.tokens.map((token) => ({ tokenId: token.id, ref: token.ref ?? null }));
      this.persist();
      return { ok: true };
    },
    reenableDeactivation(id: string): { ok: boolean; reason?: string; filled?: string[] } {
      const record = this.deactivations.find((item) => item.id === id);
      if (!record) return { ok: false, reason: '停用记录不存在。' };
      if (record.status !== 'confirmed') return { ok: false, reason: `当前状态为「${record.status}」，无法重新启用。` };
      const filled: string[] = [];
      this.missingDependencyReleases.forEach((rid) => {
        const snapshot = this.releaseSnapshots.find((item) => item.id === rid);
        if (snapshot && snapshot.dependencyList === null) {
          snapshot.dependencyList = this.tokens.map((token) => ({ tokenId: token.id, ref: token.ref ?? null }));
          filled.push(rid);
        }
      });
      record.affectedProductIds.forEach((pid) => {
        const product = this.products.find((item) => item.id === pid);
        if (product && product.frozen) product.frozen = false;
      });
      record.status = 'reenabled';
      record.reenabledAt = nowStamp();
      this.persist();
      return { ok: true, filled };
    },
    pullRelease(productId: string, releaseId: string): { ok: boolean; reason?: string } {
      const product = this.products.find((item) => item.id === productId);
      if (!product) return { ok: false, reason: '产品不存在。' };
      if (product.frozen) return { ok: false, reason: `产品「${product.name}」已冻结，停用确认未生效前无法拉取新版本。` };
      const snapshot = this.releaseSnapshots.find((item) => item.id === releaseId);
      const receipt: ProductReceipt = {
        id: `RCP-${Date.now().toString().slice(-6)}`,
        productId,
        releaseId,
        pulledAt: nowStamp(),
        items: snapshot?.tokenCount ?? this.tokens.length
      };
      this.receipts.unshift(receipt);
      product.pulledReleaseId = releaseId;
      this.persist();
      return { ok: true };
    },
    persist() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify({
          tokens: this.tokens,
          changes: this.changes,
          activeTheme: this.activeTheme,
          selectedTokenId: this.selectedTokenId,
          search: this.search,
          category: this.category,
          locked: this.locked,
          lastPublished: this.lastPublished,
          role: this.role,
          operatorName: this.operatorName,
          products: this.products,
          receipts: this.receipts,
          releaseSnapshots: this.releaseSnapshots,
          deactivations: this.deactivations
        }));
      }
    }
  }
});

function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return .5;
    const channels = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
}
