import type { CallableExecutionEngine } from '@xec/ush';

import type { Logger } from '../utils/logger.js';
import type { 
  Time,
  Duration,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createTime(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Time> {
  
  const time: Time = {
    now(): Date {
      return new Date();
    },

    timestamp(): number {
      return Date.now();
    },

    format(date: Date, format: string): string {
      // Simple format implementation
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
    },

    parse(dateString: string, format?: string): Date {
      // Simple implementation - just use Date constructor
      return new Date(dateString);
    },

    add(date: Date, duration: Duration): Date {
      const result = new Date(date);
      
      if (duration.years) {
        result.setFullYear(result.getFullYear() + duration.years);
      }
      if (duration.months) {
        result.setMonth(result.getMonth() + duration.months);
      }
      if (duration.days) {
        result.setDate(result.getDate() + duration.days);
      }
      if (duration.hours) {
        result.setHours(result.getHours() + duration.hours);
      }
      if (duration.minutes) {
        result.setMinutes(result.getMinutes() + duration.minutes);
      }
      if (duration.seconds) {
        result.setSeconds(result.getSeconds() + duration.seconds);
      }
      if (duration.milliseconds) {
        result.setMilliseconds(result.getMilliseconds() + duration.milliseconds);
      }
      
      return result;
    },

    subtract(date: Date, duration: Duration): Date {
      const negativeDuration: Duration = {
        years: duration.years ? -duration.years : undefined,
        months: duration.months ? -duration.months : undefined,
        days: duration.days ? -duration.days : undefined,
        hours: duration.hours ? -duration.hours : undefined,
        minutes: duration.minutes ? -duration.minutes : undefined,
        seconds: duration.seconds ? -duration.seconds : undefined,
        milliseconds: duration.milliseconds ? -duration.milliseconds : undefined,
      };
      
      return this.add(date, negativeDuration);
    },

    diff(from: Date, to: Date): Duration {
      const diffMs = to.getTime() - from.getTime();
      
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      const milliseconds = diffMs % 1000;
      
      return {
        days: days || undefined,
        hours: hours || undefined,
        minutes: minutes || undefined,
        seconds: seconds || undefined,
        milliseconds: milliseconds || undefined,
      };
    },

    async sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    async timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        ),
      ]);
    },
  };

  return time;
}