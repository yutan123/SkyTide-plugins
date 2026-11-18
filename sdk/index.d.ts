export interface HostError extends Error { code: 'CANCELLED' | 'TIMEOUT' | 'INVALID_ARGUMENT' | 'NETWORK' | 'INVALID_STATE' | 'HOST_ERROR'; retryable: boolean }
export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'file';
export interface Receipt { messageId: string; status: string; duplicate?: boolean; [key: string]: Json | undefined }
export interface MediaResource { resourceId: string; kind: MediaKind; [key: string]: Json }
export interface MediaDownloadOptions { fileName?: string; url: string; kind: MediaKind; headers?: Record<string, string>; timeoutMs?: number }
export interface MediaOptions { fileName?: string; headers?: Record<string, string>; timeoutMs?: number; url?: string; resourceId?: string; caption?: string; requestId: string; duration?: number }
export interface BotInfo { id: string; name: string | null; desc: string | null; created_at: number | null }
export interface Message { id: string; role: string; type: string; content: string | null; timestamp: number }
export interface Chat {
  getContext(): Promise<{botId: string; conversationId: string; pluginId: string}>;
  getBotInfo(): Promise<BotInfo | null>;
  /** Newest first, 1–100 entries; requires chat.read. */
  getRecentMessages(options?: {limit?: number}): Promise<Message[]>;
  getUnreadCount(): Promise<number>;
  sendText(options: {text: string; requestId: string}): Promise<Receipt>;
  sendImage(options: MediaOptions): Promise<Receipt>;
  sendVideo(options: MediaOptions): Promise<Receipt>;
  sendAudio(options: MediaOptions): Promise<Receipt>;
  sendDocument(options: MediaOptions): Promise<Receipt>;
  sendFile(options: MediaOptions): Promise<Receipt>;
  getStatus(requestId: string): Promise<Receipt | {status: 'not_found'}>;
}
export type MediaProcessOptions =
  | {operation: 'merge'; videoResourceId: string; audioResourceId: string; format?: 'mp4'}
  | {operation: 'transcode'; resourceId: string; format?: 'mp4' | 'webm' | 'mp3' | 'm4a' | 'wav'}
  | {operation: 'hls'; url: string; headers?: Record<string, string>; format?: 'mp4' | 'm4a'};
