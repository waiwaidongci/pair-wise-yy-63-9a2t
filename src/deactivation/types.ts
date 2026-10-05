// 基础令牌停用流程：令牌引用、产品回执与发布快照的领域模型。
// 引擎只操作普通 JSON 状态，不依赖 Pinia / 浏览器，便于单测与回放。

export type Role = 'release-maintainer' | 'editor';

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export type EngineTokenStatus = 'stable' | 'deprecated' | 'proposed' | 'disabled';

export interface EngineToken {
  id: string;
  name: string;
  category: string;
  value: string; // light / 默认变体下的原始表达式
  ref?: string;
  themes: Record<string, string>;
  status: EngineTokenStatus;
}

/** 产品回执：产品对某条发布记录的拉取凭证。 */
export interface ProductReceipt {
  releaseId: string;
  pulledAt: string;
}

export interface ProductRecord {
  id: string;
  name: string;
  /** 未停用流程冻结前，产品线上仍在使用的发布记录。 */
  currentReleaseId: string;
  frozen: boolean;
  /** 冻结原因，记录停用单编号，便于按编号恢复。 */
  frozenBy?: string;
  receipts: ProductReceipt[];
}

/** 发布快照里的依赖清单：一条引用边 = 引用方 -> 被引用基础令牌。 */
export interface DependencyEdge {
  from: string;
  to: string;
}

export interface ReleaseRecord {
  id: string;
  publishedAt: string;
  publishedBy: string;
  /** 快照内捆绑的令牌 ID。 */
  bundledTokenIds: string[];
  /** 旧发布可能缺失依赖清单，重新启用前必须补齐。 */
  manifest?: DependencyEdge[];
}

/** 停用后组件别名 / 语义令牌随引用变化的重算结果，逐变体记录。 */
export interface AliasChangeRow {
  tokenId: string;
  name: string;
  category: string;
  theme: string;
  beforeRaw: string;
  afterRaw: string;
  beforeResolved: string;
  afterResolved: string;
  status: 'unchanged' | 'changed' | 'unresolved';
}

export type DeactivationStatus =
  | 'pending'      // 已登记，等待发布维护员确认
  | 'effective'    // 已确认生效
  | 'failed'       // 确认中断（回执处理失败），等待按编号恢复
  | 'recovered'    // 恢复完成（重新启用）
  | 'superseded'; // 被新停用单取代

/** 重算前保留的引用现场，恢复时原样写回。 */
interface ReferrerMemento {
  tokenId: string;
  theme: string;
  raw: string;
}

export interface DeactivationOrder {
  id: string;
  tokenId: string;
  replacementTokenId?: string;
  reason: string;
  status: DeactivationStatus;
  createdAt: string;
  createdBy: string;
  /** 发布快照：确认所依据的引用、别名与回执现场。 */
  snapshot: {
    dependents: string[];
    aliasChanges: AliasChangeRow[];
    pendingProductIds: string[];
    processedProductIds: string[];
    frozenProductIds: string[];
    directReferrerMementos: ReferrerMemento[];
  };
  confirmedAt?: string;
  confirmedBy?: string;
  failureReason?: string;
  /** 乐观锁版本，两人同时确认时先到者写入。 */
  version: number;
}

export interface DeactivationState {
  tokens: EngineToken[];
  products: ProductRecord[];
  releases: ReleaseRecord[];
  orders: DeactivationOrder[];
  /** 全局单调版本，CAS 冲突检测用。 */
  version: number;
}

export class DeactivationError extends Error {}
export class AuthError extends DeactivationError {}
export class NotFoundError extends DeactivationError {}
export class ConflictError extends DeactivationError {}
export class ValidationError extends DeactivationError {}
