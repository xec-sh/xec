import { signal, effect } from '../src/index.js';

const message = signal('Hello');

effect(() => {
  console.log('Message changed to:', message());
});
// Logs: "Message changed to: Hello"

message.set('Hi there');
// Logs: "Message changed to: Hi there"