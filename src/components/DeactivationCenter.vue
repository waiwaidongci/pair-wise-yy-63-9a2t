<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useDeactivationStore } from '../deactivation/store';
import type { DeactivationOrder } from '../deactivation/types';

const store = useDeactivationStore();

const form = ref({ tokenId: 'color.base.blue.600', replacementTokenId: '' as string | undefined, reason: '线上反馈主色值异常，需立即停用' });
const receiptTargets = ref<Record<string, string>>({});
const failAfter = ref<number | undefined>(undefined);
const expanded = ref<string | null>(null);

const themeLabels: Record<string, string> = { light: '明亮', dark: '暗色', ops: '运营', contrast: '高对比' };
const statusMeta: Record<DeactivationOrder['status'], { label: string; theme: 'default' | 'success' | 'warning' | 'danger' | 'primary' }> = {
  pending: { label: '待确认', theme: 'warning' },
  effective: { label: '已生效', theme: 'success' },
  failed: { label: '确认失败', theme: 'danger' },
  recovered: { label: '已恢复', theme: 'default' },
  superseded: { label: '已取代', theme: 'default' }
};

const tokens = computed(() => store.state.tokens);
const products = computed(() => store.state.products);
const releases = computed(() => store.state.releases);
const orders = computed(() => store.orders);

function tokenName(id: string): string {
  return tokens.value.find((token) => token.id === id)?.name ?? id;
}

function productName(id: string): string {
  return products.value.find((product) => product.id === id)?.name ?? id;
}

function bundlesToken(releaseId: string, tokenId: string): boolean {
  return releases.value.find((release) => release.id === releaseId)?.bundledTokenIds.includes(tokenId) ?? false;
}

function changedCount(order: DeactivationOrder): number {
  return order.snapshot.aliasChanges.filter((row) => row.status !== 'unchanged').length;
}

function notice(result: { ok: boolean; error?: string }, success: string) {
  if (result.ok) MessagePlugin.success(success);
  else MessagePlugin.error(result.error ?? '操作失败');
}

function register() {
  const result = store.register({
    tokenId: form.value.tokenId,
    replacementTokenId: form.value.replacementTokenId || undefined,
    reason: form.value.reason
  });
  notice(result, `停用单 ${result.data?.id} 已登记，等待发布维护员确认`);
}

function confirm(order: DeactivationOrder) {
  const result = store.confirm(order.id, failAfter.value === undefined ? {} : { failAfter: failAfter.value });
  if (result.ok) {
    const data = result.data!;
    MessagePlugin.success(
      `停用单 ${data.id} 已生效：冻结 ${data.snapshot.frozenProductIds.length} 个未拉取产品，别名重算 ${changedCount(data)} 处变化`
    );
  } else {
    MessagePlugin.error(result.error!);
  }
}

/** 模拟两人同时确认：拿着登记时的旧版本号提交，后到者必被拒。 */
function simulateRacingConfirm(order: DeactivationOrder) {
  const first = store.confirm(order.id);
  notice(first, `先到者提交成功，停用单 ${order.id} 已写入`);
  if (!first.ok) return;
  const second = store.confirm(order.id, {}, 1);
  if (second.ok) MessagePlugin.error('并发提交竟然成功，违反先到者写入约束');
  else MessagePlugin.warning(`后到者被拒绝：${second.error}`);
}

function pullReceipt(productId: string) {
  const releaseId = receiptTargets.value[productId];
  if (!releaseId) {
    MessagePlugin.warning('请先选择要拉取的发布包');
    return;
  }
  const result = store.receipt(productId, releaseId);
  if (result.ok) {
    const data = result.data!;
    MessagePlugin.success(
      `${productName(productId)} 回执 ${releaseId}${data.unfrozen ? '，已解冻' : ''}${data.counted ? '，计入已处理' : '（已处理，不重复计数）'}`
    );
  } else {
    MessagePlugin.error(result.error!);
  }
}

function recover(order: DeactivationOrder) {
  const result = store.recover(order.id);
  notice(result, `停用单 ${order.id} 已按编号恢复，令牌重新启用，已处理产品计数保留`);
}

function backfill(releaseId: string) {
  const result = store.backfill(releaseId);
  notice(result, `发布记录 ${releaseId} 依赖清单已补齐`);
}

function reset() {
  store.resetDemo();
  MessagePlugin.success('演示数据已重置');
}
</script>

