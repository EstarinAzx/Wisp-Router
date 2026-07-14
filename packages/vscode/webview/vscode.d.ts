// ------------- vscode.d.ts — typing for the API VS Code injects into webviews ------------- //

// Only postMessage is used; state persistence goes through the extension side.
declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
};
