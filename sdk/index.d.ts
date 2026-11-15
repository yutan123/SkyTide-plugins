export interface HostError extends Error { code: 'CANCELLED' | 'TIMEOUT' | 'INVALID_ARGUMENT' | 'NETWORK' | 'INVALID_STATE' | 'HOST_ERROR'; retryable: boolean }
export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type MediaKind = 'image' | 'video' | 'audio' | 'document';
export interface Receipt { messageId: string; status: string; duplicate?: boolean; [key: string]: Json | undefined }
export interface MediaResource { resourceId: string; kind: MediaKind; [key: string]: Json }
export interface MediaOptions { url?: string; resourceId?: string; caption?: string; requestId: string; duration?: number }
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
  getStatus(requestId: string): Promise<Receipt | {status: 'not_found'}>;
}
export interface Media {
  download(options: {url: string; kind: MediaKind}): Promise<MediaResource>;
  inspect(resourceId: string): Promise<MediaResource>;
  release(resourceId: string): Promise<boolean>;
}
export interface TaskStatus { id: string; due_at: number; state: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'; attempts: number; error: string | null }
export interface Tasks {
  list(): Promise<TaskStatus[]>;
  /** Epoch milliseconds, up to one year ahead. IDs are unique per plugin. */
  schedule(options: {id: string; at: number; payload?: Json}): Promise<{id: string; status: 'pending'}>;
  /** Cancels a pending task owned by the current bot. */
  cancel(id: string): Promise<boolean>;
}
export interface ChatEvent { botId: string; messageId: string | null; message: Message }
export interface TaskEvent { id: string; botId: string; scheduledAt: number; payload: Json }
export interface Context { readonly chat: Chat; readonly media: Media; readonly tasks: Tasks; readonly notifications: {show(options: {title: string; body: string}): Promise<null>} }
export interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export interface Response { status: number; headers: Record<string, string>; body: string }
export interface Tide {
  readonly apiVersion: 1;
  readonly capabilities: readonly string[];
  readonly config: Readonly<Record<string, Json>>;
  registerTool(name: string, handler: (args: Record<string, Json>, context: Context) => Json | Promise<Json>): void;
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
    transfer(options: RequestOptions & {requestId: string; multipart?: ({name: string; value: string} | {name: string; filename: string; base64: string})[]}): Promise<Response>;
    cancel(requestId: string): Promise<boolean>;
    progress(requestId: string): Promise<null | {sent: number; received: number; total: number | null; state: 'running' | 'finished' | 'cancelled'}>;
  };
  readonly diagnostics: {getStatus(): Promise<{pluginId: string; version: string; apiVersion: number; running: boolean; activeContexts: number; lastError: string | null; package?: {source: 'local'; sha256: string} | null}>};
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
    getStatus(context: Context, requestId: string): ReturnType<Chat['getStatus']>;
  };
  readonly media: {
    download(context: Context, options: Parameters<Media['download']>[0]): Promise<MediaResource>;
    release(context: Context, resourceId: string): Promise<boolean>;
  };
}
declare global { const tide: Tide; }
