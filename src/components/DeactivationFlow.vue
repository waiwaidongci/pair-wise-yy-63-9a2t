<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import {
  CheckCircleIcon,
  ErrorCircleIcon,
  HistoryIcon,
  LockOnIcon,
  PoweroffIcon,
  RefreshIcon,
  StopCircleIcon
} from 'tdesign-icons-vue-next';
import { useTokenStore, type DeactivationRecord, type Role } from '../store';

const store = useTokenStore();

const deactivateTokenId = ref('');
const deactivateReason = ref('');
const fixValue = ref('');

const baseTokenOptions = computed(() =>
  store.tokens.map((token) => ({ label: `${token.name}（${token.id}）`, value: token.id }))
);

const latestRelease = computed(() => store.latestReleaseId);
const missingReleases = computed(() => store.missingDependencyReleases);

function roleLabel(role: Role) {
  return role === 'maintainer' ? '发布维护员' : '普通编辑';
}

function statusTheme(status: DeactivationRecord['status']) {
  switch (status) {
    case 'pending': return 'warning';
    case 'confirmed': return 'success';
    case 'failed': return 'danger';
    case 'reenabled': return 'default';
  }
}

function statusLabel(status: DeactivationRecord['status']) {
  switch (status) {
    case 'pending': return '待确认';
    case 'confirmed': return '已确认';
    case 'failed': return '确认失败';
    case 'reenabled': return '已重新启用';
  }
}

function onCreate() {
  if (!deactivateTokenId.value) {
    MessagePlugin.error('请选择要停用的基础令牌');
    return;
  }
  if (!deactivateReason.value.trim()) {
    MessagePlugin.error('请填写停用原因');
    return;
  }
  const record = store.createDeactivation(deactivateTokenId.value, deactivateReason.value.trim(), fixValue.value.trim());
  if (!record) {
    MessagePlugin.error('停用单创建失败');
    return;
  }
  MessagePlugin.success(`已生成停用单 ${record.id}，等待发布维护员确认`);
  deactivateTokenId.value = '';
  deactivateReason.value = '';
  fixValue.value = '';
}

function onConfirm(record: DeactivationRecord) {
  const result = store.confirmDeactivation(record.id, record.version);
  if (result.ok) {
    MessagePlugin.success(`停用单 ${record.id} 已确认并生效：${record.affectedProductIds.length} 个产品冻结，${record.recalculatedAliasIds.length} 个别名重算`);
  } else {
    MessagePlugin.error(result.reason ?? '确认失败');
  }
}

function onRace(record: DeactivationRecord) {
  const expected = record.version;
  const first = store.confirmDeactivation(record.id, expected);
  const second = store.confirmDeactivation(record.id, expected);
  if (first.ok) MessagePlugin.success(`先到者写入成功：停用单 ${record.id} 已确认`);
  else MessagePlugin.error(first.reason ?? '先到者失败');
  if (second.ok) MessagePlugin.warning('后到者也写入了（不应发生）');
  else MessagePlugin.warning(`后到者被拒绝：${second.reason ?? '版本冲突'}`);
}

function onSimulateFailure(record: DeactivationRecord) {
  const result = store.simulateFailure(record.id);
  if (result.ok) MessagePlugin.warning(`已模拟确认失败：${result.reason}，可按停用编号恢复`);
  else MessagePlugin.error(result.reason ?? '模拟失败');
}

function onRestore(record: DeactivationRecord) {
  const result = store.restoreDeactivation(record.id);
  if (result.ok) MessagePlugin.success(`已按停用编号 ${record.id} 恢复：冻结解除、别名还原，已处理产品不重复计数`);
  else MessagePlugin.error(result.reason ?? '恢复失败');
}

function onFill(releaseId: string) {
  const result = store.fillDependencyList(releaseId);
  if (result.ok) MessagePlugin.success(`已为 ${releaseId} 补齐依赖清单（${store.tokens.length} 条引用）`);
  else MessagePlugin.warning(result.reason ?? '无需补齐');
}

