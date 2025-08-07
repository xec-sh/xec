// State management with history support

import type { StateSubscriber } from './types.js';

export class StateManager<T> {
  private state: T;
  private subscribers = new Set<StateSubscriber<T>>();
  private history: T[] = [];
  private future: T[] = [];
  private maxHistory = 100;

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): T {
    return this.state;
  }

  setState(updater: T | ((prev: T) => T)): void {
    const prevState = this.state;
    const newState = typeof updater === 'function' 
      ? (updater as (prev: T) => T)(prevState)
      : updater;

    if (newState !== prevState) {
      // Add to history
      this.history.push(prevState);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      
      // Clear future when new state is set
      this.future = [];
      
      this.state = newState;
      this.notifySubscribers(prevState);
    }
  }

  subscribe(callback: StateSubscriber<T>): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  undo(): boolean {
    if (this.history.length === 0) return false;

    const prevState = this.history.pop()!;
    this.future.push(this.state);
    
    const oldState = this.state;
    this.state = prevState;
    this.notifySubscribers(oldState);
    
    return true;
  }

  redo(): boolean {
    if (this.future.length === 0) return false;

    const nextState = this.future.pop()!;
    this.history.push(this.state);
    
    const oldState = this.state;
    this.state = nextState;
    this.notifySubscribers(oldState);
    
    return true;
  }

  reset(newState?: T): void {
    const oldState = this.state;
    this.state = newState ?? this.history[0] ?? this.state;
    this.history = [];
    this.future = [];
    this.notifySubscribers(oldState);
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  private notifySubscribers(prevState: T): void {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state, prevState);
      } catch (error) {
        console.error('Error in state subscriber:', error);
      }
    });
  }
}