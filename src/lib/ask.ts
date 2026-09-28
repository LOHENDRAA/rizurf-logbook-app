/**
 * In-page replacement for window.confirm(). Embedded browsers (e.g. app preview panes) often block
 * native dialogs, making confirm() return false instantly — which silently cancels every action.
 */
export function ask(message: string, okLabel = 'OK'): Promise<boolean> {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'ask-dialog';
    const p = document.createElement('p');
    p.textContent = message;
    const row = document.createElement('div');
    row.className = 'row';
    const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel' });
    const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: okLabel, className: 'primary' });
    ok.dataset.testid = 'ask-ok';
    row.append(cancel, ok);
    d.append(p, row);
    document.body.append(d);
    const done = (v: boolean) => { d.close(); d.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    d.addEventListener('cancel', () => done(false)); // Esc key
    d.showModal();
    ok.focus();
  });
}
