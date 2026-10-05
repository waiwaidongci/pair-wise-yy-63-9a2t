import {
  Actor,
  AliasChangeRow,
  AuthError,
  ConflictError,
  DeactivationOrder,
  DeactivationState,
  EngineToken,
  NotFoundError,
  ProductRecord,
  ReleaseRecord,
  ValidationError
} from './types';
import {
  applyReplacement,
  asRef,
  buildManifest,
  cloneTokens,
  dependentIds,
  recalcAliases
} from './graph';

export interface RegisterInput {
  tokenId: string;
  replacementTokenId?: string;
  reason: string;
}

export interface ConfirmOptions {
  /** 乐观锁：调用方读到的 order.version，两人同时确认时后到者冲突。 */
  expectedVersion?: number;
  /** 处理前 N 个未拉取产品后注入失败，用于确认中断与恢复演练。 */
  failAfter?: number;
}

export interface ReceiptResult {
  receipt: { releaseId: string; pulledAt: string };
  unfrozen: boolean;
  /** 是否首次计入停用单的已处理产品；重复回执不重复计数。 */
  counted: boolean;
  orderId?: string;
}

const MAINTAINER: Actor['role'] = 'release-maintainer';

export class DeactivationEngine {
  constructor(private state: DeactivationState) {}

  get snapshot(): DeactivationState {
    return this.state;
  }

  private requireMaintainer(actor: Actor, action: string) {
    if (actor.role !== MAINTAINER) {
      throw new AuthError(`普通编辑无权执行「${action}」，停用流程仅发布维护员可提交`);
    }
  }

  private tokenOrThrow(tokenId: string): EngineToken {
    const token = this.state.tokens.find((item) => item.id === tokenId);
    if (!token) throw new NotFoundError(`令牌 ${tokenId} 不存在`);
    return token;
  }

  private orderOrThrow(orderId: string): DeactivationOrder {
    const order = this.state.orders.find((item) => item.id === orderId);
    if (!order) throw new NotFoundError(`停用单 ${orderId} 不存在`);
    return order;
  }

  private releaseOrThrow(releaseId: string): ReleaseRecord {
    const release = this.state.releases.find((item) => item.id === releaseId);
    if (!release) throw new NotFoundError(`发布记录 ${releaseId} 不存在`);
    return release;
  }

  private productOrThrow(productId: string): ProductRecord {
    const product = this.state.products.find((item) => item.id === productId);
    if (!product) throw new NotFoundError(`产品 ${productId} 不存在`);
    return product;
  }

  private activeOrdersForToken(tokenId: string): DeactivationOrder[] {
    return this.state.orders.filter(
      (order) => order.tokenId === tokenId && (order.status === 'pending' || order.status === 'effective' || order.status === 'failed')
    );
  }

  private releaseBundlesToken(release: ReleaseRecord, tokenId: string): boolean {
    return release.bundledTokenIds.includes(tokenId);
  }

  /** 产品是否已拉取不含停用令牌的安全包。 */
  private hasSafeReceipt(product: ProductRecord, tokenId: string): boolean {
    return product.receipts.some((receipt) => {
      const release = this.state.releases.find((item) => item.id === receipt.releaseId);
      return !!release && !this.releaseBundlesToken(release, tokenId);
    });
  }

  /** 受影响产品：回执历史中拉取过捆绑停用令牌发布包的产品。 */
  private affectedProducts(tokenId: string): ProductRecord[] {
    return this.state.products.filter((product) =>
      product.receipts.some((receipt) => {
        const release = this.state.releases.find((item) => item.id === receipt.releaseId);
        return !!release && this.releaseBundlesToken(release, tokenId);
      })
    );
  }

  /** 登记停用单：冻结引用现场、预算别名变化，等待维护员确认。 */
  registerDeactivation(input: RegisterInput, actor: Actor): DeactivationOrder {
    this.requireMaintainer(actor, '登记停用');
    const token = this.tokenOrThrow(input.tokenId);
    if (token.status === 'disabled') throw new ValidationError(`令牌 ${input.tokenId} 已处于停用状态`);
    if (this.activeOrdersForToken(input.tokenId).length > 0) {
      throw new ConflictError(`令牌 ${input.tokenId} 已存在进行中的停用单`);
    }
    if (input.replacementTokenId) {
      const replacement = this.tokenOrThrow(input.replacementTokenId);
      if (replacement.status === 'disabled') throw new ValidationError('替换令牌本身已停用，无法承接别名');
    }

    const baseline = cloneTokens(this.state.tokens);
    const projected = cloneTokens(this.state.tokens);
    const target = projected.find((item) => item.id === input.tokenId)!;
    target.status = 'disabled';
    applyReplacement(projected, input.tokenId, input.replacementTokenId);

    const dependents = dependentIds(baseline, input.tokenId);
    const previewChanges = recalcAliases({
      targetId: input.tokenId,
      replacementTokenId: input.replacementTokenId,
      baselineTokens: baseline,
      effectiveTokens: projected
    });

    const seq = this.state.orders.length + 1;
    const order: DeactivationOrder = {
      id: `DA-${String(seq).padStart(4, '0')}`,
      tokenId: input.tokenId,
      replacementTokenId: input.replacementTokenId,
      reason: input.reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      version: 1,
      snapshot: {
        dependents,
        aliasChanges: previewChanges,
        pendingProductIds: this.affectedProducts(input.tokenId)
          .filter((product) => !this.hasSafeReceipt(product, input.tokenId))
          .map((product) => product.id),
        processedProductIds: this.affectedProducts(input.tokenId)
          .filter((product) => this.hasSafeReceipt(product, input.tokenId))
          .map((product) => product.id),
        frozenProductIds: [],
        directReferrerMementos: []
      }
    };
    this.state.orders.push(order);
    this.state.version += 1;
    return order;
  }

