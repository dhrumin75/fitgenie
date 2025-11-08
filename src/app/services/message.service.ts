import { Injectable } from '@angular/core';
import { Observable, share } from 'rxjs';
import { OutboundMessage, RuntimeMessage } from '../models/messaging.models';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private readonly runtimeMessages$: Observable<RuntimeMessage>;

  constructor() {
    this.runtimeMessages$ = this.createRuntimeObservable();
  }

  messages(): Observable<RuntimeMessage> {
    return this.runtimeMessages$;
  }

  async sendMessage<TResult = unknown>(message: OutboundMessage): Promise<TResult | void> {
    if (!this.hasRuntimeMessaging()) {
      console.warn('Chrome runtime messaging unavailable. Message dropped:', message);
      return;
    }

    return new Promise<TResult | void>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: TResult) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  private createRuntimeObservable(): Observable<RuntimeMessage> {
    if (!this.hasRuntimeMessaging()) {
      return new Observable<RuntimeMessage>();
    }

    return new Observable<RuntimeMessage>((subscriber) => {
      const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message) => {
        subscriber.next(message as RuntimeMessage);
      };

      chrome.runtime.onMessage.addListener(listener);

      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    }).pipe(share());
  }

  private hasRuntimeMessaging(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage && !!chrome.runtime?.onMessage;
  }
}

