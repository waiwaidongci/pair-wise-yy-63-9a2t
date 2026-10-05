import type { AliasChangeRow, DependencyEdge, EngineToken } from './types';

const REF_PATTERN = /^\{([^{}]+)\}$/;

/** 原始值是否为单一令牌引用表达式，如 {color.base.blue.600}。 */
export function asRef(raw: string): string | undefined {
  const match = raw.trim().match(REF_PATTERN);
  return match ? match[1] : undefined;
}

export function isRef(raw: string): boolean {
  return asRef(raw) !== undefined;
}

/** 替换引用表达式指向的目标；非引用值原样返回。 */
export function rewriteRef(raw: string, fromId: string, toId: string): string {
  return asRef(raw) === fromId ? `{${toId}}` : raw;
}

function findToken(tokens: EngineToken[], id: string): EngineToken | undefined {
  return tokens.find((token) => token.id === id);
}

/**
 * 沿引用链把原始表达式解析成基础令牌的具体值。
 * 停用的基础令牌视为不可解析；引用链断裂时返回 undefined。
 */
export function resolve(
  tokens: EngineToken[],
  raw: string,
  theme: string,
  visited: Set<string> = new Set()
): string | undefined {
  const refId = asRef(raw);
  if (!refId) return raw;
  if (visited.has(refId)) return undefined; // 循环引用
  const target = findToken(tokens, refId);
  if (!target || target.status === 'disabled') return undefined;
  visited.add(refId);
  const nextRaw = target.themes[theme] ?? target.value;
  return resolve(tokens, nextRaw, theme, visited);
}

/** 直接引用某令牌的引用方（令牌 ID -> ref）。 */
export function directReferrers(tokens: EngineToken[], targetId: string): EngineToken[] {
  return tokens.filter((token) => Object.values(token.themes).some((raw) => asRef(raw) === targetId) || asRef(token.value) === targetId);
}

/** 反向可达：直接与传递依赖目标令牌的所有令牌 ID。 */
export function dependentIds(tokens: EngineToken[], targetId: string): string[] {
  const result = new Set<string>();
  const walk = (id: string) => {
    directReferrers(tokens, id).forEach((referrer) => {
      if (!result.has(referrer.id)) {
        result.add(referrer.id);
        walk(referrer.id);
      }
    });
  };
  walk(targetId);
  return [...result];
}

export interface RecalcOptions {
  targetId: string;
  replacementTokenId?: string;
  /** 重算前的令牌快照（通常是停用登记时刻），beforeResolved 以它解析。 */
  baselineTokens: EngineToken[];
  /** 重算后的令牌现场（基础令牌已停用 / 别名已改写），afterResolved 以它解析。 */
  effectiveTokens: EngineToken[];
}

/**
 * 依赖停用目标的组件别名按变化逐主题重算。
 * 直接引用停用目标的别名改写为替换令牌；无替换令牌时变为不可解析。
 * 传递依赖不直接改写表达式，但其解析结果随下游变化而变化，同样计入。
 */
export function recalcAliases(params: RecalcOptions): AliasChangeRow[] {
  const { targetId, replacementTokenId, baselineTokens, effectiveTokens } = params;
  const themes = collectThemes(baselineTokens, effectiveTokens);
  const rows: AliasChangeRow[] = [];

  dependentIds(baselineTokens, targetId).forEach((aliasId) => {
    const beforeToken = findToken(baselineTokens, aliasId);
    if (!beforeToken) return;
    themes.forEach((theme) => {
      const beforeRaw = beforeToken.themes[theme] ?? beforeToken.value;
      const afterToken = findToken(effectiveTokens, aliasId);
      const afterRaw = afterToken ? (afterToken.themes[theme] ?? afterToken.value) : beforeRaw;
      const beforeResolved = resolve(baselineTokens, beforeRaw, theme);
      const afterResolved = resolve(effectiveTokens, afterRaw, theme);
      let status: AliasChangeRow['status'] = 'unchanged';
      if (afterResolved === undefined) status = 'unresolved';
      else if (beforeResolved !== afterResolved || beforeRaw !== afterRaw) status = 'changed';
      rows.push({
        tokenId: aliasId,
        name: beforeToken.name,
        category: beforeToken.category,
        theme,
        beforeRaw,
        afterRaw,
        beforeResolved: beforeResolved ?? '（不可解析）',
        afterResolved: afterResolved ?? '（不可解析）',
        status
      });
    });
  });

  // 直接引用且提供替换令牌的别名，逐主题改写是 recalc 的副作用，
  // 由调用方在构建 effectiveTokens 时完成；这里只负责算出差异。
  void replacementTokenId;
  return rows;
}

/** 把直接引用 target 的别名在指定主题上的表达式改写为替换令牌。 */
export function applyReplacement(
  tokens: EngineToken[],
  targetId: string,
  replacementTokenId: string | undefined
): void {
  tokens.forEach((token) => {
    Object.keys(token.themes).forEach((theme) => {
      if (asRef(token.themes[theme]) === targetId) {
        token.themes[theme] = replacementTokenId
          ? `{${replacementTokenId}}`
          : token.themes[theme];
      }
    });
    if (asRef(token.value) === targetId && replacementTokenId) {
      token.value = `{${replacementTokenId}}`;
    }
  });
}

export function collectThemes(...sets: EngineToken[][]): string[] {
  const themes = new Set<string>(['light']);
  sets.forEach((tokens) => tokens.forEach((token) => Object.keys(token.themes).forEach((theme) => themes.add(theme))));
  return [...themes];
}

/** 从令牌现场生成发布快照的依赖清单。 */
export function buildManifest(tokens: EngineToken[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  tokens.forEach((token) => {
    const seen = new Set<string>();
    const addEdge = (raw: string) => {
      const refId = asRef(raw);
      if (refId && refId !== token.id && !seen.has(refId)) {
        seen.add(refId);
        edges.push({ from: token.id, to: refId });
      }
    };
    addEdge(token.value);
    Object.values(token.themes).forEach(addEdge);
  });
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** 深拷贝令牌现场（JSON 模型，无函数 / 循环引用）。 */
export function cloneTokens(tokens: EngineToken[]): EngineToken[] {
  return tokens.map((token) => ({ ...token, themes: { ...token.themes } }));
}
