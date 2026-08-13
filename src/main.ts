import './styles/app.css';
import { AppController } from './app/AppController';

const app = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#scene');

if (!app || !canvas) {
  throw new Error('Cosmic Cleanup requires #app and #scene elements.');
}

const controller = new AppController(app, canvas);
void controller.start();