export interface Media {
  saveFile(options: {resourceId: string; path: string}): Promise<{path: string; size: number}>;
  fromFile(options: {path: string; kind: MediaKind; fileName?: string}): Promise<MediaResource>;
  process(options: MediaProcessOptions): Promise<MediaResource>;
  download(options: MediaDownloadOptions): Promise<MediaResource>;
  inspect(resourceId: string): Promise<MediaResource>;
  release(resourceId: string): Promise<boolean>;
}
export interface TaskStatus { id: string; due_at: number; interval_ms: number; state: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'; attempts: number; error: string | null }
export interface Tasks {
  list(): Promise<TaskStatus[]>;
  /** Epoch milliseconds, up to one year ahead. IDs are unique per plugin. */
  schedule(options: {id: string; at: number; payload?: Json; intervalMs?: number}): Promise<{id: string; status: 'pending'}>;
  update(options: {id: string; at?: number; payload?: Json; intervalMs?: number}): Promise<boolean>;
  /** Cancels pending or running work owned by the current bot. */
  cancel(id: string): Promise<boolean>;
}
export interface ChatEvent { botId: string; messageId: string | null; message: Message }
export interface TaskEvent { id: string; botId: string; scheduledAt: number; payload: Json }
export interface Context { readonly chat: Chat; readonly media: Media; readonly tasks: Tasks; readonly notifications: {show(options: {title: string; body: string}): Promise<null>} }
export interface RequestOptions {
  url: string;
  method?: 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export interface Response { status: number; headers: Record<string, string>; body: string }
export interface FileTransferOptions {requestId: string; url: string; path: string; headers?: Record<string, string>; timeoutMs?: number}
export interface PrivateFiles {
  read(options: {path: string; offset?: number; length?: number; encoding?: 'utf8' | 'base64'}): Promise<{data: string; size: number; eof: boolean}>;
  write(options: {path: string; data: string; encoding?: 'utf8' | 'base64'; append?: boolean}): Promise<{path: string; size: number}>;
  stat(path: string): Promise<{path: string; size: number; modifiedAt: number} | null>;
  list(directory?: string): Promise<{path: string; type: 'file' | 'directory'; size: number}[]>;
  delete(path: string): Promise<boolean>;
}
export interface WorkerContext { readonly name: string; sleep(ms: number): Promise<void> }
export interface DatabaseOperation { operation: 'get' | 'put' | 'delete'; collection: string; key: string; value?: Json; vector?: number[] }
export interface DocumentRow { key: string; value: Json; updatedAt: number }
export interface PluginDatabase {
  get(collection: string, key: string): Promise<Json>;
  put(collection: string, key: string, value: Json, options?: {vector?: number[]}): Promise<null>;
  delete(collection: string, key: string): Promise<boolean>;
  query(collection: string, options?: {prefix?: string; after?: string; limit?: number}): Promise<DocumentRow[]>;
  search(collection: string, vector: number[], options?: {limit?: number}): Promise<{key: string; value: Json; score: number}[]>;
  batch(operations: DatabaseOperation[]): Promise<Json[]>;
  version(): Promise<number>;
  migrate(from: number, to: number, operations: DatabaseOperation[]): Promise<boolean>;
}
export interface AIOptions { requestId: string; providerId: string; model?: string; messages: {role: 'system' | 'user' | 'assistant'; content: string}[]; maxTokens?: number; temperature?: number }
export interface ConnectionHandle {connectionId: string; secure?: boolean; protocol?: string | null}
export interface ConnectionRead {data: string; done: boolean; timedOut?: boolean; type?: 'binary' | 'text' | 'event'; text?: string; event?: {data: string; event: string; id: string; retry?: number}}
export interface ConnectionBody {text?: string; base64?: string}
export interface TokenOptions {url: string; fields?: Record<string, string>; credentialKey?: string}
export interface OAuthToken {access_token: string; refresh_token?: string; token_type?: string; expires_in?: number; expiresAt?: number; [key: string]: Json | undefined}
export type DevicePermission = 'overlay' | 'location' | 'microphone' | 'photos' | 'videos' | 'motion';
export type OverlayOptions = { width?: number; height?: number; compact?: boolean; assetPaths?: string[] } &
  ({ html: string; entry?: never } | { entry: string; html?: never });
export type PickedMedia = { name: string; mimeType: string | null } &
  ({ base64: string } | { path: string; size: number });
export interface UiActionContext extends Context {
  readonly overlay: { show(options: OverlayOptions): Promise<boolean> };
  readonly device: {
    pickPhoto(options?: { path?: string }): Promise<PickedMedia | null>;
    pickVideo(options?: { path?: string }): Promise<PickedMedia | null>;
    recordAudio(durationMs?: number): Promise<{ mimeType: 'audio/mp4'; base64: string }>;
  };
}
export interface Tide {
  readonly device: {
    hasPermission(permission: DevicePermission): Promise<boolean>;
    getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>;
    getMotion(): Promise<{ screenRotation: number; acceleration?: number[]; angularVelocity?: number[]; rotationVector?: number[] }>;
  };
  readonly overlay: { update(data: Json): Promise<boolean>; close(): Promise<null> };
  readonly connections: {
    connect(options: {url: string}): Promise<ConnectionHandle>;
    webSocket(options: {url: string; headers?: Record<string, string>}): Promise<ConnectionHandle>;
    http(options: ConnectionBody & {url: string; method?: RequestOptions['method']; headers?: Record<string, string>; format?: 'binary' | 'sse'}): Promise<ConnectionHandle & {status: number; headers: Record<string, string>}>;
    read(connectionId: string, options?: {timeoutMs?: number}): Promise<ConnectionRead>;
    write(connectionId: string, options: ConnectionBody): Promise<number>;
    startTls(connectionId: string): Promise<ConnectionHandle>;
    close(connectionId: string): Promise<boolean>;
  };
  readonly crypto: {
    random(length?: number): Promise<string>;
    encode(text: string): Promise<string>;
    decode(base64: string, options?: {allowMalformed?: boolean}): Promise<string>;
    digest(options: {base64: string; algorithm?: 'sha256' | 'sha512' | 'sha1' | 'md5'}): Promise<{hex: string; base64: string}>;
    hmac(options: {base64: string; key: string; algorithm?: 'sha256' | 'sha512' | 'sha1' | 'md5'}): Promise<{hex: string; base64: string}>;
    encrypt(options: {base64: string; key: string; aad?: string}): Promise<{base64: string; nonce: string; mac: string}>;
    decrypt(options: {base64: string; key: string; nonce: string; mac: string; aad?: string}): Promise<string>;
  };
  readonly auth: {
    authorize(options: {url: string; parameters: Record<string, string>}): Promise<{code: string; verifier: string; redirectUri: string; state: string}>;
    createPkce(): Promise<{verifier: string; challenge: string; method: 'S256'; state: string}>;
    exchangeToken(options: TokenOptions): Promise<OAuthToken>;
    getAccessToken(options: TokenOptions & {credentialKey: string}): Promise<string>;
  };
  readonly credentials: {get(key: string): Promise<string | null>; set(key: string, value: string): Promise<null>; delete(key: string): Promise<null>};
  readonly background: {sendText(options: {botId: string; text: string; requestId: string}): Promise<Receipt>};

