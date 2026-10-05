import assert from 'node:assert';
import { DeactivationEngine } from '../src/deactivation/engine';
import { createSeedState, MAINTAINER, EDITOR } from '../src/deactivation/seed';
import { resolve } from '../src/deactivation/graph';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fresh() {
  return new DeactivationEngine(createSeedState());
}

test('普通编辑登记停用被拒绝（越权）', () => {
  const engine = fresh();
  assert.throws(
    () => engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故令牌' }, EDITOR),
    /无权/
  );
});

test('普通编辑提交停用确认被拒绝（越权）', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  assert.throws(() => engine.confirmDeactivation(order.id, EDITOR), /无权/);
});

test('登记后未确认不生效：令牌仍可用，产品未冻结', () => {
  const engine = fresh();
  engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  const token = engine.snapshot.tokens.find((t) => t.id === 'color.base.blue.600')!;
  assert.equal(token.status, 'stable');
  assert.ok(engine.snapshot.products.every((p) => !p.frozen));
});

test('维护员确认后：基础令牌停用、未拉取产品冻结、已切安全包产品不冻结', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  engine.confirmDeactivation(order.id, MAINTAINER, { expectedVersion: order.version });
  const token = engine.snapshot.tokens.find((t) => t.id === 'color.base.blue.600')!;
  assert.equal(token.status, 'disabled');
  const frozen = engine.snapshot.products.filter((p) => p.frozen).map((p) => p.id);
  assert.deepEqual(frozen.sort(), ['pdt-component-lib', 'pdt-mobile', 'pdt-ops-admin']);
  const data = engine.snapshot.products.find((p) => p.id === 'pdt-data')!;
  assert.equal(data.frozen, false);
});

test('依赖它的组件别名按变化重算：light 改写替换令牌，dark 指向的 400 仍解析', () => {
  const engine = fresh();
  const order = engine.registerDeactivation(
    { tokenId: 'color.base.blue.600', replacementTokenId: 'color.base.green.600', reason: '事故' },
    MAINTAINER
  );
  engine.confirmDeactivation(order.id, MAINTAINER);
  const button = engine.snapshot.tokens.find((t) => t.id === 'component.button.primary.bg')!;
  assert.equal(button.themes.light, '{color.semantic.primary}');
  const semantic = engine.snapshot.tokens.find((t) => t.id === 'color.semantic.primary')!;
  assert.equal(semantic.themes.light, '{color.base.green.600}');
  assert.equal(semantic.themes.dark, '{color.base.blue.400}');
  // 组件别名 light 解析到绿色，dark 仍解析到蓝色 400
  assert.equal(resolve(engine.snapshot.tokens, button.themes.light, 'light'), '#24786a');
  assert.equal(resolve(engine.snapshot.tokens, button.themes.dark, 'dark'), '#6f96ff');
  const rows = order.snapshot.aliasChanges.filter((r) => r.tokenId === 'component.button.primary.bg');
  assert.ok(rows.some((r) => r.theme === 'light' && r.status === 'changed'));
});

test('无替换令牌时停用后别名变为不可解析', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  engine.confirmDeactivation(order.id, MAINTAINER);
  const button = engine.snapshot.tokens.find((t) => t.id === 'component.button.primary.bg')!;
  assert.equal(resolve(engine.snapshot.tokens, button.themes.light, 'light'), undefined);
  assert.ok(order.snapshot.aliasChanges.some((r) => r.status === 'unresolved'));
});

test('两人同时确认：先到者写入，后到者因版本冲突被拒绝', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  const version = order.version;
  engine.confirmDeactivation(order.id, MAINTAINER, { expectedVersion: version });
  assert.throws(
    () => engine.confirmDeactivation(order.id, MAINTAINER, { expectedVersion: version }),
    /先提交|已生效/
  );
  // 令牌只停用一次，没有重复冻结副作用
  const order2 = engine.snapshot.orders.find((o) => o.id === order.id)!;
  assert.equal(order2.status, 'effective');
});

test('冻结产品拉取含停用令牌的旧包被拒绝；拉安全包后解冻且只计数一次', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  engine.confirmDeactivation(order.id, MAINTAINER);
  const mobile = engine.snapshot.products.find((p) => p.id === 'pdt-mobile')!;
  assert.equal(mobile.frozen, true);
  assert.throws(() => engine.registerProductReceipt('pdt-mobile', 'DS 4.6.0-rc.2', MAINTAINER), /冻结/);
  const first = engine.registerProductReceipt('pdt-mobile', 'DS 4.6.1-hotfix', MAINTAINER);
  assert.equal(first.unfrozen, true);
  assert.equal(first.counted, true);
  // 重复回执不重复计数
  const second = engine.registerProductReceipt('pdt-mobile', 'DS 4.6.1-hotfix', MAINTAINER);
  assert.equal(second.counted, false);
  const after = engine.snapshot.products.find((p) => p.id === 'pdt-mobile')!;
  assert.equal(after.frozen, false);
});

