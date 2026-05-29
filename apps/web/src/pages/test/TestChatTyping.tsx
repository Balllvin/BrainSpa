export function TestChatTyping() {
  return (
    <article className="test-chat-message test-chat-message--assistant" aria-label="Assistant is thinking">
      <div className="test-chat-typing">
        <span className="test-chat-typing-dot" />
        <span className="test-chat-typing-dot" />
        <span className="test-chat-typing-dot" />
      </div>
    </article>
  );
}
