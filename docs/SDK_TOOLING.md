# SDK 类型与本地测试

在 TypeScript 项目中安装本地类型包：

```sh
npm install --save-dev ./sdk
```

项目的 `tsconfig.json` 加入：

```json
{"compilerOptions":{"types":["@tidebot/plugin-sdk"],"strict":true,"target":"ES2020"}}
```

运行时由 TideBot 注入全局 `tide`，插件无需导入 JavaScript SDK。`sdk/runtime.js` 用于 Node 测试，不能替代宿主权限校验。Mock 只运行受信任的开发代码。

```js
const {createMock} = require('../sdk/mock.cjs');
const fs = require('node:fs');
const mock = createMock({handlers: {
  'chat.getRecentMessages': async ({contextToken, limit}) => {
    if (contextToken !== 'test-context') throw Error('Invalid context');
    return [{id: 'm1', role: 'user', type: 'text', content: '你好', timestamp: 1}].slice(0, limit);
  }
}});
mock.load(fs.readFileSync('main.js', 'utf8'));
// 用实际清单中的工具名和参数调用。
mock.dispatch('tool', 'recent', {
  __tideInvocation: true,
  args: {},
  contextToken: 'test-context'
}).then(console.log);
```

未配置的宿主 API 会报错。Mock 不模拟 Android 进程恢复、数据库事务、安装校验或真实网络隔离。

## 读取当前会话

清单声明 `chat.read` 后，工具的第二参数提供：

| 方法 | 返回 |
| --- | --- |
| `context.chat.getBotInfo()` | 当前机器人 `id/name/desc/created_at`，不存在时为 `null` |
| `context.chat.getRecentMessages({limit: 20})` | 按时间倒序的消息数组，`limit` 为 1～100 |
| `context.chat.getUnreadCount()` | 当前机器人未读助手消息数量 |

消息仅返回 `id/role/type/content/timestamp`。接口不接受机器人 ID，始终绑定当前工具调用；不暴露提示词、模型配置和本地文件路径。读取前后均检查上下文和机器人启用范围。

## 网络超时

`tide.request({url, timeoutMs})` 接受正整数毫秒数，最大 330000。省略时使用宿主默认超时。网络请求仍要求 `network` 权限和精确 HTTPS origin，普通请求不跟随重定向。

## 声明能力依赖

清单可声明 `requiredCapabilities` 数组，例如：

```json
{"requiredCapabilities":["chat.read","invocation.context"]}
```

当前宿主不支持的能力会使包校验失败。能力声明不自动授予权限，`chat.read` 仍需列入 `permissions`。

## 声明式界面

除开发指南中的基础组件外，还支持：

| 组件 | 字段 | 说明 |
| --- | --- | --- |
| `progress` | `value`、`label` | `value` 为 0～1；省略显示不定进度，label 用于辅助功能 |
| `badge` | `text` 或 `label` | 文本状态标签 |
| `spacer` | `height` | 0～200 的间距，默认 12 |

这些组件不包含子节点，仍受 300 节点和 16 层限制。

## 打包前校验

```sh
python3 tools/pack_plugin.py examples/hello --check
python3 tools/pack_plugin.py examples/hello --out hello.zip
```

工具检查基础清单、能力与权限、包内引用、origin、符号链接及容量。宿主安装校验还会检查参数 Schema、声明式布局、ZIP 目录与 CRC，安装校验是最终规则。

通知、可取消上传、PDF 文档、元数据与诊断接口见[宿主扩展接口](HOST_APIS.md)。Web UI 使用不包含 `allow-same-origin` 的 CSP sandbox，禁止依赖 Cookie、localStorage 或 IndexedDB 保存插件状态；持久状态通过宿主存储 API 管理。
