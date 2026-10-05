import { Actor, DeactivationState, EngineToken } from './types';
import { buildManifest } from './graph';

export const MAINTAINER: Actor = { id: 'u.guqing', name: '顾清', role: 'release-maintainer' };
export const EDITOR: Actor = { id: 'u.linyi', name: '林一', role: 'editor' };

const tokenSeed: (Omit<EngineToken, 'status'> & { status?: EngineToken['status'] })[] = [
  { id: 'color.base.blue.600', name: '品牌主色 600', category: 'color', value: '#2864dc', themes: { light: '#2864dc', dark: '#6f96ff', ops: '#24786a', contrast: '#0b4dba' } },
  { id: 'color.semantic.primary', name: '语义主色', category: 'color', value: '{color.base.blue.600}', themes: { light: '{color.base.blue.600}', dark: '{color.base.blue.400}', ops: '{color.base.green.600}', contrast: '{color.base.blue.800}' } },
  { id: 'color.base.blue.400', name: '品牌蓝 400', category: 'color', value: '#6f96ff', themes: { light: '#6f96ff', dark: '#6f96ff', ops: '#58a99a', contrast: '#2878e8' } },
  { id: 'color.base.blue.800', name: '品牌蓝 800', category: 'color', value: '#0b4dba', themes: { light: '#0b4dba', dark: '#9ab9ff', ops: '#145c51', contrast: '#06358a' } },
  { id: 'color.base.green.600', name: '运营绿 600', category: 'color', value: '#24786a', themes: { light: '#24786a', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' } },
  { id: 'component.button.primary.bg', name: '主按钮背景', category: 'component', value: '{color.semantic.primary}', themes: { light: '{color.semantic.primary}', dark: '{color.semantic.primary}', ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}' } },
  { id: 'component.link.primary', name: '链接颜色', category: 'component', value: '{color.semantic.primary}', themes: { light: '{color.semantic.primary}', dark: '{color.semantic.primary}', ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}' } }
];

export function seedTokens(): EngineToken[] {
  return tokenSeed.map((token) => ({ ...token, themes: { ...token.themes }, status: token.status ?? 'stable' }));
}

export function createSeedState(): DeactivationState {
  const tokens = seedTokens();
  const allIds = tokens.map((token) => token.id);
  const manifest = buildManifest(tokens);

  // 旧发布记录：缺依赖清单，重新启用前必须先补齐。
  const legacy: DeactivationState['releases'][number] = {
    id: 'DS 4.5.2',
    publishedAt: '2026-09-24T17:20:00+08:00',
    publishedBy: 'u.guqing',
    bundledTokenIds: allIds
    // 无 manifest
  };
  const candidate: DeactivationState['releases'][number] = {
    id: 'DS 4.6.0-rc.2',
    publishedAt: '2026-10-02T10:05:00+08:00',
    publishedBy: 'u.guqing',
    bundledTokenIds: allIds,
    manifest
  };
  // 应急安全包：不再捆绑出事基础令牌，回执后即可解冻。
  const hotfix: DeactivationState['releases'][number] = {
    id: 'DS 4.6.1-hotfix',
    publishedAt: '2026-10-05T08:40:00+08:00',
    publishedBy: 'u.guqing',
    bundledTokenIds: allIds.filter((id) => id !== 'color.base.blue.600'),
    manifest: manifest.filter((edge) => edge.from !== 'color.base.blue.600' && edge.to !== 'color.base.blue.600')
  };

  return {
    tokens,
    releases: [legacy, candidate, hotfix],
    products: [
      {
        id: 'pdt-component-lib',
        name: '通用组件库',
        currentReleaseId: 'DS 4.6.0-rc.2',
        frozen: false,
        receipts: [{ releaseId: 'DS 4.6.0-rc.2', pulledAt: '2026-10-02T11:02:00+08:00' }]
      },
      {
        id: 'pdt-ops-admin',
        name: '运营后台',
        currentReleaseId: 'DS 4.6.0-rc.2',
        frozen: false,
        receipts: [{ releaseId: 'DS 4.6.0-rc.2', pulledAt: '2026-10-02T13:26:00+08:00' }]
      },
      {
        id: 'pdt-mobile',
        name: '移动端组件',
        // 线上仍在取旧包：停用时必须冻结。
        currentReleaseId: 'DS 4.5.2',
        frozen: false,
        receipts: [{ releaseId: 'DS 4.5.2', pulledAt: '2026-09-25T09:12:00+08:00' }]
      },
      {
        id: 'pdt-data',
        name: '数据平台',
        // 已自行切到安全包：登记时计入已处理，不重复计数。
        currentReleaseId: 'DS 4.6.1-hotfix',
        frozen: false,
        receipts: [{ releaseId: 'DS 4.6.1-hotfix', pulledAt: '2026-10-05T08:55:00+08:00' }]
      }
    ],
    orders: [],
    version: 1
  };
}
