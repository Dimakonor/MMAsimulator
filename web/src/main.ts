import { render } from 'preact';
import { App } from './app';
import { html } from './ui';
import { initTelegram } from './telegram';
import './styles.css';

initTelegram();
render(html`<${App} />`, document.getElementById('root')!);
