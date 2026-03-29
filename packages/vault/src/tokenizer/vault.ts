export class VaultStore {
  private readonly realToFake = new Map<string, string>();
  private readonly fakeToReal = new Map<string, string>();

  lookupReal(real: string): string | null {
    return this.realToFake.get(real) ?? null;
  }

  lookupFake(fake: string): string | null {
    return this.fakeToReal.get(fake) ?? null;
  }

  store(real: string, fake: string, _patternId: string): void {
    const existingFake = this.realToFake.get(real);
    if (existingFake && existingFake !== fake) {
      this.fakeToReal.delete(existingFake);
    }

    const existingReal = this.fakeToReal.get(fake);
    if (existingReal && existingReal !== real) {
      this.realToFake.delete(existingReal);
    }

    this.realToFake.set(real, fake);
    this.fakeToReal.set(fake, real);
  }

  get size(): number {
    return this.realToFake.size;
  }

  clear(): void {
    this.realToFake.clear();
    this.fakeToReal.clear();
  }

  redact(text: string): string {
    let output = text;
    const entries = [...this.realToFake.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [real, fake] of entries) {
      output = output.split(real).join(fake);
    }
    return output;
  }

  restore(text: string): string {
    let output = text;
    const entries = [...this.fakeToReal.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [fake, real] of entries) {
      output = output.split(fake).join(real);
    }
    return output;
  }
}