function onReenable(record: DeactivationRecord) {
  const result = store.reenableDeactivation(record.id);
  if (result.ok) {
    const filled = result.filled && result.filled.length ? `，并补齐 ${result.filled.length} 份旧发布记录的依赖清单` : '';
    MessagePlugin.success(`停用单 ${record.id} 已重新启用${filled}`);
  } else {
    MessagePlugin.error(result.reason ?? '重新启用失败');
  }
}

function onPull(productId: string, releaseId: string) {
  const result = store.pullRelease(productId, releaseId);
  if (result.ok) MessagePlugin.success(`产品已拉取 ${releaseId} 并生成回执`);
  else MessagePlugin.error(result.reason ?? '拉取失败');
}
</script>

<template>
  <div class="deactivate-flow">
    <div class="panel role-bar">
      <div class="role-info">
        <PoweroffIcon size="20px" />
        <div><strong>当前操作身份</strong><span>停用确认仅发布维护员可执行，普通编辑提交将被拒绝</span></div>
      </div>
      <t-select v-model="store.role" style="width: 180px" :options="[{label:'发布维护员',value:'maintainer'},{label:'普通编辑',value:'editor'}]" @change="store.setRole(store.role)" />
    </div>

    <div class="flow-grid">
      <div class="panel create-panel">
        <div class="panel-head"><div><strong>发起停用</strong><span>基础令牌事故时创建停用单，确认后冻结未拉取产品并重算别名</span></div><StopCircleIcon /></div>
        <div class="create-form">
          <label><span>基础令牌</span><t-select v-model="deactivateTokenId" placeholder="选择出事故的基础令牌" :options="baseTokenOptions" /></label>
          <label><span>修复值（改值或回滚后的值）</span><t-input v-model="fixValue" placeholder="留空则沿用当前值" /></label>
          <label class="full"><span>停用原因</span><t-textarea v-model="deactivateReason" placeholder="如：品牌主色 600 色值偏差，需紧急修复" :autosize="{ minRows: 2 }" /></label>
          <t-button theme="primary" :icon="StopCircleIcon" @click="onCreate">生成停用单</t-button>
        </div>
      </div>

      <div class="panel impact-panel">
        <div class="panel-head"><div><strong>停用影响预览</strong><span>基于当前引用关系与产品回执</span></div></div>
        <div class="impact-stats">
          <div><span>未拉取产品（将冻结）</span><strong>{{ store.unpulledProductIds.length }} 个</strong><small>{{ store.products.filter(p => store.unpulledProductIds.includes(p.id)).map(p => p.name).join('、') || '无' }}</small></div>
          <div><span>依赖组件别名（将重算）</span><strong>{{ deactivateTokenId ? store.dependentsOf(deactivateTokenId).filter(id => { const t = store.tokens.find(x => x.id === id); return t?.category === 'component'; }).length : 0 }} 个</strong><small>{{ deactivateTokenId ? store.dependentsOf(deactivateTokenId).filter(id => { const t = store.tokens.find(x => x.id === id); return t?.category === 'component'; }).join('、') : '选择令牌后计算' }}</small></div>
          <div><span>最新发布快照</span><strong>{{ latestRelease }}</strong><small>未拉取此版本的产品将被冻结</small></div>
        </div>
      </div>
    </div>

    <div class="panel records-panel">
      <div class="panel-head"><div><strong>停用单记录</strong><span>按停用编号追踪确认、失败、恢复与重新启用</span></div><HistoryIcon /></div>
      <div v-if="!store.deactivations.length" class="empty-records">暂无停用单，发起后在此显示。</div>
      <div v-for="record in store.deactivations" :key="record.id" class="record-card">
        <div class="record-head">
          <div class="record-id"><t-tag size="small" theme="primary" variant="light">{{ record.id }}</t-tag><strong>{{ record.tokenName }}</strong><span>{{ record.tokenId }}</span></div>
          <t-tag :theme="statusTheme(record.status)" variant="light">{{ statusLabel(record.status) }}</t-tag>
        </div>
        <div class="record-reason">{{ record.reason }}</div>
        <div class="record-meta">
          <span>修复值 <code>{{ record.fixValue || '沿用当前值' }}</code></span>
          <span>发起 {{ record.createdBy }} · {{ record.createdAt }}</span>
          <span v-if="record.confirmedBy">确认 {{ record.confirmedBy }} · {{ record.confirmedAt }}</span>
          <span v-if="record.restoredAt" class="restored">已恢复 · {{ record.restoredAt }}</span>
          <span v-if="record.reenabledAt" class="reenabled">已重新启用 · {{ record.reenabledAt }}</span>
        </div>
        <div v-if="record.failureReason" class="record-failure"><t-icon name="error-circle" />{{ record.failureReason }}</div>
        <div class="record-body">
          <div class="record-col"><span>冻结产品</span><strong>{{ record.affectedProductIds.length }} 个</strong><small v-if="record.affectedProductIds.length">{{ record.affectedProductIds.map(pid => store.products.find(p => p.id === pid)?.name).join('、') }}</small><small v-else>确认后计入，已处理不重复计数</small></div>
          <div class="record-col"><span>重算别名</span><strong>{{ record.recalculatedAliasIds.length }} 个</strong><small v-if="record.recalculatedAliasIds.length">{{ record.recalculatedAliasIds.join('、') }}</small><small v-else>确认后按变化重算</small></div>
          <div class="record-col"><span>乐观锁版本</span><strong>v{{ record.version }}</strong><small>先到者写入，后到者冲突</small></div>
        </div>
        <div class="record-actions">
          <t-button v-if="record.status === 'pending'" size="small" theme="primary" :icon="CheckCircleIcon" @click="onConfirm(record)">确认停用（发布维护员）</t-button>
          <t-button v-if="record.status === 'pending'" size="small" variant="outline" :icon="LockOnIcon" @click="onRace(record)">模拟两人同时确认</t-button>
          <t-button v-if="record.status === 'pending'" size="small" variant="outline" :icon="ErrorCircleIcon" @click="onSimulateFailure(record)">模拟确认失败</t-button>
          <t-button v-if="record.status === 'failed'" size="small" theme="warning" variant="outline" :icon="RefreshIcon" @click="onRestore(record)">按停用编号恢复</t-button>
          <t-button v-if="record.status === 'confirmed'" size="small" theme="success" variant="outline" @click="onReenable(record)">补齐依赖清单并重新启用</t-button>
        </div>
      </div>
    </div>

    <div class="flow-grid">
      <div class="panel products-panel">
        <div class="panel-head"><div><strong>产品回执</strong><span>未拉取最新快照的产品在停用期间被冻结</span></div></div>
        <table class="data-table">
          <thead><tr><th>产品</th><th>最近拉取</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="product in store.products" :key="product.id">
              <td><strong>{{ product.name }}</strong><span>{{ product.id }}</span></td>
              <td><code>{{ product.pulledReleaseId || '从未拉取' }}</code></td>
              <td><t-tag v-if="product.frozen" theme="danger" variant="light">已冻结</t-tag><t-tag v-else theme="success" variant="light">可拉取</t-tag></td>
              <td><t-button size="small" variant="outline" :disabled="product.frozen" @click="onPull(product.id, latestRelease)">拉取 {{ latestRelease }}</t-button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel snapshots-panel">
        <div class="panel-head"><div><strong>发布快照</strong><span>旧记录缺依赖清单，重新启用前需补齐</span></div></div>
        <div v-for="snapshot in store.releaseSnapshots" :key="snapshot.id" class="snapshot-row">
          <div class="snapshot-info"><strong>{{ snapshot.id }}</strong><span>{{ snapshot.publisher }} · {{ snapshot.publishedAt }} · {{ snapshot.tokenCount }} 个令牌</span></div>
          <t-tag v-if="snapshot.dependencyList" theme="success" variant="light">依赖清单完整（{{ snapshot.dependencyList.length }} 条）</t-tag>
          <t-tag v-else theme="danger" variant="light">缺依赖清单</t-tag>
          <t-button v-if="!snapshot.dependencyList" size="small" variant="outline" @click="onFill(snapshot.id)">补齐</t-button>
        </div>
        <div v-if="missingReleases.length" class="snapshot-hint"><t-icon name="info-circle" />仍有 {{ missingReleases.length }} 份旧发布记录缺依赖清单，重新启用时会自动补齐。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.deactivate-flow { display: grid; gap: 13px; }
