// localStorage может бросать исключение (песочница, приватный режим) — тогда храним в памяти.
const mem = new Map<string, string>();
let ls: Storage | null = null;
try {
  ls = window.localStorage;
  ls.setItem('__t', '1');
  ls.removeItem('__t');
} catch {
  ls = null;
}

export const store = {
  get: (k: string): string | null => (ls ? ls.getItem(k) : (mem.get(k) ?? null)),
  set: (k: string, v: string) => (ls ? ls.setItem(k, v) : void mem.set(k, v)),
  del: (k: string) => (ls ? ls.removeItem(k) : void mem.delete(k)),
};
