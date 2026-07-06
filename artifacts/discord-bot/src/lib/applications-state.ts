import { EventEmitter } from "node:events";

let applicationsOpen = false;
const closeEmitter = new EventEmitter();
closeEmitter.setMaxListeners(0);

export function areApplicationsOpen(): boolean {
  return applicationsOpen;
}

export function setApplicationsOpen(open: boolean): void {
  applicationsOpen = open;
  if (!open) {
    closeEmitter.emit("closed");
  }
}

export class ApplicationsClosedError extends Error {
  constructor() {
    super("Applications were closed while awaiting a response.");
    this.name = "ApplicationsClosedError";
  }
}

/**
 * Returns a promise that rejects with ApplicationsClosedError the moment
 * applications are closed (via setApplicationsOpen(false)), plus a cancel
 * function to unsubscribe once it's no longer needed (e.g. the awaited
 * response already arrived).
 */
export function createApplicationsClosedWaiter(): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let handler: () => void = () => {};
  const promise = new Promise<never>((_, reject) => {
    handler = () => reject(new ApplicationsClosedError());
    closeEmitter.once("closed", handler);
  });
  return {
    promise,
    cancel: () => closeEmitter.off("closed", handler),
  };
}
