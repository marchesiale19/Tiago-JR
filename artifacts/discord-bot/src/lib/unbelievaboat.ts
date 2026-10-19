
import pkg from "unb-api";

const { Client: UnbClient } = pkg;

const apiKey = process.env["UNBELIEVABOAT_API_KEY"];

if (!apiKey) {
  throw new Error(
    "❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.",
  );
}

export const unb = new UnbClient(apiKey);