  /**
   * 发布维护员确认停用：先到者写入（版本 CAS），随后冻结未拉取产品、
   * 停用基础令牌、按引用变化重算组件别名，并固化发布快照。
   */
  confirmDeactivation(orderId: string, actor: Actor, options: ConfirmOptions = {}): DeactivationOrder {
    this.requireMaintainer(actor, '停用确认');
    const order = this.orderOrThrow(orderId);

    if (options.expectedVersion !== undefined && options.expectedVersion !== order.version) {
      throw new ConflictError(`停用单 ${orderId} 已被另一位维护员先提交（版本 ${order.version}），本次提交被拒绝`);
    }
    if (order.status === 'effective') {
      throw new ConflictError(`停用单 ${orderId} 已生效，确认请勿重复提交`);
    }
    if (order.status !== 'pending') {
      throw new ConflictError(`停用单 ${orderId} 当前状态为 ${order.status}，不能确认`);
    }
    const token = this.tokenOrThrow(order.tokenId);
    if (token.status === 'disabled') throw new ConflictError('目标令牌已被其他停用单停用');

    // 1) 冻结未拉取产品（已拉安全包的产品不冻结，且只计一次）。
    const affected = this.affectedProducts(order.tokenId);
    const pending = affected.filter((product) => !this.hasSafeReceipt(product, order.tokenId));
    let processed = 0;
    for (const product of pending) {
      if (options.failAfter !== undefined && processed >= options.failAfter) {
        order.status = 'failed';
        order.failureReason = `处理产品 ${product.name} 前回执流水线中断`;
        order.version += 1;
        this.state.version += 1;
        throw new ConflictError(`停用确认中断，停用单 ${orderId} 已置为失败，请按编号恢复`);
      }
      if (!product.frozen) {
        product.frozen = true;
        product.frozenBy = order.id;
      }
      if (!order.snapshot.frozenProductIds.includes(product.id)) order.snapshot.frozenProductIds.push(product.id);
      processed += 1;
    }

    // 2) 保留引用现场（恢复时原样写回）。
    const baseline = cloneTokens(this.state.tokens);
    order.snapshot.directReferrerMementos = [];
    this.state.tokens.forEach((candidate) => {
      Object.keys(candidate.themes).forEach((theme) => {
        if (asRef(candidate.themes[theme]) === order.tokenId) {
          order.snapshot.directReferrerMementos.push({ tokenId: candidate.id, theme, raw: candidate.themes[theme] });
        }
      });
    });
    (order as DeactivationOrder & { previousTokenStatus?: string }).previousTokenStatus = token.status;

    // 3) 停用基础令牌，依赖它的组件别名按替换关系重算。
    token.status = 'disabled';
    applyReplacement(this.state.tokens, order.tokenId, order.replacementTokenId);

    // 4) 固化发布快照（引用差异 + 回执处理结果）。
    order.snapshot.dependents = dependentIds(baseline, order.tokenId);
    order.snapshot.aliasChanges = recalcAliases({
      targetId: order.tokenId,
      replacementTokenId: order.replacementTokenId,
      baselineTokens: baseline,
      effectiveTokens: this.state.tokens
    });
    affected
      .filter((product) => this.hasSafeReceipt(product, order.tokenId))
      .forEach((product) => {
        if (!order.snapshot.processedProductIds.includes(product.id)) order.snapshot.processedProductIds.push(product.id);
      });
    order.snapshot.pendingProductIds = pending.map((product) => product.id);

    order.status = 'effective';
    order.confirmedAt = new Date().toISOString();
    order.confirmedBy = actor.id;
    order.version += 1;
    this.state.version += 1;
    return order;
  }

