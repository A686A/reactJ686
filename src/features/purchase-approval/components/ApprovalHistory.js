/**
 * 按后端返回顺序展示申请提交及审批记录，不在客户端重建历史。
 * @param {object} props 包含 history；兼容未提供历史记录的情况。
 */
export default function ApprovalHistory({ history = [] }) {
  return (
    <section className="approval-history">
      <h3 className="form-section-title">流程记录</h3>
      <ol>
        {history.map((event) => (
          <li key={event.id}>
            <div>
              <strong>{event.action}</strong>
              <time>{new Date(event.createdAt).toLocaleString("zh-CN")}</time>
            </div>
            <p>{event.actor}</p>
            {event.comment && <blockquote>{event.comment}</blockquote>}
          </li>
        ))}
      </ol>
    </section>
  );
}
