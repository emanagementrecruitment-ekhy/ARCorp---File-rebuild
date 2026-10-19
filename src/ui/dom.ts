type Child = Node | string | number | false | null | undefined | Child[];
type Props = Record<string, unknown> & { class?: string; onclick?: (e: MouseEvent) => void };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  const add = (c: Child): void => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c === null || c === undefined || c === false) return;
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer: number | undefined;
export function toast(msg: string): void {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = msg;
  box.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box?.classList.remove('show'), 3800);
}

export interface ModalOptions {
  title: string;
  body: Node | string;
  confirmLabel?: string;
  cancelLabel: string;
  danger?: boolean;
  /** Bila diisi, tombol konfirmasi aktif hanya jika pengguna mengetik kata ini. */
  typeToConfirm?: string;
}

/** Dialog konfirmasi. Resolve true jika dikonfirmasi. */
export function confirmModal(o: ModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const close = (v: boolean) => {
      overlay.remove();
      prev?.focus?.();
      resolve(v);
    };
    const input = o.typeToConfirm ? h('input', { type: 'text', 'aria-label': o.typeToConfirm, autocomplete: 'off', class: 'input' }) : null;
    const ok = h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, onclick: () => close(true), disabled: Boolean(o.typeToConfirm) }, o.confirmLabel ?? 'OK');
    if (input) input.addEventListener('input', () => (ok.disabled = input.value.trim().toUpperCase() !== o.typeToConfirm!.toUpperCase()));
    const cancel = h('button', { class: 'btn', onclick: () => close(false) }, o.cancelLabel);
    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e: MouseEvent) => e.target === overlay && close(false) },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
        h('h2', null, o.title),
        h('div', { class: 'modal-body' }, o.body),
        input,
        h('div', { class: 'modal-actions' }, cancel, ok)),
    );
    overlay.addEventListener('keydown', (e) => e.key === 'Escape' && close(false));
    document.body.append(overlay);
    (input ?? cancel).focus();
  });
}

export function infoModal(title: string, body: Node | string, closeLabel: string): Promise<void> {
  return confirmModal({ title, body, confirmLabel: closeLabel, cancelLabel: closeLabel }).then(() => undefined);
}