  sleep(ms: number): Promise<void>;
  registerWorker(name: string, handler: (context: WorkerContext) => void | Promise<void>): void;
  registerCommand(name: string, handler: (args: {text: string; botId: string; messageId: string}, context: Context) => void | Promise<void>): void;
  readonly database: PluginDatabase;
  readonly ai: {
    listModels(): Promise<{id: string; name: string; models: string[]}[]>;
    generate(options: AIOptions): Promise<{text: string; model: string; requestId: string}>;
    cancel(requestId: string): Promise<boolean>;
  };
  readonly files: PrivateFiles;
  readonly apiVersion: 1;
  readonly capabilities: readonly string[];
  readonly config: Readonly<Record<string, Json>>;
  registerTool(name: string, handler: (args: Record<string, Json>, context: Context) => Json | Promise<Json>): void;
  on(event: 'ui.action', handler: (payload: {action: string; values: Record<string, Json>}, context: UiActionContext) => Json | void | Promise<Json | void>): void;
  on(event: 'overlay.message', handler: (payload: {data: Json}) => void | Promise<void>): void;
  on(event: 'context.build', handler: (payload: {botId: string; text: string}) => {context: string} | void | Promise<{context: string} | void>): void;
  on(event: 'chat.message' | 'chat.sent', handler: (payload: ChatEvent, context: Context) => void | Promise<void>): void;
  on(event: 'task.trigger', handler: (payload: TaskEvent, context: Context) => void | Promise<void>): void;
  on(event: string, handler: (payload: Json, context: Context) => Json | void | Promise<Json | void>): void;
  readonly storage: {
    get(key: string): Promise<Json>;
    set(key: string, value: Json): Promise<null>;
    delete(key: string): Promise<null>;
    compareAndSet(key: string, expected: Json, value: Json): Promise<boolean>;
    update(key: string, updater: (previous: Json) => Json | Promise<Json>): Promise<Json>;
  };
  readonly resources: {readText(path: string): Promise<string>; readJson(path: string): Promise<Json>};
  request(options: RequestOptions): Promise<Response>;
  readonly network: {
    downloadFile(options: FileTransferOptions): Promise<{path: string; size: number; status: number; headers: Record<string, string>}>;
    uploadFile(options: FileTransferOptions & {method?: 'POST' | 'PUT' | 'PATCH'}): Promise<{status: number; headers: Record<string, string>; bodyBase64: string}>;
    cancelFile(requestId: string): Promise<boolean>;
    fileProgress(requestId: string): Promise<null | {requestId: string; bytes: number; state: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'}>;
    transfer(options: RequestOptions & {requestId: string; multipart?: ({name: string; value: string} | {name: string; filename: string; base64: string})[]}): Promise<Response>;
    cancel(requestId: string): Promise<boolean>;
    progress(requestId: string): Promise<null | {sent: number; received: number; total: number | null; state: 'running' | 'finished' | 'cancelled'}>;
  };
  readonly diagnostics: {getStatus(): Promise<{pluginId: string; version: string; apiVersion: number; running: boolean; activeContexts: number; lastError: string | null; workers: {name: string; intervalMs: number; state?: 'running' | 'waiting' | 'retrying' | 'lost'; nextAt?: number; startedAt?: number; failures?: number; error?: string}[]; package?: {source: 'local'; sha256: string} | null}>};
  log(message: unknown): Promise<null>;
  readonly chat: {
    getContext(context: Context): ReturnType<Chat['getContext']>;
    getBotInfo(context: Context): ReturnType<Chat['getBotInfo']>;
    getRecentMessages(context: Context, options?: {limit?: number}): Promise<Message[]>;
    getUnreadCount(context: Context): Promise<number>;
    sendText(context: Context, options: Parameters<Chat['sendText']>[0]): Promise<Receipt>;
    sendImage(context: Context, options: MediaOptions): Promise<Receipt>;
    sendVideo(context: Context, options: MediaOptions): Promise<Receipt>;
    sendAudio(context: Context, options: MediaOptions): Promise<Receipt>;
    sendDocument(context: Context, options: MediaOptions): Promise<Receipt>;
    sendFile(context: Context, options: MediaOptions): Promise<Receipt>;
    getStatus(context: Context, requestId: string): ReturnType<Chat['getStatus']>;
  };
  readonly media: {
    saveFile(context: Context, options: Parameters<Media['saveFile']>[0]): Promise<{path: string; size: number}>;
    fromFile(context: Context, options: Parameters<Media['fromFile']>[0]): Promise<MediaResource>;
    process(context: Context, options: MediaProcessOptions): Promise<MediaResource>;
    download(context: Context, options: Parameters<Media['download']>[0]): Promise<MediaResource>;
    release(context: Context, resourceId: string): Promise<boolean>;
  };
}
declare global { const tide: Tide; }

/** Configuration form metadata. Requires the config.ui host capability. */
export interface ConfigFieldUi {
  widget?: 'provider' | 'bot' | 'multiline' | 'file' | 'directory' | 'date' | 'time' | 'timezone' | 'slider';
  group?: string;
  collapsed?: boolean;
  visibleWhen?: Record<string, Json>;
  providerTypes?: Array<'chat' | 'stt' | 'tts'>;
  unit?: string;
  rows?: number;
  step?: number;
  extensions?: string[];
  /** Root object only; dispatched as ui.action with unsaved values. */
  testAction?: string;
  testLabel?: string;
}
export interface ConfigSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  format?: string;
  default?: Json;
  enum?: Json[];
  properties?: Record<string, ConfigSchema>;
  items?: ConfigSchema;
  required?: string[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  'x-ui'?: ConfigFieldUi;
}
export interface ConfigTestResult { ok: boolean }
