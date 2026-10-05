# pair-wise-yy-63 跨产品设计令牌治理与主题发布平台

维护基础令牌、语义令牌和组件别名，支持品牌主题、明暗模式与平台变体继承覆盖。包含令牌树、Monaco JSON 编辑、依赖图、循环引用与对比度校验、批量替换、变更评审、版本差异和发布锁定。

事故基础令牌的停用流程位于「停用中心」：登记停用单（固化引用、产品回执与发布快照现场）后，仅**发布维护员确认**才生效；确认时未拉取安全包的产品冻结、禁止继续拉取旧包，依赖令牌的组件别名按替换关系逐主题重算。确认采用乐观锁，两人同时提交时先到者写入。确认中断可按停用编号恢复，已处理产品不重复计数；旧发布记录缺依赖清单时必须先补齐再重新启用。

## 技术栈

Vue 3、TDesign、Pinia、Vue Router、TanStack Query、Axios、Monaco Editor、Vite、TypeScript。

## 运行

```bash
npm install
npm run dev
```

访问 `http://localhost:62063`。草稿、变更评审和当前主题保存在 `localStorage`。

```bash
npm run build
```
