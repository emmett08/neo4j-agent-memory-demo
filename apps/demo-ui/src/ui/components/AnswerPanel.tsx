export function AnswerPanel({ answer }: { answer: string | null }) {
  if (!answer) return <div className="small">Run the agent to see the answer here.</div>;
  return <div className="pre mono" aria-label="Agent answer">{answer}</div>;
}
