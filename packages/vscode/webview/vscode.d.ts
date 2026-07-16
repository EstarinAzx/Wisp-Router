/// <reference types="vite/client" />
// ------------- vscode.d.ts — typing for the API VS Code injects into webviews ------------- //

// Vite's ambient types declare `*.css` (and friends) so the side-effect `import './style.css'`
// resolves — TS 7 flags it (TS2882) without this; TS 5.4 let it slide.

// Only postMessage is used; state persistence goes through the extension side.
declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
};