  /**
   * 产品回执：拉取新包登记凭证。冻结产品拉取含停用令牌的旧包一律拒绝；
   * 拉到安全包后解冻，每个产品对每张停用单只计数一次。
   */
  registerProductReceipt(productId: string, releaseId: string, _actor: Actor): ReceiptResult {
    const product = this.productOrThrow(productId);
    const release = this.releaseOrThrow(releaseId);

    const blockingOrder = this.state.orders.find(
      (order) => (order.status === 'effective' || order.status === 'failed') && product.frozenBy === order.id
    );
    if (product.frozen && blockingOrder && this.releaseBundlesToken(release, blockingOrder.tokenId)) {
      throw new ConflictError(`产品 ${product.name} 已被停用单 ${blockingOrder.id} 冻结，禁止继续拉取含停用令牌的旧包 ${releaseId}`);
    }

    const existing = product.receipts.find((receipt) => receipt.releaseId === releaseId);
    const receipt = existing ?? { releaseId, pulledAt: new Date().toISOString() };
    if (!existing) product.receipts.push(receipt);
    product.currentReleaseId = releaseId;

    let unfrozen = false;
    let counted = false;
    let orderId: string | undefined;
    const order = this.state.orders.find(
      (item) => item.tokenId && (item.status === 'effective' || item.status === 'failed') && product.frozenBy === item.id
    );
    if (order && product.frozen && !this.releaseBundlesToken(release, order.tokenId)) {
      unfrozen = true;
      product.frozen = false;
      product.frozenBy = undefined;
      if (!order.snapshot.processedProductIds.includes(product.id)) {
        order.snapshot.processedProductIds.push(product.id);
        counted = true;
      }
      orderId = order.id;
    }
    this.state.version += 1;
    return { receipt, unfrozen, counted, orderId };
  }

  /** 重新启用前的依赖清单门禁：所有捆绑该令牌的发布记录必须有依赖清单。 */
  private manifestGaps(tokenId: string): ReleaseRecord[] {
    return this.state.releases.filter(
      (release) => this.releaseBundlesToken(release, tokenId) && (!release.manifest || release.manifest.length === 0)
    );
  }

  /**
   * 按停用编号恢复：写回引用现场、恢复令牌、解冻产品。
   * 已处理产品保留计数，不重复处理；旧发布缺依赖清单时必须先补齐。
   */
  recoverByOrder(orderId: string, actor: Actor, expectedVersion?: number): DeactivationOrder {
    this.requireMaintainer(actor, '停用恢复');
    const order = this.orderOrThrow(orderId);
    if (expectedVersion !== undefined && expectedVersion !== order.version) {
      throw new ConflictError(`停用单 ${orderId} 版本已变化，请刷新后重试`);
    }
    if (order.status !== 'failed') throw new ConflictError(`停用单 ${orderId} 状态为 ${order.status}，仅确认失败的停用单可恢复`);

    const gaps = this.manifestGaps(order.tokenId);
    if (gaps.length > 0) {
      throw new ValidationError(
        `重新启用前需补齐依赖清单：发布记录 ${gaps.map((release) => release.id).join('、')} 缺少依赖清单，请先补齐`
      );
    }

    // 写回引用现场（仅恢复仍指向当前表达式的条目，避免覆盖恢复期间的人工编辑）。
    order.snapshot.directReferrerMementos.forEach((memento) => {
      const token = this.state.tokens.find((item) => item.id === memento.tokenId);
      if (token && asRef(token.themes[memento.theme]) === order.replacementTokenId) {
        token.themes[memento.theme] = memento.raw;
      }
    });
    const token = this.state.tokens.find((item) => item.id === order.tokenId);
    if (token) {
      const previous = (order as DeactivationOrder & { previousTokenStatus?: string }).previousTokenStatus;
      token.status = (previous as EngineToken['status']) ?? 'stable';
    }

    this.state.products.forEach((product) => {
      if (product.frozenBy === order.id) {
        product.frozen = false;
        product.frozenBy = undefined;
      }
    });

    order.status = 'recovered';
    order.version += 1;
    this.state.version += 1;
    // processedProductIds 原样保留：已处理产品不重复计数。
    return order;
  }

  /** 补齐旧发布记录缺失的依赖清单（按当前令牌引用图重建）。 */
  backfillManifest(releaseId: string, actor: Actor): ReleaseRecord {
    this.requireMaintainer(actor, '补齐依赖清单');
    const release = this.releaseOrThrow(releaseId);
    if (release.manifest && release.manifest.length > 0) {
      throw new ConflictError(`发布记录 ${releaseId} 已具备依赖清单，无需补齐`);
    }
    const bundled = new Set(release.bundledTokenIds);
    release.manifest = buildManifest(this.state.tokens).filter((edge) => bundled.has(edge.from) && bundled.has(edge.to));
    this.state.version += 1;
    return release;
  }

  /** 预览别名重算差异（登记时已随快照保存，页面直接读取）。 */
  orderChanges(orderId: string): AliasChangeRow[] {
    return this.orderOrThrow(orderId).snapshot.aliasChanges;
  }
}
