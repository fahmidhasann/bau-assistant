import { afterEach } from "vitest";

// Keep tests isolated from a developer's local OpenRouter configuration.
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});