test('确认失败后按停用编号恢复，已处理产品不重复计数', () => {
  const engine = fresh();
  const order = engine.registerDeactivation(
    { tokenId: 'color.base.blue.600', replacementTokenId: 'color.base.green.600', reason: '事故' },
    MAINTAINER
  );
  // 只处理 1 个产品后注入失败
  try {
    engine.confirmDeactivation(order.id, MAINTAINER, { expectedVersion: order.version, failAfter: 1 });
    assert.fail('应当抛出失败');
  } catch (error) {
    assert.match(String(error), /中断|恢复/);
  }
  const failed = engine.snapshot.orders.find((o) => o.id === order.id)!;
  assert.equal(failed.status, 'failed');
  const frozenCount = engine.snapshot.products.filter((p) => p.frozen).length;
  assert.equal(frozenCount, 1);
  // 失败后冻结产品拉安全包，仍计入已处理
  const frozenOne = engine.snapshot.products.find((p) => p.frozen)!;
  const receipt = engine.registerProductReceipt(frozenOne.id, 'DS 4.6.1-hotfix', MAINTAINER);
  assert.equal(receipt.counted, true);
  const processedBefore = [...failed.snapshot.processedProductIds];
  // 旧发布缺依赖清单时恢复会被门禁拦住，先补齐再恢复
  assert.throws(() => engine.recoverByOrder(order.id, MAINTAINER, failed.version), /依赖清单/);
  engine.backfillManifest('DS 4.5.2', MAINTAINER);
  const recovered = engine.recoverByOrder(order.id, MAINTAINER, failed.version);
  assert.equal(recovered.status, 'recovered');
  const token = engine.snapshot.tokens.find((t) => t.id === 'color.base.blue.600')!;
  assert.equal(token.status, 'stable');
  const semantic = engine.snapshot.tokens.find((t) => t.id === 'color.semantic.primary')!;
  assert.equal(semantic.themes.light, '{color.base.blue.600}');
  // 已处理产品计数保留、不重复
  assert.deepEqual(recovered.snapshot.processedProductIds, processedBefore);
  assert.ok(engine.snapshot.products.every((p) => !p.frozen));
});

test('旧发布缺依赖清单：未补齐时恢复被拒，补齐后可恢复', () => {
  const engine = fresh();
  const legacy = engine.snapshot.releases.find((r) => r.id === 'DS 4.5.2')!;
  assert.ok(!legacy.manifest || legacy.manifest.length === 0);
  const order = engine.registerDeactivation(
    { tokenId: 'color.base.blue.600', replacementTokenId: 'color.base.green.600', reason: '事故' },
    MAINTAINER
  );
  try {
    engine.confirmDeactivation(order.id, MAINTAINER, { expectedVersion: order.version, failAfter: 0 });
  } catch {
    /* 预期失败 */
  }
  // failAfter:0 在冻结任何产品前失败；此时移动端旧包缺清单，恢复门禁应拦住
  assert.throws(() => engine.recoverByOrder(order.id, MAINTAINER), /依赖清单/);
  // 普通编辑不能补齐
  assert.throws(() => engine.backfillManifest('DS 4.5.2', EDITOR), /无权/);
  engine.backfillManifest('DS 4.5.2', MAINTAINER);
  assert.ok(legacy.manifest!.length > 0);
  const recovered = engine.recoverByOrder(order.id, MAINTAINER);
  assert.equal(recovered.status, 'recovered');
});

test('发布快照记录依赖清单与别名差异', () => {
  const engine = fresh();
  const order = engine.registerDeactivation({ tokenId: 'color.base.blue.600', reason: '事故' }, MAINTAINER);
  engine.confirmDeactivation(order.id, MAINTAINER);
  assert.ok(order.snapshot.dependents.includes('color.semantic.primary'));
  assert.ok(order.snapshot.dependents.includes('component.button.primary.bg'));
  assert.ok(order.confirmedAt);
  assert.equal(order.confirmedBy, MAINTAINER.id);
});

console.log(`\n${passed} 项领域测试全部通过`);
