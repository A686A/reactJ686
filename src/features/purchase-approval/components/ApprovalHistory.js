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
