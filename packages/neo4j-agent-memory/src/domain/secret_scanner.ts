export interface SecretScanner {
  hasSecret(text: string): boolean;
}

export class DefaultSecretScanner implements SecretScanner {
  private suspicious =
    /(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|xox[baprs]-|ghp_[A-Za-z0-9]{36,})/;

  hasSecret(text: string): boolean {
    return this.suspicious.test(text);
  }
}

