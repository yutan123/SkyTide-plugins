# 聊天消息快捷操作

在 `manifest.json` 声明菜单动作，并在入口脚本同步注册同名处理函数。以下为清单相关字段：

```json
{
  "requiredCapabilities": ["chat.messageActions"],
  "messageActions": [
    {"id": "save_quote", "label": "收藏这条消息"}
  ]
}
```

```js
tide.registerMessageAction('save_quote', async ({id, role, text}) => {
  await tide.storage.set(`quote:${id}`, {role, text});
  return '已收藏';
});
```

- `messageActions` 最多 16 项。`id` 在插件内唯一，匹配 `[a-z][a-z0-9_]{0,39}`；`label` 为 1–40 个字符的单行菜单名称，不带首尾空白。
- 插件启用且当前机器人未禁用该插件时，长按普通文本消息可打开「插件操作」。只有选定动作才会把这条消息的 `id`、`role`（`user` 或 `assistant`）和 `text` 交给对应插件。空文本、附件和超过 64 KiB 的 UTF-8 文本不进入此菜单。
- 此入口不创建聊天会话上下文，不提供历史、附件、回复或会话任务访问。处理函数仍可使用插件已获授权的独立 API，例如私有存储。
- 处理函数可以同步返回或返回 Promise。返回字符串（最多 8192 个 UTF-16 代码单元）时，SkyTide 显示可选中的纯文本，不会写入聊天记录；不返回内容时只提示操作完成。清单与注册不一致会使插件启动失败。
