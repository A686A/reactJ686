import { useEffect, useRef } from "react";

/**
 * 封装原生 dialog 的模态展示、关闭按钮和键盘取消处理。
 * 挂载时记录触发元素，卸载时恢复焦点；busy 时阻止关闭。
 * @param {object} props 包含标题、内容、onClose、busy 与 wide。
 */
export default function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}) {
  const ref = useRef(null);
  /** 打开原生模态框并记录触发元素；关闭卸载时恢复之前的键盘焦点。 */
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭弹窗"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