<template>
  <section class="deactivation-page">
    <div class="da-summary panel">
      <div><span>进行中停用单</span><strong>{{ orders.filter(o => ['pending','failed'].includes(o.status)).length }}</strong></div>
      <div><span>已生效</span><strong>{{ orders.filter(o => o.status === 'effective').length }}</strong></div>
      <div><span>冻结产品</span><strong>{{ products.filter(p => p.frozen).length }}</strong></div>
      <div><span>已停用令牌</span><strong>{{ tokens.filter(t => t.status === 'disabled').length }}</strong></div>
      <div><span>缺依赖清单的发布</span><strong :class="{ bad: releases.some(r => !r.manifest || !r.manifest.length) }">{{ releases.filter(r => !r.manifest || !r.manifest.length).length }}</strong></div>
    </div>

    <div class="da-layout">
      <div class="da-main">
        <!-- 登记停用单 -->
        <div class="panel da-panel">
          <div class="panel-head">
            <div><strong>登记基础令牌停用</strong><span>登记只固化现场，发布维护员确认后才生效</span></div>
            <t-tag :theme="store.isMaintainer ? 'success' : 'danger'" variant="light">{{ store.isMaintainer ? '发布维护员' : '普通编辑（越权提交将被拒绝）' }}</t-tag>
          </div>
          <div class="da-form">
            <label><span>出事基础令牌</span>
              <t-select v-model="form.tokenId" :options="tokens.filter(t => t.status !== 'disabled' && !t.ref).map(t => ({ label: `${t.name}（${t.id}）`, value: t.id }))" />
            </label>
            <label><span>替换令牌（可选）</span>
              <t-select v-model="form.replacementTokenId" clearable placeholder="不选则别名停用后不可解析" :options="tokens.filter(t => t.id !== form.tokenId && t.status !== 'disabled').map(t => ({ label: `${t.name}（${t.id}）`, value: t.id }))" />
            </label>
            <label class="span-2"><span>事故原因</span><t-input v-model="form.reason" /></label>
            <div class="da-form-actions">
              <t-button theme="primary" @click="register">登记停用单</t-button>
              <t-button variant="outline" @click="reset">重置演示数据</t-button>
            </div>
          </div>
        </div>

        <!-- 停用单列表 -->
        <div v-for="order in orders" :key="order.id" class="panel da-order">
          <div class="order-head">
            <div>
              <div class="order-title">
                <t-tag size="small" :theme="statusMeta[order.status].theme" variant="light">{{ statusMeta[order.status].label }}</t-tag>
                <strong>{{ order.id }}</strong>
                <span class="mono">{{ order.tokenId }}</span>
              </div>
              <small>{{ order.reason }} · 登记 {{ new Date(order.createdAt).toLocaleString('zh-CN') }}<template v-if="order.confirmedAt"> · 确认 {{ new Date(order.confirmedAt).toLocaleString('zh-CN') }}</template></small>
            </div>
            <div class="order-actions">
              <t-button size="small" variant="outline" @click="expanded = expanded === order.id ? null : order.id">
                {{ expanded === order.id ? '收起快照' : `查看发布快照（${changedCount(order)} 处别名变化）` }}
              </t-button>
              <t-button v-if="order.status === 'pending'" size="small" theme="primary" @click="confirm(order)">维护员确认生效</t-button>
              <t-button v-if="order.status === 'pending'" size="small" variant="outline" @click="simulateRacingConfirm(order)">模拟两人同时确认</t-button>
              <t-button v-if="order.status === 'failed'" size="small" theme="warning" @click="recover(order)">按编号恢复 {{ order.id }}</t-button>
            </div>
          </div>
          <div v-if="order.failureReason" class="order-failure"><t-icon name="error-circle" /> {{ order.failureReason }}</div>
          <div class="order-metrics">
            <div><span>依赖令牌</span><strong>{{ order.snapshot.dependents.length }}</strong></div>
            <div><span>待拉取（冻结）</span><strong>{{ order.snapshot.pendingProductIds.length }}</strong></div>
            <div><span>已处理产品</span><strong>{{ order.snapshot.processedProductIds.length }}</strong></div>
            <div><span>替换令牌</span><strong class="mono">{{ order.replacementTokenId ?? '—' }}</strong></div>
            <div><span>乐观锁版本</span><strong>v{{ order.version }}</strong></div>
          </div>
          <div v-if="expanded === order.id" class="order-snapshot">
            <div class="snapshot-col">
              <strong>产品回执处理</strong>
              <div v-for="product in products" :key="product.id" class="receipt-row">
                <div>
                  <strong>{{ product.name }}</strong>
                  <t-tag size="small" :theme="product.frozen ? 'danger' : 'success'" variant="light">{{ product.frozen ? `冻结中（${product.frozenBy}）` : '正常' }}</t-tag>
                  <small class="mono">在用 {{ product.currentReleaseId }}</small>
                </div>
                <div class="receipt-actions">
                  <t-select v-model="receiptTargets[product.id]" size="small" placeholder="选择拉取包" :options="releases.map(r => ({ label: r.id + (bundlesToken(r.id, order.tokenId) ? '（含停用令牌）' : '（安全包）'), value: r.id }))" />
                  <t-button size="small" :variant="product.frozen ? 'base' : 'outline'" :theme="product.frozen ? 'primary' : 'default'" @click="pullReceipt(product.id)">提交回执</t-button>
                </div>
              </div>
              <p class="snapshot-note">已处理：{{ order.snapshot.processedProductIds.map(productName).join('、') || '无' }}；冻结：{{ order.snapshot.frozenProductIds.map(productName).join('、') || '无' }}</p>
            </div>
            <div class="snapshot-col">
              <strong>组件别名重算（按主题）</strong>
              <div class="alias-table">
                <div class="alias-row alias-head"><span>别名</span><span>主题</span><span>解析前</span><span>解析后</span><span>结果</span></div>
                <div v-for="(row, index) in order.snapshot.aliasChanges" :key="index" class="alias-row" :class="row.status">
                  <span class="mono">{{ tokenName(row.tokenId) }}</span>
                  <span>{{ themeLabels[row.theme] ?? row.theme }}</span>
                  <span>{{ row.beforeResolved }}</span>
                  <span>{{ row.afterResolved }}</span>
                  <span><t-tag size="small" :theme="row.status === 'unresolved' ? 'danger' : row.status === 'changed' ? 'warning' : 'success'" variant="light">{{ row.status === 'unresolved' ? '不可解析' : row.status === 'changed' ? '已变化' : '无变化' }}</t-tag></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!orders.length" class="panel empty-panel">暂无停用单。基础令牌出事故时，先在上方登记，再由发布维护员确认。</div>
      </div>

      <!-- 发布快照与依赖清单 -->
      <aside class="da-side">
        <div class="panel">
          <div class="panel-head"><div><strong>发布快照</strong><span>产品按固定版本拉取，冻结期拒绝旧包</span></div></div>
          <div v-for="release in releases" :key="release.id" class="release-row">
            <div class="release-title">
              <strong>{{ release.id }}</strong>
              <t-tag size="small" :theme="release.manifest && release.manifest.length ? 'success' : 'warning'" variant="light">{{ release.manifest && release.manifest.length ? '依赖清单完整' : '缺依赖清单' }}</t-tag>
              <t-tag size="small" :theme="release.bundledTokenIds.some(id => tokens.find(t => t.id === id)?.status === 'disabled') ? 'danger' : 'default'" variant="light">{{ release.bundledTokenIds.some(id => tokens.find(t => t.id === id)?.status === 'disabled') ? '含停用令牌' : '可拉取' }}</t-tag>
            </div>
            <small>{{ release.bundledTokenIds.length }} 个令牌 · {{ release.manifest?.length ?? 0 }} 条引用边</small>
            <t-button v-if="!release.manifest || !release.manifest.length" size="small" variant="outline" @click="backfill(release.id)">先补齐依赖清单</t-button>
            <ul v-else class="manifest-list">
              <li v-for="(edge, index) in release.manifest.slice(0, 6)" :key="index" class="mono">{{ edge.from }} → {{ edge.to }}</li>
              <li v-if="release.manifest.length > 6" class="more">等 {{ release.manifest.length }} 条</li>
            </ul>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><strong>确认中断演练</strong><span>失败后只能按编号恢复</span></div></div>
          <div class="drill-box">
            <small>确认前设置「处理 N 个产品后中断」，登记一张新停用单并确认即可制造 failed 状态：</small>
            <t-select v-model="failAfter" clearable placeholder="不注入失败" :options="[{label:'第 1 个产品前中断',value:0},{label:'处理 1 个后中断',value:1},{label:'处理 2 个后中断',value:2}]" />
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