.role-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.role-info { display: flex; align-items: center; gap: 12px; color: var(--blue); }
.role-info strong, .role-info span { display: block; }
.role-info strong { font-size: 13px; color: var(--ink); }
.role-info span { font-size: 10px; color: var(--muted); margin-top: 2px; }
.flow-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; align-items: start; }
.create-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px 16px; }
.create-form label { font-size: 10px; color: #4d5f6d; }
.create-form label.full { grid-column: 1 / -1; }
.create-form label > span { display: block; margin-bottom: 6px; font-weight: 700; }
.create-form .t-button { grid-column: 1 / -1; justify-self: start; }
.impact-stats { display: grid; gap: 10px; padding: 14px 16px; }
.impact-stats > div { display: grid; gap: 3px; padding: 10px 12px; background: #f8fafb; border: 1px solid var(--line); border-radius: 5px; }
.impact-stats span { font-size: 10px; color: var(--muted); }
.impact-stats strong { font-size: 18px; color: var(--ink); }
.impact-stats small { font-size: 9px; color: var(--muted); overflow-wrap: anywhere; }
.records-panel { padding-bottom: 6px; }
.empty-records { padding: 24px; text-align: center; color: var(--muted); font-size: 11px; }
.record-card { margin: 12px 16px; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.record-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; background: #fafcfd; border-bottom: 1px solid var(--line); }
.record-id { display: flex; align-items: center; gap: 9px; }
.record-id strong { font-size: 13px; }
.record-id span { font-size: 9px; color: var(--muted); font-family: ui-monospace, monospace; }
.record-reason { padding: 10px 14px; font-size: 11px; color: #4d5f6d; }
.record-meta { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 14px 10px; font-size: 9px; color: var(--muted); }
.record-meta code { font-family: ui-monospace, monospace; color: var(--ink); }
.record-meta .restored { color: var(--amber); }
.record-meta .reenabled { color: var(--green); }
.record-failure { display: flex; align-items: center; gap: 7px; margin: 0 14px 10px; padding: 8px 11px; background: #fdeceb; color: #a34a48; border-radius: 4px; font-size: 10px; }
.record-body { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 14px 12px; }
.record-col { display: grid; gap: 3px; padding: 9px 11px; background: #f8fafb; border: 1px solid var(--line); border-radius: 5px; }
.record-col span { font-size: 9px; color: var(--muted); }
.record-col strong { font-size: 14px; }
.record-col small { font-size: 8.5px; color: var(--muted); overflow-wrap: anywhere; }
.record-actions { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); background: #fafcfd; }
.products-panel, .snapshots-panel { padding-bottom: 6px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.data-table th { text-align: left; padding: 10px 14px; font-size: 9px; color: var(--muted); font-weight: 700; border-bottom: 1px solid var(--line); }
.data-table td { padding: 10px 14px; border-bottom: 1px solid #edf1f3; }
.data-table td strong { display: block; font-size: 11px; }
.data-table td span { font-size: 8.5px; color: var(--muted); }
.data-table code { font-family: ui-monospace, monospace; font-size: 10px; }
.snapshot-row { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-bottom: 1px solid #edf1f3; }
.snapshot-info { flex: 1; display: grid; gap: 2px; }
.snapshot-info strong { font-size: 11px; }
.snapshot-info span { font-size: 8.5px; color: var(--muted); }
.snapshot-hint { display: flex; align-items: center; gap: 7px; padding: 10px 14px; font-size: 9.5px; color: var(--amber); }
@media (max-width: 1100px) {
  .flow-grid { grid-template-columns: 1fr; }
}
</style>
