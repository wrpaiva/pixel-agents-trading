export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condição não atingida no prazo');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
