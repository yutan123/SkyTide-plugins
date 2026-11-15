---
name: 插件收录或更新申请
about: 提交插件市场收录或版本更新申请
title: ''
labels: ''
---

## 申请类型

<!-- 请选择一项，并将标题改为：`[插件收录] 插件 ID 版本` 或 `[插件更新] 插件 ID 版本`。 -->

- [ ] 首次收录
- [ ] 版本更新

## 市场信息

<!-- 请替换下面 JSON 中的全部示例内容。不要填写 API Key、密码或其他敏感信息。 -->

```json
{
  "id": "tidebot_example",
  "name": "插件名称",
  "author": "作者名称",
  "description": "插件功能简介",
  "repository": "https://github.com/owner/tidebot_example",
  "version": "1.0.0",
  "commit": "填写本次审核提交的完整40位SHA",
  "changelog": "本次版本变更说明"
}
```

<!-- id、name、author 和 version 必须与 commit 中的 manifest.json 一致。 -->

## 补充说明（可选）

<!-- 可填写配置方法、外部服务、已知限制或其他审核相关信息。没有可以删除本节。 -->