// VS Code is the external boundary; provider/extension/core implementations stay real in these tests.
export const version = '1.145.3';
export const testing = { commands: new Map<string, (...args: any[]) => any>(), panel: undefined as any,
  chat: undefined as any, logs: [] as string[], notices: [] as string[], settings: {} as Record<string, unknown> };
const disposable = () => ({ dispose() {} });
export class EventEmitter<T> {
  private listeners = new Set<(value: T) => void>();
  event = (listener: (value: T) => void) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; };
  fire(value: T) { for (const listener of this.listeners) listener(value); }
  dispose() { this.listeners.clear(); }
}
export class ThemeColor { constructor(public id: string) {} }
export const Uri = { parse: (value: string) => ({ toString: () => value }), joinPath: (_: unknown, ...parts: string[]) => parts.join('/') };
export const StatusBarAlignment = { Right: 2 };
export const window = {
  createOutputChannel: () => ({ ...disposable(), appendLine: (s: string) => testing.logs.push(s) }),
  createStatusBarItem: () => ({ ...disposable(), show() {}, hide() {} }),
  createTextEditorDecorationType: disposable,
  registerWebviewViewProvider: (_: string, provider: unknown) => { testing.panel = provider; return disposable(); },
  showInformationMessage: (s: string) => { testing.notices.push(s); },
  showErrorMessage: (s: string) => { testing.notices.push(s); },
  showWarningMessage: (s: string) => { testing.notices.push(s); },
  showQuickPick: async (_: unknown) => undefined,
  showInputBox: async (_: unknown) => undefined,
};
export const workspace = { getConfiguration: () => ({
  get: (key: string, fallback?: unknown) => testing.settings[key] ?? fallback,
  inspect: (key: string) => ({ globalValue: testing.settings[key] }),
}), onDidChangeConfiguration: () => disposable() };
export const commands = { registerCommand: (id: string, fn: (...args: any[]) => any) => { testing.commands.set(id, fn); return disposable(); } };
export const languages = { registerCodeLensProvider: disposable };
export const lm = { registerLanguageModelChatProvider: (_: string, provider: unknown) => { testing.chat = provider; return disposable(); } };
export const env = { openExternal: async (_: unknown) => false, clipboard: { writeText: async () => {} } };
export class LanguageModelTextPart { constructor(public value: string) {} }
export class LanguageModelToolCallPart { constructor(public callId: string, public name: string, public input: object) {} }
export class LanguageModelToolResultPart { constructor(public callId: string, public content: unknown[]) {} }
export class LanguageModelDataPart { constructor(public data: Uint8Array, public mimeType: string) {} }
export class LanguageModelThinkingPart { constructor(public value: string | string[], public id?: string, public metadata?: Record<string, unknown>) {} }
export const LanguageModelChatMessageRole = { User: 1, Assistant: 2, System: 3 };
export const LanguageModelChatToolMode = { Auto: 1, Required: 2 };
