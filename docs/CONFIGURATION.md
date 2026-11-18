# 插件设置表单

插件通过 `manifest.config` 或 `config.schema.json` 定义设置。宿主使用 JSON Schema 子集校验数据，通过字段的 `x-ui` 元数据生成选择器和表单。依赖这些控件的插件应声明 `"requiredCapabilities": ["config.ui"]`。
设置表单渲染根对象的各个属性；嵌套对象和普通数组继续使用 JSON 编辑器。未声明 `x-ui` 的配置保持原有输入框、开关和枚举选择方式。数值范围、字符串长度、数组数量和必填校验继续生效。`x-ui.widget` 与 `enum` 不能同时声明；固定选项请直接使用 `enum`。


## 提供商与机器人选择

单选使用 `string`，多选使用 `array` 和 `items.type: string`。选择器支持搜索、清空和取消，多选显示已选数量，并受 `minItems/maxItems` 限制。

```json
{
  "type": "object",
  "properties": {
    "summaryProvider": {
      "type": "string",
      "title": "摘要模型提供商",
      "x-ui": { "widget": "provider", "providerTypes": ["chat"] }
    },
    "speechProviders": {
      "type": "array",
      "title": "语音提供商",
      "items": { "type": "string" },
      "maxItems": 5,
      "x-ui": { "widget": "provider", "providerTypes": ["stt", "tts"] }
    },
    "bot": {
      "type": "string",
      "title": "默认机器人",
      "x-ui": { "widget": "bot" }
    },
    "notificationBots": {
      "type": "array",
      "title": "通知机器人",
      "items": { "type": "string" },
      "x-ui": { "widget": "bot" }
    }
  }
}
```

`providerTypes` 支持 `chat`（聊天提供商）、`stt`（语音识别）、`tts`（语音合成）；省略时展示全部三类。开发者可以组合筛选。列表显示用户已添加的提供商名称、用途和模型名称，不包含 URL、API Key 或其他凭据。

聊天提供商保存的 ID 与 `tide.ai.listModels()` 的 `id` 相同，可以直接传给 `tide.ai.generate({providerId, ...})`。语音提供商使用 `stt:<opaque-id>` 或 `tts:<opaque-id>`，用于区分配置引用；选择器不会扩展 `tide.ai.generate` 支持的模型用途，该接口仍处理聊天文本生成。机器人保存数据库中的字符串 ID。

选择不会授予聊天、文件或网络权限。插件仍需声明并遵循相应接口的权限规则。提供商或机器人被删除后，设置显示失效提示，保存前要求清理失效引用。单选清空后不保存该字段，必填字段仍需重新选择；多选清空保存空数组。不要为动态 ID 写入其他用户设备上的默认值。

## 分组与条件显示

字段可声明 `x-ui.group`；同名字段按首次出现的分组顺序排列。设置 `collapsed: true` 可让该组默认折叠。没有分组的字段直接显示。

```json
{
  "type": "object",
  "properties": {
    "summaryEnabled": {
      "type": "boolean", "title": "启用摘要", "default": false,
      "x-ui": { "group": "AI 摘要" }
    },
    "summaryProvider": {
      "type": "string", "title": "摘要模型",
      "x-ui": {
        "widget": "provider", "providerTypes": ["chat"],
        "group": "AI 摘要", "visibleWhen": { "summaryEnabled": true }
      }
    }
  },
  "required": ["summaryProvider"]
}
```

`visibleWhen` 的键引用其他同级字段，值做 JSON 等值匹配，多个条件需同时满足。条件读取当前表单数据和字段默认值，不允许自引用、未声明字段或循环依赖。隐藏时保留已经填写的值；未填写的隐藏字段不强制必填。字段重新显示后恢复正常校验。插件执行时也应检查启用开关，不能把隐藏当成删除配置。

## 文本、数值和单位

| 声明 | 用途 |
|---|---|
| `type: string`、`x-ui.widget: multiline` | 多行提示词或模板；`rows` 为初始行数，允许 2～20，默认 4 |
| `type: string`、`format: password` | 密码输入，支持显示／隐藏，关闭输入建议和自动纠错 |
| `minimum`、`maximum` | 数值输入范围，适用于 `integer/number` |
| `x-ui.unit` | 在输入框旁显示单位，例如“秒”或“条” |
| `x-ui.widget: slider` | 滑块，必须声明不同的数字最小值和最大值 |
| `x-ui.step` | 滑块步长，须为正数并整除范围，最多 10000 档；整数滑块默认步长 1 |

```json
{
  "type": "integer", "title": "检查间隔", "default": 15,
  "minimum": 5, "maximum": 60,
  "x-ui": { "widget": "slider", "step": 5, "unit": "分钟", "group": "连接" }
}
```

## 文件与目录

`widget: file` 为字符串字段，可用 `extensions: ["pem", "crt"]` 限制文件扩展名。选择后宿主将文件导入插件私有文件区的 `config_imports/`，保存相对路径。插件声明 `files` 权限后可通过 `tide.files.read`、`tide.files.stat` 等接口访问。文件导入遵循每个文件 256 MiB、插件文件区 512 MiB 的现有上限。

`widget: directory` 列出插件私有文件区中的目录，支持搜索、选择和新建子目录；保存的值同样为相对路径。插件可将其与文件名拼接后传给文件接口。目录和文件导入在选择时立即创建，取消设置不会删除已经导入的文件或新建目录；插件可通过文件 API 管理不再需要的导入文件。

这些控件需要 `files` 权限。它们使用插件私有文件区，不返回任意外部目录的绝对路径或修改文件接口的访问范围。

## 日期、时间与时区

| `x-ui.widget` | 数据类型 | 保存格式 |
|---|---|---|
| `date` | `string` | `YYYY-MM-DD`，日期选择范围为 1900～2200 年 |
| `time` | `string` | 24 小时制 `HH:mm` |
| `timezone` | `string` | IANA 时区名称，例如 `Asia/Shanghai`、`Europe/London`、`UTC` |

日期和时间使用应用内弹窗；时区列表可搜索，基于应用携带的时区数据库。这些字段保存配置值，具体定时逻辑由插件实现，选择时区不会改变系统时区。

## 连接测试

在配置根对象的 `x-ui` 中声明 `testAction`，可选 `testLabel`：

```json
{
  "type": "object",
  "x-ui": { "testAction": "test_connection", "testLabel": "测试连接" },
  "properties": {
    "endpoint": { "type": "string", "title": "服务地址" }
  }
}
```

用户点击后，宿主先校验当前表单，再通过现有 `ui.action` 事件传递 `{action, values}`。`values` 是尚未保存的完整配置，测试处理器应读取它，不使用启动时的 `tide.config` 快照。测试不会保存设置或重启插件，插件需要处于启用状态；首次配置可先保存并启用，再进行测试。

```js
tide.on('ui.action', async ({ action, values }) => {
  if (action !== 'test_connection') return;
  const response = await tide.request({
    url: values.endpoint,
    method: 'HEAD',
    timeoutMs: 10000
  });
  return { ok: response.status >= 200 && response.status < 400 };
});
```

处理器必须返回 `{ok: boolean}`，否则测试视为失败。宿主显示成功／失败状态，并在等待超过 30 秒后结束界面等待；已经发送的网络操作仍由插件自身的超时和取消逻辑负责。重复点击在等待期间被禁用。网络、套接字和认证测试仍受插件原有权限、来源及端点声明约束。测试处理器不应写入正式业务数据、发送通知或输出密钥；宿主不会直接显示远端异常详情。

完整示例见 [`examples/config_form`](../examples/config_form/manifest.json)。