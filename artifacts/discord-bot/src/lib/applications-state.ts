import { EventEmitter } from "node:events";
import * as fs from 'node:fs';
import * as path from 'node:path';

// Ruta del archivo para persistir el estado
const STATE_FILE = path.join(process.cwd(), 'state.json');

const closeEmitter = new EventEmitter();
closeEmitter.setMaxListeners(0);

// Función interna para cargar el estado del archivo al iniciar
function loadState(): boolean {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return !!data.isOpen;
    }
  } catch (err) {
    console.error("Error cargando state.json, iniciando en false", err);
  }
  return false;
}

// Inicializamos con el valor guardado
let applicationsOpen = loadState();

export function areApplicationsOpen(): boolean {
  return applicationsOpen;
}

export function setApplicationsOpen(open: boolean): void {
  applicationsOpen = open;

  // Guardamos el nuevo estado en el archivo
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ isOpen: open }));
  } catch (err) {
    console.error("Error guardando state.json", err);
  }

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