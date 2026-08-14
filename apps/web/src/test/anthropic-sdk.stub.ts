import { vi } from "vitest";

export const createMessage = vi.fn();

export default class Anthropic {
  messages = { create: createMessage };
}
