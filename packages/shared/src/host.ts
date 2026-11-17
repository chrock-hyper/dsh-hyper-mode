/**
 * The Host surface these plugins actually touch, typed once.
 *
 * We do not depend on `@deepseek-ai/*` type packages: the plugins load shipped
 * modules at call time through `loadShipped`, so those names are resolved from
 * the installation and never imported statically. Keeping our own narrow
 * interfaces has two payoffs — no version coupling to the installed DSH, and a
 * single readable statement of which Host capabilities this bundle relies on.
 *
 * Everything here is structural: the real Cordis context is wider, and a wider
 * object is assignable to these.
 *
 * @module @chrock-studio/dsh-hyper-shared/host
 */

/** Cleanup returned by every registration. */
export type Disposable = () => void

/** JSON data crossing the Host/Client boundary. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Host-side logger; every method is optional on the real object. */
export interface HostLogger {
  info?(message: string): void
  warn?(message: string): void
  debug?(message: string): void
  error?(message: string): void
}

/** `workingDirectory` service: the directory a session was started in. */
export interface WorkingDirectoryService {
  get(session: unknown): string | undefined
  ensure?(session: unknown): Promise<string>
}

/** `subagents` service: agent tree reads and activations. */
export interface SubagentsService {
  namesOf(input?: unknown): unknown
  getProvider?(name?: string): unknown
  resolveMaxDepth?(input?: unknown): unknown
  startActivation?(spec: unknown): Promise<unknown>
}

/** `skills` service: the skill catalog. */
export interface SkillsService {
  register(skill: unknown): Disposable
  get(name: string): Promise<unknown>
}

/** `profileContext`: where this profile's installation lives. */
export interface ProfileContext {
  installAnchor?: string
}

/** A handle on one agent, as passed to prompt sections and tool calls. */
export interface AgentHandle {
  session?: unknown
  ctx?: unknown
}

/** Tool registry. Definitions are opaque here: each plugin builds its own. */
export interface ToolRegistry {
  register(definition: unknown): Disposable
  /** Select the executor for this scope; the hybrid executor mounts here. */
  setExecutor?(executor: unknown): Disposable
}

/** `ptcRuntime` service: which SDK language is mounted and how programs are shaped. */
export interface PtcRuntimeService {
  language?: unknown
  programFormat?: unknown
}

/** One system-prompt section registration. */
export interface PromptSection {
  name: string
  order?: number
  text: (context: { agent?: AgentHandle }) => string
}

/** `systemPrompt` service. */
export interface SystemPromptService {
  section(section: PromptSection): Disposable
  assemble(input?: { scope?: unknown }): Promise<{ tools: unknown[] }>
  /** Current order of a section, so a plugin can sit beside a shipped one. */
  getSectionOrder?(name: string): number
}

/** One invocation of a human command. */
export interface CommandInvocation {
  agent?: AgentHandle
  session?: unknown
  rawInput: string
}

/** One human-command registration. */
export interface CommandDefinition {
  name: string
  description: string
  input?: { hint: string }
  handler: (invocation: CommandInvocation) => unknown
}

/** `commands` service. */
export interface CommandRegistry {
  register(definition: CommandDefinition): Disposable
}

/** Minimal HTTP request view: enough for routing, body reading and loopback checks. */
export interface HttpRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>
}

/** Minimal HTTP response view. */
export interface HttpResponse {
  statusCode?: number
  writeHead?(status: number, headers?: Record<string, string>): void
  setHeader?(name: string, value: string): void
  end(text?: string): void
}

/** Route handler shape. */
export type HttpHandler = (request: HttpRequest, response: HttpResponse) => void | Promise<void>

/** One route registration. */
export interface RouteDefinition {
  kind: 'prefix' | 'exact'
  path: string
  handler: HttpHandler
}

/** `webServer` service. */
export interface WebServerService {
  register(route: RouteDefinition): Disposable
}

/** `cordisInspect` service: this bundle's tool-catalog provider registers here. */
export interface CordisInspectRegistry {
  register(definition: unknown): Disposable
}

/** The Host context as these plugins use it. */
export interface HostContext {
  /** Run a registration and tie its cleanup to this plugin's lifetime. */
  effect(callback: () => Disposable | void, label?: string): Disposable
  /** Wait for hard dependencies before running a callback. */
  inject(dependencies: string[], callback: (ctx: HostContext) => void): void

  get(name: 'profileContext'): ProfileContext | undefined
  get(name: 'workingDirectory'): WorkingDirectoryService | undefined
  get(name: 'subagents'): SubagentsService | undefined
  get(name: 'skills'): SkillsService | undefined
  get(name: 'webServer'): WebServerService | undefined
  get(name: 'cordisInspect'): CordisInspectRegistry | undefined
  get(name: string): unknown

  logger?: HostLogger
  tools?: ToolRegistry
  systemPrompt?: SystemPromptService
  commands?: CommandRegistry
  webServer?: WebServerService
  cordisInspect?: CordisInspectRegistry
  ptcRuntime?: PtcRuntimeService
}
