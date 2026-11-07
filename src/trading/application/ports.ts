export interface Clock {
  now(): number;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const systemClock: Clock = { now: () => Date.now() };

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};
