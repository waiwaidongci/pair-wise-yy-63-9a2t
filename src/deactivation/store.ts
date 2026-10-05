import { defineStore } from 'pinia';
import { Actor, DeactivationOrder, DeactivationState } from './types';
import { DeactivationEngine, ConfirmOptions, RegisterInput, ReceiptResult } from './engine';
import { createSeedState, EDITOR, MAINTAINER } from './seed';

const storageKey = 'yy63-token-deactivation';

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

function loadState(): DeactivationState {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        return JSON.parse(raw) as DeactivationState;
      } catch {
        // 损坏的本地缓存回落到种子数据。
      }
    }
  }
  return createSeedState();
}

export const useDeactivationStore = defineStore('deactivation', {
  state: () => ({
    state: loadState() as DeactivationState,
    actorId: MAINTAINER.id as string
  }),
  getters: {
    engine(): DeactivationEngine {
      return new DeactivationEngine(this.state);
    },
    actor(): Actor {
      return this.actorId === MAINTAINER.id ? MAINTAINER : EDITOR;
    },
    isMaintainer(): boolean {
      return this.actor.role === 'release-maintainer';
    },
    actors(): Actor[] {
      return [MAINTAINER, EDITOR];
    },
    orders(): DeactivationOrder[] {
      return [...this.state.orders].sort((a, b) => b.id.localeCompare(a.id));
    }
  },
  actions: {
    persist() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(this.state));
      }
    },
    resetDemo() {
      this.state = createSeedState();
      this.actorId = MAINTAINER.id;
      this.persist();
    },
    setActor(actorId: string) {
      this.actorId = actorId;
    },
    runGuarded<T>(fn: () => T): ActionResult<T> {
      try {
        const data = fn();
        this.persist();
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    register(input: RegisterInput): ActionResult<DeactivationOrder> {
      return this.runGuarded(() => this.engine.registerDeactivation(input, this.actor));
    },
    confirm(orderId: string, options: ConfirmOptions = {}, overrideExpectedVersion?: number): ActionResult<DeactivationOrder> {
      const order = this.state.orders.find((item) => item.id === orderId);
      const expectedVersion = overrideExpectedVersion ?? options.expectedVersion ?? order?.version;
      return this.runGuarded(() => this.engine.confirmDeactivation(orderId, this.actor, { ...options, expectedVersion }));
    },
    receipt(productId: string, releaseId: string): ActionResult<ReceiptResult> {
      return this.runGuarded(() => this.engine.registerProductReceipt(productId, releaseId, this.actor));
    },
    recover(orderId: string): ActionResult<DeactivationOrder> {
      const order = this.state.orders.find((item) => item.id === orderId);
      return this.runGuarded(() => this.engine.recoverByOrder(orderId, this.actor, order?.version));
    },
    backfill(releaseId: string) {
      return this.runGuarded(() => this.engine.backfillManifest(releaseId, this.actor));
    }
  }
});
