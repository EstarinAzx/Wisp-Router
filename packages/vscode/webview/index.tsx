// ------------------- index.tsx — webview entry: mount the Preact app ------------------- //

/*
 * Depends on:
 *   - preact: render() mounts the component tree.
 *   - ./app: the App component (whole panel UI).
 *   - ./style.css: Tailwind v4 bundle, emitted by Vite as dist/webview/main.css.
 */

import { render } from 'preact';
import { App } from './app';
import './style.css';

render(<App />, document.getElementById('root')!);
