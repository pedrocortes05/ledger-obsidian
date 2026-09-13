/* Minimal stand-in for the obsidian module in unit tests. */
export const Platform = { isMobile: false };

export class Notice {
  public static messages: string[] = [];
  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export const debounce = <T extends unknown[]>(fn: (...args: T) => unknown) => {
  const wrapped = (...args: T): void => {
    fn(...args);
  };
  wrapped.cancel = () => wrapped;
  wrapped.run = () => undefined;
  return wrapped;
};

export class Modal {
  public contentEl = document.createElement('div');
  public titleEl = document.createElement('div');
  public modalEl = document.createElement('div');
  constructor(public app: unknown) {}
  public open(): void {
    (this as unknown as { onOpen: () => void }).onOpen();
  }
  public close(): void {
    (this as unknown as { onClose: () => void }).onClose();
  }
}

export class Setting {
  constructor(public containerEl: HTMLElement) {}
  public addButton(): this {
    return this;
  }
}

export class TFile {}
export class FileView {}
export class Plugin {}
export class PluginSettingTab {}
export class MarkdownView {}
export const normalizePath = (path: string): string => path;
export const addIcon = (): void => undefined;
