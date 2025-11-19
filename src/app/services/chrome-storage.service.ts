import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { UserProfile, TryOnResult } from '../models/try-on.models';

interface StorageProfile {
  photoDataUrl: string;
  uploadedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChromeStorageService {
  private readonly storageKey = 'fitgenie:userProfile';
  private readonly tryOnResultKey = 'fitgenie:latestTryOnResult';
  private inMemoryProfile: UserProfile | null = null;
  private inMemoryResult: TryOnResult | null = null;

  async saveUserPhoto(photoDataUrl: string): Promise<UserProfile> {
    const profile: UserProfile = {
      photoDataUrl,
      uploadedAt: new Date().toISOString()
    };

    if (this.hasChromeStorage()) {
      await this.setChromeStorage(profile);
    } else {
      this.inMemoryProfile = profile;
    }

    return profile;
  }

  async getUserPhoto(): Promise<UserProfile | null> {
    if (this.hasChromeStorage()) {
      const stored = await this.getChromeStorage();
      return stored;
    }

    return this.inMemoryProfile;
  }

  async clearUserPhoto(): Promise<void> {
    if (this.hasChromeStorage()) {
      await this.removeChromeStorage();
    }
    this.inMemoryProfile = null;
  }

  watchUserPhoto(): Observable<UserProfile | null> {
    if (!this.hasChromeStorage()) {
      return new Observable<UserProfile | null>((subscriber) => {
        subscriber.next(this.inMemoryProfile);
        return () => undefined;
      });
    }

    return new Observable<UserProfile | null>((subscriber) => {
      this.getChromeStorage()
        .then((profile) => subscriber.next(profile))
        .catch((error) => console.error('Failed to read user photo from storage', error));

      const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
        if (areaName !== 'local' || !changes[this.storageKey]) {
          return;
        }

        const change = changes[this.storageKey];
        subscriber.next(this.toUserProfile(change?.newValue as StorageProfile | null));
      };

      chrome.storage.onChanged.addListener(listener);

      return () => {
        chrome.storage.onChanged.removeListener(listener);
      };
    });
  }

  private hasChromeStorage(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local;
  }

  private async setChromeStorage(profile: UserProfile): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [this.storageKey]: profile }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async getChromeStorage(): Promise<UserProfile | null> {
    return new Promise<UserProfile | null>((resolve, reject) => {
      chrome.storage.local.get(this.storageKey, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }

        const value = result[this.storageKey] as StorageProfile | undefined;
        if (!value?.photoDataUrl) {
          resolve(null);
          return;
        }

        resolve(this.toUserProfile(value));
      });
    });
  }

  private async removeChromeStorage(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(this.storageKey, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private toUserProfile(value: StorageProfile | null | undefined): UserProfile | null {
    if (!value?.photoDataUrl) {
      return null;
    }
    return {
      photoDataUrl: value.photoDataUrl,
      uploadedAt: value.uploadedAt
    };
  }

  async saveTryOnResult(result: TryOnResult): Promise<void> {
    if (this.hasChromeStorage()) {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.local.set({ [this.tryOnResultKey]: result }, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } else {
      this.inMemoryResult = result;
    }
  }

  async getTryOnResult(): Promise<TryOnResult | null> {
    if (this.hasChromeStorage()) {
      return new Promise<TryOnResult | null>((resolve, reject) => {
        chrome.storage.local.get(this.tryOnResultKey, (result) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
            return;
          }

          const value = result[this.tryOnResultKey] as TryOnResult | undefined;
          resolve(value ?? null);
        });
      });
    }

    return this.inMemoryResult;
  }
}

